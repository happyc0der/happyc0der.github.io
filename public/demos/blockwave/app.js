// BLOCKWAVE demo page. Python does the game; this file only schedules it, moves
// frames from WASM memory to canvases and keeps the readouts current.
import { startPython, PYODIDE_VERSION } from '../_shared/pyodide.js';

const $ = (id) => document.getElementById(id);
const ACTIONS = ['none', 'left', 'right', 'soft drop', 'hard drop', 'rotate cw', 'rotate ccw', 'hold'];
// Arcade (bloom, sun, grid, scanlines, vignette) is the default when this browser renders it in
// under this many milliseconds; otherwise the page starts on the flat profile and says so.
const ARCADE_BUDGET_MS = 40;

let py = null;
let look = 'arcade';
let activeTab = 'watch';
let onScreen = true;

// ---------------------------------------------------------------- helpers

// Let the status line paint before a long synchronous Python call. The timeout covers an
// off-screen iframe, where the browser may not run animation frames at all.
const nextPaint = () => new Promise((resolve) => {
  let done = false;
  const go = () => { if (!done) { done = true; resolve(); } };
  requestAnimationFrame(() => setTimeout(go, 0));
  setTimeout(go, 80);
});

async function fetchBytes(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not fetch ${url} (${res.status})`);
  const total = +res.headers.get('content-length') || 0;
  if (!res.body || !total || !onProgress) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(1, got / total));
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function place(path, bytes) {
  py.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
  py.FS.writeFile(path, bytes);
}

function setBar(el, f) { el.querySelector('i').style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`; }

// A numpy (H, W, 4) uint8 array, read in place out of WASM memory.
function blit(arrProxy, ctx) {
  const buf = arrProxy.getBuffer('u8clamped');
  try {
    const [h, w] = buf.shape;
    let img;
    try { img = new ImageData(buf.data, w, h); } catch { img = new ImageData(new Uint8ClampedArray(buf.data), w, h); }
    ctx.putImageData(img, 0, 0);
    return img;
  } finally {
    buf.release();
  }
}

function pyGet(expr) { return py.runPython(expr); }

function segment(groupId, onPick) {
  const group = $(groupId);
  group.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b || b.disabled) return;
    for (const x of group.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    onPick(b.dataset.v);
  });
  return (v) => { for (const x of group.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x.dataset.v === v)); };
}

