// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

/// \file
/// The state behind Device, Frame and RenderPass, for the WebGPU backend.
///
/// Written for the browser build of the lab (portfolio demo `atlas-lab`). It replaces
/// engine/rhi/src/device_impl.hpp, which holds SDL_GPU objects: SDL 3.4 has no SDL_GPU backend
/// for the web, so the same public interface (atlas/rhi/device.hpp) is implemented here on
/// WebGPU through Emscripten's emdawnwebgpu port. Every WebGPU type in the renderer is
/// reachable only from here and from the files that include it, as SDL's were.
///
/// What differs from SDL_GPU, and how this file bridges it:
///
/// - SDL pushes uniforms into the command buffer. WebGPU has no push constants, so each push
///   is copied into a per-frame arena at a 256-byte aligned offset, and the draw binds a
///   uniform buffer with that dynamic offset. The arena is written to the GPU with one
///   queue write just before the frame is submitted, which the queue orders before the
///   frame's commands.
/// - SDL's register spaces become bind groups, the convention the cooked shaders already
///   follow after translation: group 1 holds vertex uniforms, group 2 fragment
///   textures and samplers, group 3 fragment uniforms. Group 0 (vertex textures and storage)
///   is empty for every Atlas shader.
/// - There is no fence to wait on. Readbacks map a buffer asynchronously and are collected
///   when the browser has resolved the mapping, which is what the lab's pick already expects:
///   it polls `readback_ready` on later frames.

#include <atlas/core/handle.hpp>
#include <atlas/rhi/device.hpp>
#include <atlas/rhi/handles.hpp>
#include <atlas/rhi/types.hpp>

#include "device_loss.hpp"
#include <webgpu/webgpu.h>

#include <array>
#include <cstdint>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <vector>

struct SDL_Window;

namespace atlas::rhi {

/// Uniform data is bound in slots of this many bytes. WebGPU requires dynamic offsets to be
/// multiples of 256 on every adapter, and every Atlas shader's constant buffer is smaller
/// (the largest is 96 bytes), so one slot size serves them all.
inline constexpr std::uint32_t kUniformSlotBytes = 256;
/// Uniform buffers per stage, as SDL_GPU allows.
inline constexpr std::uint32_t kUniformSlotsPerStage = 4;
/// One frame's worth of uniform pushes: 16,384 draws. A frame that needs more is refused a
/// push and says so rather than overwriting an earlier draw's data.
inline constexpr std::uint32_t kUniformArenaBytes = 4U * 1024U * 1024U;

struct BufferResource {
    WGPUBuffer buffer = nullptr;
    std::uint64_t size = 0;
    std::string debug_name;
};

struct TextureResource {
    WGPUTexture texture = nullptr;
    WGPUTextureView view = nullptr;
    std::uint32_t width = 0;
    std::uint32_t height = 0;
    TextureFormat format = TextureFormat::Unknown;
    TextureUsage usage;
    std::string debug_name;
};

struct SamplerResource {
    WGPUSampler sampler = nullptr;
    std::string debug_name;
};

struct ShaderResource {
    WGPUShaderModule module = nullptr;
    ShaderStage stage = ShaderStage::Vertex;
    std::string entry_point;
    std::uint32_t samplers = 0;
    std::uint32_t uniform_buffers = 0;
    std::string debug_name;
};

struct PipelineResource {
    WGPURenderPipeline pipeline = nullptr;
    WGPUPipelineLayout layout = nullptr;
    /// Group 2's layout for this pipeline's fragment textures; null when it samples none.
    WGPUBindGroupLayout sampler_layout = nullptr;
    std::uint32_t fragment_samplers = 0;
    TextureFormat colour_format = TextureFormat::Unknown;
    std::string debug_name;
};

/// A readback that has been recorded and submitted and not yet collected.
struct PendingReadback {
    WGPUBuffer staging = nullptr;  ///< MapRead | CopyDst; released once the pixels are out.
    std::uint32_t padded_row = 0;  ///< Bytes per row in the staging buffer, a multiple of 256.
    Rect2D region;
    TextureFormat format = TextureFormat::Unknown;
    std::uint32_t byte_count = 0;
    /// Which of the device's map-state cells the browser's answer is written to. The cells live
    /// on the device, whose address is stable, because this record moves when its pool grows.
    std::size_t state_slot = 0;
    Device::Readback result;
    bool collected = false;
    std::string debug_name;
};

struct Device::Impl {
    WGPUInstance instance = nullptr;
    WGPUAdapter adapter = nullptr;
    WGPUDevice device = nullptr;
    WGPUQueue queue = nullptr;
    WGPUSurface surface = nullptr;
    SDL_Window* window = nullptr;
    /// The canvas the surface presents to, as a CSS selector.
    std::string canvas;
    WGPUTextureFormat surface_format = WGPUTextureFormat_Undefined;
    Extent2D configured;

