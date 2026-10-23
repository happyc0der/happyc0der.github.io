// SPDX-License-Identifier: GPL-3.0-or-later
//
// The browser demo's entry points into Atlas, compiled with em++ beside the engine's own sources.
//
// This file is the demo's, not the engine's. It does three things and nothing else:
//   1. Runs the repositories' three golden scenarios exactly as their tests do, and hands the
//      hashes to JavaScript. The scenarios are copied from
//        atlas-engine engine/simulation/tests/test_golden.cpp   (with synthetic_systems.hpp)
//        atlas-engine apps/lab/sim/tests/test_golden.cpp        (with lab_harness.hpp)
//        atlas-chess  sim/tests/test_golden.cpp                 (with chess_harness.hpp)
//      The harness headers include Catch2, so their few lines of wiring are repeated here with the
//      REQUIREs turned into early returns.
//   2. Drives a lab world, a pair of lab worlds in lockstep, and a chess game through the engine's
//      own Kernel, CommandQueue, World and divergence attribution.
//   3. Backs the page's JavaScript stand-in for the engine's WAMR mod host. The chess opponent mod
//      runs in the browser's WebAssembly engine; the parts of the host that touch simulation
//      state (command types, submit, random streams, views) are here, mirroring
//      engine/script/src/mod_host.cpp. The per-tick instruction budget that WAMR enforces natively
//      is not reproduced.
//
// Everything is single-threaded: no WorkerPool is created, which is the configuration the
// determinism tests compare every worker count against.

#include <atlas/chess/fen.hpp>
#include <atlas/chess/mod_views.hpp>
#include <atlas/chess/position.hpp>
#include <atlas/chess/rules.hpp>
#include <atlas/chess/world.hpp>
#include <atlas/core/assert.hpp>
#include <atlas/core/build_info.hpp>
#include <atlas/core/hash.hpp>
#include <atlas/lab/commands.hpp>
#include <atlas/lab/generate.hpp>
#include <atlas/lab/snapshot.hpp>
#include <atlas/lab/systems.hpp>
#include <atlas/lab/tables.hpp>
#include <atlas/simulation/divergence.hpp>
#include <atlas/simulation/golden.hpp>
#include <atlas/simulation/kernel.hpp>
#include <atlas/simulation/rng.hpp>

// The engine's synthetic test systems, used by its golden scenario. Header-only, no Catch2.
#include "synthetic_systems.hpp"

#include <emscripten/emscripten.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace {

namespace sim = atlas::sim;
namespace lab = atlas::lab;
namespace chess = atlas::chess;

// Output slots JavaScript reads after a call: 64-bit values and one string.
std::array<std::uint64_t, 32> g_u64{};
std::string g_text;

const bool kMainThreadMarked = [] {
    atlas::mark_main_thread();
    return true;
}();

void set_error(const atlas::Error& error) {
    g_text = error.to_string();
}

// ------------------------------------------------------------------------------------------
// Golden 1: engine/simulation/tests/test_golden.cpp, run_golden().

int run_golden_sim() {
    using sim::testing::Harness;
    Harness h(sim::kGoldenRows);
    if (!h.schedule.add(sim::testing::increment_values(h.values)) ||
        !h.schedule.add(sim::testing::sum_into_counter(h.values, h.counter)) ||
        !h.schedule.add(sim::testing::random_into_counter(h.counter))) {
        g_text = "adding the synthetic systems failed";
        return 1;
    }
    if (auto s = h.schedule.finalise(h.world); !s) {
        set_error(s.error());
        return 1;
    }
    sim::Kernel kernel(h.world, h.schedule, h.commands, sim::KernelConfig{.seed = sim::kGoldenSeed});
    const auto reports = kernel.run(sim::kGoldenTicks);
    if (!reports) {
        set_error(reports.error());
        return 1;
    }
    atlas::Hasher over_time;
    for (const auto& report : *reports) {
        over_time.add(report.state_hash);
    }
    g_u64[0] = reports->back().state_hash;
    g_u64[1] = over_time.value();
    g_u64[2] = sim::kGoldenFinalState;
    g_u64[3] = sim::kGoldenAllTicks;
    g_u64[4] = kernel.current_tick();
    return 0;
}

// ------------------------------------------------------------------------------------------
// A lab world wired as apps/lab/sim/tests/lab_harness.hpp and apps/lab/main.cpp wire it.

struct LabSim {
    lab::LabWorld lab;
    sim::Schedule schedule;
    sim::CommandQueue commands;
    std::shared_ptr<lab::CellBound> bound = std::make_shared<lab::CellBound>(0);
    std::unique_ptr<sim::Kernel> kernel;
    std::uint64_t seed = 0;
    lab::CellSnapshot snapshot;
    std::vector<std::uint32_t> rgba;
    std::vector<double> step_ms;
};

