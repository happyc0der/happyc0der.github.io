// SPDX-License-Identifier: GPL-3.0-or-later
#include "webgpu_conv.hpp"

namespace atlas::rhi::detail {

WGPUBufferUsage to_wgpu(BufferUsage usage) noexcept {
    // CopyDst on both, because every buffer here is filled by a queue write.
    switch (usage) {
    case BufferUsage::Vertex: return WGPUBufferUsage_Vertex | WGPUBufferUsage_CopyDst;
    case BufferUsage::Index: return WGPUBufferUsage_Index | WGPUBufferUsage_CopyDst;
    }
    return WGPUBufferUsage_Vertex | WGPUBufferUsage_CopyDst;
}

WGPUPrimitiveTopology to_wgpu(PrimitiveTopology topology) noexcept {
    switch (topology) {
    case PrimitiveTopology::TriangleList: return WGPUPrimitiveTopology_TriangleList;
    case PrimitiveTopology::TriangleStrip: return WGPUPrimitiveTopology_TriangleStrip;
    case PrimitiveTopology::LineList: return WGPUPrimitiveTopology_LineList;
    case PrimitiveTopology::PointList: return WGPUPrimitiveTopology_PointList;
    }
    return WGPUPrimitiveTopology_TriangleList;
}

WGPUVertexFormat to_wgpu(VertexFormat format) noexcept {
    switch (format) {
    case VertexFormat::Float1: return WGPUVertexFormat_Float32;
    case VertexFormat::Float2: return WGPUVertexFormat_Float32x2;
    case VertexFormat::Float3: return WGPUVertexFormat_Float32x3;
    case VertexFormat::Float4: return WGPUVertexFormat_Float32x4;
    case VertexFormat::UByte4Norm: return WGPUVertexFormat_Unorm8x4;
    }
    return WGPUVertexFormat_Float32x4;
}

WGPULoadOp to_wgpu(LoadOp op) noexcept {
    // WebGPU has no "don't care"; clearing is the cheap equivalent on a tiled GPU.
    switch (op) {
    case LoadOp::Clear: return WGPULoadOp_Clear;
    case LoadOp::Load: return WGPULoadOp_Load;
    case LoadOp::DontCare: return WGPULoadOp_Clear;
    }
    return WGPULoadOp_Clear;
}

WGPUFilterMode to_wgpu(Filter filter) noexcept {
    return filter == Filter::Nearest ? WGPUFilterMode_Nearest : WGPUFilterMode_Linear;
}

WGPUAddressMode to_wgpu(AddressMode mode) noexcept {
    switch (mode) {
    case AddressMode::ClampToEdge: return WGPUAddressMode_ClampToEdge;
    case AddressMode::Repeat: return WGPUAddressMode_Repeat;
    case AddressMode::MirroredRepeat: return WGPUAddressMode_MirrorRepeat;
    }
    return WGPUAddressMode_ClampToEdge;
}

WGPUTextureFormat to_wgpu(TextureFormat format) noexcept {
    switch (format) {
    case TextureFormat::Unknown: return WGPUTextureFormat_Undefined;
    case TextureFormat::Bgra8Unorm: return WGPUTextureFormat_BGRA8Unorm;
    case TextureFormat::Rgba8Unorm: return WGPUTextureFormat_RGBA8Unorm;
    case TextureFormat::Bgra8UnormSrgb: return WGPUTextureFormat_BGRA8UnormSrgb;
    case TextureFormat::Rgba8UnormSrgb: return WGPUTextureFormat_RGBA8UnormSrgb;
    case TextureFormat::R32Uint: return WGPUTextureFormat_R32Uint;
    }
    return WGPUTextureFormat_Undefined;
}

TextureFormat from_wgpu(WGPUTextureFormat format) noexcept {
    switch (format) {
    case WGPUTextureFormat_BGRA8Unorm: return TextureFormat::Bgra8Unorm;
    case WGPUTextureFormat_RGBA8Unorm: return TextureFormat::Rgba8Unorm;
    case WGPUTextureFormat_BGRA8UnormSrgb: return TextureFormat::Bgra8UnormSrgb;
    case WGPUTextureFormat_RGBA8UnormSrgb: return TextureFormat::Rgba8UnormSrgb;
    case WGPUTextureFormat_R32Uint: return TextureFormat::R32Uint;
    default: return TextureFormat::Unknown;
    }
}

WGPUTextureUsage to_wgpu(TextureUsage usage) noexcept {
    // CopyDst so that upload_texture can write it, CopySrc so that a readback can read it.
    WGPUTextureUsage flags = WGPUTextureUsage_CopyDst | WGPUTextureUsage_CopySrc;
    if (usage.sampled) {
        flags |= WGPUTextureUsage_TextureBinding;
    }
    if (usage.colour_target) {
        flags |= WGPUTextureUsage_RenderAttachment;
    }
    return flags;
}

}  // namespace atlas::rhi::detail
