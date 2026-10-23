// Page side of the Snakes and Ladders demo. Python (the repo's model.py and simulation.py)
// runs in worker.js; this file only asks it for numbers and draws them. Nothing here computes
// a probability or an expectation: the quantiles are read off the curve Python returns, and the
// token's path is the list of squares model.simulate_game returned.

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const fmt = (x, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (p) => {
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  if (p > 0.999) return '>99.9%';
  if (p > 0.99) return `${fmt(p * 100, 1)}%`;
  return `${fmt(p * 100, p >= 0.1 ? 0 : p >= 0.01 ? 1 : 2)}%`;
};

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

// ---------- Worker RPC ----------
let worker = null;
let nextId = 1;
const pending = new Map();
let testsRunning = false;

function call(fn, ...args) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, fn });
    worker.postMessage({ id, fn, args });
  });
}

function onMessage({ data }) {
  if (data.type === 'status') {
    $('bar').style.width = `${Math.round((data.frac || 0) * 100)}%`;
    $('load-status').textContent = data.text;
    if (testsRunning) $('tests-status').textContent = data.text;
  } else if (data.type === 'out') {
    if (testsRunning) appendTestText(data.text);
  } else if (data.type === 'ready') {
    ready(data);
  } else if (data.type === 'fatal') {
    fatal(data.error);
  } else if (data.type === 'result') {
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    if (data.error) p.reject(new Error(data.error));
    else {
      if (data.result && typeof data.result.ms === 'number' && !testsRunning) {
        $('busy').textContent = `Python: ${p.fn}() took ${fmt(data.result.ms, data.result.ms < 10 ? 1 : 0)} ms`;
      }
      p.resolve(data.result);
    }
  }
}

function fatal(message) {
  const poster = $('poster');
  poster.hidden = false;
  $('app').hidden = true;
  poster.dataset.state = 'error';
  $('load-status').textContent = `Could not start Python: ${message}`;
  $('load-status').classList.add('error');
  const btn = $('start');
  btn.removeAttribute('aria-disabled');
  btn.textContent = 'Reload and try again';
  btn.onclick = () => location.reload();
}

// ---------- Start ----------
$('start').addEventListener('click', () => {
  const btn = $('start');
  if (btn.getAttribute('aria-disabled') === 'true' || worker) return;
  btn.setAttribute('aria-disabled', 'true');
  btn.textContent = 'Starting…';
  $('poster').dataset.state = 'loading';
  $('load-status').textContent = 'Starting the worker';
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  } catch (err) {
    fatal(err.message);
    return;
  }
  worker.onmessage = onMessage;
  worker.onerror = (e) => fatal(e.message || 'the worker failed to load');
  worker.postMessage({ type: 'boot' });
});

// ---------- Layout ----------
// Two columns from 760 px. Under 1200 px the right column is narrow, so the readout and the
// simulation panel move under the board and the tests stay on the right. Under 760 px it is
// one column, with the sliders first so they sit next to the board they drive.
const wide = window.matchMedia('(min-width: 1200px)');
const twoCol = window.matchMedia('(min-width: 760px)');
function layout() {
  const a = $('col-a');
  const b = $('col-b');
  const p = (id) => $(id);
  let order;
  if (wide.matches) order = [[a, ['p-board']], [b, ['p-controls', 'p-tiles', 'note', 'p-charts', 'readout', 'p-sim', 'p-tests']]];
  else if (twoCol.matches) order = [[a, ['p-board', 'readout', 'p-sim']], [b, ['p-controls', 'p-tiles', 'note', 'p-charts', 'p-tests']]];
  else order = [[a, ['p-controls', 'p-board', 'readout']], [b, ['p-tiles', 'note', 'p-charts', 'p-sim', 'p-tests']]];
  for (const [col, ids] of order) {
    ids.forEach((id, i) => { if (col.children[i] !== p(id)) col.insertBefore(p(id), col.children[i] || null); });
  }
}
layout();
wide.addEventListener('change', layout);
twoCol.addEventListener('change', layout);

// ---------- State ----------
const S = {
  info: null,
  heads: new Map(), // head square -> where it moves the player
  roll: 6,
  n: 10,
  view: 'dist',
  selected: 0,
  analysis: new Map(),
  dist: new Map(),
  settles: new Map(),
  rows: new Map(),
  walks: new Map(),
  sweep: null,
  sim: null,
  game: null,
};

function ready(msg) {
  S.info = msg.info;
  for (const [h, t] of S.info.board) S.heads.set(h, t);
  S.roll = S.info.default_roll;
  $('die').value = S.roll;
  $('sim-seed').textContent = S.info.seed;
  const firstGames = document.querySelector('[data-games="1000"]');
  firstGames.dataset.games = S.info.num_games;
  firstGames.textContent = `${S.info.num_games.toLocaleString('en-US')} games`;
  $('turn').max = S.info.steps - 1;

  buildBoard();
  $('poster').hidden = true;
  $('app').hidden = false;
  $('die').focus({ preventScroll: true });

  const loaded = $('loaded');
  loaded.hidden = false;
  loaded.innerHTML = `<b>Loaded:</b> Python ${S.info.python}, NumPy ${S.info.numpy}, Pyodide ${msg.pyodide}, in ${fmt(msg.loadMs / 1000, 1)} s on this device.`;

  updateDie();
  call('sweep', Array.from({ length: 24 }, (_, i) => i + 1)).then((r) => { S.sweep = r; drawSweep(); });
}

