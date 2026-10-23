// SPDX-License-Identifier: GPL-3.0-or-later
//
// atlas::rhi on WebGPU: devices, frames and render passes.
//
// Written for the browser build of the lab (portfolio demo `atlas-lab`). It implements the
// same public interface as engine/rhi/src/device.cpp, which drives SDL_GPU: SDL 3.4 has no
// SDL_GPU backend for the web (SDL_CreateGPUDevice reports "No supported SDL_GPU backend
// found!" under Emscripten), so this file talks to WebGPU through Emscripten's emdawnwebgpu
// port instead. Behaviour the callers rely on is kept, and where WebGPU cannot do what SDL
// does the difference is said where it happens.
//
// Waiting. Native SDL_GPU blocks in two places: acquiring the swapchain image (vsync) and
// waiting on fences. A browser cannot block, so both are written as waits that yield to the
// browser through Emscripten's Asyncify: begin_frame waits for the next animation frame,
// which is the browser's vsync and where it presents the previous frame; wait_idle and the
// device and pipeline creation checks wait on WebGPU futures.

#include <atlas/core/assert.hpp>
#include <atlas/core/handle.hpp>
#include <atlas/core/log.hpp>
#include <atlas/core/profile.hpp>
#include <atlas/platform/internal/sdl_access.hpp>
#include <atlas/platform/window.hpp>
#include <atlas/rhi/device.hpp>

#include "device_impl.hpp"
#include "webgpu_conv.hpp"
#include <SDL3/SDL_properties.h>
#include <SDL3/SDL_video.h>
#include <emscripten/emscripten.h>
#include <emscripten/html5.h>

#include <algorithm>
#include <array>
#include <cstdio>
#include <cstring>
#include <format>
#include <string>
#include <utility>
#include <vector>

// Resolve on the browser's next animation frame. The canvas presents what was drawn into its
// current texture when control returns to the browser, so this is both the present and the
// wait for the display that SDL_WaitAndAcquireGPUSwapchainTexture does natively.
EM_ASYNC_JS(void, atlas_web_wait_for_animation_frame, (), {
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
});