function buildProbs(listId) {
  const ol = $(listId);
  ol.innerHTML = ACTIONS.map((a) => `<li><span>${a}</span><span class="t"><i></i></span><span class="v">0%</span></li>`).join('');
  const rows = [...ol.children];
  return (probs, chosen) => {
    rows.forEach((li, i) => {
      const p = probs[i] || 0;
      li.classList.toggle('on', i === chosen);
      li.querySelector('i').style.width = `${(p * 100).toFixed(1)}%`;
      li.querySelector('.v').textContent = `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
    });
  };
}

class Mean {
  constructor(n = 30) { this.n = n; this.xs = []; }
  add(x) { this.xs.push(x); if (this.xs.length > this.n) this.xs.shift(); }
  get v() { return this.xs.length ? this.xs.reduce((a, b) => a + b, 0) / this.xs.length : 0; }
}

// ---------------------------------------------------------------- start

const status = $('status');
const progress = $('progress');

async function start() {
  const btn = $('start');
  btn.disabled = true;
  progress.hidden = false;
  const say = (text, f) => { status.textContent = text; setBar(progress, f); };
  try {
    let weightFrac = 0;
    const manifestP = fetch('py/manifest.json').then((r) => { if (!r.ok) throw new Error('manifest missing'); return r.json(); });
    const weightsP = fetchBytes('data/board.npz', (f) => { weightFrac = f; });
    const others = Promise.all(['data/parity_board.npz', 'data/board_config.json'].map((u) => fetchBytes(u)));

    py = await startPython({ packages: ['numpy'], onStatus: (text, f) => say(text, f * 0.7) });
    const manifest = await manifestP;
    const files = [...manifest.repo_files, ...manifest.demo_files];
    say(`Fetching ${manifest.repo_files.length} BLOCKWAVE modules and the demo's glue`, 0.72);
    const blobs = await Promise.all(files.map((f) => fetchBytes(`py/${f}`)));
    files.forEach((f, i) => place(`/home/pyodide/${f}`, blobs[i]));

    if (weightFrac < 1) say('Downloading the board agent\'s weights (4 MB)', 0.75);
    const [weights, [parity, config]] = await Promise.all([weightsP, others]);
    place('/home/pyodide/data/board.npz', weights);
    place('/home/pyodide/data/parity_board.npz', parity);
    place('/home/pyodide/data/board_config.json', config);

    say('Importing the engine, renderer and agent environment', 0.82);
    await nextPaint();
    py.runPython(`
import sys
if '/home/pyodide' not in sys.path:
    sys.path.insert(0, '/home/pyodide')
from pathlib import Path
from demo import driver
DATA = Path('/home/pyodide/data')
`);
    say('Measuring how fast this browser renders a frame', 0.88);
    await nextPaint();
    const benchArcade = pyGet('driver.bench("arcade", 30)');
    const benchFlat = pyGet('driver.bench("flat", 30)');
    look = benchArcade <= ARCADE_BUDGET_MS ? 'arcade' : 'flat';
    perf.bench = { arcade: benchArcade, flat: benchFlat };

    say('Building the agent and checking the NumPy forward pass against PyTorch', 0.93);
    await nextPaint();
    py.runPython(`watch = driver.BoardWatch((DATA / 'board.npz').read_bytes(), (DATA / 'board_config.json').read_text(), profile=${JSON.stringify(look)})`);
    const par = JSON.parse(pyGet(`watch.parity((DATA / 'parity_board.npz').read_bytes())`));
    watch.hz = JSON.parse(new TextDecoder().decode(config)).agent_hz || 5;
    watch.W = pyGet('watch');
    watch.rgba = pyGet('watch.canvas.rgba');
    $('w-parity').textContent = `NumPy vs PyTorch logits: max |Δ| ${par.max_abs.toExponential(1)} over ${par.n} recorded states (${(par.params / 1e6).toFixed(2)}M parameters). ${par.max_abs < 1e-4 ? 'Parity OK.' : 'PARITY FAILED.'}`;
    setLook(look);
    const lookNote = look === 'flat'
      ? `This browser took ${benchArcade.toFixed(0)} ms for an arcade frame, so the page started on the flat profile (${benchFlat.toFixed(0)} ms). `
      : '';
    $('w-perf').dataset.prefix = lookNote;

    say(`Ready: Pyodide ${PYODIDE_VERSION}`, 1);
    $('poster').hidden = true;
    $('app').hidden = false;
    renderWatch();
    updateWatchUI(null);
    schedule('watch');
  } catch (err) {
    console.error(err);
    status.textContent = `Could not start: ${err.message}`;
    status.classList.add('error');
    btn.disabled = false;
    btn.textContent = 'Try again';
  }
}

$('start').addEventListener('click', start);

// ---------------------------------------------------------------- shared loop plumbing

const perf = { bench: null };
const loops = {};

function schedule(name) {
  const loop = loops[name];
  if (!loop || loop.raf || !loop.ready()) return;
  if (activeTab !== name || !onScreen || document.hidden) return;
  loop.raf = requestAnimationFrame((t) => { loop.raf = 0; loop.frame(t); });
}

function stopAll() {
  for (const l of Object.values(loops)) { if (l.raf) cancelAnimationFrame(l.raf); l.raf = 0; l.last = 0; }
}

// ---------------------------------------------------------------- tab 1: watch the board agent

const watch = { W: null, rgba: null, hz: 5, speed: 1, paused: false, acc: 0, hold: 0, raf: 0, last: 0,
  rewards: [], totals: { pieces: 0, lines: 0, games: 0 }, lastRes: null,
  m: { render: new Mean(), env: new Mean(), policy: new Mean() } };
loops.watch = watch;
watch.ready = () => !!watch.W;
const wctx = $('cv-watch').getContext('2d');
const wProbs = buildProbs('w-probs');

function renderWatch() {
  watch.m.render.add(watch.W.render());
  blit(watch.rgba, wctx);
}

function onWatchStep(r) {
  watch.m.env.add(r.env_ms);
  watch.m.policy.add(r.policy_ms);
  if (r.reward !== null) {
    watch.rewards.push({ v: r.reward, dead: r.top_out });
    if (watch.rewards.length > 80) watch.rewards.shift();
  }
  if (r.top_out) {
    const g = r.games[r.games.length - 1];
    watch.totals.pieces += g.pieces;
    watch.totals.lines += g.lines;
    watch.totals.games += 1;
    const lpp = watch.totals.lines / Math.max(1, watch.totals.pieces);
    const li = $('bar-live');
    li.hidden = false;
    li.querySelector('.bn').textContent = `board-state agent, this page (${watch.totals.games} game${watch.totals.games > 1 ? 's' : ''})`;
    li.querySelector('i').style.setProperty('--v', lpp.toFixed(4));
    li.querySelector('.bv').textContent = lpp.toFixed(4);
  }
  watch.lastRes = r;
}

function updateWatchUI(r) {
  if (r) {
    $('w-dec').textContent = r.decisions.toLocaleString();
    $('w-pieces').textContent = r.pieces;
    $('w-lines').textContent = r.lines;
    $('w-games').textContent = r.n_games;
    wProbs(r.probs, r.action);
    $('w-act').textContent = `· chose ${ACTIONS[r.action]}`;
    const last = watch.rewards[watch.rewards.length - 1];
    if (last) $('w-rew').textContent = `· last ${last.v.toFixed(3)}`;
  }
  drawSpark();
  const b = perf.bench;
  $('w-perf').textContent = `${$('w-perf').dataset.prefix || ''}Measured here: ${look} frame ${watch.m.render.v.toFixed(1)} ms, env step ${watch.m.env.v.toFixed(1)} ms, policy ${watch.m.policy.v.toFixed(1)} ms.`
    + (b ? ` Arcade ${b.arcade.toFixed(0)} ms vs flat ${b.flat.toFixed(0)} ms per frame.` : '');
}

watch.frame = (now) => {
  const dt = Math.min(now - (watch.last || now), 250);
  watch.last = now;
  if (watch.hold > 0) {
    watch.hold -= dt;
    if (watch.hold <= 0) { $('ov-watch').hidden = true; renderWatch(); }
  } else if (!watch.paused) {
    watch.acc += (dt * watch.hz * watch.speed) / 1000;
    let n = 0;
    let r = null;
    const t0 = performance.now();
    while (watch.acc >= 1 && n < 16 && performance.now() - t0 < 45) {
      r = JSON.parse(watch.W.step());
      watch.acc -= 1;
      n += 1;
      onWatchStep(r);
      if (r.top_out) break;
    }
    if (watch.acc > 3) watch.acc = 0; // this browser cannot keep up at this speed: drop the backlog
    if (r && r.top_out) {
      const g = r.games[r.games.length - 1];
      const ov = $('ov-watch');
      ov.textContent = `Topped out. Game ${r.n_games}: ${g.pieces} pieces, ${g.lines} lines. The next game starts from the evaluator's held-out seed sequence.`;
      ov.hidden = false;
      watch.hold = 2200;
      watch.acc = 0;
    } else if (r) {
      renderWatch();
    }
    if (r) updateWatchUI(r);
  }
  schedule('watch');
};

function watchStepOnce() {
  if (!watch.W || watch.hold > 0) return;
  const r = JSON.parse(watch.W.step());
  onWatchStep(r);
  if (!r.top_out) renderWatch();
  updateWatchUI(r);
}

$('w-pause').addEventListener('click', () => {
  watch.paused = !watch.paused;
  $('w-pause').textContent = watch.paused ? 'Resume' : 'Pause';
  $('w-pause').setAttribute('aria-pressed', String(watch.paused));
  $('w-step').disabled = !watch.paused;
  watch.acc = 0;
});
$('w-step').addEventListener('click', watchStepOnce);
segment('w-speed', (v) => { watch.speed = +v; watch.acc = 0; });
const showLook = segment('w-look', (v) => setLook(v));

function setLook(v) {
  look = v;
  showLook(v);
  if (watch.W) {
    watch.W.set_profile(v);
    watch.rgba.destroy();
    watch.rgba = pyGet('watch.canvas.rgba');
    watch.m.render = new Mean();
    if (watch.hold <= 0) renderWatch();
  }
  if (pixel.W) {
    pixel.W.set_profile(v);
    pixel.rgba.destroy();
    pixel.rgba = pyGet('pixel.canvas.rgba');
    renderPixelHuman();
  }
  if (play.G) {
    play.G.set_profile(v);
    play.rgba.destroy();
    play.rgba = pyGet('play.canvas.rgba');
    if (!play.running) blit(play.rgba, gctx);
  }
}

// Reward sparkline: alive placements on a fixed scale, top-outs as red bars.
function drawSpark() {
  const cv = $('w-spark');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(100, Math.round(cv.clientWidth * dpr));
  const H = Math.max(40, Math.round(cv.clientHeight * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const lo = -6, hi = 0.6;
  const y = (v) => H - 6 * dpr - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - 14 * dpr);
  ctx.strokeStyle = '#262233';
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.beginPath(); ctx.moveTo(0, y(0)); ctx.lineTo(W, y(0)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#8f8aa3';
  ctx.font = `${10 * dpr}px ui-monospace, monospace`;
  ctx.fillText('0', 4 * dpr, y(0) - 3 * dpr);
  ctx.fillText('−6', 4 * dpr, H - 8 * dpr);
  const pts = watch.rewards;
  if (!pts.length) return;
  const step = (W - 24 * dpr) / 79;
  const x0 = W - 6 * dpr - (pts.length - 1) * step;
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  let pen = false;
  pts.forEach((p, i) => {
    const x = x0 + i * step;
    if (p.dead) { pen = false; return; }
    if (pen) ctx.lineTo(x, y(p.v)); else { ctx.moveTo(x, y(p.v)); pen = true; }
  });
  ctx.stroke();
  pts.forEach((p, i) => {
    const x = x0 + i * step;
    if (p.dead) {
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(x - 1.5 * dpr, 2 * dpr, 3 * dpr, H - 4 * dpr);
    } else if (p.v < 0) {
      ctx.fillStyle = '#c4b5fd';
      ctx.beginPath(); ctx.arc(x, y(p.v), 2 * dpr, 0, Math.PI * 2); ctx.fill();
    }
  });
}

// ---------------------------------------------------------------- tab 2: the pixel agent

const pixel = { W: null, rgba: null, crop: null, hz: 5, speed: 1, paused: false, acc: 0, hold: 0, raf: 0, last: 0, ring: [] };
loops.pixel = pixel;
pixel.ready = () => !!pixel.W;
const pctx = $('cv-pixel').getContext('2d');
const cropCtx = $('cv-crop').getContext('2d');
const stackCtx = [...document.querySelectorAll('.stack canvas')].map((c) => c.getContext('2d'));
const pProbs = buildProbs('p-probs');

async function loadPixel() {
  const btn = $('p-load');
  const bar = $('p-progress');
  const st = $('p-status');
  btn.disabled = true;
  bar.hidden = false;
  try {
    st.textContent = 'Downloading the pixel agent\'s weights (6.8 MB)';
    const [w, par, cfg] = await Promise.all([
      fetchBytes('data/pixel.npz', (f) => setBar(bar, f * 0.9)),
      fetchBytes('data/parity_pixel.npz'),
      fetchBytes('data/pixel_config.json'),
    ]);
    place('/home/pyodide/data/pixel.npz', w);
    place('/home/pyodide/data/parity_pixel.npz', par);
    place('/home/pyodide/data/pixel_config.json', cfg);
    st.textContent = 'Building the pixel agent and checking parity with PyTorch';
    setBar(bar, 0.95);
    await nextPaint();
    py.runPython(`pixel = driver.PixelWatch((DATA / 'pixel.npz').read_bytes(), (DATA / 'pixel_config.json').read_text(), profile=${JSON.stringify(look)})`);
    const p = JSON.parse(pyGet(`pixel.parity((DATA / 'parity_pixel.npz').read_bytes())`));
    $('p-parity').textContent = `NumPy vs PyTorch logits: max |Δ| ${p.max_abs.toExponential(1)} over ${p.n} recorded frame stacks (${(p.params / 1e6).toFixed(2)}M parameters). ${p.max_abs < 1e-4 ? 'Parity OK.' : 'PARITY FAILED.'}`;
    pixel.hz = JSON.parse(new TextDecoder().decode(cfg)).agent_hz || 5;
    pixel.W = pyGet('pixel');
    pixel.rgba = pyGet('pixel.canvas.rgba');
    pixel.crop = pyGet('pixel.crop.rgba');
    const first = blit(pixel.crop, cropCtx);
    pixel.ring = [first, first, first, first].map((img) => new ImageData(new Uint8ClampedArray(img.data), 88, 88));
    drawStack();
    renderPixelHuman();
    $('p-gate').hidden = true;
    $('p-views').hidden = false;
    schedule('pixel');
  } catch (err) {
    console.error(err);
    st.textContent = `Could not load the pixel agent: ${err.message}`;
    st.classList.add('error');
    btn.disabled = false;
  }
}
$('p-load').addEventListener('click', loadPixel);

function renderPixelHuman() { pixel.W.render(); blit(pixel.rgba, pctx); }
function drawStack() { pixel.ring.forEach((img, i) => stackCtx[i].putImageData(img, 0, 0)); }

function onPixelStep(r) {
  const img = blit(pixel.crop, cropCtx);
  pixel.ring.push(new ImageData(new Uint8ClampedArray(img.data), 88, 88));
  if (pixel.ring.length > 4) pixel.ring.shift();
  pixel.lastRes = r;
}

function updatePixelUI(r) {
  $('p-dec').textContent = r.decisions.toLocaleString();
  $('p-pieces').textContent = r.pieces;
  $('p-lines').textContent = r.lines;
  $('p-games').textContent = r.n_games;
  pProbs(r.probs, r.action);
  $('p-act').textContent = `· chose ${ACTIONS[r.action]}`;
  drawStack();
}

pixel.frame = (now) => {
  const dt = Math.min(now - (pixel.last || now), 250);
  pixel.last = now;
  if (pixel.hold > 0) {
    pixel.hold -= dt;
    if (pixel.hold <= 0) { $('ov-pixel').hidden = true; renderPixelHuman(); }
  } else if (!pixel.paused) {
    pixel.acc += (dt * pixel.hz * pixel.speed) / 1000;
    let n = 0;
    let r = null;
    const t0 = performance.now();
    while (pixel.acc >= 1 && n < 8 && performance.now() - t0 < 45) {
      r = JSON.parse(pixel.W.step());
      pixel.acc -= 1;
      n += 1;
      onPixelStep(r);
      if (r.top_out) break;
    }
    if (pixel.acc > 3) pixel.acc = 0;
    if (r && r.top_out) {
      const g = r.games[r.games.length - 1];
      const ov = $('ov-pixel');
      ov.textContent = `Topped out. Game ${r.n_games}: ${g.pieces} pieces, ${g.lines} lines.`;
      ov.hidden = false;
      pixel.hold = 2200;
      pixel.acc = 0;
    } else if (r) {
      renderPixelHuman();
    }
    if (r) updatePixelUI(r);
  }
  schedule('pixel');
};

$('p-pause').addEventListener('click', () => {
  pixel.paused = !pixel.paused;
  $('p-pause').textContent = pixel.paused ? 'Resume' : 'Pause';
  $('p-pause').setAttribute('aria-pressed', String(pixel.paused));
  $('p-step').disabled = !pixel.paused;
  pixel.acc = 0;
});
$('p-step').addEventListener('click', () => {
  if (!pixel.W || pixel.hold > 0) return;
  const r = JSON.parse(pixel.W.step());
  onPixelStep(r);
  if (!r.top_out) renderPixelHuman();
  updatePixelUI(r);
});
segment('p-speed', (v) => { pixel.speed = +v; pixel.acc = 0; });

// ---------------------------------------------------------------- tab 3: play

const play = { G: null, rgba: null, running: false, over: false, raf: 0, last: 0, m: { render: new Mean(), logic: new Mean() } };
loops.play = play;
play.ready = () => !!play.G && play.running;
const gctx = $('cv-play').getContext('2d');
const KEYS = {
  ArrowLeft: 'K_LEFT', ArrowRight: 'K_RIGHT', ArrowDown: 'K_DOWN', ArrowUp: 'K_UP', Space: 'K_SPACE',
  KeyX: 'K_x', KeyZ: 'K_z', KeyC: 'K_c', ControlLeft: 'K_LCTRL', ControlRight: 'K_RCTRL',
  ShiftLeft: 'K_LSHIFT', ShiftRight: 'K_RSHIFT',
};

function ensureGame() {
  if (play.G) return;
  py.runPython(`play = driver.Play(profile=${JSON.stringify(look)})`);
  play.G = pyGet('play');
  play.rgba = pyGet('play.canvas.rgba');
}

function playOverlay(text) {
  const ov = $('ov-play');
  ov.textContent = text;
  ov.hidden = false;
}

function pausePlay(text = 'Paused. Click or tap to resume.') {
  if (!play.running) return;
  play.running = false;
  if (play.G) play.G.release_all();
  for (const b of document.querySelectorAll('#pad .down')) b.classList.remove('down');
  playOverlay(text);
}

function resumePlay() {
  ensureGame();
  if (play.over) { play.G.restart(); play.over = false; }
  $('ov-play').hidden = true;
  play.running = true;
  play.last = 0;
  schedule('play');
}

play.frame = (now) => {
  if (!play.running) return;
  const dt = play.last ? now - play.last : 1000 / 60;
  play.last = now;
  const r = JSON.parse(play.G.advance(dt / 1000));
  blit(play.rgba, gctx);
  play.m.render.add(r.render_ms);
  play.m.logic.add(r.logic_ms);
  $('g-score').textContent = r.score.toLocaleString();
  $('g-lines').textContent = r.lines;
  $('g-level').textContent = r.level;
  $('g-pieces').textContent = r.pieces;
  $('g-perf').textContent = `Measured here: ${look} frame ${play.m.render.v.toFixed(1)} ms, engine ${play.m.logic.v.toFixed(2)} ms per animation frame.`;
  if (r.game_over) {
    play.running = false;
    play.over = true;
    play.G.release_all();
    playOverlay(`Game over: ${r.score.toLocaleString()} points, ${r.lines} lines. Click, tap or press Enter to play again.`);
    return;
  }
  schedule('play');
};

$('ov-play').addEventListener('click', resumePlay);

document.addEventListener('keydown', (e) => {
  if (activeTab !== 'play' || !play.G) return;
  if (!play.running) {
    if (e.code === 'Enter' && play.over && document.activeElement === document.body) { e.preventDefault(); resumePlay(); }
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); pausePlay(); return; }
  const k = KEYS[e.code];
  if (!k) return;
  e.preventDefault();
  if (e.repeat) return; // the repo's InputState does its own auto-repeat (DAS/ARR)
  play.G.key_down(k);
});
document.addEventListener('keyup', (e) => {
  const k = KEYS[e.code];
  if (!k || !play.G || !play.running) return;
  e.preventDefault();
  play.G.key_up(k);
});
window.addEventListener('blur', () => pausePlay());

for (const b of document.querySelectorAll('#pad button')) {
  const up = () => {
    if (!b.classList.contains('down')) return;
    b.classList.remove('down');
    if (play.G && play.running) play.G.key_up(b.dataset.k);
  };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!play.running) { resumePlay(); return; }
    b.setPointerCapture?.(e.pointerId);
    b.classList.add('down');
    play.G.key_down(b.dataset.k);
  });
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('lostpointercapture', up);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---------------------------------------------------------------- tabs, visibility

const TABS = ['watch', 'pixel', 'play'];
function setTab(name, focus = false) {
  if (name === activeTab) return;
  if (activeTab === 'play') pausePlay();
  stopAll();
  activeTab = name;
  for (const t of TABS) {
    const tab = $(`tab-${t}`);
    const on = t === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`panel-${t}`).hidden = !on;
    if (on && focus) tab.focus({ preventScroll: true });
  }
  if (name === 'play' && !play.running && !play.over) {
    ensureGame();
    play.G.advance(0); // zero ticks: just draw the board behind the "click to play" overlay
    blit(play.rgba, gctx);
  }
  if (name === 'watch') updateWatchUI(watch.lastRes);
  schedule(name);
}
for (const t of TABS) $(`tab-${t}`).addEventListener('click', () => setTab(t));
document.querySelector('.tabs').addEventListener('keydown', (e) => {
  if (activeTab === 'play' && play.running) return; // arrows belong to the game
  const i = TABS.indexOf(activeTab);
  let j = null;
  if (e.key === 'ArrowRight') j = (i + 1) % TABS.length;
  else if (e.key === 'ArrowLeft') j = (i + TABS.length - 1) % TABS.length;
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = TABS.length - 1;
  if (j === null) return;
  e.preventDefault();
  setTab(TABS[j], true);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pausePlay(); stopAll(); } else schedule(activeTab);
});
// Stop drawing while the embedding page has scrolled the demo out of view.
if ('IntersectionObserver' in window) {
  new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    if (!onScreen) { pausePlay(); stopAll(); } else schedule(activeTab);
  }).observe(document.querySelector('.wrap'));
}
window.addEventListener('resize', () => { if (watch.W && activeTab === 'watch') drawSpark(); });