// ---------- Board geometry ----------
const CELL = 100;
function centre(sq) {
  if (sq === 0) return [95, 1045];
  const r = Math.floor((sq - 1) / 10);
  let c = (sq - 1) % 10;
  if (r % 2 === 1) c = 9 - c;
  return [c * CELL + 50, (9 - r) * CELL + 50];
}
function cellBox(sq) {
  if (sq === 0) return [0, 1005, 190, 80];
  const [cx, cy] = centre(sq);
  return [cx - 50, cy - 50, 100, 100];
}

const cells = [];
const vals = [];
const unreachMarks = [];
let selRect = null;
let token = null;
let footprints = null;
const linkPaths = new Map(); // head -> path element from head to destination

function buildBoard() {
  const svg = $('board');
  const defs = el('defs', {}, svg);
  const pat = el('pattern', { id: 'hatch', width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  el('rect', { width: 10, height: 10, fill: '#14121c' }, pat);
  el('rect', { width: 4, height: 10, fill: '#2a2538' }, pat);

  const gCells = el('g', {}, svg);
  for (let sq = 0; sq <= S.info.win; sq++) {
    const [x, y, w, h] = cellBox(sq);
    const r = el('rect', { x, y, width: w, height: h, rx: 8, class: 'cell', fill: '#1b1826', 'data-sq': sq }, gCells);
    cells[sq] = r;
  }

  // Ladders under snakes, both under the numbers.
  const gLinks = el('g', { class: 'links' }, svg);
  const ladders = S.info.board.filter(([h, t]) => t > h);
  const snakes = S.info.board.filter(([h, t]) => t < h);
  for (const [h, t] of ladders) drawLadder(gLinks, h, t);
  for (const [h, t] of snakes) drawSnake(gLinks, h, t);

  const gText = el('g', {}, svg);
  for (let sq = 0; sq <= S.info.win; sq++) {
    const [x, y] = cellBox(sq);
    const num = el('text', { x: x + 9, y: y + 26, class: 'num' }, gText);
    num.textContent = sq === 0 ? '0 · start' : String(sq);
    const [cx, cy] = centre(sq);
    vals[sq] = el('text', { x: cx, y: sq === 0 ? cy + 22 : cy + 24, class: 'val' }, gText);
    const [bx, by, bw, bh] = cellBox(sq);
    unreachMarks[sq] = el('rect', { x: bx + 6, y: by + 6, width: bw - 12, height: bh - 12, rx: 6, class: 'unreach', visibility: 'hidden' }, gText);
  }

  footprints = el('g', { 'pointer-events': 'none' }, svg);
  selRect = el('rect', { rx: 9, class: 'sel' }, svg);
  token = el('g', { visibility: 'hidden', 'pointer-events': 'none' }, svg);
  el('circle', { r: 34, fill: 'rgba(196, 181, 253, 0.22)' }, token);
  el('circle', { r: 19, fill: '#c4b5fd', stroke: '#0b0a10', 'stroke-width': 4 }, token);

  svg.addEventListener('click', (e) => {
    const sq = e.target.getAttribute && e.target.getAttribute('data-sq');
    if (sq !== null && sq !== undefined) select(Number(sq));
  });
  $('board-wrap').addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: 10, ArrowDown: -10 }[e.key];
    let next = null;
    if (step !== undefined) next = Math.min(S.info.win, Math.max(0, S.selected + step));
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = S.info.win;
    if (next === null) return;
    e.preventDefault();
    select(next);
  });
  placeSel();
}

function perp(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len, len];
}

function drawLadder(g, foot, top) {
  const [x1, y1] = centre(foot);
  const [x2, y2] = centre(top);
  const [nx, ny, len] = perp(x1, y1, x2, y2);
  const inset = 20 / len;
  const ax = x1 + (x2 - x1) * inset; const ay = y1 + (y2 - y1) * inset;
  const bx = x2 - (x2 - x1) * inset; const by = y2 - (y2 - y1) * inset;
  const w = 13;
  const lg = el('g', { opacity: 0.88 }, g);
  for (const s of [-1, 1]) {
    el('line', { x1: ax + nx * w * s, y1: ay + ny * w * s, x2: bx + nx * w * s, y2: by + ny * w * s, stroke: '#60a5fa', 'stroke-width': 5, 'stroke-linecap': 'round' }, lg);
  }
  const rungs = Math.max(2, Math.floor((len - 40) / 36));
  for (let i = 1; i <= rungs; i++) {
    const t = i / (rungs + 1);
    const px = ax + (bx - ax) * t; const py = ay + (by - ay) * t;
    el('line', { x1: px - nx * w, y1: py - ny * w, x2: px + nx * w, y2: py + ny * w, stroke: '#60a5fa', 'stroke-width': 4, 'stroke-linecap': 'round' }, lg);
  }
  linkPaths.set(foot, el('path', { d: `M${x1} ${y1} L${x2} ${y2}`, fill: 'none', stroke: 'none' }, g));
}