namespace atlas::rhi {

namespace {

constexpr log::Category kRhi{"rhi"};

}  // namespace

Error Device::Impl::fail(ErrorCode fallback, std::string_view what) {
    const std::string detail = std::exchange(last_error, {});
    const ErrorCode code = health.record_failure(fallback, detail);
    if (code == ErrorCode::DeviceLost && fallback != ErrorCode::DeviceLost) {
        ATLAS_LOG_ERROR(kRhi,
                        "the graphics device was lost while {}: {}. Atlas does not recover "
                        "from this; the application must be restarted.",
                        what, detail);
    }
    if (detail.empty()) {
        return {code, std::string{what}};
    }
    return {code, std::format("{}: {}", what, detail)};
}

Error Device::Impl::already_lost(std::string_view what) const {
    return {ErrorCode::DeviceLost,
            std::format("cannot {}: the graphics device was lost earlier ({}). Atlas does not "
                        "recover from device loss; the application must be restarted.",
                        what, health.reason())};
}

std::optional<std::uint32_t> Device::Impl::push_uniforms(std::span<const std::byte> data) {
    if (data.size() > kUniformSlotBytes) {
        ATLAS_LOG_ERROR(kRhi, "a uniform push of {} bytes exceeds this backend's {}-byte slot",
                        data.size(), kUniformSlotBytes);
        return std::nullopt;
    }
    if (uniform_used + kUniformSlotBytes > kUniformArenaBytes) {
        ATLAS_LOG_ERROR(kRhi, "this frame pushed more than {} uniform slots; the draw is skipped",
                        kUniformArenaBytes / kUniformSlotBytes);
        return std::nullopt;
    }
    const std::uint32_t offset = uniform_used;
    std::memcpy(uniform_arena.data() + offset, data.data(), data.size());
    uniform_used += kUniformSlotBytes;
    return offset;
}

void Device::Impl::wait(WGPUFuture future) const {
    WGPUFutureWaitInfo info{.future = future, .completed = false};
    while (!info.completed) {
        const WGPUWaitStatus status = wgpuInstanceWaitAny(instance, 1, &info, UINT64_MAX);
        if (status != WGPUWaitStatus_Success) {
            ATLAS_LOG_ERROR(kRhi, "waiting on a WebGPU future failed ({})",
                            static_cast<int>(status));
            return;
        }
    }
}

namespace detail {

void release_frame_objects(Frame::Impl& frame) noexcept {
    if (frame.encoder != nullptr) {
        wgpuCommandEncoderRelease(frame.encoder);
        frame.encoder = nullptr;
    }
    if (frame.swapchain_view != nullptr) {
        wgpuTextureViewRelease(frame.swapchain_view);
        frame.swapchain_view = nullptr;
    }
    if (frame.swapchain != nullptr) {
        wgpuTextureRelease(frame.swapchain);
        frame.swapchain = nullptr;
    }
}

}  // namespace detail

// ---------------------------------------------------------------------------------------
// RenderPass
// ---------------------------------------------------------------------------------------

RenderPass::RenderPass(std::unique_ptr<Impl> impl) noexcept : m_impl(std::move(impl)) {}

RenderPass::~RenderPass() {
    end();
}

RenderPass::RenderPass(RenderPass&& other) noexcept : m_impl(std::move(other.m_impl)) {}

RenderPass& RenderPass::operator=(RenderPass&& other) noexcept {
    if (this != &other) {
        end();
        m_impl = std::move(other.m_impl);
    }
    return *this;
}

void RenderPass::end() {
    if (m_impl == nullptr || m_impl->ended) {
        return;
    }
    ATLAS_ASSERT_MAIN_THREAD();

    wgpuRenderPassEncoderEnd(m_impl->pass);
    wgpuRenderPassEncoderRelease(m_impl->pass);
    m_impl->pass = nullptr;
    if (m_impl->sampler_group != nullptr) {
        wgpuBindGroupRelease(m_impl->sampler_group);
        m_impl->sampler_group = nullptr;
    }
    m_impl->ended = true;
    if (m_impl->frame != nullptr) {
        m_impl->frame->pass_open = false;
    }
}

void RenderPass::bind_pipeline(GraphicsPipelineHandle pipeline) {
    if (m_impl == nullptr || m_impl->ended) {
        return;
    }
    ATLAS_ASSERT_MAIN_THREAD();

    const auto* resource = m_impl->frame->device->pipelines.get(pipeline);
    if (resource == nullptr) {
        ATLAS_ASSERT_MSG(false, "bind_pipeline called with a stale or null pipeline handle");
        ATLAS_LOG_ERROR(kRhi, "bind_pipeline: handle does not resolve; the draw is skipped");
        return;
    }
    wgpuRenderPassEncoderSetPipeline(m_impl->pass, resource->pipeline);
    m_impl->pipeline = resource;
}

void RenderPass::bind_vertex_buffer(std::uint32_t slot, BufferHandle buffer, std::uint64_t offset) {
    if (m_impl == nullptr || m_impl->ended) {
        return;
    }
    ATLAS_ASSERT_MAIN_THREAD();

    const auto* resource = m_impl->frame->device->buffers.get(buffer);
    if (resource == nullptr) {
        ATLAS_ASSERT_MSG(false, "bind_vertex_buffer called with a stale or null handle");
        ATLAS_LOG_ERROR(kRhi, "bind_vertex_buffer: handle does not resolve");
        return;
    }
    wgpuRenderPassEncoderSetVertexBuffer(m_impl->pass, slot, resource->buffer, offset,
                                         resource->size - std::min(offset, resource->size));
}

void RenderPass::bind_fragment_samplers(std::uint32_t first_slot,
                                        std::span<const TextureSamplerBinding> bindings) {
    if (m_impl == nullptr || m_impl->ended || bindings.empty()) {
        return;
    }
    ATLAS_ASSERT_MAIN_THREAD();

    const PipelineResource* pipeline = m_impl->pipeline;
    if (pipeline == nullptr || pipeline->sampler_layout == nullptr) {
        ATLAS_LOG_ERROR(kRhi, "bind_fragment_samplers: the bound pipeline samples no textures");
        return;
    }
    // One texture and its sampler, at bindings 0 and 1 of group 2: the layout Tint gives the
    // one sampled shader Atlas ships (sprite.frag), whose texture and sampler glslang put at
    // the same SPIR-V binding. Nothing in the lab samples a texture.
    if (first_slot != 0 || bindings.size() != 1 || pipeline->fragment_samplers != 1) {
        ATLAS_LOG_ERROR(kRhi, "bind_fragment_samplers: this backend binds exactly one texture "
                              "and sampler pair, at slot 0");
        return;
    }
    const auto* texture = m_impl->frame->device->textures.get(bindings[0].texture);
    const auto* sampler = m_impl->frame->device->samplers.get(bindings[0].sampler);
    if (texture == nullptr || sampler == nullptr) {
        ATLAS_ASSERT_MSG(false, "bind_fragment_samplers given a stale or null handle");
        ATLAS_LOG_ERROR(kRhi, "bind_fragment_samplers: a handle does not resolve; the draw is "
                              "skipped");
        return;
    }
    std::array<WGPUBindGroupEntry, 2> entries{};
    entries[0] = WGPU_BIND_GROUP_ENTRY_INIT;
    entries[0].binding = 0;
    entries[0].textureView = texture->view;
    entries[1] = WGPU_BIND_GROUP_ENTRY_INIT;
    entries[1].binding = 1;
    entries[1].sampler = sampler->sampler;
    WGPUBindGroupDescriptor desc = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
    desc.layout = pipeline->sampler_layout;
    desc.entryCount = entries.size();
    desc.entries = entries.data();
    if (m_impl->sampler_group != nullptr) {
        wgpuBindGroupRelease(m_impl->sampler_group);
    }
    m_impl->sampler_group = wgpuDeviceCreateBindGroup(m_impl->frame->device->device, &desc);
}

void RenderPass::set_vertex_uniforms(std::uint32_t slot, std::span<const std::byte> data) {
    if (m_impl == nullptr || m_impl->ended || data.empty() || slot >= kUniformSlotsPerStage) {
        return;
    }
    ATLAS_ASSERT_MAIN_THREAD();
    if (const auto offset = m_impl->frame->device->push_uniforms(data)) {
        m_impl->vertex_offsets[slot] = *offset;
    }
}

void RenderPass::set_fragment_uniforms(std::uint32_t slot, std::span<const std::byte> data) {
    if (m_impl == nullptr || m_impl->ended || data.empty() || slot >= kUniformSlotsPerStage) {
        return;
    }
    ATLAS_ASSERT_MAIN_THREAD();
    if (const auto offset = m_impl->frame->device->push_uniforms(data)) {
        m_impl->fragment_offsets[slot] = *offset;
    }
}

void RenderPass::set_viewport(float x, float y, float width, float height) {
    if (m_impl == nullptr || m_impl->ended) {
        return;
    }
    ATLAS_ASSERT_MAIN_THREAD();
    wgpuRenderPassEncoderSetViewport(m_impl->pass, x, y, width, height, 0.0F, 1.0F);
}

void RenderPass::draw(std::uint32_t vertex_count, std::uint32_t instance_count,
                      std::uint32_t first_vertex, std::uint32_t first_instance) {
    if (m_impl == nullptr || m_impl->ended) {
        return;
    }
    ATLAS_ASSERT_MAIN_THREAD();
    const PipelineResource* pipeline = m_impl->pipeline;
    if (pipeline == nullptr) {
        ATLAS_LOG_ERROR(kRhi, "draw with no pipeline bound; skipped");
        return;
    }
    if (pipeline->fragment_samplers > 0 && m_impl->sampler_group == nullptr) {
        ATLAS_LOG_ERROR(kRhi, "draw with pipeline '{}', which samples a texture, before "
                              "bind_fragment_samplers; skipped",
                        pipeline->debug_name);
        return;
    }
    // Every group in the pipeline's layout must be set. The uniform groups take the offsets of
    // the latest push per slot, which is what SDL_GPU's pushed uniforms mean for a draw.
    Device::Impl& device = *m_impl->frame->device;
    wgpuRenderPassEncoderSetBindGroup(m_impl->pass, 0, device.empty_group, 0, nullptr);
    wgpuRenderPassEncoderSetBindGroup(m_impl->pass, 1, device.vertex_uniform_group,
                                      kUniformSlotsPerStage, m_impl->vertex_offsets.data());
    wgpuRenderPassEncoderSetBindGroup(m_impl->pass, 2,
                                      m_impl->sampler_group != nullptr &&
                                              pipeline->fragment_samplers > 0
                                          ? m_impl->sampler_group
                                          : device.empty_group,
                                      0, nullptr);
    wgpuRenderPassEncoderSetBindGroup(m_impl->pass, 3, device.fragment_uniform_group,
                                      kUniformSlotsPerStage, m_impl->fragment_offsets.data());
    wgpuRenderPassEncoderDraw(m_impl->pass, vertex_count, instance_count, first_vertex,
                              first_instance);
}

void RenderPass::push_debug_group(std::string_view label) {
    if (m_impl == nullptr || m_impl->ended) {
        return;
    }
    wgpuRenderPassEncoderPushDebugGroup(m_impl->pass, detail::view(label));
}

void RenderPass::pop_debug_group() {
    if (m_impl == nullptr || m_impl->ended) {
        return;
    }
    wgpuRenderPassEncoderPopDebugGroup(m_impl->pass);
}

void RenderPass::insert_debug_label(std::string_view label) {
    if (m_impl == nullptr || m_impl->ended) {
        return;
    }
    wgpuRenderPassEncoderInsertDebugMarker(m_impl->pass, detail::view(label));
}

Extent2D RenderPass::target_extent() const noexcept {
    return m_impl != nullptr ? m_impl->target_extent : Extent2D{};
}

TextureFormat RenderPass::target_format() const noexcept {
    return m_impl != nullptr ? m_impl->target_format : TextureFormat::Unknown;
}

// ---------------------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------------------

Frame::Frame(std::unique_ptr<Impl> impl) noexcept : m_impl(std::move(impl)) {}

namespace {

/// An abandoned frame: nothing it recorded is submitted. WebGPU needs no image handed back,
/// unlike SDL's swapchain, so cancelling is releasing.
void discard_frame(Frame::Impl& frame) {
    detail::release_frame_objects(frame);
    frame.submitted = true;
    if (frame.device != nullptr) {
        frame.device->frame_open = false;
        frame.device->uniform_used = 0;
    }
}

}  // namespace

Frame::~Frame() {
    if (m_impl != nullptr && !m_impl->submitted) {
        discard_frame(*m_impl);
    }
}

Frame::Frame(Frame&& other) noexcept : m_impl(std::move(other.m_impl)) {}

Frame& Frame::operator=(Frame&& other) noexcept {
    if (this != &other) {
        if (m_impl != nullptr && !m_impl->submitted) {
            discard_frame(*m_impl);
        }
        m_impl = std::move(other.m_impl);
    }
    return *this;
}

bool Frame::has_swapchain_target() const noexcept {
    return m_impl != nullptr && m_impl->swapchain_view != nullptr;
}

Extent2D Frame::swapchain_extent() const noexcept {
    return m_impl != nullptr ? m_impl->extent : Extent2D{};
}

TextureFormat Frame::swapchain_format() const noexcept {
    if (m_impl == nullptr || m_impl->device == nullptr) {
        return TextureFormat::Unknown;
    }
    return m_impl->device->swapchain_format;
}

Result<RenderPass> Frame::begin_render_pass(const RenderPassDesc& desc) {
    ATLAS_ASSERT_MAIN_THREAD();

    if (m_impl == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "begin_render_pass on an invalid frame"));
    }
    if (m_impl->pass_open) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "a render pass is already open on this frame"));
    }

    const bool draws_offscreen = desc.colour.texture.valid();
    if (!draws_offscreen && m_impl->swapchain_view == nullptr) {
        return std::unexpected(
            Error(ErrorCode::Unavailable,
                  "this frame has no swapchain target, so there is nothing to draw into. Check "
                  "has_swapchain_target() first, or name a texture in the pass, which needs no "
                  "swapchain image."));
    }

    WGPUTextureView target_view = nullptr;
    TextureFormat target_format = TextureFormat::Unknown;
    Extent2D target_extent;

    if (draws_offscreen) {
        const TextureResource* resource = m_impl->device->textures.get(desc.colour.texture);
        if (resource == nullptr) {
            return std::unexpected(
                Error(ErrorCode::InvalidArgument,
                      "the texture named as this pass's colour target does not resolve; it was "
                      "destroyed, or the handle is from another device"));
        }
        if (!resource->usage.colour_target) {
            return std::unexpected(
                Error(ErrorCode::InvalidArgument,
                      std::format("texture '{}' is named as a colour target but was created as {}. "
                                  "Set TextureUsage::colour_target when creating it.",
                                  resource->debug_name, to_string(resource->usage))));
        }
        target_view = resource->view;
        target_format = resource->format;
        target_extent = Extent2D{.width = resource->width, .height = resource->height};
    } else {
        // A capture reads the swapchain texture itself at end_frame: the canvas is configured
        // with CopySrc, so there is no need for SDL's offscreen-and-blit detour, which exists
        // because Metal's drawables are framebuffer-only.
        target_view = m_impl->swapchain_view;
        target_format = m_impl->device->swapchain_format;
        target_extent = m_impl->extent;
    }

    WGPURenderPassColorAttachment colour = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
    colour.view = target_view;
    colour.loadOp = detail::to_wgpu(desc.colour.load);
    colour.storeOp = WGPUStoreOp_Store;
    if (is_integer_format(target_format)) {
        // Always zero, as on every native backend; see ColourTargetDesc::clear_colour.
        colour.clearValue = WGPUColor{.r = 0.0, .g = 0.0, .b = 0.0, .a = 0.0};
    } else {
        colour.clearValue = WGPUColor{.r = desc.colour.clear_colour.r,
                                      .g = desc.colour.clear_colour.g,
                                      .b = desc.colour.clear_colour.b,
                                      .a = desc.colour.clear_colour.a};
    }

    WGPURenderPassDescriptor pass_desc = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
    pass_desc.label = detail::view(desc.debug_name);
    pass_desc.colorAttachmentCount = 1;
    pass_desc.colorAttachments = &colour;

    WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(m_impl->encoder, &pass_desc);
    if (pass == nullptr) {
        return std::unexpected(
            m_impl->device->fail(ErrorCode::Internal, "beginning a render pass"));
    }

    m_impl->pass_open = true;

    auto impl = std::make_unique<RenderPass::Impl>();
    impl->frame = m_impl.get();
    impl->pass = pass;
    impl->target_extent = target_extent;
    impl->target_format = target_format;
    return RenderPass{std::move(impl)};
}

