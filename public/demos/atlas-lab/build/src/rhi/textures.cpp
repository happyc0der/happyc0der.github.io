// SPDX-License-Identifier: GPL-3.0-or-later
//
// atlas::rhi on WebGPU: textures and samplers. The WebGPU counterpart of
// engine/rhi/src/textures.cpp, written for the browser build of the lab.

#include <atlas/core/assert.hpp>
#include <atlas/core/profile.hpp>
#include <atlas/rhi/device.hpp>

#include "device_impl.hpp"
#include "webgpu_conv.hpp"

#include <cstring>
#include <format>
#include <string>
#include <utility>
#include <vector>

namespace atlas::rhi {

Result<TextureHandle> Device::create_texture(const TextureDesc& desc) {
    ATLAS_ASSERT_MAIN_THREAD();

    if (m_impl == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "create_texture on an invalid device"));
    }
    if (m_impl->health.lost()) {
        return std::unexpected(m_impl->already_lost("create a texture"));
    }
    if (desc.width == 0 || desc.height == 0) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument,
                  std::format("texture '{}' must have a non-zero size, got {}x{}", desc.debug_name,
                              desc.width, desc.height)));
    }
    if (desc.format == TextureFormat::Unknown) {
        return std::unexpected(Error(ErrorCode::InvalidArgument,
                                     std::format("texture '{}' has no format", desc.debug_name)));
    }
    if (!desc.usage.sampled && !desc.usage.colour_target) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument,
                  std::format("texture '{}' declares no usage, so nothing could read or write it",
                              desc.debug_name)));
    }
    // R32Uint cannot be filtered in WebGPU, and a sampled integer texture would need a
    // non-filtering layout nothing here builds. Atlas only ever draws into one and reads it
    // back, which is what is supported.
    if (is_integer_format(desc.format) && desc.usage.sampled) {
        return std::unexpected(Error(
            ErrorCode::NotSupported,
            std::format("this backend ({}) cannot sample format {}, wanted for texture '{}'",
                        m_impl->backend_name, to_string(desc.format), desc.debug_name)));
    }

    const std::string name{desc.debug_name};
    WGPUTextureDescriptor info = WGPU_TEXTURE_DESCRIPTOR_INIT;
    info.label = detail::view(name);
    info.usage = detail::to_wgpu(desc.usage);
    info.dimension = WGPUTextureDimension_2D;
    info.size = WGPUExtent3D{.width = desc.width, .height = desc.height, .depthOrArrayLayers = 1};
    info.format = detail::to_wgpu(desc.format);
    info.mipLevelCount = 1;
    info.sampleCount = 1;

    WGPUTexture texture = wgpuDeviceCreateTexture(m_impl->device, &info);
    if (texture == nullptr) {
        return std::unexpected(
            m_impl->fail(ErrorCode::ResourceCreationFailed,
                         std::format("creating texture '{}' ({}x{}, {}) failed", desc.debug_name,
                                     desc.width, desc.height, to_string(desc.format))));
    }
    WGPUTextureView view = wgpuTextureCreateView(texture, nullptr);

    auto handle = m_impl->textures.insert(TextureResource{
        .texture = texture,
        .view = view,
        .width = desc.width,
        .height = desc.height,
        .format = desc.format,
        .usage = desc.usage,
        .debug_name = name,
    });
    if (!handle) {
        wgpuTextureViewRelease(view);
        wgpuTextureDestroy(texture);
        wgpuTextureRelease(texture);
        return std::unexpected(std::move(handle).error().context("registering a texture"));
    }
    return *handle;
}