std::unique_ptr<LabSim> make_lab(const lab::LabConfig& config, std::uint64_t kernel_seed,
                                 bool record_system_hashes) {
    auto out = std::make_unique<LabSim>();
    auto generated = lab::generate(config);
    if (!generated) {
        set_error(generated.error());
        return nullptr;
    }
    out->lab = std::move(*generated);
    out->bound->store(out->lab.layout.cell_count());
    if (auto s = lab::add_lab_systems(out->schedule, out->lab.ids); !s) {
        set_error(s.error());
        return nullptr;
    }
    if (auto s = out->schedule.finalise(out->lab.world); !s) {
        set_error(s.error());
        return nullptr;
    }
    if (auto s = lab::register_lab_commands(out->commands, out->lab.ids, out->bound); !s) {
        set_error(s.error());
        return nullptr;
    }
    out->seed = kernel_seed;
    out->kernel = std::make_unique<sim::Kernel>(
        out->lab.world, out->schedule, out->commands,
        sim::KernelConfig{.seed = kernel_seed, .record_system_hashes = record_system_hashes});
    return out;
}

// Golden 2: apps/lab/sim/tests/test_golden.cpp, run_golden().
int run_golden_lab() {
    constexpr lab::LabConfig kGoldenConfig{.width = 32, .height = 32, .chunk_size = 8, .seed = 0xA71A5};
    constexpr std::uint64_t kGoldenKernelSeed = 0x0A71'A5'0000'0007ULL;
    constexpr std::uint64_t kGoldenTicks = 500;
    constexpr std::uint32_t kGoldenCommandsPerTick = 2;

    // LabHarness::kernel() leaves record_system_hashes at its default, which is on.
    auto h = make_lab(kGoldenConfig, kGoldenKernelSeed, true);
    if (!h) {
        return 1;
    }
    g_u64[0] = h->lab.world.hash();
    atlas::Hasher over_time;
    for (std::uint64_t i = 0; i < kGoldenTicks; ++i) {
        if (auto s = lab::submit_synthetic_commands(h->commands, h->kernel->current_tick(),
                                                    kGoldenCommandsPerTick, kGoldenKernelSeed,
                                                    h->lab.layout.cell_count(), sim::SourceId::Local);
            !s) {
            set_error(s.error());
            return 1;
        }
        const auto report = h->kernel->step();
        if (!report) {
            set_error(report.error());
            return 1;
        }
        over_time.add(report->state_hash);
        g_u64[1] = report->state_hash;
    }
    g_u64[2] = over_time.value();
    g_u64[3] = 0x9CF3'9EF6'6B2C'4845ULL;
    g_u64[4] = 0x1514'CC4B'3F41'D18EULL;
    g_u64[5] = 0xA962'B352'A643'ABC9ULL;
    return 0;
}

// ------------------------------------------------------------------------------------------
// Chess, wired as atlas-chess sim/tests/chess_harness.hpp and src/main.cpp wire it.

/// src/main.cpp's kSeed. Chess draws no random numbers; the opponent mod does, through the host.
constexpr std::uint64_t kChessSeed = 0x0C4E'5500'0000'0000ULL;
/// sim/tests/test_golden.cpp's kGoldenKernelSeed.
constexpr std::uint64_t kOperaSeed = 0x0C4E'5500'0000'1858ULL;

struct ChessGame {
    chess::ChessWorld chess;
    sim::Schedule schedule;
    sim::CommandQueue commands;
    std::unique_ptr<sim::Kernel> kernel;
    int mod_seat = -1;  // -1: no mod; otherwise a chess::Seat value.
    std::uint64_t seed = kChessSeed;
};

std::unique_ptr<ChessGame> make_chess(std::uint64_t seed, int mod_seat) {
    auto g = std::make_unique<ChessGame>();
    auto made = chess::make_world();
    if (!made) {
        set_error(made.error());
        return nullptr;
    }
    g->chess = std::move(*made);
    if (auto s = g->schedule.finalise(g->chess.world); !s) {
        set_error(s.error());
        return nullptr;
    }
    if (auto s = chess::register_chess_commands(g->commands, g->chess.ids); !s) {
        set_error(s.error());
        return nullptr;
    }
    g->mod_seat = mod_seat;
    g->seed = seed;
    if (mod_seat >= 0) {
        // src/main.cpp open_opponent(): the seat is simulation state, so "not your turn" is a
        // decline the rules make for the mod exactly as for a person. Mod index 0.
        auto& players = chess::players_table(g->chess.world, g->chess.ids);
        const auto id = sim::mod_source(0);
        if (mod_seat == static_cast<int>(chess::Seat::White) || mod_seat == static_cast<int>(chess::Seat::Both)) {
            players.white = id;
        }
        if (mod_seat == static_cast<int>(chess::Seat::Black) || mod_seat == static_cast<int>(chess::Seat::Both)) {
            players.black = id;
        }
    }
    g->kernel = std::make_unique<sim::Kernel>(
        g->chess.world, g->schedule, g->commands,
        sim::KernelConfig{.seed = seed, .record_applied_commands = true});
    return g;
}