    Backend backend = Backend::WebGpu;
    std::string backend_name = "webgpu";
    TextureFormat swapchain_format = TextureFormat::Unknown;

    HandlePool<BufferResource, BufferTag> buffers;
    HandlePool<TextureResource, TextureTag> textures;
    HandlePool<SamplerResource, SamplerTag> samplers;
    HandlePool<ShaderResource, ShaderTag> shaders;
    HandlePool<PipelineResource, GraphicsPipelineTag> pipelines;

    /// Shared by every pipeline: group 0 is empty, groups 1 and 3 are four uniform slots each.
    WGPUBindGroupLayout empty_layout = nullptr;
    WGPUBindGroupLayout vertex_uniform_layout = nullptr;
    WGPUBindGroupLayout fragment_uniform_layout = nullptr;
    WGPUBindGroup empty_group = nullptr;
    WGPUBindGroup vertex_uniform_group = nullptr;
    WGPUBindGroup fragment_uniform_group = nullptr;
    WGPUBuffer uniform_buffer = nullptr;
    /// This frame's pushes, copied to `uniform_buffer` in one write at submission.
    std::vector<std::byte> uniform_arena;
    std::uint32_t uniform_used = 0;

    bool frame_open = false;
    bool capture_requested = false;
    std::optional<Capture> capture;

    HandlePool<PendingReadback, ReadbackTag> readbacks;
    /// Written by the map callbacks: 0 pending, 1 mapped, -1 failed. One cell per readback
    /// that may be outstanding.
    std::array<int, Device::kMaxPendingReadbacks> readback_states{};
    std::array<bool, Device::kMaxPendingReadbacks> readback_slot_used{};

    detail::DeviceHealth health;
    /// The latest uncaptured validation error, for the next failure to report.
    std::string last_error;
    std::uint64_t uncaptured_errors = 0;

    [[nodiscard]] Error fail(ErrorCode fallback, std::string_view what);
    [[nodiscard]] Error already_lost(std::string_view what) const;

    /// Copy `data` into this frame's uniform arena and return its offset, or nothing when the
    /// arena is full or the data does not fit one slot.
    [[nodiscard]] std::optional<std::uint32_t> push_uniforms(std::span<const std::byte> data);

    /// Wait for a WebGPU future. Yields to the browser (Asyncify) until it resolves.
    void wait(WGPUFuture future) const;
};

struct Frame::Impl {
    Device::Impl* device = nullptr;
    WGPUCommandEncoder encoder = nullptr;
    WGPUTexture swapchain = nullptr;
    WGPUTextureView swapchain_view = nullptr;
    Extent2D extent;
    bool submitted = false;
    bool pass_open = false;
};

struct RenderPass::Impl {
    Frame::Impl* frame = nullptr;
    WGPURenderPassEncoder pass = nullptr;
    Extent2D target_extent;
    TextureFormat target_format = TextureFormat::Unknown;
    bool ended = false;

    /// Binding state, applied before each draw, because WebGPU sets bind groups and SDL_GPU
    /// pushes uniforms: the dynamic offsets of the latest push per slot are what a draw reads.
    const PipelineResource* pipeline = nullptr;
    std::array<std::uint32_t, kUniformSlotsPerStage> vertex_offsets{};
    std::array<std::uint32_t, kUniformSlotsPerStage> fragment_offsets{};
    WGPUBindGroup sampler_group = nullptr;
};

namespace detail {

/// Release a frame's encoder and swapchain view, whether or not it was submitted.
void release_frame_objects(Frame::Impl& frame) noexcept;

}  // namespace detail
}  // namespace atlas::rhi