function drawSnake(g, head, tail) {
  const [x1, y1] = centre(head);
  const [x2, y2] = centre(tail);
  const [nx, ny, len] = perp(x1, y1, x2, y2);
  const a = Math.min(70, len * 0.22);
  const c1x = x1 + (x2 - x1) / 3 + nx * a; const c1y = y1 + (y2 - y1) / 3 + ny * a;
  const c2x = x1 + (2 * (x2 - x1)) / 3 - nx * a; const c2y = y1 + (2 * (y2 - y1)) / 3 - ny * a;
  const d = `M${x1} ${y1} C${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`;
  const sg = el('g', { opacity: 0.9 }, g);
  el('path', { d, fill: 'none', stroke: '#f0abfc', 'stroke-width': 15, 'stroke-linecap': 'round' }, sg);
  el('path', { d, fill: 'none', stroke: '#0b0a10', 'stroke-opacity': 0.35, 'stroke-width': 3, 'stroke-dasharray': '3 13', 'stroke-linecap': 'round' }, sg);
  el('circle', { cx: x1, cy: y1, r: 16, fill: '#f0abfc' }, sg);
  el('circle', { cx: x1 - 5, cy: y1 - 3, r: 3, fill: '#0b0a10' }, sg);
  el('circle', { cx: x1 + 5, cy: y1 - 3, r: 3, fill: '#0b0a10' }, sg);
  linkPaths.set(head, el('path', { d, fill: 'none', stroke: 'none' }, g));
}

function placeSel() {
  const [x, y, w, h] = cellBox(S.selected);
  selRect.setAttribute('x', x + 2);
  selRect.setAttribute('y', y + 2);
  selRect.setAttribute('width', w - 4);
  selRect.setAttribute('height', h - 4);
}