// Golden 3: atlas-chess sim/tests/test_golden.cpp, play_opera().
constexpr std::array<std::string_view, 33> kOperaGame{
    "e2e4", "e7e5", "g1f3", "d7d6", "d2d4", "c8g4", "d4e5", "g4f3", "d1f3", "d6e5", "f1c4",
    "g8f6", "f3b3", "d8e7", "b1c3", "c7c6", "c1g5", "b7b5", "c3b5", "c6b5", "c4b5", "b8d7",
    "e1c1", "a8d8", "d1d7", "d8d7", "h1d1", "e7e6", "b5d7", "f6d7", "b3b8", "d7b8", "d1d8",
};
constexpr std::string_view kOperaFinalFen = "1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17";

int run_golden_opera() {
    auto g = make_chess(kOperaSeed, -1);
    if (!g) {
        return 1;
    }
    // The test's harness builds its kernel with only the seed set.
    sim::Kernel kernel(g->chess.world, g->schedule, g->commands, sim::KernelConfig{.seed = kOperaSeed});
    g_u64[0] = g->chess.world.hash();
    atlas::Hasher over_time;
    for (const auto text : kOperaGame) {
        auto move = chess::parse_move(text);
        if (!move) {
            set_error(move.error());
            return 1;
        }
        const auto payload = chess::encode_move(*move);
        if (auto s = g->commands.submit(kernel.current_tick(), sim::SourceId::Local, chess::kMoveCommand, payload); !s) {
            set_error(s.error());
            return 1;
        }
        const auto report = kernel.step();
        if (!report) {
            set_error(report.error());
            return 1;
        }
        if (report->commands_applied != 1 || report->commands_declined != 0) {
            g_text = std::string("move ") + std::string(text) + " was not applied";
            return 1;
        }
        over_time.add(report->state_hash);
        g_u64[1] = report->state_hash;
    }
    g_u64[2] = over_time.value();
    g_u64[3] = 0x7CF3'0858'2112'403CULL;
    g_u64[4] = 0xBAEC'2954'2FFB'AA76ULL;
    g_u64[5] = 0x8862'D6E8'EEB7'FC02ULL;
    const auto& result = chess::result_table(g->chess.world, g->chess.ids);
    g_u64[6] = static_cast<std::uint64_t>(result.outcome);
    g_u64[7] = static_cast<std::uint64_t>(result.reason);
    g_u64[8] = kernel.current_tick();
    const auto position = chess::Position::from_tables(chess::board_table(g->chess.world, g->chess.ids),
                                                       chess::state_table(g->chess.world, g->chess.ids));
    g_text = chess::to_fen(position);
    g_text += '\n';
    g_text += kOperaFinalFen;
    return 0;
}

// ------------------------------------------------------------------------------------------
// The lab palettes, ported from apps/lab/view/src/cell_field.cpp (the view links SDL_GPU, so it
// cannot be compiled here). Same formulas, packed the same way: red in the low byte.

struct Colour {
    float r, g, b, a;
};

Colour hsv(float hue, float saturation, float value) noexcept {
    const float h = std::fmod(hue, 1.0F) * 6.0F;
    const auto sector = static_cast<int>(h);
    const float f = h - static_cast<float>(sector);
    const float p = value * (1.0F - saturation);
    const float q = value * (1.0F - (saturation * f));
    const float t = value * (1.0F - (saturation * (1.0F - f)));
    switch (sector % 6) {
    case 0: return {value, t, p, 1.0F};
    case 1: return {q, value, p, 1.0F};
    case 2: return {p, value, t, 1.0F};
    case 3: return {p, q, value, 1.0F};
    case 4: return {t, p, value, 1.0F};
    default: return {value, p, q, 1.0F};
    }
}

std::uint32_t pack(const Colour& c) noexcept {
    const auto channel = [](float v) {
        return static_cast<std::uint32_t>(std::lround(std::clamp(v, 0.0F, 1.0F) * 255.0F));
    };
    return channel(c.r) | (channel(c.g) << 8U) | (channel(c.b) << 16U) | (channel(c.a) << 24U);
}

using Packed = std::array<std::uint32_t, 256>;

