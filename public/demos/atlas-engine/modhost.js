// SPDX-License-Identifier: GPL-3.0-or-later
//
// A JavaScript stand-in for the engine's WAMR mod host (engine/script/src/mod_host.cpp), for one
// mod. The browser's own WebAssembly engine runs the mod; the imports that touch simulation
// state call back into atlas.wasm (the mod_* functions in build/atlas_web.cpp), which mirror the
// native imports. What is not reproduced: WAMR's per-tick instruction budget (10,000,000) and its
// own memory and stack ceilings. Shared by app.js and build/check-mod.mjs.

const utf8 = new TextDecoder();

// engine/script/include/atlas/script/atlas_mod.h
const ATLAS_ERR_RANGE = -1;
const ATLAS_ERR_EXHAUSTED = -2;
const ATLAS_ERR_REFUSED = -3;
const SAFE_IMPORTS = new Set(['atlas_tick', 'atlas_command_type', 'atlas_submit', 'atlas_random', 'atlas_log',
  'atlas_view_count', 'atlas_view_size', 'atlas_view_read', 'atlas_say']);
const REQUIRED_EXPORTS = ['memory', 'mod_init', 'mod_tick', 'mod_shutdown'];
const MAX_MODULE_BYTES = 4 * 1024 * 1024;   // ModLimits::max_module_bytes
const MAX_LOG_BYTES_PER_TICK = 4096;         // ModHostConfig::max_log_bytes_per_tick
const MAX_MESSAGES_PER_TICK = 4;             // ModHostConfig::max_messages_per_tick

/// Does in JavaScript what engine/script/src/mod_host.cpp does around WAMR, for one mod. The
/// imports that touch simulation state call back into the wasm (mod_* in build/atlas_web.cpp).
/// Not reproduced: WAMR's per-tick instruction budget and its own memory and stack ceilings.
export class ModHostStandIn {
  constructor(atlas, bytes, onLog) {
    this.A = atlas;
    this.bytes = bytes;
    this.onLog = onLog;
    this.inCall = false;
    this.tick = 0;
    this.disabled = '';
    this.stats = { ticks: 0, logDropped: 0, said: 0 };
  }

  async start() {
    if (this.bytes.length > MAX_MODULE_BYTES) throw new Error('the mod is larger than the 4 MB a mod may be');
    const module = await WebAssembly.compile(this.bytes);
    for (const imp of WebAssembly.Module.imports(module)) {
      if (imp.module !== 'atlas' || !SAFE_IMPORTS.has(imp.name) || imp.kind !== 'function') {
        throw new Error(`the mod imports ${imp.module}.${imp.name}, which the interface does not have`);
      }
    }
    const exported = new Set(WebAssembly.Module.exports(module).map((e) => e.name));
    for (const name of REQUIRED_EXPORTS) if (!exported.has(name)) throw new Error(`the mod does not export ${name}`);
    this.instance = await WebAssembly.instantiate(module, this.imports());
    this.ex = this.instance.exports;
    this.importNames = WebAssembly.Module.imports(module).map((i) => i.name);
    const declined = this.ex.mod_init();
    if (declined !== 0) throw new Error(`mod_init returned ${declined}`);
  }

  span(ptr, len) {
    const mem = new Uint8Array(this.ex.memory.buffer);
    const p = ptr >>> 0;
    const n = len >>> 0;
    if (p + n > mem.length) throw new WebAssembly.RuntimeError('out of bounds memory access');
    return mem.subarray(p, p + n);
  }

  toAtlas(bytes) {
    const p = this.A._web_alloc(bytes.length);
    this.A.HEAPU8.set(bytes, p);
    return p;
  }

  imports() {
    return {
      atlas: {
        atlas_tick: () => (this.inCall ? BigInt(this.tick) : BigInt(ATLAS_ERR_REFUSED)),
        atlas_command_type: (name, len) => {
          if (!this.inCall) return ATLAS_ERR_REFUSED;
          const b = this.span(name, len);
          return this.A._mod_command_type(this.toAtlas(b), b.length);
        },
        atlas_submit: (type, payload, len) => {
          if (!this.inCall) return ATLAS_ERR_REFUSED;
          const b = this.span(payload, len);
          return this.A._mod_submit(type, this.toAtlas(b), b.length);
        },
        atlas_random: (stream, bound) => (this.inCall ? this.A._mod_random(stream, bound) : BigInt(ATLAS_ERR_REFUSED)),
        atlas_log: (level, ptr, len) => {
          if (!this.inCall) return;
          const b = this.span(ptr, len);
          if (b.length > this.logLeft) { this.stats.logDropped++; return; }
          this.logLeft -= b.length;
          this.onLog(level, utf8.decode(b));
        },
        atlas_view_count: () => (this.inCall ? this.A._mod_view_count() : ATLAS_ERR_REFUSED),
        atlas_view_size: (view) => (this.inCall ? this.A._mod_view_size(view) : ATLAS_ERR_RANGE),
        atlas_view_read: (view, offset, dest, len) => {
          const out = this.span(dest, len);  // WAMR checks the buffer before the import runs
          if (!this.inCall || offset < 0 || view < 0 || view >= this.A._mod_view_count()) return ATLAS_ERR_RANGE;
          const size = this.A._mod_view_size(view);
          if (offset > size) return ATLAS_ERR_RANGE;
          const n = Math.min(out.length, size - offset);
          const src = this.A._mod_view_data(view) + offset;
          out.set(this.A.HEAPU8.subarray(src, src + n));
          return n;
        },
        atlas_say: (key, keyLen, args, count) => {
          if (!this.inCall) return ATLAS_ERR_REFUSED;
          const suffix = utf8.decode(this.span(key, keyLen));
          const valid = suffix.length > 0 && suffix.length <= 64 && !suffix.startsWith('.') && !suffix.endsWith('.')
            && !suffix.includes('..') && /^[a-z0-9_.]+$/.test(suffix);
          if (!valid || count < 0 || count > 4) return ATLAS_ERR_RANGE;
          if (this.sayLeft === 0) return ATLAS_ERR_EXHAUSTED;
          const values = [];
          if (count > 0) {
            const off = args >>> 0;
            if (off + count * 8 > this.ex.memory.buffer.byteLength) return ATLAS_ERR_RANGE;
            const dv = new DataView(this.ex.memory.buffer, off, count * 8);
            for (let i = 0; i < count; i++) values.push(dv.getBigInt64(i * 8, true));
          }
          this.sayLeft--;
          this.stats.said++;
          this.onLog(1, `says mod.chess_opponent.${suffix}${values.length ? ` ${values.join(', ')}` : ''}`);
          return 0;
        },
      },
    };
  }

  /// ModHost::poll: one call to mod_tick, inside a call context, before the tick runs.
  poll(tick) {
    if (this.disabled) return;
    this.inCall = true;
    this.tick = tick;
    this.logLeft = MAX_LOG_BYTES_PER_TICK;
    this.sayLeft = MAX_MESSAGES_PER_TICK;
    try {
      this.ex.mod_tick(BigInt(tick));
    } catch (e) {
      this.disabled = String((e && e.message) || e);
      this.onLog(3, `trapped and disabled: ${this.disabled}`);
    } finally {
      this.inCall = false;
    }
    this.stats.ticks++;
  }
}
