// SPDX-License-Identifier: GPL-3.0-or-later
//
// atlas::rhi on WebGPU: buffers, shaders, pipelines, readbacks and captures.
//
// The WebGPU counterpart of engine/rhi/src/resources.cpp, written for the browser build of
// the lab. The validation the native file does before calling the graphics library is kept
// word for word where it is about Atlas's own rules (sizes, integer targets, vertex layouts);
// what changes is the library underneath.

#include <atlas/core/assert.hpp>
#include <atlas/core/log.hpp>
#include <atlas/core/profile.hpp>
#include <atlas/rhi/device.hpp>

#include "device_impl.hpp"
#include "webgpu_conv.hpp"

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <format>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace atlas::rhi {
namespace {

constexpr log::Category kRhi{"rhi"};

/// Rows copied out of a texture must start on 256-byte boundaries in WebGPU.
[[nodiscard]] std::uint32_t padded_row(std::uint32_t bytes) noexcept {
    return (bytes + 255U) & ~255U;
}

struct ScopeResult {
    bool done = false;
    WGPUErrorType type = WGPUErrorType_NoError;
    std::string message;
};

/// Run `create` inside a validation error scope and report what it found, so that a shader
/// or pipeline the browser refuses fails here, with the browser's message, as
/// SDL_CreateGPUShader and SDL_CreateGPUGraphicsPipeline fail natively.
template <typename Create>
[[nodiscard]] auto scoped(Device::Impl& impl, Create&& create, ScopeResult& result) {
    wgpuDevicePushErrorScope(impl.device, WGPUErrorFilter_Validation);
    auto object = std::forward<Create>(create)();
    WGPUPopErrorScopeCallbackInfo info = WGPU_POP_ERROR_SCOPE_CALLBACK_INFO_INIT;
    info.mode = WGPUCallbackMode_WaitAnyOnly;
    info.callback = [](WGPUPopErrorScopeStatus, WGPUErrorType type, WGPUStringView message,
                       void* userdata1, void*) {
        auto* out = static_cast<ScopeResult*>(userdata1);
        out->done = true;
        out->type = type;
        out->message = detail::text(message);
    };
    info.userdata1 = &result;
    impl.wait(wgpuDevicePopErrorScope(impl.device, info));
    return object;
}

}  // namespace

Result<BufferHandle> Device::create_buffer(const BufferDesc& desc) {
    ATLAS_ASSERT_MAIN_THREAD();

    if (m_impl == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "create_buffer on an invalid device"));
    }
    if (m_impl->health.lost()) {
        return std::unexpected(m_impl->already_lost("create a buffer"));
    }
    if (desc.size == 0) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "a buffer must have a non-zero size"));
    }

    const std::string name{desc.debug_name};
    WGPUBufferDescriptor info = WGPU_BUFFER_DESCRIPTOR_INIT;
    info.label = detail::view(name);
    info.usage = detail::to_wgpu(desc.usage);
    // Queue writes must be multiples of four bytes, so the allocation is rounded up to allow a
    // write of the whole declared size.
    info.size = (desc.size + 3U) & ~std::uint64_t{3};

    WGPUBuffer buffer = wgpuDeviceCreateBuffer(m_impl->device, &info);
    if (buffer == nullptr) {
        return std::unexpected(m_impl->fail(
            ErrorCode::ResourceCreationFailed,
            std::format("creating buffer '{}' of {} bytes failed", desc.debug_name, desc.size)));
    }

    auto handle = m_impl->buffers.insert(BufferResource{
        .buffer = buffer,
        .size = desc.size,
        .debug_name = name,
    });
    if (!handle) {
        wgpuBufferDestroy(buffer);
        wgpuBufferRelease(buffer);
        return std::unexpected(std::move(handle).error().context("registering a buffer"));
    }
    return *handle;
}