// ---------------------------------------------------------------------------------------
// Device
// ---------------------------------------------------------------------------------------

Device::Device(std::unique_ptr<Impl> impl) noexcept : m_impl(std::move(impl)) {}

namespace {

struct AdapterRequest {
    WGPUAdapter adapter = nullptr;
    std::string message;
};

struct DeviceRequest {
    WGPUDevice device = nullptr;
    std::string message;
};

void on_adapter(WGPURequestAdapterStatus status, WGPUAdapter adapter, WGPUStringView message,
                void* userdata1, void* /*userdata2*/) {
    auto* request = static_cast<AdapterRequest*>(userdata1);
    if (status == WGPURequestAdapterStatus_Success) {
        request->adapter = adapter;
    } else {
        request->message = detail::text(message);
    }
}

void on_device(WGPURequestDeviceStatus status, WGPUDevice device, WGPUStringView message,
               void* userdata1, void* /*userdata2*/) {
    auto* request = static_cast<DeviceRequest*>(userdata1);
    if (status == WGPURequestDeviceStatus_Success) {
        request->device = device;
    } else {
        request->message = detail::text(message);
    }
}

/// The device's impl is reached through userdata, which is stable: the impl is heap-allocated
/// once and moved only as a pointer.
void on_device_lost(WGPUDevice const* /*device*/, WGPUDeviceLostReason reason,
                    WGPUStringView message, void* userdata1, void* /*userdata2*/) {
    auto* impl = static_cast<Device::Impl*>(userdata1);
    if (impl == nullptr || reason == WGPUDeviceLostReason_Destroyed ||
        reason == WGPUDeviceLostReason_CallbackCancelled) {
        return;
    }
    // Phrased so the shared classifier (device_loss.cpp) recognises it as loss.
    const std::string why = std::format("the WebGPU device was removed ({}): {}",
                                        static_cast<int>(reason), detail::text(message));
    (void)impl->health.record_failure(ErrorCode::DeviceLost, why);
    ATLAS_LOG_ERROR(kRhi, "{}. Atlas does not recover from this; reload the page.", why);
}

void on_uncaptured_error(WGPUDevice const* /*device*/, WGPUErrorType type, WGPUStringView message,
                         void* userdata1, void* /*userdata2*/) {
    auto* impl = static_cast<Device::Impl*>(userdata1);
    const std::string text = detail::text(message);
    if (impl != nullptr) {
        impl->last_error = text;
        ++impl->uncaptured_errors;
    }
    ATLAS_LOG_ERROR(kRhi, "WebGPU error ({}): {}", static_cast<int>(type), text);
}

struct ScopeResult {
    WGPUErrorType type = WGPUErrorType_NoError;
    std::string message;
};

void on_pop_scope(WGPUPopErrorScopeStatus /*status*/, WGPUErrorType type, WGPUStringView message,
                  void* userdata1, void* /*userdata2*/) {
    auto* result = static_cast<ScopeResult*>(userdata1);
    result->type = type;
    result->message = detail::text(message);
}

WGPUBindGroupLayout uniform_layout(WGPUDevice device, WGPUShaderStage stage, const char* label) {
    std::array<WGPUBindGroupLayoutEntry, kUniformSlotsPerStage> entries{};
    for (std::uint32_t i = 0; i < kUniformSlotsPerStage; ++i) {
        entries[i] = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
        entries[i].binding = i;
        entries[i].visibility = stage;
        entries[i].buffer.type = WGPUBufferBindingType_Uniform;
        entries[i].buffer.hasDynamicOffset = true;
        entries[i].buffer.minBindingSize = 0;
    }
    WGPUBindGroupLayoutDescriptor desc = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
    desc.label = detail::view(label);
    desc.entryCount = entries.size();
    desc.entries = entries.data();
    return wgpuDeviceCreateBindGroupLayout(device, &desc);
}

WGPUBindGroup uniform_group(WGPUDevice device, WGPUBindGroupLayout layout, WGPUBuffer buffer,
                            const char* label) {
    std::array<WGPUBindGroupEntry, kUniformSlotsPerStage> entries{};
    for (std::uint32_t i = 0; i < kUniformSlotsPerStage; ++i) {
        entries[i] = WGPU_BIND_GROUP_ENTRY_INIT;
        entries[i].binding = i;
        entries[i].buffer = buffer;
        entries[i].offset = 0;
        entries[i].size = kUniformSlotBytes;
    }
    WGPUBindGroupDescriptor desc = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
    desc.label = detail::view(label);
    desc.layout = layout;
    desc.entryCount = entries.size();
    desc.entries = entries.data();
    return wgpuDeviceCreateBindGroup(device, &desc);
}

/// The canvas's backing size in pixels. SDL sets it from the canvas's CSS size and the
/// device pixel ratio whenever the window is resized.
Extent2D canvas_size(const std::string& selector) {
    int width = 0;
    int height = 0;
    if (emscripten_get_canvas_element_size(selector.c_str(), &width, &height) != EMSCRIPTEN_RESULT_SUCCESS) {
        return {};
    }
    return Extent2D{.width = static_cast<std::uint32_t>(std::max(0, width)),
                    .height = static_cast<std::uint32_t>(std::max(0, height))};
}

void configure_surface(Device::Impl& impl, Extent2D extent) {
    WGPUSurfaceConfiguration config = WGPU_SURFACE_CONFIGURATION_INIT;
    config.device = impl.device;
    config.format = impl.surface_format;
    // CopySrc so that a capture can read the frame it shows.
    config.usage = WGPUTextureUsage_RenderAttachment | WGPUTextureUsage_CopySrc;
    config.width = extent.width;
    config.height = extent.height;
    config.alphaMode = WGPUCompositeAlphaMode_Opaque;
    config.presentMode = WGPUPresentMode_Fifo;
    wgpuSurfaceConfigure(impl.surface, &config);
    impl.configured = extent;
}

}  // namespace