// Colour ramp from the surface colour to the accent, for shading squares.
const LO = [27, 24, 38];
const HI = [167, 139, 250];
const TOP = [221, 214, 254];
function ramp(t) {
  t = Math.max(0, Math.min(1, t));
  const [a, b, u] = t < 0.75 ? [LO, HI, t / 0.75] : [HI, TOP, (t - 0.75) / 0.25];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(',')})`;
}

function paintBoard() {
  if (!cells.length) return;
  const a = S.analysis.get(S.roll);
  const dist = S.dist.get(`${S.roll}:${S.n}`);
  const reach = a ? new Set(a.reachable) : null;
  let pmax = 0;
  if (dist) for (let sq = 0; sq < S.info.win; sq++) pmax = Math.max(pmax, dist[sq]);
  let lmax = 0;
  if (a) for (const v of a.per_square) if (v != null) lmax = Math.max(lmax, v);

  for (let sq = 0; sq <= S.info.win; sq++) {
    const cell = cells[sq];
    const val = vals[sq];
    let fill = '#1b1826';
    let text = '';
    let dark = false;
    if (S.heads.has(sq)) {
      fill = 'url(#hatch)';
    } else if (S.view === 'dist' && dist) {
      const p = dist[sq];
      const t = sq === S.info.win ? p : pmax > 0 ? p / pmax : 0;
      if (p > 0) fill = ramp(0.1 + 0.9 * t);
      // Label the likeliest squares and the win square; the readout has every square.
      if ((p >= 0.0095 && p >= 0.35 * pmax) || (sq === S.info.win && p > 0)) text = pct(p);
      dark = p > 0 && t > 0.55;
    } else if (S.view === 'left' && a) {
      const v = a.per_square[sq];
      if (v != null) {
        const t = lmax > 0 ? 1 - v / lmax : 0;
        fill = ramp(0.08 + 0.92 * t);
        text = v === 0 ? '0' : v < 9.95 ? fmt(v, 1) : fmt(v, 0);
        dark = t > 0.55;
      } else if (a.per_square_error[sq]) {
        text = a.per_square_error[sq].startsWith('ValueError') ? '∞' : a.per_square_error[sq].startsWith('returned') ? 'nan' : 'err';
      }
    }
    cell.setAttribute('fill', fill);
    val.textContent = text;
    val.setAttribute('fill', dark ? '#140f24' : '#e7e5ee');
    val.style.stroke = dark ? 'none' : '';
    unreachMarks[sq].setAttribute('visibility', reach && !reach.has(sq) && !S.heads.has(sq) ? 'visible' : 'hidden');
  }
}

// ---------- Fetching, latest request wins ----------
function latest(run) {
  let running = false;
  let wanted = null;
  return async (key) => {
    wanted = key;
    if (running) return;
    running = true;
    while (wanted !== null) {
      const k = wanted;
      wanted = null;
      try { await run(k); } catch (err) { $('busy').textContent = `Python raised: ${err.message}`; }
    }
    running = false;
  };
}

const fetchAnalysis = latest(async (roll) => {
  if (!S.analysis.has(roll)) S.analysis.set(roll, await call('analyse', roll));
  if (roll === S.roll) { paintBoard(); drawTiles(); drawCurve(); drawNote(); drawReadout(); }
});
const fetchDist = latest(async (key) => {
  const [roll, n] = key.split(':').map(Number);
  if (!S.dist.has(key)) S.dist.set(key, (await call('distribution', roll, n)).p);
  if (roll === S.roll && n === S.n) { paintBoard(); drawReadout(); drawCurve(); }
});
const fetchSettles = latest(async (roll) => {
  if (!S.settles.has(roll)) S.settles.set(roll, await call('settles', roll, 1e-4));
  if (roll === S.roll) drawTiles();
});
const fetchRow = latest(async (key) => {
  const [roll] = key.split(':').map(Number);
  if (!S.rows.has(key)) S.rows.set(key, await call('row', ...key.split(':').map(Number)));
  if (roll === S.roll) drawReadout();
});
const fetchWalk = latest(async (roll) => {
  if (!S.walks.has(roll)) S.walks.set(roll, await call('pointWalk', roll, 40));
  if (roll === S.roll) drawNote();
});

function updateDie() {
  $('die-out').textContent = `d${S.roll}`;
  $('die').setAttribute('aria-valuetext', `${S.roll}-sided die`);
  $('curve-die').textContent = `d${S.roll}`;
  resetGame();
  paintBoard(); drawTiles(); drawCurve(); drawSweep(); drawNote(); drawReadout();
  fetchAnalysis(S.roll);
  fetchDist(`${S.roll}:${S.n}`);
  fetchRow(`${S.roll}:${S.selected}`);
  fetchSettles(S.roll);
  if (S.roll === 1) fetchWalk(1);
}

$('die').addEventListener('input', () => {
  const v = Number($('die').value);
  if (v === S.roll || !S.info) return;
  S.roll = v;
  updateDie();
});
$('turn').addEventListener('input', () => {
  S.n = Number($('turn').value);
  $('turn-out').textContent = S.n;
  drawCurve();
  fetchDist(`${S.roll}:${S.n}`);
});
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
  S.view = b.dataset.view;
  document.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  paintBoard();
  drawNote();
}));

function select(sq) {
  S.selected = sq;
  placeSel();
  drawReadout();
  drawRowCompare();
  if (!S.heads.has(sq)) fetchRow(`${S.roll}:${sq}`);
}

// ---------- Tiles, note, readout ----------
function quantiles(curve) {
  const first = (p) => { const i = curve.findIndex((v) => v >= p); return i < 0 ? null : i; };
  return [first(1e-12), first(50), first(90), first(99)];
}

function drawTiles() {
  const a = S.analysis.get(S.roll);
  const lim = S.settles.get(S.roll);
  $('t-exp').textContent = a ? (a.expected == null ? '∞' : fmt(a.expected, 4)) : '…';
  $('t-exp-sub').textContent = a && a.error ? 'expected_turns(T) raised ValueError' : 'expected_turns(T), from square 0';
  $('t-reach').textContent = a ? `${a.reachable.length} of ${S.info.n_squares}` : '…';
  if (a) {
    const q = quantiles(a.curve);
    $('t-q').textContent = q[0] == null ? 'never' : q.map((v) => (v == null ? `>${a.curve.length - 1}` : v)).join(' / ');
  } else $('t-q').textContent = '…';
  $('t-lim').textContent = lim ? (lim.n == null ? 'not by 600' : `n = ${lim.n}`) : '…';
}

function arrow(a, b) {
  // With a one-sided die every move is a + 1, so any other step went through a head at a + 1.
  if (b === a + 1) return `${b}`;
  const h = a + 1;
  return `${b} (${S.heads.get(h) > h ? 'ladder' : 'snake'} at ${h})`;
}

function drawNote() {
  const note = $('note');
  const a = S.analysis.get(S.roll);
  if (!a || a.expected != null) { note.hidden = true; return; }
  const parts = [`<code>${escapeHtml(a.error)}</code><br>`];
  const walk = S.walks.get(S.roll);
  if (walk) {
    const seen = new Map();
    let start = -1; let end = -1;
    for (let i = 0; i < walk.length; i++) {
      if (seen.has(walk[i])) { start = seen.get(walk[i]); end = i; break; }
      seen.set(walk[i], i);
    }
    if (start >= 0) {
      const lead = walk.slice(0, start + 1);
      const loop = walk.slice(start, end + 1);
      const leadText = lead.map((s, i) => (i === 0 ? `${s}` : arrow(lead[i - 1], s))).join(' → ');
      const loopText = loop.map((s, i) => (i === 0 ? `${s}` : arrow(loop[i - 1], s))).join(' → ');
      parts.push(`Every turn is forced. From the start the player goes ${leadText}, then repeats ${loopText} every ${loop.length - 1} turns and never reaches ${S.info.win}. Drag <em>After turn</em> to watch it (each step is <code>sharing_distribution_plot(T, n)</code>).`);
    }
  }
  // Squares from which 100 is reachable (so no ValueError) but the inversion failed.
  const bad = a.per_square_error.filter((e) => e && !e.startsWith('ValueError'));
  if (bad.length) {
    const kinds = [...new Set(bad.map((e) => (e.startsWith('returned') ? `returns <code>${escapeHtml(e.slice(9))}</code>` : `raises <code>${escapeHtml(e)}</code>`)))].join(' or ');
    parts.push(`<br>In <em>Turns left</em>, ${bad.length} squares can still reach ${S.info.win} because they lie past the loop, yet <code>expected_turns(T, s)</code> ${kinds} for them: the loop has no way out, so I&nbsp;&minus;&nbsp;Q is singular and has no inverse. (Desktop NumPy raises <code>LinAlgError: Singular matrix</code> for the same call.)`);
  }
  note.innerHTML = parts.join(' ');
  note.hidden = false;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fraction(p, d) {
  const k = Math.round(p * d);
  return Math.abs(k / d - p) < 1e-9 ? `${k}/${d}` : fmt(p, 4);
}

function drawReadout() {
  const box = $('readout');
  if (!S.info) return;
  const sq = S.selected;
  const a = S.analysis.get(S.roll);
  const dist = S.dist.get(`${S.roll}:${S.n}`);
  const bits = [`<b>Square ${sq}</b>${sq === 0 ? ' (start, off the board)' : sq === S.info.win ? ' (win)' : ''}`];
  if (S.heads.has(sq)) {
    const t = S.heads.get(sq);
    bits.push(`is a ${t > sq ? 'ladder' : 'snake'} head (${sq} → ${t}). Landing here moves the player straight on, so no turn ends here and it never holds probability.`);
    box.innerHTML = bits.join(' ');
    return;
  }
  if (dist) bits.push(`· after ${S.n} turns: <b>${pct(dist[sq])}</b> of games are here${sq === S.info.win ? ' (finished)' : ''}`);
  if (a) {
    const v = a.per_square[sq];
    if (v != null) bits.push(`· expected turns left from here: <b>${fmt(v, 2)}</b>`);
    else if (a.per_square_error[sq]) {
      const e = a.per_square_error[sq];
      bits.push(`· <span class="err">expected_turns(T, ${sq}) ${e.startsWith('returned') ? escapeHtml(e) : `raised ${escapeHtml(e)}`}</span>`);
    }
    if (!a.reachable.includes(sq)) bits.push(`· never reached from square 0 with a d${S.roll}`);
  }
  const row = S.rows.get(`${S.roll}:${sq}`);
  if (row) {
    const groups = new Map();
    for (const [j, p] of row) {
      const key = fraction(p, S.roll);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(j);
    }
    const desc = [...groups].map(([f, js]) => `${js.join(', ')} (${f}${js.length > 1 ? ' each' : ''})`).join('; ');
    bits.push(`<br>Row ${sq} of T, the next turn: ${desc}`);
  }
  box.innerHTML = bits.join(' ');
}

// ---------- Charts ----------
function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }

function drawSweep() {
  const svg = $('sweep');
  clear(svg);
  if (!S.sweep) {
    el('text', { x: 240, y: 94, class: 'ax', 'text-anchor': 'middle' }, svg).textContent = 'computing 24 die sizes…';
    return;
  }
  const W = 480; const H = 180; const L = 34; const R = 8; const T = 26; const B = 26;
  const vals = S.sweep.expected;
  const finite = vals.filter((v) => v != null);
  const ymax = Math.ceil(Math.max(...finite) / 20) * 20;
  const y = (v) => T + (H - T - B) * (1 - v / ymax);
  const band = (W - L - R) / vals.length;
  for (let t = 0; t <= ymax; t += 20) {
    el('line', { x1: L, x2: W - R, y1: y(t), y2: y(t), class: 'grid-line' }, svg);
    el('text', { x: L - 6, y: y(t) + 4, class: 'ax', 'text-anchor': 'end' }, svg).textContent = t;
  }
  let minI = 0;
  vals.forEach((v, i) => { if (v != null && (vals[minI] == null || v < vals[minI])) minI = i; });
  vals.forEach((v, i) => {
    const roll = S.sweep.rolls[i];
    const x = L + i * band + band * 0.14;
    const w = band * 0.72;
    const current = roll === S.roll;
    const top = v == null ? T : y(v);
    const bar = el('rect', {
      x, y: top, width: w, height: H - B - top, rx: 2, class: 'bar',
      fill: v == null ? 'url(#sweep-hatch)' : current ? '#c4b5fd' : i === minI ? 'rgba(167,139,250,0.75)' : 'rgba(167,139,250,0.38)',
      stroke: current ? '#c4b5fd' : 'none',
    }, svg);
    bar.addEventListener('click', () => { $('die').value = roll; $('die').dispatchEvent(new Event('input')); });
    const tip = el('title', {}, bar);
    tip.textContent = v == null ? `d${roll}: cannot be won` : `d${roll}: ${fmt(v, 4)} turns`;
    if (current || roll === 1 || [6, 12, 15, 20, 24].includes(roll)) {
      el('text', { x: x + w / 2, y: H - 8, class: current ? 'ax-hi' : 'ax', 'text-anchor': 'middle' }, svg).textContent = roll;
    }
    if (v == null) el('text', { x: x + w / 2, y: T - 8, class: current ? 'ax-hi' : 'ax', 'text-anchor': 'middle' }, svg).textContent = '∞';
  });
  // The fastest die, top right; the current die's value above its bar, kept inside the plot.
  el('text', { x: W - R, y: 12, class: 'ax', 'text-anchor': 'end' }, svg).textContent = `fastest: d${S.sweep.rolls[minI]}, ${fmt(vals[minI], 2)} turns`;
  const cur = S.sweep.rolls.indexOf(S.roll);
  if (vals[cur] != null) {
    const cx = L + cur * band + band / 2;
    const anchor = cx > W - 60 ? 'end' : cx < L + 30 ? 'start' : 'middle';
    el('text', { x: cx, y: y(vals[cur]) - 7, class: 'ax-hi', 'text-anchor': anchor }, svg).textContent = fmt(vals[cur], 2);
  }
  const defs = el('defs', {}, svg);
  const pat = el('pattern', { id: 'sweep-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  el('rect', { width: 6, height: 6, fill: '#1b1826' }, pat);
  el('rect', { width: 2, height: 6, fill: S.roll === 1 ? '#c4b5fd' : '#4b4560' }, pat);
}

function drawCurve() {
  const svg = $('curve');
  clear(svg);
  const a = S.analysis.get(S.roll);
  if (!a) {
    el('text', { x: 240, y: 94, class: 'ax', 'text-anchor': 'middle' }, svg).textContent = 'computing…';
    return;
  }
  const W = 480; const H = 180; const L = 40; const R = 10; const T = 14; const B = 26;
  const c = a.curve;
  const x = (n) => L + (W - L - R) * (n / (c.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / 100);
  for (const t of [0, 50, 100]) {
    el('line', { x1: L, x2: W - R, y1: y(t), y2: y(t), class: 'grid-line' }, svg);
    el('text', { x: L - 6, y: y(t) + 4, class: 'ax', 'text-anchor': 'end' }, svg).textContent = `${t}%`;
  }
  for (const n of [0, 100, 200, c.length - 1]) {
    el('text', { x: x(n), y: H - 8, class: 'ax', 'text-anchor': n === 0 ? 'start' : n === c.length - 1 ? 'end' : 'middle' }, svg).textContent = n;
  }
  const d = c.map((v, n) => `${n ? 'L' : 'M'}${x(n).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  el('path', { d: `${d}L${x(c.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z`, fill: 'rgba(167,139,250,0.12)' }, svg);
  el('path', { d, fill: 'none', stroke: '#a78bfa', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, svg);
  const q = quantiles(c);
  [[q[1], '50%'], [q[2], '90%'], [q[3], '99%']].forEach(([n, lab]) => {
    if (n == null) return;
    el('circle', { cx: x(n), cy: y(c[n]), r: 3.5, fill: '#e7e5ee' }, svg);
  });
  // Marker for the turn slider.
  const n = Math.min(S.n, c.length - 1);
  el('line', { x1: x(n), x2: x(n), y1: T, y2: H - B, stroke: '#c4b5fd', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, svg);
  el('circle', { cx: x(n), cy: y(c[n]), r: 5, fill: '#c4b5fd', stroke: '#0b0a10', 'stroke-width': 2 }, svg);
  const right = x(n) > W - 170;
  el('text', { x: x(n) + (right ? -8 : 8), y: Math.max(T + 26, y(c[n]) + (c[n] > 60 ? 28 : -10)), class: 'ax-hi', 'text-anchor': right ? 'end' : 'start' }, svg).textContent = `turn ${n}: ${fmt(c[n], c[n] < 10 ? 2 : 1)}% done`;
}

// ---------- Playing one game ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let animGen = 0;

function resetGame() {
  animGen++;
  S.game = null;
  if (token) token.setAttribute('visibility', 'hidden');
  if (footprints) clear(footprints);
  $('play').textContent = 'Play a game';
  $('game-status').classList.remove('err');
  $('game-status').innerHTML = 'One game is <code>model.simulate_game(T)</code> after <code>np.random.seed(seed)</code>.';
}

function moveToken(x, y) { token.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); }

function tween(from, to, ms, gen) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const frame = (now) => {
      if (gen !== animGen) return resolve(false);
      const u = Math.min(1, (now - t0) / ms);
      const e = u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2;
      moveToken(from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e);
      if (u < 1) requestAnimationFrame(frame); else resolve(true);
    };
    requestAnimationFrame(frame);
  });
}