namespace {

/// Write `data` at `offset`, padding a tail that is not a multiple of four bytes, which
/// WebGPU's queue writes require and SDL's transfers do not.
void write_padded(WGPUQueue queue, WGPUBuffer buffer, std::uint64_t offset,
                  std::span<const std::byte> data) {
    const std::size_t whole = data.size() & ~std::size_t{3};
    if (whole > 0) {
        wgpuQueueWriteBuffer(queue, buffer, offset, data.data(), whole);
    }
    if (whole < data.size()) {
        std::array<std::byte, 4> tail{};
        std::memcpy(tail.data(), data.data() + whole, data.size() - whole);
        wgpuQueueWriteBuffer(queue, buffer, offset + whole, tail.data(), tail.size());
    }
}

}  // namespace

Status Device::upload_buffer(BufferHandle buffer, std::span<const std::byte> data,
                             std::uint64_t offset) {
    ATLAS_ZONE_NAMED("Device::upload_buffer");
    ATLAS_ASSERT_MAIN_THREAD();

    if (m_impl == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "upload_buffer on an invalid device"));
    }
    if (m_impl->health.lost()) {
        return std::unexpected(m_impl->already_lost("upload to a buffer"));
    }
    const auto* resource = m_impl->buffers.get(buffer);
    if (resource == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "upload_buffer: the handle is null or stale"));
    }
    if (data.empty()) {
        return ok();
    }
    if (offset + data.size() > resource->size) {
        return std::unexpected(Error(
            ErrorCode::OutOfRange,
            std::format("upload of {} bytes at offset {} does not fit buffer '{}' of {} bytes",
                        data.size(), offset, resource->debug_name, resource->size)));
    }
    if (offset % 4 != 0) {
        return std::unexpected(Error(
            ErrorCode::NotSupported,
            std::format("upload to buffer '{}' at offset {}: WebGPU writes at multiples of four",
                        resource->debug_name, offset)));
    }
    // A queue write is ordered before every later submission, which is the guarantee the
    // native version buys by waiting on a fence; there is nothing further to wait for.
    write_padded(m_impl->queue, resource->buffer, offset, data);
    return ok();
}

Status Device::stream_buffer(BufferHandle buffer, std::span<const std::byte> data) {
    ATLAS_ZONE_NAMED("Device::stream_buffer");
    ATLAS_ASSERT_MAIN_THREAD();

    if (m_impl == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "stream_buffer on an invalid device"));
    }
    if (m_impl->health.lost()) {
        return std::unexpected(m_impl->already_lost("stream into a buffer"));
    }
    if (data.empty()) {
        return ok();
    }
    BufferResource* resource = m_impl->buffers.get(buffer);
    if (resource == nullptr) {
        return std::unexpected(Error(ErrorCode::InvalidArgument,
                                     "the buffer to stream into does not resolve; it was "
                                     "destroyed, or the handle is from another device"));
    }
    if (data.size() > resource->size) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument,
                  std::format("streaming {} bytes into buffer '{}', which holds {}", data.size(),
                              resource->debug_name, resource->size)));
    }
    // SDL cycles the buffer so that draws already recorded keep the old contents. A WebGPU
    // queue write lands after every command buffer already submitted and before every later
    // one, so work in flight keeps what it was given without any cycling. The one case it
    // does not cover is a draw recorded earlier in a frame that has not been submitted yet,
    // which then sees the new contents; the lab streams its cells once a frame, before the
    // draws that read them.
    write_padded(m_impl->queue, resource->buffer, 0, data);
    return ok();
}

void Device::destroy_buffer(BufferHandle buffer) {
    if (m_impl == nullptr) {
        return;
    }
    ATLAS_ASSERT_MAIN_THREAD();
    const auto* resource = m_impl->buffers.get(buffer);
    if (resource == nullptr) {
        return;
    }
    wgpuBufferDestroy(resource->buffer);
    wgpuBufferRelease(resource->buffer);
    m_impl->buffers.destroy(buffer);
}