Result<Device> Device::create(const DeviceDesc& desc, const platform::Window& window) {
    ATLAS_ASSERT_MAIN_THREAD();

    if (!window.valid()) {
        return std::unexpected(Error(ErrorCode::InvalidArgument,
                                     "cannot create a graphics device for an invalid window"));
    }
    SDL_Window* native = platform::internal::native_handle(window);
    if (native == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "the window has no native handle"));
    }
    if (desc.preferred_backend != Backend::Unknown && desc.preferred_backend != Backend::WebGpu) {
        ATLAS_LOG_WARN(kRhi, "backend {} was asked for; the browser build has only WebGPU",
                       to_string(desc.preferred_backend));
    }

    auto impl = std::make_unique<Impl>();
    impl->window = native;
    // The canvas SDL's window draws to, so the surface and SDL's input agree on one element.
    const char* canvas = SDL_GetStringProperty(SDL_GetWindowProperties(native),
                                               SDL_PROP_WINDOW_EMSCRIPTEN_CANVAS_ID_STRING,
                                               "#canvas");
    impl->canvas = canvas != nullptr ? canvas : "#canvas";

    const WGPUInstanceFeatureName timed_wait = WGPUInstanceFeatureName_TimedWaitAny;
    WGPUInstanceDescriptor instance_desc = WGPU_INSTANCE_DESCRIPTOR_INIT;
    instance_desc.requiredFeatureCount = 1;
    instance_desc.requiredFeatures = &timed_wait;
    impl->instance = wgpuCreateInstance(&instance_desc);
    if (impl->instance == nullptr) {
        return std::unexpected(Error(ErrorCode::GpuDeviceCreationFailed,
                                     "this browser has no WebGPU (navigator.gpu is missing)"));
    }

    WGPUEmscriptenSurfaceSourceCanvasHTMLSelector source =
        WGPU_EMSCRIPTEN_SURFACE_SOURCE_CANVAS_HTML_SELECTOR_INIT;
    source.selector = detail::view(impl->canvas);
    WGPUSurfaceDescriptor surface_desc = WGPU_SURFACE_DESCRIPTOR_INIT;
    surface_desc.nextInChain = &source.chain;
    surface_desc.label = detail::view("atlas canvas");
    impl->surface = wgpuInstanceCreateSurface(impl->instance, &surface_desc);
    if (impl->surface == nullptr) {
        return std::unexpected(
            Error(ErrorCode::GpuDeviceCreationFailed,
                  std::format("could not create a WebGPU surface on '{}'", impl->canvas)));
    }

    AdapterRequest adapter_request;
    WGPURequestAdapterOptions adapter_options = WGPU_REQUEST_ADAPTER_OPTIONS_INIT;
    adapter_options.compatibleSurface = impl->surface;
    adapter_options.powerPreference = WGPUPowerPreference_HighPerformance;
    WGPURequestAdapterCallbackInfo adapter_callback = WGPU_REQUEST_ADAPTER_CALLBACK_INFO_INIT;
    adapter_callback.mode = WGPUCallbackMode_WaitAnyOnly;
    adapter_callback.callback = on_adapter;
    adapter_callback.userdata1 = &adapter_request;
    impl->wait(wgpuInstanceRequestAdapter(impl->instance, &adapter_options, adapter_callback));
    if (adapter_request.adapter == nullptr) {
        return std::unexpected(Error(
            ErrorCode::GpuDeviceCreationFailed,
            std::format("no WebGPU adapter: {}. This is expected in a browser without WebGPU or "
                        "with it switched off",
                        adapter_request.message.empty() ? "the browser offered none"
                                                        : adapter_request.message)));
    }
    impl->adapter = adapter_request.adapter;

    DeviceRequest device_request;
    WGPUDeviceDescriptor device_desc = WGPU_DEVICE_DESCRIPTOR_INIT;
    device_desc.label = detail::view(desc.debug_name);
    device_desc.deviceLostCallbackInfo.mode = WGPUCallbackMode_AllowSpontaneous;
    device_desc.deviceLostCallbackInfo.callback = on_device_lost;
    device_desc.deviceLostCallbackInfo.userdata1 = impl.get();
    device_desc.uncapturedErrorCallbackInfo.callback = on_uncaptured_error;
    device_desc.uncapturedErrorCallbackInfo.userdata1 = impl.get();
    WGPURequestDeviceCallbackInfo device_callback = WGPU_REQUEST_DEVICE_CALLBACK_INFO_INIT;
    device_callback.mode = WGPUCallbackMode_WaitAnyOnly;
    device_callback.callback = on_device;
    device_callback.userdata1 = &device_request;
    impl->wait(wgpuAdapterRequestDevice(impl->adapter, &device_desc, device_callback));
    if (device_request.device == nullptr) {
        return std::unexpected(
            Error(ErrorCode::GpuDeviceCreationFailed,
                  std::format("the WebGPU adapter refused a device: {}", device_request.message)));
    }
    impl->device = device_request.device;
    impl->queue = wgpuDeviceGetQueue(impl->device);

    WGPUSurfaceCapabilities caps = WGPU_SURFACE_CAPABILITIES_INIT;
    if (wgpuSurfaceGetCapabilities(impl->surface, impl->adapter, &caps) != WGPUStatus_Success ||
        caps.formatCount == 0) {
        return std::unexpected(Error(ErrorCode::GpuDeviceCreationFailed,
                                     "the canvas reports no presentable format"));
    }
    // The first format is the browser's preferred one (getPreferredCanvasFormat).
    impl->surface_format = caps.formats[0];
    wgpuSurfaceCapabilitiesFreeMembers(caps);
    impl->swapchain_format = detail::from_wgpu(impl->surface_format);
    if (impl->swapchain_format == TextureFormat::Unknown) {
        return std::unexpected(
            Error(ErrorCode::GpuDeviceCreationFailed,
                  std::format("the canvas prefers format {}, which Atlas has no name for",
                              static_cast<int>(impl->surface_format))));
    }
    const Extent2D extent = canvas_size(impl->canvas);
    if (extent.width > 0 && extent.height > 0) {
        configure_surface(*impl, extent);
    }
    if (desc.present_mode == PresentMode::Immediate) {
        ATLAS_LOG_WARN(kRhi, "immediate presentation was asked for and a browser canvas does not "
                             "have it; frames wait for the display refresh, so any timing taken "
                             "from them measures the display rather than the engine");
    }

    // The bind groups every pipeline shares.
    WGPUBindGroupLayoutDescriptor empty_desc = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
    empty_desc.label = detail::view("atlas empty group");
    impl->empty_layout = wgpuDeviceCreateBindGroupLayout(impl->device, &empty_desc);
    WGPUBindGroupDescriptor empty_group = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
    empty_group.layout = impl->empty_layout;
    impl->empty_group = wgpuDeviceCreateBindGroup(impl->device, &empty_group);
    impl->vertex_uniform_layout =
        uniform_layout(impl->device, WGPUShaderStage_Vertex, "atlas vertex uniforms");
    impl->fragment_uniform_layout =
        uniform_layout(impl->device, WGPUShaderStage_Fragment, "atlas fragment uniforms");
    WGPUBufferDescriptor uniform_desc = WGPU_BUFFER_DESCRIPTOR_INIT;
    uniform_desc.label = detail::view("atlas uniform arena");
    uniform_desc.size = kUniformArenaBytes;
    uniform_desc.usage = WGPUBufferUsage_Uniform | WGPUBufferUsage_CopyDst;
    impl->uniform_buffer = wgpuDeviceCreateBuffer(impl->device, &uniform_desc);
    impl->vertex_uniform_group = uniform_group(impl->device, impl->vertex_uniform_layout,
                                               impl->uniform_buffer, "atlas vertex uniforms");
    impl->fragment_uniform_group = uniform_group(impl->device, impl->fragment_uniform_layout,
                                                 impl->uniform_buffer, "atlas fragment uniforms");
    impl->uniform_arena.resize(kUniformArenaBytes);

    WGPUAdapterInfo info = WGPU_ADAPTER_INFO_INIT;
    std::string adapter_name = "unknown adapter";
    if (wgpuAdapterGetInfo(impl->adapter, &info) == WGPUStatus_Success) {
        adapter_name = std::format("{} {}", detail::text(info.vendor),
                                   detail::text(info.architecture));
        wgpuAdapterInfoFreeMembers(info);
    }
    ATLAS_LOG_INFO(kRhi, "graphics device ready: backend={} adapter={} validation={} swapchain={}",
                   impl->backend_name, adapter_name, desc.debug, to_string(impl->swapchain_format));
    ATLAS_LOG_INFO(kRhi, "shader formats accepted: wgsl=true spirv=false msl=false dxil=false");

    return Device{std::move(impl)};
}

