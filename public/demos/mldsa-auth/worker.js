// Runs the compiled mldsa-auth code off the main thread, so the page never
// blocks. hd.mjs/hd.wasm: the repo's handshake + session code and the demo shim
// (src/handshake_demo.c). tests.mjs/tests.wasm: the repo's tests/test_handshake.c
// and tests/test_session.c, fetched only when asked for.

// The ?v= build tag index.html gave app.js, passed on to this worker. Every
// file it loads carries it too, so a cached copy from an older deploy can
// never be mixed with this one (hd.mjs and worker.js must match).
const V = self.location.search;

let hd = null;
let testsBin = null;
let testsFactory = null;

const post = (m) => self.postMessage(m);

async function fetchBytes(url, stage) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const encoding = res.headers.get('content-encoding');
  const total = encoding && encoding !== 'identity' ? 0 : Number(res.headers.get('content-length')) || 0;
  if (!res.body) {
    const b = new Uint8Array(await res.arrayBuffer());
    post({ type: 'progress', stage, got: b.length, total: b.length });
    return b;
  }
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    post({ type: 'progress', stage, got, total });
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// The smallest step performance.now() takes here. Browsers coarsen it on
// pages that are not cross-origin isolated (GitHub Pages cannot opt in), so
// the page reports it next to every single-shot timing.
function timerResolution() {
  let min = Infinity, n = 0, last = performance.now();
  const stop = last + 60;
  while (n < 300) {
    const t = performance.now();
    if (t > stop) break;
    if (t > last) { min = Math.min(min, t - last); last = t; n++; }
  }
  return Number.isFinite(min) ? min : null;
}

const J = (ptr) => JSON.parse(hd.UTF8ToString(ptr));

const ops = {
  async init() {
    const bin = await fetchBytes('hd.wasm' + V, 'module');
    post({ type: 'stage', stage: 'compile' });
    const { default: create } = await import('./hd.mjs' + V);
    hd = await create({ wasmBinary: bin });
    post({ type: 'stage', stage: 'keygen' });
    const init = J(hd._hd_init());
    return { init, wasmBytes: bin.length, timerRes: timerResolution(), isolated: !!self.crossOriginIsolated };
  },

  handshake({ mode, field }) {
    return J(hd._hd_handshake(mode, field));
  },

  send({ dir, text, attack }) {
    const bytes = new TextEncoder().encode(text);
    const p = hd._malloc(Math.max(1, bytes.length));
    hd.HEAPU8.set(bytes, p);
    try {
      return J(hd._hd_send(dir, p, bytes.length, attack));
    } finally {
      hd._free(p);
    }
  },

  bench({ n }) {
    const chunk = 5;
    const out = hd._malloc(n * 9 * 8);
    const rows = [];
    const t0 = performance.now();
    try {
      for (let i = 0; i < n; i += chunk) {
        const k = Math.min(chunk, n - i);
        const done = hd._hd_bench(k, out);
        const f = new Float64Array(hd.HEAPU8.buffer, out, k * 9);
        for (let r = 0; r < done; r++) rows.push(Array.from(f.subarray(r * 9, r * 9 + 9)));
        if (done !== k) throw new Error(`handshake ${i + done + 1} did not reach ESTABLISHED`);
        post({ type: 'progress', stage: 'bench', got: i + k, total: n });
      }
    } finally {
      hd._free(out);
    }
    return { rows, wallMs: performance.now() - t0, timerRes: timerResolution() };
  },

  recbench({ budgetMs }) {
    const out = hd._malloc(4 * 8);
    try {
      const rc = hd._hd_record_bench(budgetMs, out);
      if (rc !== 0) throw new Error(`record benchmark failed (${rc})`);
      const f = new Float64Array(hd.HEAPU8.buffer, out, 4);
      return { sealMs: f[0], openMs: f[1], records: f[2], contentBytes: f[3] };
    } finally {
      hd._free(out);
    }
  },

  sessions() {
    return hd ? J(hd._hd_sessions()) : null;
  },

  async tests({ which }) {
    if (!testsBin) {
      testsBin = await fetchBytes('tests.wasm' + V, 'tests');
      testsFactory = (await import('./tests.mjs' + V)).default;
    }
    let buf = [];
    const flush = () => { if (buf.length) { post({ type: 'lines', lines: buf }); buf = []; } };
    const line = (l) => { buf.push(l); if (buf.length >= 40) flush(); };
    // A fresh instance per run: each suite keeps static state.
    const M = await testsFactory({ wasmBinary: testsBin, print: line, printErr: (l) => line('[stderr] ' + l) });
    const t0 = performance.now();
    let rc, threw = null;
    try {
      rc = M._run_suite(which);
    } catch (e) {
      threw = e && e.name === 'ExitStatus' ? `exit(${e.status})` : String(e);
      rc = e && typeof e.status === 'number' ? e.status : -1;
    }
    const ms = performance.now() - t0;
    flush();
    return { rc, threw, ms, wasmBytes: testsBin.length };
  },
};

// Ops that run in hd. After each one the page gets both live sessions' states
// from session_get_state(), so it never shows a session the library has not got.
const HD_OPS = new Set(['init', 'handshake', 'send', 'bench', 'recbench']);

self.onmessage = async (ev) => {
  const { id, op, args } = ev.data;
  try {
    const result = await ops[op](args || {});
    if (HD_OPS.has(op) && hd) result.sessions = J(hd._hd_sessions());
    post({ type: 'result', id, result });
  } catch (e) {
    post({ type: 'error', id, message: e && e.message ? e.message : String(e) });
  }
};
