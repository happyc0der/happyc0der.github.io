// SPDX-License-Identifier: GPL-3.0-or-later
//
// The page around Atlas's lab. Everything the visitor sees inside the canvas is the lab itself
// (apps/lab/main.cpp and the engine, compiled with Emscripten); this file only fetches it, gives
// it a command line, passes two-finger touch gestures on as the mouse input the lab reads, and
// runs the lab's own headless mode to compare state hashes with a native build.

const WASM = 'atlas_lab.wasm';
// Uncompressed size, for the progress bar: a compressed response's length says nothing about
// how many bytes the body will deliver.
const WASM_BYTES = 2300875;

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('canvas');
const poster = $('poster');
const statusLine = $('status');
const progress = $('progress');
const bar = $('progress-bar');
const form = $('opts');

// ---------------------------------------------------------------- options -> command line

let compiled = null;  // WebAssembly.Module, kept so that the hash check need not compile again
let running = false;
let exited = false;

const params = new URLSearchParams(location.search);
const optionNames = { grid: 'grid', seed: 'seed', cpt: 'cpt', paused: 'paused' };
for (const [key, name] of Object.entries(optionNames)) {
  if (!params.has(key)) continue;
  const field = form.elements[name];
  if (field.type === 'checkbox') field.checked = params.get(key) === '1';
  else field.value = params.get(key);
}

function readOptions() {
  const grid = Number(form.elements.grid.value) || 1024;
  const seed = Math.max(0, Math.floor(Number(form.elements.seed.value) || 0));
  const cpt = Number(form.elements.cpt.value) || 0;
  const paused = form.elements.paused.checked;
  return { grid, seed, cpt, paused };
}

/// The lab's own command line. --workers 0 because the page has one thread; --save gives F5,
/// F9 and the panel's Save and Load buttons a file in the module's in-memory filesystem.
function commandLine({ grid, seed, cpt, paused }) {
  const args = ['--workers', '0', '--grid', String(grid), '--seed', String(seed), '--save', 'lab.save'];
  if (cpt > 0) args.push('--commands-per-tick', String(cpt));
  if (paused) args.push('--paused');
  return args;
}

function showCommandLine() {
  $('cmdline').innerHTML = '<b>atlas_lab</b> ' + commandLine(readOptions()).join(' ');
}
showCommandLine();
form.addEventListener('change', () => {
  showCommandLine();
  if (running || exited) $('apply').hidden = false;
});
/// A fresh page with the current options, started straight away: a module whose runtime has
/// exited cannot run main again, and a reload is the clean way to give the lab a new one.
function runAgain() {
  const o = readOptions();
  location.search = new URLSearchParams({ grid: o.grid, seed: o.seed, cpt: o.cpt, paused: o.paused ? 1 : 0, run: 1 }).toString();
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  runAgain();
});

// ---------------------------------------------------------------- environment checks

// "About 700": a 700-pixel iframe with a border is 698 inside, and gets the full lab.
const narrow = () => window.innerWidth < 680;
function updateNarrow() {
  if (running) return;
  $('narrow').hidden = !narrow();
  $('start-row').hidden = narrow();
  poster.classList.toggle('is-narrow', narrow());
}
updateNarrow();
window.addEventListener('resize', updateNarrow);

function problem(html) {
  const p = $('problem');
  p.innerHTML = html;
  p.hidden = false;
}

// ---------------------------------------------------------------- loading


async function fetchWasm() {
  if (compiled) return compiled;
  progress.hidden = false;
  const response = await fetch(WASM);
  if (!response.ok) throw new Error(`${WASM}: HTTP ${response.status}`);
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    bar.style.width = `${Math.min(100, (100 * received) / WASM_BYTES).toFixed(1)}%`;
    statusLine.textContent = `downloading ${(received / 1e6).toFixed(1)} of ${(WASM_BYTES / 1e6).toFixed(1)} MB`;
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  statusLine.textContent = 'compiling';
  compiled = await WebAssembly.compile(bytes);
  return compiled;
}