Device::~Device() {
    if (m_impl == nullptr || m_impl->device == nullptr) {
        return;
    }
    ATLAS_ASSERT_MAIN_THREAD();

    (void)wait_idle();

    if (!m_impl->readbacks.empty()) {
        std::fprintf(stderr, "atlas rhi: %zu readback(s) were asked for and never collected\n",
                     m_impl->readbacks.size());
    }
    m_impl->readbacks.for_each_live([](ReadbackHandle, PendingReadback& pending) noexcept {
        if (pending.staging != nullptr) {
            wgpuBufferRelease(pending.staging);
            pending.staging = nullptr;
        }
    });

    const auto counts = resource_counts();
    if (counts.total() > 0) {
        std::fprintf(stderr,
                     "atlas rhi: %zu graphics resources were still live at device shutdown "
                     "(buffers=%zu textures=%zu samplers=%zu shaders=%zu pipelines=%zu)\n",
                     counts.total(), counts.buffers, counts.textures, counts.samplers,
                     counts.shaders, counts.pipelines);
        m_impl->buffers.for_each_live([](BufferHandle, const BufferResource& resource) noexcept {
            std::fprintf(stderr, "  leaked buffer '%s'\n", resource.debug_name.c_str());
        });
        m_impl->textures.for_each_live([](TextureHandle, const TextureResource& resource) noexcept {
            std::fprintf(stderr, "  leaked texture '%s'\n", resource.debug_name.c_str());
        });
        m_impl->samplers.for_each_live([](SamplerHandle, const SamplerResource& resource) noexcept {
            std::fprintf(stderr, "  leaked sampler '%s'\n", resource.debug_name.c_str());
        });
        m_impl->shaders.for_each_live([](ShaderHandle, const ShaderResource& resource) noexcept {
            std::fprintf(stderr, "  leaked shader '%s'\n", resource.debug_name.c_str());
        });
        m_impl->pipelines.for_each_live(
            [](GraphicsPipelineHandle, const PipelineResource& resource) {
                std::fprintf(stderr, "  leaked pipeline '%s'\n", resource.debug_name.c_str());
            });
    }

    m_impl->pipelines.for_each_live([](GraphicsPipelineHandle, PipelineResource& resource) {
        wgpuRenderPipelineRelease(resource.pipeline);
        wgpuPipelineLayoutRelease(resource.layout);
        if (resource.sampler_layout != nullptr) {
            wgpuBindGroupLayoutRelease(resource.sampler_layout);
        }
    });
    m_impl->shaders.for_each_live(
        [](ShaderHandle, ShaderResource& resource) { wgpuShaderModuleRelease(resource.module); });
    m_impl->samplers.for_each_live(
        [](SamplerHandle, SamplerResource& resource) { wgpuSamplerRelease(resource.sampler); });
    m_impl->textures.for_each_live([](TextureHandle, TextureResource& resource) {
        wgpuTextureViewRelease(resource.view);
        wgpuTextureDestroy(resource.texture);
        wgpuTextureRelease(resource.texture);
    });
    m_impl->buffers.for_each_live([](BufferHandle, BufferResource& resource) {
        wgpuBufferDestroy(resource.buffer);
        wgpuBufferRelease(resource.buffer);
    });

    wgpuBindGroupRelease(m_impl->vertex_uniform_group);
    wgpuBindGroupRelease(m_impl->fragment_uniform_group);
    wgpuBindGroupRelease(m_impl->empty_group);
    wgpuBindGroupLayoutRelease(m_impl->vertex_uniform_layout);
    wgpuBindGroupLayoutRelease(m_impl->fragment_uniform_layout);
    wgpuBindGroupLayoutRelease(m_impl->empty_layout);
    wgpuBufferDestroy(m_impl->uniform_buffer);
    wgpuBufferRelease(m_impl->uniform_buffer);
    wgpuSurfaceUnconfigure(m_impl->surface);
    wgpuSurfaceRelease(m_impl->surface);
    wgpuQueueRelease(m_impl->queue);
    wgpuDeviceDestroy(m_impl->device);
    wgpuDeviceRelease(m_impl->device);
    wgpuAdapterRelease(m_impl->adapter);
    wgpuInstanceRelease(m_impl->instance);
    m_impl->device = nullptr;
}