Result<ShaderHandle> Device::create_shader(const ShaderDesc& desc) {
    ATLAS_ASSERT_MAIN_THREAD();

    if (m_impl == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "create_shader on an invalid device"));
    }
    if (m_impl->health.lost()) {
        return std::unexpected(m_impl->already_lost("create a shader"));
    }
    if (desc.code.empty()) {
        return std::unexpected(Error(ErrorCode::InvalidArgument,
                                     std::format("shader '{}' has no code", desc.debug_name)));
    }
    if (!supports_shader_format(desc.format)) {
        return std::unexpected(
            Error(ErrorCode::NotSupported,
                  std::format("shader '{}' is {}, which the {} backend does not accept",
                              desc.debug_name, to_string(desc.format), m_impl->backend_name)));
    }
    if (desc.storage_textures != 0 || desc.storage_buffers != 0) {
        return std::unexpected(Error(
            ErrorCode::NotSupported,
            std::format("shader '{}' declares storage resources, which this backend does not "
                        "bind yet; no shader Atlas ships declares any",
                        desc.debug_name)));
    }
    if (desc.stage == ShaderStage::Vertex && desc.samplers != 0) {
        return std::unexpected(Error(
            ErrorCode::NotSupported,
            std::format("vertex shader '{}' samples textures, which this backend does not bind",
                        desc.debug_name)));
    }

    const std::string source{reinterpret_cast<const char*>(desc.code.data()), desc.code.size()};
    WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT;
    wgsl.code = detail::view(source);
    WGPUShaderModuleDescriptor info = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
    info.nextInChain = &wgsl.chain;
    info.label = detail::view(desc.debug_name);

    ScopeResult scope;
    WGPUShaderModule module = scoped(
        *m_impl, [&] { return wgpuDeviceCreateShaderModule(m_impl->device, &info); }, scope);
    if (module == nullptr || scope.type != WGPUErrorType_NoError) {
        if (module != nullptr) {
            wgpuShaderModuleRelease(module);
        }
        m_impl->last_error = scope.message;
        return std::unexpected(m_impl->fail(
            ErrorCode::ShaderCompilationFailed,
            std::format("creating {} shader '{}' ({}, entry point '{}') failed",
                        to_string(desc.stage), desc.debug_name, to_string(desc.format),
                        desc.entry_point)));
    }

    auto handle = m_impl->shaders.insert(ShaderResource{
        .module = module,
        .stage = desc.stage,
        .entry_point = std::string{desc.entry_point},
        .samplers = desc.samplers,
        .uniform_buffers = desc.uniform_buffers,
        .debug_name = std::string{desc.debug_name},
    });
    if (!handle) {
        wgpuShaderModuleRelease(module);
        return std::unexpected(std::move(handle).error().context("registering a shader"));
    }
    return *handle;
}

void Device::destroy_shader(ShaderHandle shader) {
    if (m_impl == nullptr) {
        return;
    }
    ATLAS_ASSERT_MAIN_THREAD();
    const auto* resource = m_impl->shaders.get(shader);
    if (resource == nullptr) {
        return;
    }
    wgpuShaderModuleRelease(resource->module);
    m_impl->shaders.destroy(shader);
}

