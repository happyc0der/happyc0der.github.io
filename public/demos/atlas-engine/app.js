// SPDX-License-Identifier: GPL-3.0-or-later
//
// The page around atlas.wasm. Everything that decides a simulation result happens in the wasm,
// which is the repositories' C++ (see build/atlas_web.cpp). This file draws, handles input, and
// stands in for the engine's WAMR mod host when the chess opponent mod runs.

import { ModHostStandIn } from './modhost.js';

const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let A = null;           // the Emscripten module
let modBytes = null;    // chess_opponent.wasm
let modSha = '';

const u64 = () => new BigUint64Array(A.HEAPU8.buffer, A._web_u64(), 32);
const utf8 = new TextDecoder();
const text = () => utf8.decode(A.HEAPU8.slice(A._web_text(), A._web_text() + A._web_text_len()));
const hex = (v) => '0x' + BigInt.asUintN(64, BigInt(v)).toString(16).toUpperCase().padStart(16, '0');
const kb = (n) => `${Math.round(n / 1024)} KB`;
const fmtMs = (ms) => (ms < 0.1 ? `${(ms * 1000).toFixed(1)} µs` : ms < 1 ? `${Math.round(ms * 1000)} µs` : ms < 10 ? `${ms.toFixed(2)} ms` : `${ms.toFixed(1)} ms`);
const nf = new Intl.NumberFormat('en-US');

function fatal(message) {
  const box = $('fatal');
  box.hidden = false;
  box.textContent = message;
}