Device::Device(Device&& other) noexcept : m_impl(std::move(other.m_impl)) {}

Device& Device::operator=(Device&& other) noexcept {
    if (this != &other) {
        m_impl = std::move(other.m_impl);
    }
    return *this;
}

Backend Device::backend() const noexcept {
    return m_impl != nullptr ? m_impl->backend : Backend::Unknown;
}

std::string_view Device::backend_name() const noexcept {
    return m_impl != nullptr ? std::string_view{m_impl->backend_name} : std::string_view{};
}

bool Device::supports_shader_format(ShaderFormat format) const noexcept {
    return m_impl != nullptr && format == ShaderFormat::Wgsl;
}

bool Device::is_lost() const noexcept {
    return m_impl != nullptr && m_impl->health.lost();
}

std::string_view Device::loss_reason() const noexcept {
    return m_impl != nullptr ? m_impl->health.reason() : std::string_view{};
}

TextureFormat Device::swapchain_format() const noexcept {
    return m_impl != nullptr ? m_impl->swapchain_format : TextureFormat::Unknown;
}

Device::ResourceCounts Device::resource_counts() const noexcept {
    if (m_impl == nullptr) {
        return {};
    }
    return ResourceCounts{
        .buffers = m_impl->buffers.size(),
        .textures = m_impl->textures.size(),
        .samplers = m_impl->samplers.size(),
        .shaders = m_impl->shaders.size(),
        .pipelines = m_impl->pipelines.size(),
    };
}