Result<GraphicsPipelineHandle> Device::create_graphics_pipeline(const GraphicsPipelineDesc& desc) {
    ATLAS_ASSERT_MAIN_THREAD();

    if (m_impl == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "create_graphics_pipeline on an invalid device"));
    }
    if (m_impl->health.lost()) {
        return std::unexpected(m_impl->already_lost("create a graphics pipeline"));
    }

    const auto* vertex = m_impl->shaders.get(desc.vertex_shader);
    const auto* fragment = m_impl->shaders.get(desc.fragment_shader);
    if (vertex == nullptr || fragment == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument,
                  std::format("pipeline '{}' needs a live vertex and fragment shader; one handle "
                              "is null or stale",
                              desc.debug_name)));
    }

    const TextureFormat colour_format = desc.colour_format == TextureFormat::Unknown
                                            ? m_impl->swapchain_format
                                            : desc.colour_format;
    if (colour_format == TextureFormat::Unknown) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument,
                  std::format("pipeline '{}' has no colour target format", desc.debug_name)));
    }
    if (is_integer_format(colour_format) && desc.blend != BlendMode::Replace) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument,
                  std::format("pipeline '{}' draws into {}, an integer format, with blend mode {}. "
                              "An integer target cannot be blended; use BlendMode::Replace.",
                              desc.debug_name, to_string(colour_format), to_string(desc.blend))));
    }
    if (fragment->samplers > 1) {
        return std::unexpected(Error(
            ErrorCode::NotSupported,
            std::format("pipeline '{}': fragment shader '{}' samples {} textures; this backend "
                        "binds one",
                        desc.debug_name, fragment->debug_name, fragment->samplers)));
    }

    // Vertex streams, checked as the native backend checks them.
    std::vector<WGPUVertexBufferLayout> streams;
    std::vector<std::vector<WGPUVertexAttribute>> attributes;
    streams.reserve(desc.vertex_layout.streams.size());
    attributes.reserve(desc.vertex_layout.streams.size());
    for (std::size_t slot = 0; slot < desc.vertex_layout.streams.size(); ++slot) {
        const auto& stream = desc.vertex_layout.streams[slot];
        if (stream.stride == 0) {
            return std::unexpected(
                Error(ErrorCode::InvalidArgument,
                      std::format("pipeline '{}': vertex stream {} has a stride of zero",
                                  desc.debug_name, slot)));
        }
        auto& list = attributes.emplace_back();
        for (const auto& attribute : stream.attributes) {
            if (attribute.offset + byte_size(attribute.format) > stream.stride) {
                return std::unexpected(Error(
                    ErrorCode::InvalidArgument,
                    std::format("pipeline '{}': attribute at location {} reads {} bytes at "
                                "offset {}, past the end of a {}-byte vertex",
                                desc.debug_name, attribute.location, byte_size(attribute.format),
                                attribute.offset, stream.stride)));
            }
            WGPUVertexAttribute out = WGPU_VERTEX_ATTRIBUTE_INIT;
            out.format = detail::to_wgpu(attribute.format);
            out.offset = attribute.offset;
            out.shaderLocation = attribute.location;
            list.push_back(out);
        }
        WGPUVertexBufferLayout layout = WGPU_VERTEX_BUFFER_LAYOUT_INIT;
        layout.stepMode =
            stream.per_instance ? WGPUVertexStepMode_Instance : WGPUVertexStepMode_Vertex;
        layout.arrayStride = stream.stride;
        layout.attributeCount = list.size();
        layout.attributes = list.data();
        streams.push_back(layout);
    }

    // Group 2: one texture and its sampler, when the fragment shader samples one.
    WGPUBindGroupLayout sampler_layout = nullptr;
    if (fragment->samplers == 1) {
        std::array<WGPUBindGroupLayoutEntry, 2> entries{};
        entries[0] = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
        entries[0].binding = 0;
        entries[0].visibility = WGPUShaderStage_Fragment;
        entries[0].texture.sampleType = WGPUTextureSampleType_Float;
        entries[0].texture.viewDimension = WGPUTextureViewDimension_2D;
        entries[1] = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
        entries[1].binding = 1;
        entries[1].visibility = WGPUShaderStage_Fragment;
        entries[1].sampler.type = WGPUSamplerBindingType_Filtering;
        WGPUBindGroupLayoutDescriptor layout_desc = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
        layout_desc.entryCount = entries.size();
        layout_desc.entries = entries.data();
        sampler_layout = wgpuDeviceCreateBindGroupLayout(m_impl->device, &layout_desc);
    }
    const std::array<WGPUBindGroupLayout, 4> groups{
        m_impl->empty_layout, m_impl->vertex_uniform_layout,
        sampler_layout != nullptr ? sampler_layout : m_impl->empty_layout,
        m_impl->fragment_uniform_layout};
    WGPUPipelineLayoutDescriptor layout_desc = WGPU_PIPELINE_LAYOUT_DESCRIPTOR_INIT;
    layout_desc.label = detail::view(desc.debug_name);
    layout_desc.bindGroupLayoutCount = groups.size();
    layout_desc.bindGroupLayouts = groups.data();
    WGPUPipelineLayout layout = wgpuDeviceCreatePipelineLayout(m_impl->device, &layout_desc);

    WGPUBlendState blend = WGPU_BLEND_STATE_INIT;
    blend.color.srcFactor = WGPUBlendFactor_SrcAlpha;
    blend.color.dstFactor = WGPUBlendFactor_OneMinusSrcAlpha;
    blend.color.operation = WGPUBlendOperation_Add;
    blend.alpha.srcFactor = WGPUBlendFactor_One;
    blend.alpha.dstFactor = WGPUBlendFactor_OneMinusSrcAlpha;
    blend.alpha.operation = WGPUBlendOperation_Add;

    WGPUColorTargetState target = WGPU_COLOR_TARGET_STATE_INIT;
    target.format = detail::to_wgpu(colour_format);
    target.blend = desc.blend == BlendMode::AlphaBlend ? &blend : nullptr;
    target.writeMask = WGPUColorWriteMask_All;

    WGPUFragmentState fragment_state = WGPU_FRAGMENT_STATE_INIT;
    fragment_state.module = fragment->module;
    fragment_state.entryPoint = detail::view(fragment->entry_point);
    fragment_state.targetCount = 1;
    fragment_state.targets = &target;

    WGPURenderPipelineDescriptor info = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
    info.label = detail::view(desc.debug_name);
    info.layout = layout;
    info.vertex.module = vertex->module;
    info.vertex.entryPoint = detail::view(vertex->entry_point);
    info.vertex.bufferCount = streams.size();
    info.vertex.buffers = streams.data();
    info.primitive.topology = detail::to_wgpu(desc.topology);
    info.primitive.cullMode = WGPUCullMode_None;
    info.primitive.frontFace = WGPUFrontFace_CCW;
    info.fragment = &fragment_state;
    info.multisample.count = 1;
    info.multisample.mask = 0xFFFFFFFFU;

    ScopeResult scope;
    WGPURenderPipeline pipeline = scoped(
        *m_impl, [&] { return wgpuDeviceCreateRenderPipeline(m_impl->device, &info); }, scope);
    if (pipeline == nullptr || scope.type != WGPUErrorType_NoError) {
        if (pipeline != nullptr) {
            wgpuRenderPipelineRelease(pipeline);
        }
        wgpuPipelineLayoutRelease(layout);
        if (sampler_layout != nullptr) {
            wgpuBindGroupLayoutRelease(sampler_layout);
        }
        m_impl->last_error = scope.message;
        return std::unexpected(
            m_impl->fail(ErrorCode::PipelineCreationFailed,
                         std::format("creating pipeline '{}' failed", desc.debug_name)));
    }

    auto handle = m_impl->pipelines.insert(PipelineResource{
        .pipeline = pipeline,
        .layout = layout,
        .sampler_layout = sampler_layout,
        .fragment_samplers = fragment->samplers,
        .colour_format = colour_format,
        .debug_name = std::string{desc.debug_name},
    });
    if (!handle) {
        wgpuRenderPipelineRelease(pipeline);
        wgpuPipelineLayoutRelease(layout);
        if (sampler_layout != nullptr) {
            wgpuBindGroupLayoutRelease(sampler_layout);
        }
        return std::unexpected(std::move(handle).error().context("registering a pipeline"));
    }
    return *handle;
}