// ------------------------------------------------------------------------------- loading

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url.pathname || url}: HTTP ${res.status}`);
  const total = res.headers.get('content-encoding') ? 0 : Number(res.headers.get('content-length')) || 0;
  if (!res.body || !res.body.getReader) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    onProgress(bytes.length, bytes.length);
    return bytes;
  }
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress(got, total);
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function loadAtlas(onStatus) {
  const wasmUrl = new URL('atlas.wasm', import.meta.url);
  const [{ default: createAtlas }, wasm, mod] = await Promise.all([
    import('./atlas.mjs'),
    fetchWithProgress(wasmUrl, (got, total) =>
      onStatus(`Downloading atlas.wasm: ${kb(got)}${total ? ` of ${kb(total)}` : ''}`, total ? 0.85 * got / total : 0.4)),
    fetchWithProgress(new URL('chess_opponent.wasm', import.meta.url), () => {}),
  ]);
  modBytes = mod;
  onStatus('Compiling the WebAssembly', 0.9);
  let failInstantiate;
  const failed = new Promise((_, reject) => { failInstantiate = reject; });
  const module = await Promise.race([
    createAtlas({
      instantiateWasm(imports, done) {
        WebAssembly.instantiate(wasm, imports).then((r) => done(r.instance, r.module), failInstantiate);
        return {};
      },
      print: () => {},
      printErr: (line) => console.warn('[atlas]', line),
    }),
    failed,
  ]);
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', modBytes));
    modSha = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { modSha = ''; }
  return module;
}

// ------------------------------------------------------------------------------- frame loop

const loop = { raf: 0, visible: true, inView: true, tab: 'hashes' };

function wantsFrames() {
  if (!loop.visible) return false;
  if (loop.tab === 'lab') return lab.playing;
  if (loop.tab === 'lock') return lock.playing;
  if (loop.tab === 'chess') return chessWantsTicks();
  return false;
}

function frame() {
  loop.raf = 0;
  if (!wantsFrames()) return;
  try {
    if (loop.tab === 'lab') labFrame();
    else if (loop.tab === 'lock') lockFrame();
    else if (loop.tab === 'chess') chessFrame();
  } catch (e) {
    fatal(`Stopped: ${e.message || e}`);
    lab.playing = lock.playing = false;
    chess.paused = true;
    return;
  }
  kick();
}

function kick() {
  if (!loop.raf && wantsFrames()) loop.raf = requestAnimationFrame(frame);
}

function updateVisible() {
  loop.visible = loop.inView && !document.hidden;
  kick();
}

// ------------------------------------------------------------------------------- tabs

const TABS = ['hashes', 'lab', 'lock', 'chess'];

function selectTab(name, focus = false) {
  loop.tab = name;
  for (const t of TABS) {
    const button = $(`tab-${t}`);
    const on = t === name;
    button.setAttribute('aria-selected', String(on));
    button.tabIndex = on ? 0 : -1;
    $(`p-${t}`).hidden = !on;
    if (on && focus) button.focus({ preventScroll: true });
  }
  if (name === 'lab') enterLab();
  if (name === 'lock') enterLock();
  if (name === 'chess') enterChess();
  kick();
}

function wireTabs() {
  const list = $('tabs');
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) selectTab(b.dataset.tab);
  });
  list.addEventListener('keydown', (e) => {
    const i = TABS.indexOf(loop.tab);
    let next = null;
    if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
    else if (e.key === 'ArrowLeft') next = TABS[(i + TABS.length - 1) % TABS.length];
    else if (e.key === 'Home') next = TABS[0];
    else if (e.key === 'End') next = TABS[TABS.length - 1];
    if (next) { e.preventDefault(); selectTab(next, true); }
  });
}

function wireSeg(id, onChange) {
  const seg = $(id);
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    for (const x of seg.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    onChange(b.dataset.v);
  });
}

function setSeg(id, value) {
  for (const x of $(id).querySelectorAll('button')) x.setAttribute('aria-pressed', String(x.dataset.v === String(value)));
}

// ------------------------------------------------------------------------------- hashes

const GOLDENS = [
  {
    title: 'Engine scenario',
    desc: '64 rows, three synthetic systems and a random stream, 500 ticks.',
    src: 'engine/simulation/tests/test_golden.cpp',
    recorded: 'docs/DETERMINISM.md lists them on macOS arm64, Linux arm64, Linux x86_64 and Windows x64.',
    run: () => A._golden_sim(),
    rows: (o) => [['final state', o[0], o[2]], ['all 500 tick hashes', o[1], o[3]]],
  },
  {
    title: 'Lab scenario',
    desc: '32×32 cells in chunks of 8, two set_color_index commands a tick, 500 ticks.',
    src: 'apps/lab/sim/tests/test_golden.cpp',
    recorded: 'Recorded on macOS arm64 on 2026-09-16; the test notes the Linux lanes confirm them.',
    run: () => A._golden_lab(),
    rows: (o) => [['initial world', o[0], o[3]], ['final state', o[1], o[4]], ['all 500 tick hashes', o[2], o[5]]],
  },
  {
    title: 'Opera Game',
    desc: 'Morphy, Paris 1858: 33 plies through the kernel, one move a tick, to mate.',
    src: 'atlas-chess sim/tests/test_golden.cpp',
    recorded: 'Recorded on macOS arm64 on 2026-09-23; the test notes the Linux and Windows lanes confirm them.',
    run: () => A._golden_opera(),
    rows: (o) => [['initial world', o[0], o[3]], ['final state', o[1], o[4]], ['all 33 tick hashes', o[2], o[5]]],
    extra: (o) => {
      const [fen, want] = text().split('\n');
      return { ok: fen === want && o[6] === 1n && o[7] === 1n, fen, want, mate: o[6] === 1n && o[7] === 1n };
    },
  },
];

function runGoldens() {
  const box = $('h-scenarios');
  box.textContent = '';
  let total = 0;
  let bad = 0;
  let elapsed = 0;
  for (const g of GOLDENS) {
    const t0 = performance.now();
    const status = g.run();
    const ms = performance.now() - t0;
    elapsed += ms;
    const card = document.createElement('article');
    card.className = 'scenario';
    const h = document.createElement('h3');
    h.textContent = g.title;
    const took = document.createElement('span');
    took.className = 'took';
    took.textContent = fmtMs(ms);
    h.append(took);
    const d = document.createElement('p');
    d.className = 'desc';
    d.textContent = g.desc;
    card.append(h, d);
    if (status !== 0) {
      const err = document.createElement('p');
      err.className = 'bad';
      err.textContent = `The scenario failed to run: ${text()}`;
      card.append(err);
      bad++;
      total++;
    } else {
      const o = u64();
      for (const [what, got, want] of g.rows(o)) {
        total++;
        const ok = got === want;
        if (!ok) bad++;
        card.append(hashRow(what, want, got, ok));
      }
      if (g.extra) {
        const x = g.extra(o);
        total++;
        if (!x.ok) bad++;
        const row = document.createElement('div');
        row.className = `hrow${x.ok ? '' : ' mismatch'}`;
        row.innerHTML = '<span class="what"></span><span class="mark"></span><span class="val"></span><span class="val"></span>';
        row.children[0].textContent = 'final position (FEN) and checkmate';
        row.children[1].textContent = x.ok ? 'match' : 'MISMATCH';
        row.children[1].className = `mark ${x.ok ? 'ok' : 'bad'}`;
        row.children[2].innerHTML = '<span class="k">recorded</span>';
        row.children[2].append(x.want);
        row.children[3].innerHTML = '<span class="k">wasm32</span>';
        row.children[3].append(`${x.fen}${x.mate ? ', white mates' : ', NOT MATE'}`);
        card.append(row);
      }
    }
    const src = document.createElement('p');
    src.className = 'src';
    src.textContent = `${g.src}. ${g.recorded}`;
    card.append(src);
    box.append(card);
  }
  $('h-summary').textContent = bad === 0
    ? `All ${total} checks match the values recorded natively.`
    : `${bad} of ${total} checks differ from the recorded values on wasm32.`;
  $('h-summary').className = bad === 0 ? 'ok' : 'bad';
  $('h-time').textContent = `computed in this browser in ${fmtMs(elapsed)}`;
  A._web_build_info();
  $('h-build').textContent = `Build: ${text()}. Hashes are the engine's own (atlas::Hasher, hash version 2), computed by the wasm, not by this page.`;
}

function hashRow(what, want, got, ok) {
  const row = document.createElement('div');
  row.className = `hrow${ok ? '' : ' mismatch'}`;
  const w = document.createElement('span');
  w.className = 'what';
  w.textContent = what;
  const mark = document.createElement('span');
  mark.className = `mark ${ok ? 'ok' : 'bad'}`;
  mark.textContent = ok ? 'match' : 'MISMATCH';
  const a = document.createElement('span');
  a.className = 'val';
  a.innerHTML = '<span class="k">recorded</span>';
  a.append(hex(want));
  const b = document.createElement('span');
  b.className = 'val';
  b.innerHTML = '<span class="k">wasm32</span>';
  b.append(hex(got));
  row.append(w, mark, a, b);
  return row;
}