Result<Frame> Device::begin_frame() {
    ATLAS_ZONE_NAMED("Device::begin_frame");
    ATLAS_ASSERT_MAIN_THREAD();

    if (m_impl == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "begin_frame on an invalid device"));
    }
    if (m_impl->frame_open) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument,
                  "a frame is already open; submit or drop it before beginning another"));
    }
    if (m_impl->health.lost()) {
        return std::unexpected(m_impl->already_lost("begin a frame"));
    }

    // The wait for the display. Control goes back to the browser, which presents the frame
    // submitted last time, delivers input to SDL's handlers and calls back on the next
    // refresh. This is where native SDL_GPU waits for a swapchain image under vsync.
    atlas_web_wait_for_animation_frame();

    auto impl = std::make_unique<Frame::Impl>();
    impl->device = m_impl.get();

    WGPUCommandEncoderDescriptor encoder_desc = WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT;
    encoder_desc.label = detail::view("atlas frame");
    impl->encoder = wgpuDeviceCreateCommandEncoder(m_impl->device, &encoder_desc);
    if (impl->encoder == nullptr) {
        return std::unexpected(m_impl->fail(ErrorCode::Internal, "creating a command encoder"));
    }

    // Resized by SDL from the canvas's CSS size; the surface follows here, once a frame.
    const Extent2D extent = canvas_size(m_impl->canvas);
    if (extent.width == 0 || extent.height == 0) {
        // Not an error: a canvas of no size has nothing to draw into, like a minimised window.
        m_impl->frame_open = true;
        return Frame{std::move(impl)};
    }
    if (extent != m_impl->configured) {
        configure_surface(*m_impl, extent);
    }

    WGPUSurfaceTexture surface_texture = WGPU_SURFACE_TEXTURE_INIT;
    wgpuSurfaceGetCurrentTexture(m_impl->surface, &surface_texture);
    if (surface_texture.texture == nullptr ||
        (surface_texture.status != WGPUSurfaceGetCurrentTextureStatus_SuccessOptimal &&
         surface_texture.status != WGPUSurfaceGetCurrentTextureStatus_SuccessSuboptimal)) {
        ATLAS_LOG_DEBUG(kRhi, "no canvas texture this frame (status {})",
                        static_cast<int>(surface_texture.status));
        if (surface_texture.texture != nullptr) {
            wgpuTextureRelease(surface_texture.texture);
        }
        m_impl->frame_open = true;
        return Frame{std::move(impl)};
    }
    impl->swapchain = surface_texture.texture;
    impl->swapchain_view = wgpuTextureCreateView(surface_texture.texture, nullptr);
    impl->extent = extent;

    m_impl->frame_open = true;
    m_impl->uniform_used = 0;
    return Frame{std::move(impl)};
}