void Device::destroy_graphics_pipeline(GraphicsPipelineHandle pipeline) {
    if (m_impl == nullptr) {
        return;
    }
    ATLAS_ASSERT_MAIN_THREAD();
    const auto* resource = m_impl->pipelines.get(pipeline);
    if (resource == nullptr) {
        return;
    }
    wgpuRenderPipelineRelease(resource->pipeline);
    wgpuPipelineLayoutRelease(resource->layout);
    if (resource->sampler_layout != nullptr) {
        wgpuBindGroupLayoutRelease(resource->sampler_layout);
    }
    m_impl->pipelines.destroy(pipeline);
}

void Device::request_capture() noexcept {
    ATLAS_ASSERT_MAIN_THREAD();
    if (m_impl != nullptr) {
        m_impl->capture_requested = true;
    }
}

std::optional<Device::Capture> Device::take_capture() noexcept {
    ATLAS_ASSERT_MAIN_THREAD();
    if (m_impl == nullptr) {
        return std::nullopt;
    }
    return std::exchange(m_impl->capture, std::nullopt);
}

namespace {

void on_mapped(WGPUMapAsyncStatus status, WGPUStringView /*message*/, void* userdata1, void*) {
    auto* state = static_cast<int*>(userdata1);
    if (state != nullptr) {
        *state = status == WGPUMapAsyncStatus_Success ? 1 : -1;
    }
}

/// Copy a mapped staging buffer's rows out, dropping the padding WebGPU required.
void copy_rows(const std::byte* mapped, std::uint32_t padded, std::uint32_t row_bytes,
               std::uint32_t rows, std::byte* out) {
    for (std::uint32_t row = 0; row < rows; ++row) {
        std::memcpy(out + (static_cast<std::size_t>(row) * row_bytes),
                    mapped + (static_cast<std::size_t>(row) * padded), row_bytes);
    }
}

}  // namespace