// The lab logs through stdout and stderr with colour codes; the console gets them by severity,
// so an INF line is not reported as an error just because it went to stderr.
const ANSI = /\x1b\[[0-9;]*m/g;
function toConsole(line) {
  const text = line.replace(ANSI, '');
  if (/ (ERR|FTL) \[/.test(text)) console.error(text);
  else if (/ WRN \[/.test(text)) console.warn(text);
  else console.log(text);
  return text;
}

async function createLab(extra) {
  const { default: createAtlasLab } = await import('./atlas_lab.mjs');
  const module = await fetchWasm();
  return createAtlasLab({
    instantiateWasm(imports, done) {
      WebAssembly.instantiate(module, imports).then((instance) => done(instance, module));
      return {};
    },
    ...extra,
  });
}

async function start() {
  if (running || exited) return;
  if (!('gpu' in navigator)) {
    $('start').disabled = true;
    problem('This browser does not expose WebGPU, which the lab draws with here. It is in current Chrome and Edge, in Safari 26, and in Firefox 141 or later on Windows. The <a href="../atlas-engine/" target="_top">Atlas engine demo</a> runs the same simulation without it.');
    return;
  }
  const adapter = await navigator.gpu.requestAdapter().catch(() => null);
  if (!adapter) {
    $('start').disabled = true;
    problem('WebGPU is present but the browser offered no adapter (it may be switched off, or blocked for this graphics driver). The <a href="../atlas-engine/" target="_top">Atlas engine demo</a> runs the same simulation without it.');
    return;
  }
  running = true;
  $('start').disabled = true;
  $('start-anyway').disabled = true;
  statusLine.classList.remove('error');
  try {
    const args = commandLine(readOptions());
    const lab = await createLab({
      canvas,
      print: toConsole,
      printErr: toConsole,
      // Keys go to the canvas only, so the lab does not take them from the page around it.
      preRun: [(m) => { m.ENV.SDL_EMSCRIPTEN_KEYBOARD_ELEMENT = '#canvas'; }],
      onExit: (code) => finished(code),
      onAbort: (what) => failed(String(what)),
    });
    window.atlasLab = lab;  // for the curious, and for the page's own tests
    statusLine.textContent = 'starting';
    poster.hidden = true;
    canvas.focus();
    lab.callMain(args);
  } catch (error) {
    failed(error && error.message ? error.message : String(error));
  }
}

function finished(code) {
  running = false;
  exited = true;
  poster.hidden = false;
  progress.hidden = true;
  $('start-row').hidden = false;
  $('start').disabled = false;
  $('start').textContent = 'Run again';
  $('start').onclick = runAgain;
  statusLine.textContent = code === 0
    ? 'The lab quit (Escape quits it, as it does natively) with exit status 0.'
    : `The lab exited with status ${code}. Its log, in the browser console, says why.`;
  if (code !== 0) statusLine.classList.add('error');
}

function failed(message) {
  running = false;
  exited = true;
  poster.hidden = false;
  progress.hidden = true;
  statusLine.textContent = `The lab stopped: ${message}`;
  statusLine.classList.add('error');
  $('start-row').hidden = false;
  $('start').disabled = false;
  $('start').textContent = 'Reload';
  $('start').onclick = runAgain;
}

$('start').addEventListener('click', start);
$('start-anyway').addEventListener('click', () => { $('narrow').hidden = true; poster.classList.remove('is-narrow'); start(); });
if (params.get('run') === '1' && !narrow()) start();

// The lab pans with the right button; the browser's menu would take that click.
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

// An iframe without allow="fullscreen" cannot go fullscreen, so the button only shows where it works.
$('fullscreen').hidden = !document.fullscreenEnabled;
$('fullscreen').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else stage.requestFullscreen?.().then(() => canvas.focus()).catch(() => {});
});
// The canvas takes the frame's height less the header's.
function measureChrome() {
  const top = $('top');
  document.documentElement.style.setProperty('--chrome', `${top.offsetHeight + 30}px`);
}
measureChrome();
window.addEventListener('resize', measureChrome);

// SDL reads the canvas's size when the window resizes; a layout change that is not a window
// resize (fullscreen, the iframe's own resizing) is passed on as one.
new ResizeObserver(() => window.dispatchEvent(new Event('resize'))).observe(canvas);

// ---------------------------------------------------------------- touch

// SDL turns one finger into the left button, which is a recolour. Two fingers become what the
// lab reads from a mouse: a right-button drag at their midpoint for panning, and wheel notches
// for the change in their spread. Each press is sent a little after the pointer has moved to
// where it lands, because the lab asks its overlay whether the pointer is over a panel from the
// last frame's answer, and a finger, unlike a mouse, arrives without passing anything on the way.
const touches = new Map();
let mode = null;  // null | 'pending' | 'single' | 'pair' | 'ended'
let pressed = 0;  // the synthetic buttons mask currently held
let timer = 0;
let lastMid = null;
let lastSpread = 0;
const SETTLE_MS = 60;  // a few frames at 60 Hz

function synth(type, x, y, button, buttons) {
  canvas.dispatchEvent(new PointerEvent(type, {
    pointerType: 'mouse', pointerId: 1, isPrimary: true, button, buttons,
    clientX: x, clientY: y, bubbles: true, cancelable: true,
  }));
}
function midpoint() {
  const [a, b] = [...touches.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, spread: Math.hypot(a.x - b.x, a.y - b.y) };
}
function release(x, y) {
  if (pressed === 1) synth('pointerup', x, y, 0, 0);
  if (pressed === 2) synth('pointerup', x, y, 2, 0);
  pressed = 0;
}
function onTouch(event) {
  // Only on the running lab's canvas: before Start the poster's own buttons take the tap.
  if (event.pointerType !== 'touch' || !running || event.target !== canvas) return;
  event.stopPropagation();
  event.preventDefault();
  const p = { x: event.clientX, y: event.clientY };
  if (event.type === 'pointerdown') {
    touches.set(event.pointerId, p);
    canvas.focus();
    clearTimeout(timer);
    if (touches.size === 1 && mode === null) {
      mode = 'pending';
      synth('pointermove', p.x, p.y, -1, 0);
      timer = setTimeout(() => {
        if (mode !== 'pending') return;
        mode = 'single';
        const t = [...touches.values()][0];
        synth('pointermove', t.x, t.y, -1, 0);
        synth('pointerdown', t.x, t.y, 0, 1);
        pressed = 1;
      }, 150);
    } else if (touches.size === 2 && (mode === 'pending' || mode === 'ended')) {
      mode = 'pair';
      const m = midpoint();
      lastMid = m;
      lastSpread = m.spread;
      synth('pointermove', m.x, m.y, -1, 0);
      timer = setTimeout(() => {
        if (mode !== 'pair' || pressed) return;
        synth('pointerdown', lastMid.x, lastMid.y, 2, 2);
        pressed = 2;
      }, SETTLE_MS);
    }
  } else if (event.type === 'pointermove') {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, p);
    if (mode === 'single') synth('pointermove', p.x, p.y, -1, pressed);
    else if (mode === 'pair' && touches.size === 2) {
      const m = midpoint();
      synth('pointermove', m.x, m.y, -1, pressed);
      if (lastSpread > 0 && m.spread > 0) {
        const notches = Math.log(m.spread / lastSpread) / Math.log(1.15);
        if (Math.abs(notches) > 0.05) {
          // SDL counts 100 pixels of deltaY as one notch, and up as zooming in.
          canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -notches * 100, deltaMode: 0, clientX: m.x, clientY: m.y, bubbles: true, cancelable: true }));
          lastSpread = m.spread;
        }
      }
      lastMid = m;
    }
  } else {  // up or cancel
    if (!touches.has(event.pointerId)) return;
    touches.delete(event.pointerId);
    if (mode === 'pending' && event.type === 'pointerup') {
      // A tap shorter than the hold-back: still a recolour, once the pointer has settled.
      clearTimeout(timer);
      mode = null;
      setTimeout(() => {
        synth('pointerdown', p.x, p.y, 0, 1);
        synth('pointerup', p.x, p.y, 0, 0);
      }, SETTLE_MS);
      return;
    }
    if (mode === 'pair') {
      clearTimeout(timer);
      const m = lastMid || p;
      release(m.x, m.y);
      mode = 'ended';  // until every finger is up, so the one left behind does not paint
    } else if (mode === 'single') {
      release(p.x, p.y);
    }
    if (touches.size === 0) { clearTimeout(timer); mode = null; }
  }
}
for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
  stage.addEventListener(type, onTouch, { capture: true, passive: false });
}