function slide(path, ms, gen) {
  const len = path.getTotalLength();
  return new Promise((resolve) => {
    const t0 = performance.now();
    const frame = (now) => {
      if (gen !== animGen) return resolve(false);
      const u = Math.min(1, (now - t0) / ms);
      const p = path.getPointAtLength(len * u);
      moveToken(p.x, p.y);
      if (u < 1) requestAnimationFrame(frame); else resolve(true);
    };
    requestAnimationFrame(frame);
  });
}

// How a turn from a to b can be drawn. simulate_game returns only the square each turn ended
// on, not the roll, so this picks a roll that explains the move: a plain move if one exists,
// else a move through a snake or ladder head, else an overshoot (a roll past 100 is not played).
function explain(a, b) {
  const d = S.game.roll;
  const win = S.info.win;
  if (b === a && a + d > win) return { kind: 'stay' };
  if (b > a && b - a <= d && !S.heads.has(b)) return { kind: 'walk', to: b };
  for (let j = 1; j <= d; j++) {
    const h = a + j;
    if (h <= win && S.heads.get(h) === b) return { kind: 'via', head: h };
  }
  return { kind: 'jump' };
}

function footprint(sq) {
  const [cx, cy] = centre(sq);
  el('circle', { cx, cy: cy + 36, r: 5, fill: '#c4b5fd', opacity: 0.55 }, footprints);
}

