// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

/// \file
/// The WebGPU handles behind atlas::rhi, for the one consumer that needs them: the debug
/// overlay's Dear ImGui renderer (imgui_impl_wgpu). The browser build's counterpart of
/// atlas/rhi/internal/sdl_gpu_access.hpp, with the same functions and the same rule: only
/// atlas::tools includes it. The types are forward-declared, so including this pulls in no
/// graphics headers.

struct WGPUDeviceImpl;
struct WGPUCommandEncoderImpl;
struct WGPURenderPassEncoderImpl;

namespace atlas::rhi {

class Device;
class Frame;
class RenderPass;

namespace internal {

/// The native device, or nullptr for an invalid one.
[[nodiscard]] WGPUDeviceImpl* native_device(const Device& device) noexcept;

/// The command encoder a frame is recording into, or nullptr.
[[nodiscard]] WGPUCommandEncoderImpl* native_command_buffer(const Frame& frame) noexcept;

/// The native render pass encoder, or nullptr if the pass has ended.
[[nodiscard]] WGPURenderPassEncoderImpl* native_render_pass(const RenderPass& pass) noexcept;

/// The command encoder the pass is recording into, or nullptr if the pass has ended.
[[nodiscard]] WGPUCommandEncoderImpl* native_command_buffer_of(const RenderPass& pass) noexcept;

/// The swapchain's colour format as a WGPUTextureFormat value, which the overlay's backend
/// wants exactly.
[[nodiscard]] unsigned int swapchain_texture_format(const Device& device) noexcept;

}  // namespace internal
}  // namespace atlas::rhi