struct Palettes {
    Packed region{}, owner{}, population{}, colour{};
    Palettes() {
        for (std::size_t i = 0; i < 256; ++i) {
            region[i] = pack(hsv(static_cast<float>(i) / 256.0F, 0.75F, 0.85F));
            owner[i] = pack(hsv(static_cast<float>(i % lab::kOwnerCount) * 0.618'034F, 0.65F, 0.9F));
            const float t = static_cast<float>(i) / 255.0F;
            population[i] = pack({std::min(1.0F, t * 3.0F), std::clamp((t * 3.0F) - 1.0F, 0.0F, 1.0F),
                                  std::clamp((t * 3.0F) - 2.0F, 0.0F, 1.0F), 1.0F});
            colour[i] = pack(hsv(static_cast<float>(i % lab::kColorCount) * 0.618'034F, 0.65F, 0.9F));
        }
    }
    [[nodiscard]] const Packed& for_mode(lab::MapMode mode) const noexcept {
        switch (mode) {
        case lab::MapMode::RegionValue: return region;
        case lab::MapMode::OwnerIndex: return owner;
        case lab::MapMode::PopulationValue: return population;
        default: return colour;
        }
    }
};

const Palettes& palettes() {
    static const Palettes kPalettes;
    return kPalettes;
}

/// Fill a row-major RGBA image of the grid from the lab's own snapshot.
void render_lab(LabSim& s, int mode) {
    const auto& layout = s.lab.layout;
    lab::fill_snapshot(s.snapshot, s.lab.world, s.lab.ids, layout,
                       sim::SnapshotHeader{.tick = s.kernel->current_tick()});
    const auto values = lab::band(s.snapshot, static_cast<lab::MapMode>(mode));
    const Packed& palette = palettes().for_mode(static_cast<lab::MapMode>(mode));
    const std::uint32_t w = layout.width();
    s.rgba.resize(static_cast<std::size_t>(w) * layout.height());
    const std::uint32_t chunk = layout.chunk_size();
    const std::uint32_t per_chunk = layout.cells_per_chunk();
    // Cells are stored chunk by chunk; walk them in storage order and scatter into rows.
    for (std::uint32_t c = 0; c < layout.chunk_count(); ++c) {
        const auto origin = layout.chunk_origin(c);
        const std::uint8_t* src = values.data() + (static_cast<std::size_t>(c) * per_chunk);
        for (std::uint32_t y = 0; y < chunk; ++y) {
            std::uint32_t* row = s.rgba.data() + (static_cast<std::size_t>(origin.y + y) * w) + origin.x;
            for (std::uint32_t x = 0; x < chunk; ++x) {
                row[x] = palette[src[(y * chunk) + x]];
            }
        }
    }
}

std::unique_ptr<LabSim> g_lab;
int g_lab_commands_per_tick = 0;

// ------------------------------------------------------------------------------------------
// Lockstep: two lab worlds fed the same command stream, compared hash for hash each tick.

std::unique_ptr<LabSim> g_peer_a;
std::unique_ptr<LabSim> g_peer_b;
bool g_inject = false;
bool g_diverged = false;

// ------------------------------------------------------------------------------------------
// Chess game state and the mod-host side the page's stand-in calls into.

std::unique_ptr<ChessGame> g_chess;

/// What mod_host.cpp's HostCall carries for one poll, reduced to what this mod can reach.
struct ModCall {
    bool active = false;
    atlas::Tick tick = 0;
    atlas::Tick target = 0;
    std::map<std::uint32_t, sim::RngStream> streams;
    std::uint32_t commands_left = 0;
    std::uint64_t submitted = 0;
    std::uint64_t refused = 0;
};
ModCall g_call;
/// ModHostConfig defaults, and the name src/main.cpp gives the mod (the --mod argument).
constexpr std::uint32_t kMaxCommandsPerTick = 1024;
constexpr std::string_view kModName = "chess_opponent.wasm";
constexpr atlas::Tick kModInputDelay = 1;  // src/main.cpp: {.seed = kSeed, .input_delay = 1}

chess::PositionView g_view_position{};
std::array<std::uint8_t, 1> g_view_seat{};
std::array<std::uint8_t, 256 * 4> g_moves{};
std::array<std::uint8_t, 96> g_board{};

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE std::uint64_t* web_u64() { return g_u64.data(); }
EMSCRIPTEN_KEEPALIVE const char* web_text() { return g_text.c_str(); }
EMSCRIPTEN_KEEPALIVE int web_text_len() { return static_cast<int>(g_text.size()); }
EMSCRIPTEN_KEEPALIVE std::uint8_t* web_alloc(int bytes) {
    static std::vector<std::uint8_t> scratch;
    scratch.resize(static_cast<std::size_t>(std::max(bytes, 1)));
    return scratch.data();
}

EMSCRIPTEN_KEEPALIVE int web_build_info() {
    g_text = std::string(atlas::build_info::summary());
    return 0;
}

// ---------------------------------------------------------------- goldens
EMSCRIPTEN_KEEPALIVE int golden_sim() { return run_golden_sim(); }
EMSCRIPTEN_KEEPALIVE int golden_lab() { return run_golden_lab(); }
EMSCRIPTEN_KEEPALIVE int golden_opera() { return run_golden_opera(); }

// ---------------------------------------------------------------- lab
EMSCRIPTEN_KEEPALIVE int lab_create(std::uint32_t grid, std::uint32_t chunk, std::uint32_t seed) {
    g_lab.reset();
    // apps/lab/main.cpp make_simulation(): one seed for generation and the kernel, and per-system
    // hashes off unless recording or running loopback peers.
    g_lab = make_lab({.width = grid, .height = grid, .chunk_size = chunk, .seed = seed}, seed, false);
    if (!g_lab) {
        return 1;
    }
    g_u64[0] = g_lab->lab.world.hash();
    return 0;
}

EMSCRIPTEN_KEEPALIVE void lab_set_commands_per_tick(int n) { g_lab_commands_per_tick = std::clamp(n, 0, 4096); }

/// Run `count` ticks. Returns the wall time of the kernel steps alone, in milliseconds.
EMSCRIPTEN_KEEPALIVE double lab_step(int count) {
    if (!g_lab) {
        return -1.0;
    }
    double total = 0.0;
    for (int i = 0; i < count; ++i) {
        if (g_lab_commands_per_tick > 0) {
            if (auto s = lab::submit_synthetic_commands(
                    g_lab->commands, g_lab->kernel->current_tick(),
                    static_cast<std::uint32_t>(g_lab_commands_per_tick), g_lab->seed,
                    g_lab->lab.layout.cell_count(), sim::SourceId::Local);
                !s) {
                set_error(s.error());
                return -1.0;
            }
        }
        const double t0 = emscripten_get_now();
        const auto report = g_lab->kernel->step();
        const double dt = emscripten_get_now() - t0;
        if (!report) {
            set_error(report.error());
            return -1.0;
        }
        total += dt;
        g_u64[0] = report->state_hash;
        g_u64[1] = report->tick;
        g_u64[2] = report->commands_applied;
    }
    return total;
}

EMSCRIPTEN_KEEPALIVE std::uint32_t* lab_render(int mode) {
    if (!g_lab) {
        return nullptr;
    }
    render_lab(*g_lab, std::clamp(mode, 0, 3));
    return g_lab->rgba.data();
}

/// The packed palette for a map mode (256 entries, red in the low byte), for the page's legend.
EMSCRIPTEN_KEEPALIVE const std::uint32_t* lab_palette(int mode) {
    return palettes().for_mode(static_cast<lab::MapMode>(std::clamp(mode, 0, 3))).data();
}

EMSCRIPTEN_KEEPALIVE double lab_tick() { return g_lab ? static_cast<double>(g_lab->kernel->current_tick()) : 0.0; }
EMSCRIPTEN_KEEPALIVE int lab_hash() {
    if (!g_lab) {
        return 1;
    }
    g_u64[0] = g_lab->lab.world.hash();
    return 0;
}

/// One cell's values, read from the tables (not the snapshot): region, owner, population, colour.
EMSCRIPTEN_KEEPALIVE int lab_cell(std::uint32_t x, std::uint32_t y) {
    if (!g_lab || !g_lab->lab.layout.contains(x, y)) {
        return 1;
    }
    const std::uint32_t i = g_lab->lab.layout.cell_index(x, y);
    const auto& cells = lab::cell_table(g_lab->lab.world, g_lab->lab.ids);
    const auto& population = lab::population_table(g_lab->lab.world, g_lab->lab.ids);
    const auto& chunks = lab::chunk_table(g_lab->lab.world, g_lab->lab.ids);
    g_u64[0] = cells.region_value[i];
    g_u64[1] = cells.owner_index[i];
    g_u64[2] = population.population_value[i];
    g_u64[3] = cells.color_index[i];
    g_u64[4] = i;
    g_u64[5] = g_lab->lab.layout.chunk_of(i);
    g_u64[6] = chunks.owner_index[g_lab->lab.layout.chunk_of(i)];
    return 0;
}

/// Submit set_color_index commands for a square brush, stamped for the next tick to run.
/// Returns how many the queue accepted.
EMSCRIPTEN_KEEPALIVE int lab_paint(int cx, int cy, int radius, int colour) {
    if (!g_lab) {
        return -1;
    }
    const auto& layout = g_lab->lab.layout;
    int accepted = 0;
    for (int y = cy - radius; y <= cy + radius; ++y) {
        for (int x = cx - radius; x <= cx + radius; ++x) {
            if (x < 0 || y < 0 || !layout.contains(static_cast<std::uint32_t>(x), static_cast<std::uint32_t>(y))) {
                continue;
            }
            const auto payload = lab::encode_set_color_index(
                layout.cell_index(static_cast<std::uint32_t>(x), static_cast<std::uint32_t>(y)),
                static_cast<std::uint8_t>(colour));
            if (g_lab->commands.submit(g_lab->kernel->current_tick(), sim::SourceId::Local,
                                       lab::kSetColorIndex, payload)) {
                ++accepted;
            }
        }
    }
    return accepted;
}

/// bench_simulation.cpp's "simulation/tick" at one size: a fresh world, seed 11, no per-system
/// hashes, `warmup` untimed steps and then the median of `iterations` timed ones, in ms.
EMSCRIPTEN_KEEPALIVE double lab_bench(std::uint32_t side, std::uint32_t chunk, int iterations, int warmup) {
    auto bench = make_lab({.width = side, .height = side, .chunk_size = chunk, .seed = 11}, 11, false);
    if (!bench) {
        return -1.0;
    }
    for (int i = 0; i < warmup; ++i) {
        if (!bench->kernel->step()) {
            return -1.0;
        }
    }
    std::vector<double> samples;
    for (int i = 0; i < iterations; ++i) {
        const double t0 = emscripten_get_now();
        const auto report = bench->kernel->step();
        samples.push_back(emscripten_get_now() - t0);
        if (!report) {
            set_error(report.error());
            return -1.0;
        }
        g_u64[0] = report->state_hash;
    }
    std::ranges::sort(samples);
    const std::size_t n = samples.size();
    g_u64[1] = static_cast<std::uint64_t>(samples.front() * 1000.0);
    g_u64[2] = static_cast<std::uint64_t>(samples.back() * 1000.0);
    return n % 2 == 1 ? samples[n / 2] : (samples[(n / 2) - 1] + samples[n / 2]) / 2.0;
}

// ---------------------------------------------------------------- lockstep
EMSCRIPTEN_KEEPALIVE int lockstep_create(std::uint32_t grid, std::uint32_t chunk, std::uint32_t seed) {
    g_peer_a.reset();
    g_peer_b.reset();
    g_inject = false;
    g_diverged = false;
    // Per-system hashes on, as apps/lab/main.cpp does for loopback peers: a divergence that
    // cannot be attributed to a system is what they exist to avoid.
    g_peer_a = make_lab({.width = grid, .height = grid, .chunk_size = chunk, .seed = seed}, seed, true);
    g_peer_b = make_lab({.width = grid, .height = grid, .chunk_size = chunk, .seed = seed}, seed, true);
    if (!g_peer_a || !g_peer_b) {
        return 1;
    }
    g_u64[0] = g_peer_a->lab.world.hash();
    g_u64[1] = g_peer_b->lab.world.hash();
    return 0;
}

/// Ask for one extra set_color_index command on peer B only, at its next tick.
EMSCRIPTEN_KEEPALIVE void lockstep_inject() { g_inject = true; }

/// One tick on both peers. Returns 0 if they agree, 1 at the first tick they disagree (with the
/// engine's attribution in the text slot), 2 while they stay apart, negative on error.
EMSCRIPTEN_KEEPALIVE int lockstep_step(int commands_per_tick) {
    if (!g_peer_a || !g_peer_b) {
        return -1;
    }
    LabSim& a = *g_peer_a;
    LabSim& b = *g_peer_b;
    const atlas::Tick tick = a.kernel->current_tick();
    for (LabSim* peer : {&a, &b}) {
        if (commands_per_tick > 0) {
            if (auto s = lab::submit_synthetic_commands(peer->commands, tick,
                                                        static_cast<std::uint32_t>(commands_per_tick),
                                                        peer->seed, peer->lab.layout.cell_count(),
                                                        sim::SourceId::Local);
                !s) {
                set_error(s.error());
                return -1;
            }
        }
    }
    g_u64[3] = 0;
    if (g_inject) {
        g_inject = false;
        // A cell whose colour this command really changes, so the difference cannot vanish.
        const std::uint32_t cell = static_cast<std::uint32_t>(tick % b.lab.layout.cell_count());
        const auto current = lab::cell_table(b.lab.world, b.lab.ids).color_index[cell];
        const auto colour = static_cast<std::uint8_t>((current + 1U) % lab::kColorCount);
        const auto payload = lab::encode_set_color_index(cell, colour);
        if (auto s = b.commands.submit(tick, sim::SourceId::Local, lab::kSetColorIndex, payload); !s) {
            set_error(s.error());
            return -1;
        }
        g_u64[3] = 1;
        g_u64[4] = cell;
    }
    const auto ra = a.kernel->step();
    const auto rb = b.kernel->step();
    if (!ra || !rb) {
        set_error(!ra ? ra.error() : rb.error());
        return -1;
    }
    g_u64[0] = ra->state_hash;
    g_u64[1] = rb->state_hash;
    g_u64[2] = ra->tick;
    if (ra->state_hash == rb->state_hash) {
        return 0;
    }
    if (g_diverged) {
        return 2;
    }
    g_diverged = true;
    const auto divergence = sim::attribute_divergence(ra->tick, ra->state_hash, rb->state_hash,
                                                      ra->system_hashes, rb->system_hashes, a.schedule);
    g_text = divergence.description;
    return 1;
}

// ---------------------------------------------------------------- chess
/// A new game. `mod_seat` is -1 for two people at one screen, else chess::Seat (0 white, 1 black,
/// 2 both). `opera_seed` selects the golden test's kernel seed instead of the app's.
EMSCRIPTEN_KEEPALIVE int chess_new(int mod_seat, int opera_seed) {
    g_chess = make_chess(opera_seed != 0 ? kOperaSeed : kChessSeed, std::clamp(mod_seat, -1, 2));
    if (!g_chess) {
        return 1;
    }
    g_u64[0] = g_chess->chess.world.hash();
    return 0;
}

/// The position as the mod sees it (mod_views.cpp, 72 bytes), then the result reason and
/// whether the side to move is in check.
EMSCRIPTEN_KEEPALIVE std::uint8_t* chess_board() {
    if (!g_chess) {
        return nullptr;
    }
    const auto view = chess::position_view(g_chess->chess.world, g_chess->chess.ids);
    std::memcpy(g_board.data(), view.data(), view.size());
    const auto& result = chess::result_table(g_chess->chess.world, g_chess->chess.ids);
    const auto position = chess::Position::from_tables(chess::board_table(g_chess->chess.world, g_chess->chess.ids),
                                                       chess::state_table(g_chess->chess.world, g_chess->chess.ids));
    g_board[72] = static_cast<std::uint8_t>(result.reason);
    g_board[73] = position.in_check(position.side_to_move) ? 1 : 0;
    g_board[74] = static_cast<std::uint8_t>(result.outcome);
    g_u64[0] = g_chess->chess.world.hash();
    g_u64[1] = g_chess->kernel->current_tick();
    return g_board.data();
}

/// Legal moves for the side to move, as from/to/promotion triples. Returns the count.
EMSCRIPTEN_KEEPALIVE int chess_legal() {
    if (!g_chess) {
        return 0;
    }
    chess::MoveList moves;
    chess::legal_moves(g_chess->chess.world, g_chess->chess.ids, moves);
    int n = 0;
    for (const auto& m : moves) {
        g_moves[(n * 3) + 0] = m.from;
        g_moves[(n * 3) + 1] = m.to;
        g_moves[(n * 3) + 2] = static_cast<std::uint8_t>(m.promotion);
        ++n;
    }
    return n;
}
EMSCRIPTEN_KEEPALIVE std::uint8_t* chess_moves() { return g_moves.data(); }

EMSCRIPTEN_KEEPALIVE int chess_fen() {
    if (!g_chess) {
        return 1;
    }
    g_text = chess::to_fen(chess::Position::from_tables(chess::board_table(g_chess->chess.world, g_chess->chess.ids),
                                                        chess::state_table(g_chess->chess.world, g_chess->chess.ids)));
    return 0;
}

/// Publish this tick's views and open the mod's call context, as ModHost::poll does before it
/// calls mod_tick. Returns the tick being decided.
EMSCRIPTEN_KEEPALIVE double chess_begin_tick() {
    if (!g_chess) {
        return -1.0;
    }
    g_view_position = chess::position_view(g_chess->chess.world, g_chess->chess.ids);
    g_view_seat[0] = static_cast<std::uint8_t>(std::max(g_chess->mod_seat, 0));
    g_call = ModCall{};
    g_call.active = true;
    g_call.tick = g_chess->kernel->current_tick();
    g_call.target = g_call.tick + kModInputDelay;
    g_call.commands_left = kMaxCommandsPerTick;
    return static_cast<double>(g_call.tick);
}

/// Close the mod's call context, submit the person's move if any, and run the tick. Writes the
/// applied moves as from/to/promotion/by-mod quadruples into chess_moves(); returns how many.
EMSCRIPTEN_KEEPALIVE int chess_end_tick(int has_person, int from, int to, int promotion) {
    if (!g_chess) {
        return -1;
    }
    g_call.active = false;
    g_u64[2] = g_call.submitted;
    g_u64[3] = g_call.refused;
    if (has_person != 0) {
        const chess::Move move{.from = static_cast<chess::Square>(from),
                               .to = static_cast<chess::Square>(to),
                               .promotion = static_cast<chess::PieceKind>(promotion)};
        const auto payload = chess::encode_move(move);
        if (auto s = g_chess->commands.submit(g_chess->kernel->current_tick(), sim::SourceId::Local,
                                              chess::kMoveCommand, payload);
            !s) {
            set_error(s.error());
            return -1;
        }
    }
    const auto report = g_chess->kernel->step();
    if (!report) {
        set_error(report.error());
        return -1;
    }
    int n = 0;
    for (const auto& applied : report->applied_commands) {
        if (auto decoded = chess::decode_move(applied.payload)) {
            g_moves[(n * 4) + 0] = decoded->from;
            g_moves[(n * 4) + 1] = decoded->to;
            g_moves[(n * 4) + 2] = static_cast<std::uint8_t>(decoded->promotion);
            g_moves[(n * 4) + 3] = sim::is_mod_source(applied.source) ? 1 : 0;
            ++n;
        }
    }
    g_u64[0] = report->state_hash;
    g_u64[1] = report->tick;
    g_u64[4] = report->commands_declined;
    return n;
}

/// perft from a FEN at the scratch pointer. Nodes in u64[0]; returns milliseconds.
EMSCRIPTEN_KEEPALIVE double chess_perft(const char* fen, int len, int depth) {
    auto position = chess::parse_fen(std::string_view(fen, static_cast<std::size_t>(len)));
    if (!position) {
        set_error(position.error());
        return -1.0;
    }
    const double t0 = emscripten_get_now();
    g_u64[0] = chess::perft(*position, std::clamp(depth, 1, 6));
    return emscripten_get_now() - t0;
}

// ---------------------------------------------------------------- mod host, simulation side
// Each mirrors the native import of the same name in engine/script/src/mod_host.cpp. The page's
// JavaScript copies strings and payloads out of the mod's memory into web_alloc() first.

EMSCRIPTEN_KEEPALIVE int mod_command_type(const char* name, int len) {
    if (!g_call.active || !g_chess || name == nullptr) {
        return -3;  // ATLAS_ERR_REFUSED
    }
    const auto type = sim::command_type(std::string_view(name, static_cast<std::size_t>(len)));
    return g_chess->commands.has_handler(type) ? static_cast<std::int32_t>(type) : 0;
}

EMSCRIPTEN_KEEPALIVE int mod_submit(int type, const std::uint8_t* payload, int len) {
    if (!g_call.active || !g_chess) {
        return -3;
    }
    if (g_call.commands_left == 0) {
        ++g_call.refused;
        return -2;  // ATLAS_ERR_EXHAUSTED
    }
    if (payload == nullptr && len != 0) {
        ++g_call.refused;
        return -1;  // ATLAS_ERR_RANGE
    }
    const std::span<const std::byte> span(reinterpret_cast<const std::byte*>(payload), static_cast<std::size_t>(len));
    if (auto s = g_chess->commands.submit(g_call.target, sim::mod_source(0),
                                          sim::CommandType{static_cast<std::uint32_t>(type)}, span);
        !s) {
        ++g_call.refused;
        return -3;
    }
    --g_call.commands_left;
    ++g_call.submitted;
    return 0;
}

EMSCRIPTEN_KEEPALIVE std::int64_t mod_random(int stream, std::int64_t bound) {
    if (!g_call.active || !g_chess) {
        return -3;
    }
    if (bound <= 0) {
        return -1;
    }
    const auto key = static_cast<std::uint32_t>(stream);
    auto at = g_call.streams.find(key);
    if (at == g_call.streams.end()) {
        const auto mixed = sim::StreamId{static_cast<std::uint32_t>(sim::stream_id(kModName)) ^ key};
        at = g_call.streams.emplace(key, sim::RngStream{g_chess->seed, mixed, g_call.tick}).first;
    }
    return static_cast<std::int64_t>(at->second.next_below(static_cast<std::uint64_t>(bound)));
}

EMSCRIPTEN_KEEPALIVE int mod_call_active() { return g_call.active ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int mod_view_count() { return g_call.active ? 2 : -3; }
EMSCRIPTEN_KEEPALIVE int mod_view_size(int view) {
    if (!g_call.active || view < 0 || view > 1) {
        return -1;
    }
    return view == 0 ? static_cast<int>(g_view_position.size()) : static_cast<int>(g_view_seat.size());
}
EMSCRIPTEN_KEEPALIVE const std::uint8_t* mod_view_data(int view) {
    return view == 0 ? g_view_position.data() : g_view_seat.data();
}

}  // extern "C"