namespace detail {
Status capture_frame(Device::Impl& device, Frame::Impl& frame);
}

Status Device::end_frame(Frame&& frame) {
    ATLAS_ZONE_NAMED("Device::end_frame");
    ATLAS_ASSERT_MAIN_THREAD();

    if (m_impl == nullptr) {
        return std::unexpected(Error(ErrorCode::InvalidArgument, "end_frame on an invalid device"));
    }
    if (!frame.valid()) {
        return std::unexpected(Error(ErrorCode::InvalidArgument, "end_frame on an invalid frame"));
    }

    Frame local = std::move(frame);
    ATLAS_ASSERT_MSG(!local.m_impl->pass_open, "a render pass was still open at end_frame");

    // This frame's uniforms, in one write that the queue orders before the commands below.
    if (m_impl->uniform_used > 0) {
        wgpuQueueWriteBuffer(m_impl->queue, m_impl->uniform_buffer, 0, m_impl->uniform_arena.data(),
                             m_impl->uniform_used);
    }

    const bool capture_now = m_impl->capture_requested && local.m_impl->swapchain != nullptr;
    if (m_impl->capture_requested && !capture_now) {
        m_impl->capture_requested = false;
        ATLAS_LOG_WARN(kRhi, "a capture was requested but this frame had nothing to capture");
    }

    WGPUCommandBufferDescriptor buffer_desc = WGPU_COMMAND_BUFFER_DESCRIPTOR_INIT;
    WGPUCommandBuffer commands = wgpuCommandEncoderFinish(local.m_impl->encoder, &buffer_desc);
    if (commands == nullptr) {
        detail::release_frame_objects(*local.m_impl);
        local.m_impl->submitted = true;
        m_impl->frame_open = false;
        return std::unexpected(m_impl->fail(ErrorCode::Internal, "finishing the frame"));
    }
    wgpuQueueSubmit(m_impl->queue, 1, &commands);
    wgpuCommandBufferRelease(commands);

    Status status = ok();
    if (capture_now) {
        status = detail::capture_frame(*m_impl, *local.m_impl);
    }

    detail::release_frame_objects(*local.m_impl);
    local.m_impl->submitted = true;
    m_impl->frame_open = false;
    m_impl->uniform_used = 0;
    return status;
}

Status Device::wait_idle() {
    ATLAS_ASSERT_MAIN_THREAD();
    if (m_impl == nullptr) {
        return std::unexpected(Error(ErrorCode::InvalidArgument, "wait_idle on an invalid device"));
    }
    if (m_impl->health.lost()) {
        return std::unexpected(m_impl->already_lost("wait for the device"));
    }
    WGPUQueueWorkDoneCallbackInfo info = WGPU_QUEUE_WORK_DONE_CALLBACK_INFO_INIT;
    info.mode = WGPUCallbackMode_WaitAnyOnly;
    info.callback = [](WGPUQueueWorkDoneStatus, WGPUStringView, void*, void*) {};
    m_impl->wait(wgpuQueueOnSubmittedWorkDone(m_impl->queue, info));
    return ok();
}

}  // namespace atlas::rhi
