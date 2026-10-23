// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

/// \file
/// Atlas's RHI vocabulary to WebGPU's, in one place. The WebGPU counterpart of
/// engine/rhi/src/sdl_gpu_conv.hpp, written for the browser build of the lab.

#include <atlas/rhi/descs.hpp>
#include <atlas/rhi/types.hpp>

#include <webgpu/webgpu.h>

#include <string>
#include <string_view>

namespace atlas::rhi::detail {

[[nodiscard]] WGPUBufferUsage to_wgpu(BufferUsage usage) noexcept;
[[nodiscard]] WGPUPrimitiveTopology to_wgpu(PrimitiveTopology topology) noexcept;
[[nodiscard]] WGPUVertexFormat to_wgpu(VertexFormat format) noexcept;
[[nodiscard]] WGPULoadOp to_wgpu(LoadOp op) noexcept;
[[nodiscard]] WGPUFilterMode to_wgpu(Filter filter) noexcept;
[[nodiscard]] WGPUAddressMode to_wgpu(AddressMode mode) noexcept;
[[nodiscard]] WGPUTextureFormat to_wgpu(TextureFormat format) noexcept;
[[nodiscard]] TextureFormat from_wgpu(WGPUTextureFormat format) noexcept;
[[nodiscard]] WGPUTextureUsage to_wgpu(TextureUsage usage) noexcept;

/// A string view WebGPU can read, over storage the caller keeps alive for the call.
[[nodiscard]] inline WGPUStringView view(std::string_view text) noexcept {
    return WGPUStringView{.data = text.data(), .length = text.size()};
}

[[nodiscard]] inline std::string text(WGPUStringView view) {
    if (view.data == nullptr) {
        return {};
    }
    return view.length == WGPU_STRLEN ? std::string{view.data}
                                      : std::string{view.data, view.length};
}

}  // namespace atlas::rhi::detail