Result<ReadbackHandle> Device::request_readback(TextureHandle texture, Rect2D region) {
    ATLAS_ZONE_NAMED("Device::request_readback");
    ATLAS_ASSERT_MAIN_THREAD();

    if (m_impl == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "request_readback on an invalid device"));
    }
    if (m_impl->health.lost()) {
        return std::unexpected(m_impl->already_lost("read a texture back"));
    }
    const TextureResource* resource = m_impl->textures.get(texture);
    if (resource == nullptr) {
        return std::unexpected(Error(ErrorCode::InvalidArgument,
                                     "the texture to read back does not resolve; it was "
                                     "destroyed, or the handle is from another device"));
    }
    const std::uint32_t pixel_size = byte_size(resource->format);
    if (pixel_size == 0) {
        return std::unexpected(
            Error(ErrorCode::NotSupported,
                  std::format("texture '{}' has format {}, whose pixel size is not known here",
                              resource->debug_name, to_string(resource->format))));
    }
    if (region.extent.width == 0 || region.extent.height == 0) {
        return std::unexpected(Error(
            ErrorCode::InvalidArgument,
            std::format("an empty region of texture '{}' was asked for", resource->debug_name)));
    }
    const std::uint64_t right = static_cast<std::uint64_t>(region.x) + region.extent.width;
    const std::uint64_t bottom = static_cast<std::uint64_t>(region.y) + region.extent.height;
    if (right > resource->width || bottom > resource->height) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument,
                  std::format("the region ({},{} {}x{}) leaves texture '{}', which is {}x{}",
                              region.x, region.y, region.extent.width, region.extent.height,
                              resource->debug_name, resource->width, resource->height)));
    }
    if (m_impl->readbacks.size() >= kMaxPendingReadbacks) {
        return std::unexpected(
            Error(ErrorCode::Exhausted,
                  std::format("{} readbacks are already outstanding, which is the limit. Something "
                              "is asking and not collecting.",
                              kMaxPendingReadbacks)));
    }

    const std::uint32_t row_bytes = region.extent.width * pixel_size;
    const std::uint32_t padded = padded_row(row_bytes);
    const std::uint32_t byte_count = row_bytes * region.extent.height;

    WGPUBufferDescriptor staging_desc = WGPU_BUFFER_DESCRIPTOR_INIT;
    staging_desc.label = detail::view("atlas readback");
    staging_desc.size = static_cast<std::uint64_t>(padded) * region.extent.height;
    staging_desc.usage = WGPUBufferUsage_MapRead | WGPUBufferUsage_CopyDst;
    WGPUBuffer staging = wgpuDeviceCreateBuffer(m_impl->device, &staging_desc);
    if (staging == nullptr) {
        return std::unexpected(
            m_impl->fail(ErrorCode::ResourceCreationFailed, "creating a readback staging buffer"));
    }

    WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(m_impl->device, nullptr);
    WGPUTexelCopyTextureInfo source = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT;
    source.texture = resource->texture;
    source.origin = WGPUOrigin3D{.x = region.x, .y = region.y, .z = 0};
    source.aspect = WGPUTextureAspect_All;
    WGPUTexelCopyBufferInfo destination = WGPU_TEXEL_COPY_BUFFER_INFO_INIT;
    destination.buffer = staging;
    destination.layout.offset = 0;
    destination.layout.bytesPerRow = padded;
    destination.layout.rowsPerImage = region.extent.height;
    const WGPUExtent3D size{.width = region.extent.width,
                            .height = region.extent.height,
                            .depthOrArrayLayers = 1};
    wgpuCommandEncoderCopyTextureToBuffer(encoder, &source, &destination, &size);
    WGPUCommandBuffer commands = wgpuCommandEncoderFinish(encoder, nullptr);
    wgpuQueueSubmit(m_impl->queue, 1, &commands);
    wgpuCommandBufferRelease(commands);
    wgpuCommandEncoderRelease(encoder);

    Device::Readback result;
    result.region = region;
    result.format = resource->format;
    result.pixels.resize(byte_count);

    std::size_t state_slot = 0;
    while (state_slot < kMaxPendingReadbacks && m_impl->readback_slot_used[state_slot]) {
        ++state_slot;
    }
    if (state_slot == kMaxPendingReadbacks) {
        wgpuBufferRelease(staging);
        return std::unexpected(Error(ErrorCode::Exhausted, "no readback state cell is free"));
    }

    auto ticket = m_impl->readbacks.insert(PendingReadback{
        .staging = staging,
        .padded_row = padded,
        .region = region,
        .format = resource->format,
        .byte_count = byte_count,
        .state_slot = state_slot,
        .result = std::move(result),
        .collected = false,
        .debug_name = resource->debug_name,
    });
    if (!ticket) {
        wgpuBufferRelease(staging);
        return std::unexpected(std::move(ticket).error().context("recording a readback"));
    }

    // Asked for now, answered by the browser between frames, into a cell on the device.
    m_impl->readback_slot_used[state_slot] = true;
    m_impl->readback_states[state_slot] = 0;
    WGPUBufferMapCallbackInfo map = WGPU_BUFFER_MAP_CALLBACK_INFO_INIT;
    map.mode = WGPUCallbackMode_AllowProcessEvents;
    map.callback = on_mapped;
    map.userdata1 = &m_impl->readback_states[state_slot];
    (void)wgpuBufferMapAsync(staging, WGPUMapMode_Read, 0, staging_desc.size, map);
    return *ticket;
}

