// SPDX-License-Identifier: GPL-3.0-or-later
//
// The browser build's counterpart of engine/rhi/src/backends.cpp: one backend, WebGPU, which
// takes WGSL and nothing else.

#include "backends.hpp"

namespace atlas::rhi::detail {

std::vector<ShaderFormat> requested_shader_formats() {
    return {kShippedShaderFormats.begin(), kShippedShaderFormats.end()};
}

std::vector<std::string> compiled_backends() {
    return {"webgpu"};
}

std::vector<ShaderFormat> backend_shader_formats(std::string_view backend) {
    if (backend == "webgpu") {
        return {ShaderFormat::Wgsl};
    }
    return {};
}

}  // namespace atlas::rhi::detail
