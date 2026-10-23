// SPDX-License-Identifier: GPL-3.0-or-later
//
// The browser build's counterpart of engine/rhi/src/sdl_gpu_access.cpp.

#include <atlas/rhi/internal/webgpu_access.hpp>

#include "device_impl.hpp"
#include "webgpu_conv.hpp"

namespace atlas::rhi::internal {

WGPUDeviceImpl* native_device(const Device& device) noexcept {
    return device.m_impl != nullptr ? device.m_impl->device : nullptr;
}

WGPUCommandEncoderImpl* native_command_buffer(const Frame& frame) noexcept {
    return frame.m_impl != nullptr ? frame.m_impl->encoder : nullptr;
}

WGPURenderPassEncoderImpl* native_render_pass(const RenderPass& pass) noexcept {
    if (pass.m_impl == nullptr || pass.m_impl->ended) {
        return nullptr;
    }
    return pass.m_impl->pass;
}

WGPUCommandEncoderImpl* native_command_buffer_of(const RenderPass& pass) noexcept {
    if (pass.m_impl == nullptr || pass.m_impl->ended || pass.m_impl->frame == nullptr) {
        return nullptr;
    }
    return pass.m_impl->frame->encoder;
}

unsigned int swapchain_texture_format(const Device& device) noexcept {
    if (device.m_impl == nullptr) {
        return 0;
    }
    return static_cast<unsigned int>(detail::to_wgpu(device.m_impl->swapchain_format));
}

}  // namespace atlas::rhi::internal