// ------------------------------------------------------------------------------- lab

// benchmarks/baselines/mac16-7-appleclang-relwithdebinfo.json, "simulation/tick" medians, and
// for a million cells the M8 table in docs/PERFORMANCE.md. Apple M4 Pro, AppleClang 21.
const NATIVE = {
  100: { chunk: 10, line: '16.1 µs on one thread' },
  320: { chunk: 32, line: '161 µs on one thread' },
  // docs/PERFORMANCE.md's M8 table, measured separately: 1.650 ms with no pool, 694 µs on 4.
  1024: { chunk: 32, line: '1.675 ms on one thread, 743 µs on 4 workers' },
};

const lab = {
  ready: false, size: 1024, mode: 1, playing: false, colour: 1, samples: [],
  cursor: { x: 512, y: 512 }, painting: false, lastPaint: null, ctx: null,
};

function enterLab() {
  if (!lab.ready) {
    createLab(lab.size);
    buildSwatches();
    lab.ready = true;
    if (!reduceMotion.matches) setLabPlaying(true);
  }
  renderLab();
}

function createLab(size) {
  const t0 = performance.now();
  if (A._lab_create(size, NATIVE[size].chunk, 1) !== 0) throw new Error(text());
  const made = performance.now() - t0;
  lab.size = size;
  lab.samples = [];
  const canvas = $('lab-canvas');
  canvas.width = size;
  canvas.height = size;
  lab.ctx = canvas.getContext('2d');
  lab.cursor = { x: size >> 1, y: size >> 1 };
  $('lab-cells').textContent = `${nf.format(size * size)}`;
  $('lab-native').textContent = NATIVE[size].line;
  $('lab-hash').textContent = hex(u64()[0]);
  $('lab-tick').textContent = '0';
  $('lab-ms').textContent = '–';
  $('lab-readout').textContent = `Generated ${nf.format(size * size)} cells in ${fmtMs(made)}. Hover or tap the map to read a cell from the tables.`;
  drawSpark();
}

function setLabPlaying(on) {
  lab.playing = on;
  $('lab-play').textContent = on ? 'Pause' : 'Play';
  kick();
}

function labTick() {
  const ms = A._lab_step(1);
  if (ms < 0) throw new Error(text());
  lab.samples.push(ms);
  if (lab.samples.length > 120) lab.samples.shift();
  const o = u64();
  $('lab-tick').textContent = nf.format(Number(o[1]) + 1);
  $('lab-hash').textContent = hex(o[0]);
  const recent = lab.samples.slice(-60).sort((a, b) => a - b);
  $('lab-ms').textContent = `${fmtMs(recent[recent.length >> 1])} median of ${recent.length}`;
}

function labFrame() {
  labTick();
  renderLab();
  drawSpark();
}

function renderLab() {
  const ptr = A._lab_render(lab.mode);
  const n = lab.size * lab.size * 4;
  const img = new ImageData(new Uint8ClampedArray(A.HEAPU8.buffer, ptr, n), lab.size, lab.size);
  lab.ctx.putImageData(img, 0, 0);
  placeBrush();
}

function drawSpark() {
  const c = $('lab-spark');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = c.clientWidth || 300;
  const h = c.clientHeight || 44;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const s = lab.samples;
  const max = Math.max(0.05, ...s) * 1.1;
  const top = 16;
  g.strokeStyle = '#262233';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, h - 0.5); g.lineTo(w, h - 0.5); g.stroke();
  if (s.length > 1) {
    g.strokeStyle = '#a78bfa';
    g.lineWidth = 1.5;
    g.beginPath();
    s.forEach((v, i) => {
      const x = (i / 119) * w;
      const y = h - 2 - (v / max) * (h - top - 4);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
  }
  g.fillStyle = '#8f8aa3';
  g.font = '10px ui-monospace, Menlo, monospace';
  g.fillText(s.length ? `step ms, last ${s.length} ticks (max ${fmtMs(Math.max(...s))})` : 'step ms per tick', 2, 11);
}

function buildSwatches() {
  const box = $('lab-swatches');
  box.textContent = '';
  const pal = new Uint32Array(A.HEAPU8.buffer, A._lab_palette(3), 256).slice(0, 8);
  pal.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = `rgb(${p & 255},${(p >> 8) & 255},${(p >> 16) & 255})`;
    b.setAttribute('aria-label', `colour index ${i}`);
    b.setAttribute('aria-pressed', String(i === lab.colour));
    b.addEventListener('click', () => {
      lab.colour = i;
      for (const x of box.children) x.setAttribute('aria-pressed', String(x === b));
    });
    box.append(b);
  });
}

function brushRadius() { return Math.max(1, Math.round(lab.size / 64)); }

function placeBrush() {
  const b = $('lab-brush');
  if (!lab.showBrush) { b.style.display = 'none'; return; }
  const r = brushRadius();
  const s = 100 / lab.size;
  b.style.display = 'block';
  b.style.left = `${(lab.cursor.x - r) * s}%`;
  b.style.top = `${(lab.cursor.y - r) * s}%`;
  b.style.width = `${(2 * r + 1) * s}%`;
  b.style.height = `${(2 * r + 1) * s}%`;
}