function describeTurn(i) {
  const g = S.game;
  const a = i === 0 ? 0 : g.path[i - 1];
  const b = g.path[i];
  const how = explain(a, b);
  let extra = '';
  if (how.kind === 'via') extra = ` via the ${S.heads.get(how.head) > how.head ? 'ladder' : 'snake'} at ${how.head}`;
  if (how.kind === 'stay') extra = ' (roll past 100: stays)';
  return `Seed ${g.seed}, d${g.roll} · turn ${i + 1} of ${g.path.length}: ${a} → ${b}${extra}`;
}

async function animateTurn(i, gen) {
  const g = S.game;
  const a = i === 0 ? 0 : g.path[i - 1];
  const b = g.path[i];
  const how = explain(a, b);
  const instant = reduceMotion.matches;
  if (instant) {
    moveToken(...centre(b));
  } else if (how.kind === 'walk' || how.kind === 'via') {
    const last = how.kind === 'walk' ? b : how.head;
    let prev = centre(a);
    const hop = Math.max(14, Math.min(48, 220 / Math.max(1, last - a)));
    for (let s = a + 1; s <= last; s++) {
      const next = centre(s);
      if (!(await tween(prev, next, hop, gen))) return false;
      prev = next;
    }
    if (how.kind === 'via' && !(await slide(linkPaths.get(how.head), 320, gen))) return false;
  } else if (how.kind === 'stay') {
    const [cx, cy] = centre(a);
    if (!(await tween([cx, cy], [cx, cy - 22], 110, gen))) return false;
    if (!(await tween([cx, cy - 22], [cx, cy], 110, gen))) return false;
  } else if (!(await tween(centre(a), centre(b), 300, gen))) return false;
  footprint(b);
  g.shown = i + 1;
  $('game-status').textContent = describeTurn(i);
  return true;
}