// ---------------------------------------------------------------- hashes against native

// Recorded on 2026-10-23 by running the native atlas_lab (Debug, AppleClang 21, macOS arm64,
// built from atlas-engine 0232309) with these arguments; the 1024 and 512 cases gave the same
// hashes with its default pool of 13 worker threads as with --workers 0.
const CHECKS = [
  { args: '--headless --unbounded --workers 0 --grid 256 --seed 1 --ticks 600', initial: '0x3ccd93216be5e73f', final: '0x790c3f6d07e1aa51' },
  { args: '--headless --unbounded --workers 0 --grid 1024 --seed 1 --ticks 120', initial: '0x5edf8c8eaf0d3e21', final: '0xc8b13347307e4610' },
  { args: '--headless --unbounded --workers 0 --grid 512 --seed 7 --ticks 300 --commands-per-tick 50', initial: '0x75cabf4ca183af27', final: '0xff02cf1bccee96a1' },
  { args: '--loopback-peers 2 --grid 256 --ticks 200 --commands-per-tick 20', peers: '0x095bc53ce4e86fc0' },
];

async function runHeadless(args) {
  const lines = [];
  const started = performance.now();
  let code = null;
  const lab = await createLab({
    print: (l) => lines.push(l.replace(ANSI, '')),
    printErr: (l) => lines.push(l.replace(ANSI, '')),
    onExit: (c) => { code = c; },
  });
  try { lab.callMain(args.split(' ')); } catch (e) { if (!(e && e.name === 'ExitStatus')) throw e; }
  return { lines, code, ms: performance.now() - started };
}