function cellAt(e) {
  const c = $('lab-canvas');
  const rect = c.getBoundingClientRect();
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * lab.size);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * lab.size);
  return { x: Math.min(lab.size - 1, Math.max(0, x)), y: Math.min(lab.size - 1, Math.max(0, y)) };
}

function readCell({ x, y }) {
  if (A._lab_cell(x, y) !== 0) return;
  const o = u64();
  $('lab-readout').textContent = `cell (${x}, ${y}), index ${o[4]}, chunk ${o[5]}: region ${o[0]}, owner ${o[1]}, population ${nf.format(Number(o[2]))}, colour ${o[3]}`;
}

function paintAt(p) {
  const n = A._lab_paint(p.x, p.y, brushRadius(), lab.colour);
  if (lab.mode !== 3) { lab.mode = 3; setSeg('lab-mode', 3); }
  const tick = A._lab_tick();
  $('lab-readout').textContent = `Submitted ${n} set_color_index commands stamped for tick ${nf.format(tick)}; the kernel applies them when that tick runs${lab.playing ? '' : ', so it stepped once'}.`;
  if (!lab.playing) { labTick(); renderLab(); drawSpark(); }
}

function wireLab() {
  $('lab-play').addEventListener('click', () => setLabPlaying(!lab.playing));
  $('lab-stepbtn').addEventListener('click', () => { setLabPlaying(false); labTick(); renderLab(); drawSpark(); });
  wireSeg('lab-mode', (v) => { lab.mode = Number(v); renderLab(); });
  wireSeg('lab-size', (v) => { createLab(Number(v)); renderLab(); $('lab-bench-out').textContent = 'The tick scenario of bench_simulation.cpp: a fresh world, seed 11, median after two warm-up ticks.'; });
  $('lab-bench').addEventListener('click', () => {
    const out = $('lab-bench-out');
    const wasPlaying = lab.playing;
    setLabPlaying(false);
    out.textContent = 'Running…';
    setTimeout(() => {
      const iterations = { 100: 200, 320: 60, 1024: 12 }[lab.size];
      const median = A._lab_bench(lab.size, NATIVE[lab.size].chunk, iterations, 2);
      if (median < 0) { out.textContent = `Failed: ${text()}`; return; }
      const o = u64();
      out.innerHTML = '';
      const strong = document.createElement('strong');
      strong.textContent = `${fmtMs(median)} median`;
      out.append(strong, ` over ${iterations} ticks in this browser (min ${fmtMs(Number(o[1]) / 1000)}, max ${fmtMs(Number(o[2]) / 1000)}), one thread. Recorded native, same scenario: ${NATIVE[lab.size].line}.`);
      if (wasPlaying) setLabPlaying(true);
    }, 30);
  });

  const c = $('lab-canvas');
  c.addEventListener('pointermove', (e) => {
    const p = cellAt(e);
    lab.cursor = p;
    lab.showBrush = true;
    placeBrush();
    if (lab.painting) {
      // Dabs along the segment from the last one, a brush radius apart, so a fast drag is a line.
      const from = lab.lastPaint || p;
      const r = brushRadius();
      const steps = Math.floor(Math.max(Math.abs(p.x - from.x), Math.abs(p.y - from.y)) / r);
      for (let i = 1; i <= steps; i++) {
        const q = { x: Math.round(from.x + ((p.x - from.x) * i) / steps), y: Math.round(from.y + ((p.y - from.y) * i) / steps) };
        paintAt(q);
        lab.lastPaint = q;
      }
    } else if (e.pointerType === 'mouse') readCell(p);
  });
  // Mouse and pen paint on press and drag. A finger paints on tap only, so a swipe still
  // scrolls the page around the iframe.
  c.addEventListener('pointerdown', (e) => {
    lab.pointerType = e.pointerType;
    if (e.pointerType === 'touch') return;
    c.setPointerCapture(e.pointerId);
    const p = cellAt(e);
    lab.cursor = p;
    lab.painting = true;
    lab.lastPaint = p;
    lab.showBrush = true;
    readCell(p);
    paintAt(p);
  });
  c.addEventListener('click', (e) => {
    if (lab.pointerType !== 'touch') return;
    const p = cellAt(e);
    lab.cursor = p;
    lab.showBrush = true;
    paintAt(p);
  });
  const stop = () => { lab.painting = false; lab.lastPaint = null; };
  c.addEventListener('pointerup', stop);
  c.addEventListener('pointercancel', stop);
  c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { lab.showBrush = false; placeBrush(); } });
  c.addEventListener('focus', () => { lab.showBrush = true; placeBrush(); });
  c.addEventListener('blur', () => { lab.showBrush = false; placeBrush(); });
  c.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? brushRadius() * 4 : brushRadius() * 2 + 1;
    const p = lab.cursor;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      p.x = Math.min(lab.size - 1, Math.max(0, p.x + moves[e.key][0]));
      p.y = Math.min(lab.size - 1, Math.max(0, p.y + moves[e.key][1]));
      placeBrush();
      readCell(p);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      paintAt(p);
    }
  });
}

// ------------------------------------------------------------------------------- lockstep

const lock = { ready: false, playing: false, rows: [], agree: 0, diverged: null, injected: null };

function enterLock() {
  if (!lock.ready) {
    resetLock();
    lock.ready = true;
    if (!reduceMotion.matches) setLockPlaying(true);
  }
}