function finishText() {
  const g = S.game;
  const a = S.analysis.get(g.roll);
  const exp = a && a.expected != null ? ` The chain&rsquo;s expectation for a d${g.roll} is ${fmt(a.expected, 2)}.` : '';
  return `Seed ${g.seed}, d${g.roll}: won in <b>${g.path.length}</b> turns.${exp}`;
}

async function runGame() {
  const g = S.game;
  const gen = ++animGen;
  g.playing = true;
  $('play').textContent = 'Pause';
  token.setAttribute('visibility', 'visible');
  if (g.shown === 0) moveToken(...centre(0));
  if (reduceMotion.matches) {
    // No motion: draw the whole game at once; Step still walks through it turn by turn.
    for (let i = g.shown; i < g.path.length; i++) footprint(g.path[i]);
    g.shown = g.path.length;
    moveToken(...centre(g.path[g.path.length - 1]));
  } else {
    while (g.shown < g.path.length) {
      if (!(await animateTurn(g.shown, gen))) return;
      await sleep(40);
      if (gen !== animGen) return;
    }
  }
  g.playing = false;
  $('play').textContent = 'Play again';
  $('game-status').innerHTML = finishText();
}

async function fetchGame() {
  const seed = Math.max(0, Math.min(4294967295, Math.floor(Number($('seed').value) || 0)));
  $('seed').value = seed;
  resetGame();
  const roll = S.roll;
  const gen = animGen;
  for (const id of ['play', 'step', 'end']) $(id).setAttribute('aria-disabled', 'true');
  $('game-status').textContent = roll === 1
    ? `Playing seed ${seed} with a d1… simulate_game gives up after ${S.info.max_turns.toLocaleString('en-US')} turns.`
    : `Sampling a game with seed ${seed}…`;
  let r;
  try {
    r = await call('play', roll, seed);
  } finally {
    for (const id of ['play', 'step', 'end']) $(id).removeAttribute('aria-disabled');
  }
  if (gen !== animGen || roll !== S.roll) return null;
  if (r.error) {
    $('game-status').classList.add('err');
    $('game-status').innerHTML = `model.simulate_game(T) raised after ${fmt(r.ms / 1000, 1)} s: <code>${escapeHtml(r.error)}</code>`;
    return null;
  }
  S.game = { roll, seed, path: r.path, shown: 0, playing: false };
  return S.game;
}

$('play').addEventListener('click', async () => {
  if ($('play').getAttribute('aria-disabled') === 'true') return;
  const g = S.game;
  if (g && g.playing) { // pause
    animGen++;
    g.playing = false;
    $('play').textContent = 'Resume';
    if (g.shown > 0) moveToken(...centre(g.path[g.shown - 1]));
    return;
  }
  if (g && g.shown > 0 && g.shown < g.path.length) { runGame(); return; } // resume
  if (await fetchGame()) runGame();
});

$('step').addEventListener('click', async () => {
  if ($('step').getAttribute('aria-disabled') === 'true') return;
  let g = S.game;
  if (g && g.playing) { animGen++; g.playing = false; if (g.shown > 0) moveToken(...centre(g.path[g.shown - 1])); }
  if (!g || g.shown >= g.path.length) {
    g = await fetchGame();
    if (!g) return;
    token.setAttribute('visibility', 'visible');
    moveToken(...centre(0));
  }
  const gen = ++animGen;
  const ok = await animateTurn(g.shown, gen);
  if (ok && g.shown >= g.path.length) { $('play').textContent = 'Play again'; $('game-status').innerHTML = finishText(); }
  else if (ok) $('play').textContent = 'Resume';
});