bool Device::readback_ready(ReadbackHandle ticket) noexcept {
    ATLAS_ASSERT_MAIN_THREAD();
    if (m_impl == nullptr) {
        return false;
    }
    PendingReadback* pending = m_impl->readbacks.get(ticket);
    if (pending == nullptr) {
        return false;
    }
    if (pending->collected) {
        return true;
    }
    if (pending->staging == nullptr) {
        return false;
    }
    // Runs the map callback if the browser has resolved the mapping since the last poll.
    wgpuInstanceProcessEvents(m_impl->instance);
    const int state = m_impl->readback_states[pending->state_slot];
    if (state == 0) {
        return false;
    }
    m_impl->readback_slot_used[pending->state_slot] = false;
    if (state > 0) {
        const auto* mapped = static_cast<const std::byte*>(
            wgpuBufferGetConstMappedRange(pending->staging, 0, WGPU_WHOLE_MAP_SIZE));
        if (mapped != nullptr) {
            copy_rows(mapped, pending->padded_row,
                      pending->region.extent.width * byte_size(pending->format),
                      pending->region.extent.height, pending->result.pixels.data());
            pending->collected = true;
        }
        wgpuBufferUnmap(pending->staging);
    } else {
        std::fprintf(stderr, "atlas rhi: mapping the pixels read back from '%s' failed\n",
                     pending->debug_name.c_str());
    }
    wgpuBufferRelease(pending->staging);
    pending->staging = nullptr;
    return pending->collected;
}

Result<Device::Readback> Device::take_readback(ReadbackHandle ticket) {
    ATLAS_ASSERT_MAIN_THREAD();

    if (m_impl == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "take_readback on an invalid device"));
    }
    PendingReadback* pending = m_impl->readbacks.get(ticket);
    if (pending == nullptr) {
        return std::unexpected(Error(ErrorCode::InvalidArgument,
                                     "this readback ticket does not resolve; it was already "
                                     "taken, or it is from another device"));
    }
    if (!pending->collected && !readback_ready(ticket)) {
        if (pending->staging == nullptr) {
            m_impl->readbacks.destroy(ticket);
            return std::unexpected(
                Error(ErrorCode::Internal, "a readback signalled but produced no pixels"));
        }
        return std::unexpected(Error(ErrorCode::Unavailable,
                                     "this readback has not finished yet; ask readback_ready "
                                     "first, or wait_idle to force it"));
    }
    pending = m_impl->readbacks.get(ticket);
    if (pending == nullptr || !pending->collected) {
        return std::unexpected(
            Error(ErrorCode::Internal, "a readback signalled but produced no pixels"));
    }
    Readback taken = std::move(pending->result);
    m_impl->readbacks.destroy(ticket);
    return taken;
}