Status Device::upload_texture(TextureHandle texture, std::span<const std::byte> pixels) {
    ATLAS_ZONE_NAMED("Device::upload_texture");
    ATLAS_ASSERT_MAIN_THREAD();

    if (m_impl == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "upload_texture on an invalid device"));
    }
    if (m_impl->health.lost()) {
        return std::unexpected(m_impl->already_lost("upload to a texture"));
    }
    const auto* resource = m_impl->textures.get(texture);
    if (resource == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "upload_texture: the handle is null or stale"));
    }
    const std::uint32_t pixel_size = byte_size(resource->format);
    const std::size_t expected =
        static_cast<std::size_t>(resource->width) * resource->height * pixel_size;
    if (pixels.size() != expected) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument,
                  std::format("texture '{}' is {}x{} in {}, which needs exactly {} bytes; got {}",
                              resource->debug_name, resource->width, resource->height,
                              to_string(resource->format), expected, pixels.size())));
    }

    WGPUTexelCopyTextureInfo destination = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT;
    destination.texture = resource->texture;
    destination.aspect = WGPUTextureAspect_All;
    WGPUTexelCopyBufferLayout layout = WGPU_TEXEL_COPY_BUFFER_LAYOUT_INIT;
    layout.offset = 0;
    layout.bytesPerRow = resource->width * pixel_size;  // queue writes need no 256 padding
    layout.rowsPerImage = resource->height;
    const WGPUExtent3D size{
        .width = resource->width, .height = resource->height, .depthOrArrayLayers = 1};
    // Ordered before every later submission, like upload_buffer; nothing to wait for.
    wgpuQueueWriteTexture(m_impl->queue, &destination, pixels.data(), pixels.size(), &layout,
                          &size);
    return ok();
}

void Device::destroy_texture(TextureHandle texture) {
    if (m_impl == nullptr) {
        return;
    }
    ATLAS_ASSERT_MAIN_THREAD();
    const auto* resource = m_impl->textures.get(texture);
    if (resource == nullptr) {
        return;
    }
    wgpuTextureViewRelease(resource->view);
    wgpuTextureDestroy(resource->texture);
    wgpuTextureRelease(resource->texture);
    m_impl->textures.destroy(texture);
}

Result<SamplerHandle> Device::create_sampler(const SamplerDesc& desc) {
    ATLAS_ASSERT_MAIN_THREAD();

    if (m_impl == nullptr) {
        return std::unexpected(
            Error(ErrorCode::InvalidArgument, "create_sampler on an invalid device"));
    }
    if (m_impl->health.lost()) {
        return std::unexpected(m_impl->already_lost("create a sampler"));
    }

    WGPUSamplerDescriptor info = WGPU_SAMPLER_DESCRIPTOR_INIT;
    info.label = detail::view(desc.debug_name);
    info.minFilter = detail::to_wgpu(desc.min_filter);
    info.magFilter = detail::to_wgpu(desc.mag_filter);
    info.mipmapFilter = WGPUMipmapFilterMode_Nearest;
    info.addressModeU = detail::to_wgpu(desc.address_u);
    info.addressModeV = detail::to_wgpu(desc.address_v);
    info.addressModeW = WGPUAddressMode_ClampToEdge;
    info.maxAnisotropy = 1;

    WGPUSampler sampler = wgpuDeviceCreateSampler(m_impl->device, &info);
    if (sampler == nullptr) {
        return std::unexpected(
            m_impl->fail(ErrorCode::ResourceCreationFailed,
                         std::format("creating sampler '{}' failed", desc.debug_name)));
    }
    auto handle = m_impl->samplers.insert(SamplerResource{
        .sampler = sampler,
        .debug_name = std::string{desc.debug_name},
    });
    if (!handle) {
        wgpuSamplerRelease(sampler);
        return std::unexpected(std::move(handle).error().context("registering a sampler"));
    }
    return *handle;
}

void Device::destroy_sampler(SamplerHandle sampler) {
    if (m_impl == nullptr) {
        return;
    }
    ATLAS_ASSERT_MAIN_THREAD();
    const auto* resource = m_impl->samplers.get(sampler);
    if (resource == nullptr) {
        return;
    }
    wgpuSamplerRelease(resource->sampler);
    m_impl->samplers.destroy(sampler);
}

}  // namespace atlas::rhi