function resetLock() {
  if (A._lockstep_create(320, 32, 1) !== 0) throw new Error(text());
  lock.rows = [];
  lock.agree = 0;
  lock.diverged = null;
  lock.injected = null;
  $('ls-desc').hidden = true;
  renderLock();
}

function setLockPlaying(on) {
  lock.playing = on;
  $('ls-play').textContent = on ? 'Pause' : 'Run';
  kick();
}

function lockTick() {
  const r = A._lockstep_step(2);
  if (r < 0) throw new Error(text());
  const o = u64();
  const row = { tick: Number(o[2]), a: o[0], b: o[1], inj: o[3] === 1n };
  if (row.inj) lock.injected = { tick: row.tick, cell: Number(o[4]) };
  if (r === 0) lock.agree++;
  if (r === 1) lock.diverged = { tick: row.tick, desc: text() };
  lock.rows.unshift(row);
  if (lock.rows.length > 12) lock.rows.pop();
}

function lockFrame() {
  lockTick();
  renderLock();
}

function renderLock() {
  const body = $('ls-log');
  body.textContent = '';
  for (const r of lock.rows) {
    const tr = document.createElement('tr');
    const same = r.a === r.b;
    tr.className = `${same ? '' : 'diff'}${r.inj ? ' inj' : ''}`;
    for (const v of [nf.format(r.tick), hex(r.a), hex(r.b), same ? '=' : '≠']) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.append(td);
    }
    tr.lastChild.setAttribute('aria-label', same ? 'agree' : 'differ');
    body.append(tr);
  }
  const verdict = $('ls-verdict');
  const ticks = lock.rows.length ? lock.rows[0].tick + 1 : 0;
  if (lock.diverged) {
    verdict.className = 'verdict bad';
    verdict.textContent = `Diverged at tick ${nf.format(lock.diverged.tick)}, after ${nf.format(lock.agree)} ticks in agreement.`;
    const box = $('ls-desc');
    box.hidden = false;
    box.textContent = `Engine (attribute_divergence): ${lock.diverged.desc}.`;
    if (lock.injected) {
      box.append(document.createElement('br'), document.createElement('br'),
        `What happened: peer B alone received set_color_index for cell ${nf.format(lock.injected.cell)} at tick ${nf.format(lock.injected.tick)}. That changes colour_index in the cells table, and the first system in the schedule that writes the cells table is the one named. Every later tick differs too, because the two worlds are no longer the same.`);
    }
  } else {
    verdict.className = `verdict${ticks ? ' ok' : ''}`;
    verdict.textContent = ticks ? `Agree, hash for hash, for ${nf.format(ticks)} ticks.` : 'Not started';
  }
}

function wireLock() {
  $('ls-play').addEventListener('click', () => setLockPlaying(!lock.playing));
  $('ls-stepbtn').addEventListener('click', () => { setLockPlaying(false); lockTick(); renderLock(); });
  $('ls-inject').addEventListener('click', () => {
    A._lockstep_inject();
    if (!lock.playing) { lockTick(); renderLock(); }
  });
  $('ls-reset').addEventListener('click', () => { resetLock(); kick(); });
}

// ------------------------------------------------------------------------------- chess

const PIECE = { 1: 'p', 2: 'n', 3: 'b', 4: 'r', 5: 'q', 6: 'k' };
const NAME = { 1: 'pawn', 2: 'knight', 3: 'bishop', 4: 'rook', 5: 'queen', 6: 'king' };
const REASON = { 1: 'checkmate', 2: 'stalemate', 3: 'the fifty-move rule', 4: 'threefold repetition', 5: 'insufficient material' };
const OPERA = ['e2e4', 'e7e5', 'g1f3', 'd7d6', 'd2d4', 'c8g4', 'd4e5', 'g4f3', 'd1f3', 'd6e5', 'f1c4',
  'g8f6', 'f3b3', 'd8e7', 'b1c3', 'c7c6', 'c1g5', 'b7b5', 'c3b5', 'c6b5', 'c4b5', 'b8d7',
  'e1c1', 'a8d8', 'd1d7', 'd8d7', 'h1d1', 'e7e6', 'b5d7', 'f6d7', 'b3b8', 'd7b8', 'd1d8'];