std::size_t Device::pending_readbacks() const noexcept {
    ATLAS_ASSERT_MAIN_THREAD();
    return m_impl != nullptr ? m_impl->readbacks.size() : 0;
}

namespace detail {

/// Copy this frame's canvas texture back to memory and store it on the device. Waits, as the
/// native capture does, so it is for screenshots and tests only.
Status capture_frame(Device::Impl& device, Frame::Impl& frame) {
    ATLAS_ZONE_NAMED("capture texture");
    const std::uint32_t pixel_size = byte_size(device.swapchain_format);
    const Extent2D extent = frame.extent;
    if (pixel_size == 0 || extent.width == 0 || extent.height == 0) {
        device.capture_requested = false;
        return std::unexpected(Error(ErrorCode::Unavailable,
                                     "cannot capture: the swapchain format or size is unknown"));
    }
    const std::uint32_t row_bytes = extent.width * pixel_size;
    const std::uint32_t padded = padded_row(row_bytes);

    WGPUBufferDescriptor staging_desc = WGPU_BUFFER_DESCRIPTOR_INIT;
    staging_desc.size = static_cast<std::uint64_t>(padded) * extent.height;
    staging_desc.usage = WGPUBufferUsage_MapRead | WGPUBufferUsage_CopyDst;
    WGPUBuffer staging = wgpuDeviceCreateBuffer(device.device, &staging_desc);

    WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(device.device, nullptr);
    WGPUTexelCopyTextureInfo source = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT;
    source.texture = frame.swapchain;
    source.aspect = WGPUTextureAspect_All;
    WGPUTexelCopyBufferInfo destination = WGPU_TEXEL_COPY_BUFFER_INFO_INIT;
    destination.buffer = staging;
    destination.layout.bytesPerRow = padded;
    destination.layout.rowsPerImage = extent.height;
    const WGPUExtent3D size{.width = extent.width, .height = extent.height, .depthOrArrayLayers = 1};
    wgpuCommandEncoderCopyTextureToBuffer(encoder, &source, &destination, &size);
    WGPUCommandBuffer commands = wgpuCommandEncoderFinish(encoder, nullptr);
    wgpuQueueSubmit(device.queue, 1, &commands);
    wgpuCommandBufferRelease(commands);
    wgpuCommandEncoderRelease(encoder);

    int state = 0;
    WGPUBufferMapCallbackInfo map = WGPU_BUFFER_MAP_CALLBACK_INFO_INIT;
    map.mode = WGPUCallbackMode_WaitAnyOnly;
    map.callback = on_mapped;
    map.userdata1 = &state;
    device.wait(wgpuBufferMapAsync(staging, WGPUMapMode_Read, 0, staging_desc.size, map));
    device.capture_requested = false;
    if (state <= 0) {
        wgpuBufferRelease(staging);
        return std::unexpected(Error(ErrorCode::Internal, "mapping the captured pixels failed"));
    }
    const auto* mapped = static_cast<const std::byte*>(
        wgpuBufferGetConstMappedRange(staging, 0, WGPU_WHOLE_MAP_SIZE));
    Device::Capture capture;
    capture.extent = extent;
    capture.format = device.swapchain_format;
    capture.pixels.resize(static_cast<std::size_t>(row_bytes) * extent.height);
    if (mapped != nullptr) {
        copy_rows(mapped, padded, row_bytes, extent.height, capture.pixels.data());
    }
    wgpuBufferUnmap(staging);
    wgpuBufferRelease(staging);
    device.capture = std::move(capture);
    ATLAS_LOG_INFO(kRhi, "captured {}x{} pixels ({} bytes, {})", extent.width, extent.height,
                   static_cast<std::size_t>(row_bytes) * extent.height,
                   to_string(device.swapchain_format));
    return ok();
}

}  // namespace detail

}  // namespace atlas::rhi