function cell(text, cls) {
  const td = document.createElement('td');
  td.textContent = text;
  if (cls) td.className = cls;
  return td;
}

$('check').addEventListener('click', async () => {
  const button = $('check');
  button.disabled = true;
  $('check-out').hidden = false;
  const rows = $('check-rows');
  rows.textContent = '';
  let matched = 0;
  let total = 0;
  $('check-note').textContent = 'Running; each case runs to completion on the page’s one thread.';
  for (const check of CHECKS) {
    await new Promise((r) => setTimeout(r, 30));  // let the row above paint
    let result;
    try { result = await runHeadless(check.args); } catch (e) { result = { lines: [String(e)], code: -1, ms: 0 }; }
    const text = result.lines.join('\n');
    const pairs = [];
    if (check.peers) {
      const got = [...text.matchAll(/peer (\d+): final tick=(\d+) state hash=(0x[0-9a-f]+)/g)];
      for (const g of got) pairs.push([`peer ${g[1]} at tick ${g[2]}`, check.peers, g[3]]);
      if (got.length === 0) pairs.push(['peers', check.peers, 'no result']);
    } else {
      const initial = text.match(/initial hash (0x[0-9a-f]+)/);
      const final = text.match(/final tick=(\d+) state hash=(0x[0-9a-f]+)/);
      pairs.push(['initial state', check.initial, initial ? initial[1] : 'no result']);
      pairs.push([final ? `state at tick ${final[1]}` : 'final state', check.final, final ? final[2] : 'no result']);
    }
    const tickTime = text.match(/ticks=(\d+) dropped=\d+ tick time total us=(\d+)/);
    pairs.forEach(([what, want, got], i) => {
      total += 1;
      const ok = want === got;
      if (ok) matched += 1;
      const tr = document.createElement('tr');
      tr.append(cell(i === 0 ? `atlas_lab ${check.args}` : '', 'args'), cell(`${what}: ${want}`), cell(got), cell(ok ? 'match' : 'MISMATCH', ok ? 'ok' : 'bad'));
      rows.append(tr);
    });
    if (tickTime) {
      const tr = document.createElement('tr');
      const per = Number(tickTime[2]) / Number(tickTime[1]);
      tr.append(cell(''), cell(''), cell(`browser timing: ${tickTime[1]} ticks, ${(per / 1000).toFixed(2)} ms a tick on average (the lab's own tick-time counter)`, 'args'), cell(''));
      rows.append(tr);
    }
  }
  $('check-note').innerHTML = `${matched} of ${total} hashes match the native build. These are the lab's own headless and loopback modes (<code>--headless</code>, <code>--loopback-peers</code>), run in fresh instances of the same WebAssembly module; nothing is computed by this page. Native values: atlas_lab built from 0232309 on macOS arm64.`;
  button.disabled = false;
});