$('end').addEventListener('click', async () => {
  if ($('end').getAttribute('aria-disabled') === 'true') return;
  let g = S.game;
  if (!g || g.shown >= g.path.length) {
    g = await fetchGame();
    if (!g) return;
  }
  animGen++;
  token.setAttribute('visibility', 'visible');
  for (let i = g.shown; i < g.path.length; i++) footprint(g.path[i]);
  g.shown = g.path.length;
  g.playing = false;
  moveToken(...centre(g.path[g.path.length - 1]));
  $('play').textContent = 'Play again';
  $('game-status').innerHTML = finishText();
});

$('next-seed').addEventListener('click', () => {
  $('seed').value = Math.min(4294967295, (Math.floor(Number($('seed').value)) || 0) + 1);
  resetGame();
});
$('seed').addEventListener('change', resetGame);

// ---------- simulation.py ----------
let simGames = 1000;
document.querySelectorAll('[data-games]').forEach((b) => b.addEventListener('click', () => {
  simGames = Number(b.dataset.games);
  document.querySelectorAll('[data-games]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}));

$('roll').addEventListener('click', async () => {
  const btn = $('roll');
  if (btn.getAttribute('aria-disabled') === 'true') return;
  btn.setAttribute('aria-disabled', 'true');
  btn.textContent = 'Rolling…';
  $('sim-facts').textContent = `Playing ${simGames.toLocaleString('en-US')} games with simulation.simulate_game…`;
  try {
    S.sim = await call('empirical', simGames, S.info.seed);
    drawSim();
  } catch (err) {
    $('sim-facts').textContent = `Python raised: ${err.message}`;
  } finally {
    btn.removeAttribute('aria-disabled');
    btn.textContent = 'Roll again';
  }
});

function drawSim() {
  const r = S.sim;
  if (!r) return;
  const diff = ((r.mean - r.exact) / r.exact) * 100;
  $('sim-facts').innerHTML = `Mean game: <b>${fmt(r.mean, 3)}</b> turns over ${r.games.toLocaleString('en-US')} games, against the exact <b>${fmt(r.exact, 4)}</b> (${diff >= 0 ? '+' : ''}${fmt(diff, 1)}%). `
    + `${r.rows_observed} of ${S.info.n_squares} rows observed; the largest gap between a simulated and an exact entry is ${fmt(r.worst, 3)}, in row ${r.worst_row}. `
    + `Took ${fmt(r.ms / 1000, 2)} s.`;
  drawRowCompare();
}

function drawRowCompare() {
  const box = $('rowcmp');
  const r = S.sim;
  if (!r) { box.innerHTML = ''; return; }
  const sq = S.selected;
  const row = r.rows[sq] || r.rows[String(sq)];
  if (S.heads.has(sq) || !row || !row.cells.length) {
    box.innerHTML = `<span>Square ${sq}: ${S.heads.has(sq) ? 'a head, so no row is ever observed' : 'no moves observed'}. Pick another square on the board.</span>`;
    return;
  }
  const lines = [`<span>Row ${sq}, observed ${row.observed.toLocaleString('en-US')} times: <i style="display:inline-block;width:10px;height:5px;background:var(--accent)"></i> exact d6 matrix, <i style="display:inline-block;width:10px;height:5px;background:var(--snake)"></i> simulation.empirical_matrix</span>`];
  const max = Math.max(...row.cells.map(([, ex, si]) => Math.max(ex, si)));
  for (const [j, ex, si] of row.cells) {
    lines.push(`<div class="r"><span>→ ${j}</span><span class="bars"><i class="ex" style="width:${(ex / max) * 100}%"></i><i class="si" style="width:${(si / max) * 100}%"></i></span><span class="v">${fmt(ex, 3)} vs ${fmt(si, 3)}</span></div>`);
  }
  box.innerHTML = lines.join('');
}

// ---------- The repo's tests ----------
let testText = '';
let testPaint = 0;
function appendTestText(text) {
  testText += text;
  if (!testPaint) testPaint = requestAnimationFrame(paintTests);
}
function paintTests() {
  testPaint = 0;
  const pre = $('testout');
  pre.textContent = '';
  for (const line of testText.split('\n')) {
    const span = document.createElement('span');
    if (/\bPASSED\b|\d+ passed/.test(line)) span.className = 'pass';
    if (/\bFAILED\b|\bERROR\b|\d+ failed|\d+ errors?\b/.test(line)) span.className = 'fail';
    span.textContent = `${line}\n`;
    pre.appendChild(span);
  }
  pre.scrollTop = pre.scrollHeight;
}

$('run-tests').addEventListener('click', async () => {
  const btn = $('run-tests');
  if (btn.getAttribute('aria-disabled') === 'true') return;
  btn.setAttribute('aria-disabled', 'true');
  btn.textContent = 'Running…';
  const pre = $('testout');
  pre.hidden = false;
  pre.textContent = '';
  testText = '';
  testsRunning = true;
  $('tests-status').hidden = false;
  $('tests-status').textContent = 'Starting pytest…';
  try {
    const r = await call('tests');
    testsRunning = false;
    $('tests-status').textContent = `pytest exited with code ${r.code}${r.code === 0 ? ' (all passed)' : ''} after ${fmt(r.ms / 1000, 1)} s in this browser.`;
  } catch (err) {
    testsRunning = false;
    appendTestText(`\nPython raised: ${err.message}\n`);
  } finally {
    btn.removeAttribute('aria-disabled');
    btn.textContent = 'Run again';
  }
});