const OPERA_FINAL = 0xBAEC29542FFBAA76n;
// sim/tests/test_perft.cpp: the positions it checks and the counts its comments list.
const PERFT = [
  ['start', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281, 4865609]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, 4085603]],
  ['position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487]],
  ['position 6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890, 3894594]],
];

const chess = {
  ready: false, seat: 1, host: null, board: null, legal: [], selected: -1, pending: null, plies: [],
  last: null, paused: false, opera: null, focus: 52, declined: 0, modSubmitted: 0, modRefused: 0,
};

const sqName = (sq) => 'abcdefgh'[sq & 7] + (1 + (sq >> 3));
const parseSq = (s) => (s.charCodeAt(0) - 97) + 8 * (s.charCodeAt(1) - 49);
const moveText = (m) => sqName(m.from) + sqName(m.to) + (m.promo ? ' nbrq'[m.promo - 1] : '');

function modPlays(side) {
  return chess.seat === 2 || (chess.seat >= 0 && chess.seat === side);
}

function chessWantsTicks() {
  if (!chess.ready || chess.paused || !chess.board || chess.board[71] !== 0) return false;
  if (chess.opera) return false;
  return chess.host !== null && !chess.host.disabled;
}

function enterChess() {
  if (!chess.ready) {
    chess.ready = true;
    buildBoard();
    buildPerft();
    newGame();
  }
}

function modLog(level, line) {
  const log = $('ch-log');
  const tag = ['debug', 'info', 'warn', 'error'][level] || 'info';
  log.textContent += `tick ${chess.host ? chess.host.tick : '-'} [${tag}] ${line}\n`;
  if (log.textContent.length > 6000) log.textContent = log.textContent.slice(-4000);
  log.scrollTop = log.scrollHeight;
}

async function newGame(opera = false) {
  stopOpera();
  chess.paused = false;
  chess.selected = -1;
  chess.pending = null;
  chess.plies = [];
  chess.last = null;
  chess.declined = 0;
  chess.modSubmitted = 0;
  chess.modRefused = 0;
  chess.host = null;
  const seat = opera ? -1 : chess.seat;
  if (A._chess_new(seat, opera ? 1 : 0) !== 0) throw new Error(text());
  $('ch-log').textContent = '';
  if (seat >= 0) {
    const host = new ModHostStandIn(A, modBytes, modLog);
    try {
      await host.start();
      chess.host = host;
      modLog(1, `loaded chess_opponent.wasm, ${nf.format(modBytes.length)} bytes${modSha ? `, sha256 ${modSha.slice(0, 12)}… (${modSha === 'b856ce40f227f2c5affa49c6bc2ddf47b3bd5901cf65e0d604badd8bd6505830' ? 'matches' : 'DIFFERS FROM'} chess_manifest.json)` : ''}; imports ${host.importNames.join(', ')}`);
    } catch (e) {
      modLog(3, `the mod was refused: ${e.message}`);
    }
  } else {
    $('ch-log').textContent = opera ? 'No mod in this game: the Opera Game replays the golden test\'s moves, one per tick.\n' : 'No mod in this game: two people at one screen.\n';
  }
  $('ch-pause').hidden = !(seat >= 0) && !opera;
  $('ch-pause').textContent = 'Pause';
  $('ch-step').hidden = !opera;
  refreshBoard();
  kick();
}

function chessTick() {
  const tick = A._chess_begin_tick();
  if (chess.host) chess.host.poll(tick);
  const p = chess.pending;
  chess.pending = null;
  const n = A._chess_end_tick(p ? 1 : 0, p ? p.from : 0, p ? p.to : 0, p ? p.promo : 0);
  if (n < 0) throw new Error(text());
  const o = u64();
  chess.tick = Number(o[1]) + 1;
  chess.hash = o[0];
  chess.modSubmitted += Number(o[2]);
  chess.modRefused += Number(o[3]);
  const moves = new Uint8Array(A.HEAPU8.buffer, A._chess_moves(), n * 4).slice();
  let personApplied = false;
  for (let i = 0; i < n; i++) {
    const m = { from: moves[i * 4], to: moves[i * 4 + 1], promo: moves[i * 4 + 2], byMod: moves[i * 4 + 3] === 1 };
    chess.plies.push(m);
    chess.last = m;
    if (!m.byMod) personApplied = true;
  }
  if (p && !personApplied) chess.declined++;
  if (n > 0 || p) refreshBoard();
  else updateChessStats();
  return n;
}

function chessFrame() {
  chessTick();
}

function refreshBoard() {
  const b = new Uint8Array(A.HEAPU8.buffer, A._chess_board(), 75).slice();
  chess.board = b;
  chess.hash = u64()[0];
  chess.tick = Number(u64()[1]);
  const count = A._chess_legal();
  const raw = new Uint8Array(A.HEAPU8.buffer, A._chess_moves(), count * 3).slice();
  chess.legal = [];
  for (let i = 0; i < count; i++) chess.legal.push({ from: raw[i * 3], to: raw[i * 3 + 1], promo: raw[i * 3 + 2] });
  drawBoard();
  updateChessStats();
}

function personCanMove() {
  const b = chess.board;
  return b && b[71] === 0 && !chess.opera && !modPlays(b[64]) && !chess.pending;
}

function flipped() { return chess.seat === 0; }

function buildBoard() {
  const board = $('board');
  board.textContent = '';
  for (let i = 0; i < 64; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sq';
    btn.dataset.i = String(i);
    btn.tabIndex = -1;
    board.append(btn);
  }
  board.addEventListener('click', (e) => {
    const btn = e.target.closest('.sq');
    if (btn) clickSquare(Number(btn.dataset.sq));
  });
  board.addEventListener('keydown', (e) => {
    const btn = e.target.closest('.sq');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    let r = i >> 3;
    let c = i & 7;
    if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (e.key === 'ArrowRight') c = Math.min(7, c + 1);
    else if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
    else if (e.key === 'ArrowDown') r = Math.min(7, r + 1);
    else return;
    e.preventDefault();
    focusCell(r * 8 + c);
  });
}

function focusCell(i) {
  const cells = $('board').children;
  for (const c of cells) c.tabIndex = -1;
  cells[i].tabIndex = 0;
  chess.focus = i;
  cells[i].focus({ preventScroll: true });
}

function drawBoard() {
  const b = chess.board;
  const cells = $('board').children;
  const side = b[64];
  const flip = flipped();
  const dests = new Map();
  if (chess.selected >= 0) for (const m of chess.legal) if (m.from === chess.selected) dests.set(m.to, true);
  let kingInCheck = -1;
  if (b[73]) for (let sq = 0; sq < 64; sq++) if ((b[sq] & 7) === 6 && ((b[sq] & 8) !== 0) === (side === 1)) kingInCheck = sq;
  for (let i = 0; i < 64; i++) {
    const row = i >> 3;
    const col = i & 7;
    const rank = flip ? row : 7 - row;
    const file = flip ? 7 - col : col;
    const sq = rank * 8 + file;
    const code = b[sq];
    const cell = cells[i];
    cell.dataset.sq = String(sq);
    const classes = ['sq', (rank + file) % 2 === 1 ? 'l' : 'd'];
    if (chess.last && (chess.last.from === sq || chess.last.to === sq)) classes.push('last');
    if (chess.selected === sq) classes.push('sel');
    if (sq === kingInCheck) classes.push('check');
    if (dests.has(sq)) classes.push('dest', code ? 'cap' : 'x');
    cell.className = classes.join(' ');
    cell.tabIndex = i === chess.focus ? 0 : -1;
    const kind = code & 7;
    const black = (code & 8) !== 0;
    let html = kind ? `<svg viewBox="0 0 45 45" class="${black ? 'pb' : 'pw'}" aria-hidden="true"><use href="#pc-${PIECE[kind]}"/></svg>` : '';
    if (col === 0) html += `<span class="coord r" aria-hidden="true">${rank + 1}</span>`;
    if (row === 7) html += `<span class="coord f" aria-hidden="true">${'abcdefgh'[file]}</span>`;
    cell.innerHTML = html;
    cell.setAttribute('aria-label', `${sqName(sq)}${kind ? `, ${black ? 'black' : 'white'} ${NAME[kind]}` : ''}${dests.has(sq) ? ', legal move' : ''}`);
    cell.setAttribute('aria-pressed', String(chess.selected === sq));
  }
}

function clickSquare(sq) {
  if (!personCanMove()) return;
  const b = chess.board;
  const side = b[64];
  const code = b[sq];
  if (chess.selected >= 0) {
    const options = chess.legal.filter((m) => m.from === chess.selected && m.to === sq);
    if (options.length === 1) { submitPerson(options[0]); return; }
    if (options.length > 1) { askPromotion(options); return; }
  }
  if (code && ((code & 8) !== 0) === (side === 1) && chess.legal.some((m) => m.from === sq)) chess.selected = sq;
  else chess.selected = -1;
  drawBoard();
}

function askPromotion(options) {
  const box = $('promo-choices');
  box.textContent = '';
  const black = chess.board[64] === 1;
  for (const kind of [5, 4, 3, 2]) {
    const m = options.find((o) => o.promo === kind);
    if (!m) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', `promote to ${NAME[kind]}`);
    btn.innerHTML = `<svg viewBox="0 0 45 45" class="${black ? 'pb' : 'pw'}" aria-hidden="true"><use href="#pc-${PIECE[kind]}"/></svg>`;
    btn.addEventListener('click', () => { $('promo').hidden = true; submitPerson(m); });
    box.append(btn);
  }
  $('promo').hidden = false;
  box.firstChild.focus({ preventScroll: true });
}

function submitPerson(m) {
  chess.selected = -1;
  chess.pending = { from: m.from, to: m.to, promo: m.promo };
  if (!chess.host) chessTick();   // two people: a tick per move, as src/main.cpp's play()
  else kick();                    // with a mod: the next frame's tick carries it, a tick a frame
  drawBoard();
}

function updateChessStats() {
  const b = chess.board;
  if (!b) return;
  $('ch-tick').textContent = nf.format(chess.tick || 0);
  $('ch-hash').textContent = hex(chess.hash || 0n);
  if (chess.host) {
    const s = chess.host.stats;
    $('ch-mod').textContent = chess.host.disabled ? 'disabled' : `${nf.format(s.ticks)} polls, ${nf.format(chess.modSubmitted)} ${chess.modSubmitted === 1 ? 'move' : 'moves'} submitted${chess.modRefused ? `, ${chess.modRefused} refused` : ''}`;
  } else $('ch-mod').textContent = chess.opera ? 'none (replay)' : 'none';
  const side = b[64] === 0 ? 'White' : 'Black';
  let status;
  if (b[71] !== 0) {
    const who = { 1: 'White wins', 2: 'Black wins', 3: 'Draw' }[b[71]];
    status = `${who} by ${REASON[b[72]] || 'the rules'}.`;
  } else {
    status = `${side} to move${b[73] ? ', in check' : ''}`;
    if (chess.opera) status += ` · ply ${chess.opera.i} of ${OPERA.length}`;
    else if (modPlays(b[64])) status += chess.host && chess.host.disabled ? ' (the mod is disabled)' : ' · the mod is thinking (it scores two of its moves per tick)';
    else if (chess.seat >= 0) status += ' · your move';
  }
  if (chess.opera && chess.opera.i === OPERA.length) {
    const ok = chess.hash === OPERA_FINAL;
    status += ` Final hash ${ok ? 'matches' : 'DIFFERS FROM'} the recorded ${hex(OPERA_FINAL)}.`;
  }
  $('ch-status').textContent = status;
  const list = $('ch-moves');
  list.textContent = '';
  for (let i = 0; i < chess.plies.length; i += 2) {
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'n';
    num.textContent = `${i / 2 + 1}.`;
    li.append(num);
    for (const m of chess.plies.slice(i, i + 2)) {
      const span = document.createElement('span');
      span.className = m.byMod ? 'm' : '';
      span.textContent = `${moveText(m)}${m.byMod ? '*' : ''} `;
      li.append(span);
    }
    list.append(li);
  }
  list.scrollTop = list.scrollHeight;
}

// The Opera Game, through the kernel with the golden test's seed, one ply a tick.
function startOpera() {
  newGame(true).then(() => {
    chess.opera = { i: 0, timer: 0 };
    $('ch-pause').hidden = false;
    $('ch-step').hidden = false;
    if (!reduceMotion.matches) playOpera(true);
    else { $('ch-pause').textContent = 'Play'; updateChessStats(); }
  });
}

function operaStep() {
  const o = chess.opera;
  if (!o || o.i >= OPERA.length) return;
  const t = OPERA[o.i];
  chess.pending = { from: parseSq(t.slice(0, 2)), to: parseSq(t.slice(2, 4)), promo: 0 };
  o.i++;
  chessTick();
  refreshBoard();
  if (o.i >= OPERA.length) playOpera(false);
}

function playOpera(on) {
  const o = chess.opera;
  if (!o) return;
  clearInterval(o.timer);
  o.timer = 0;
  if (on && o.i < OPERA.length) o.timer = setInterval(() => { if (loop.visible && loop.tab === 'chess') operaStep(); }, 450);
  $('ch-pause').textContent = o.timer ? 'Pause' : 'Play';
  $('ch-pause').hidden = $('ch-step').hidden = o.i >= OPERA.length;
}

function stopOpera() {
  if (chess.opera) clearInterval(chess.opera.timer);
  chess.opera = null;
}

function buildPerft() {
  const pos = $('pf-pos');
  PERFT.forEach(([name], i) => pos.add(new Option(name, String(i))));
  const fillDepth = () => {
    const d = $('pf-depth');
    d.textContent = '';
    PERFT[Number(pos.value)][2].forEach((n, i) => d.add(new Option(`depth ${i + 1} (${nf.format(n)})`, String(i + 1))));
    d.value = String(Math.min(3, PERFT[Number(pos.value)][2].length));
  };
  pos.addEventListener('change', fillDepth);
  fillDepth();
  $('pf-run').addEventListener('click', () => {
    const [name, fen, counts] = PERFT[Number(pos.value)];
    const depth = Number($('pf-depth').value);
    const out = $('pf-out');
    out.textContent = 'Counting…';
    setTimeout(() => {
      const bytes = new TextEncoder().encode(fen);
      const p = A._web_alloc(bytes.length);
      A.HEAPU8.set(bytes, p);
      const ms = A._chess_perft(p, bytes.length, depth);
      if (ms < 0) { out.textContent = `Failed: ${text()}`; return; }
      const nodes = Number(u64()[0]);
      const ok = nodes === counts[depth - 1];
      out.innerHTML = '';
      const s = document.createElement('strong');
      s.className = ok ? 'ok' : 'bad';
      s.textContent = `${nf.format(nodes)} nodes, ${ok ? 'matches' : 'DIFFERS FROM'} the expected ${nf.format(counts[depth - 1])}`;
      out.append(s, ` · ${name}, depth ${depth}, ${fmtMs(ms)} in this browser (${nf.format(Math.round(nodes / Math.max(ms, 0.001) / 1000))} k nodes/ms). Native reference: depth 3 from the start in 172 µs (macOS release, M22).`);
    }, 30);
  });
}

function wireChess() {
  wireSeg('ch-mode', (v) => { chess.seat = Number(v); newGame(); });
  $('ch-new').addEventListener('click', () => newGame());
  $('ch-opera').addEventListener('click', startOpera);
  $('ch-step').addEventListener('click', () => { playOpera(false); operaStep(); });
  $('ch-pause').addEventListener('click', () => {
    if (chess.opera) { playOpera(!chess.opera.timer); return; }
    chess.paused = !chess.paused;
    $('ch-pause').textContent = chess.paused ? 'Resume' : 'Pause';
    kick();
  });
}

// ------------------------------------------------------------------------------- start

async function start() {
  const button = $('start');
  button.disabled = true;
  $('progress').hidden = false;
  const status = (msg, f) => {
    $('load-status').textContent = msg;
    $('progress-bar').style.width = `${Math.round(f * 100)}%`;
  };
  try {
    A = await loadAtlas(status);
    status('Running the golden scenarios', 1);
    $('poster').hidden = true;
    $('tabs').hidden = false;
    wireTabs();
    wireLab();
    wireLock();
    wireChess();
    selectTab('hashes');
    runGoldens();
    $('h-run').addEventListener('click', runGoldens);
  } catch (e) {
    button.disabled = false;
    status(`Could not start: ${e.message || e}`, 0);
    $('load-status').classList.add('error');
  }
}

$('start').addEventListener('click', start);

if ('IntersectionObserver' in window) {
  new IntersectionObserver((entries) => { loop.inView = entries[entries.length - 1].isIntersecting; updateVisible(); }).observe($('app'));
}
document.addEventListener('visibilitychange', updateVisible);
reduceMotion.addEventListener?.('change', () => {
  if (reduceMotion.matches) { setLabPlaying(false); setLockPlaying(false); }
});
