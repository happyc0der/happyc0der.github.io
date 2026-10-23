// Results explorer for happyc0der/eeg-dementia-graph-transformer. Everything drawn here comes from
// data.json, which build/export_data.py exports from the repository's committed result files.
// The only computation is the evaluation step itself: argmax of each subject's saved out-of-fold
// probabilities -> confusion matrix -> per-class recall -> balanced accuracy, checked on screen
// against the repository's own metric files. No model is trained or run.

const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const CLS = ['AD', 'CN', 'FTD'];
const CLS_LONG = ["Alzheimer's", 'control', 'frontotemporal dementia'];
// Validated as a set (all pairs, protan/deutan) against the dark surface; shapes repeat the identity.
const COL = ['#d55181', '#9085e9', '#c98500'];
const ACC = '#a78bfa', ACC_HI = '#c4b5fd', MUTED = '#8f8aa3', GRID = '#262233', AXIS = '#3a3449';
const TEXT = '#e7e5ee', TEXT2 = '#cfcbdb', SURF = '#14121c', LEAKY = '#5e5577', NULLBAR = '#6c6684';
const GROUPS = [
  ['feature', 'Feature models · phase 1'],
  ['baseline', 'Baselines'],
  ['foundation', 'EEG foundation models · phase 2'],
  ['cnn', 'CNNs trained from scratch · phase 2'],
  ['hybrid', 'Hybrids · phase 2'],
];
const GROUP_WORD = { feature: 'feature model', baseline: 'baseline', foundation: 'foundation model', cnn: 'CNN from scratch', hybrid: 'hybrid' };

let D = null;
const S = { tab: 'leak', model: 'ensemble_vote', rep: -1, cell: null, focus: null, forestAll: false, fsel: 'ensemble_vote', perm: 0, replay: null };

// ---------- small helpers ----------
function svg(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function stext(parent, x, y, str, attrs = {}) {
  const t = svg('text', { x, y, ...attrs }, parent);
  t.textContent = str;
  return t;
}
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) e.append(c);
  return e;
}
const f1 = (x) => (100 * x).toFixed(1);
const pct = (x, d = 1) => (100 * x).toFixed(d) + '%';
const signed = (v, d = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

function barPath(x0, y0, w, hgt, r = 4) {
  // Square at the baseline (left), 4px rounded data end (right).
  if (w <= 0) return '';
  const rr = Math.min(r, w, hgt / 2);
  return `M${x0},${y0}H${x0 + w - rr}Q${x0 + w},${y0} ${x0 + w},${y0 + rr}V${y0 + hgt - rr}Q${x0 + w},${y0 + hgt} ${x0 + w - rr},${y0 + hgt}H${x0}Z`;
}
function colPath(x0, base, w, hgt, r = 3) {
  // Vertical bar: square at the baseline, rounded top.
  if (hgt <= 0) return '';
  const rr = Math.min(r, w / 2, hgt);
  const top = base - hgt;
  return `M${x0},${base}V${top + rr}Q${x0},${top} ${x0 + rr},${top}H${x0 + w - rr}Q${x0 + w},${top} ${x0 + w},${top + rr}V${base}Z`;
}
function marker(g, c, x, y, r, attrs = {}) {
  if (c === 0) return svg('circle', { cx: x, cy: y, r, ...attrs }, g);
  if (c === 1) {
    const s = r * 1.75;
    return svg('rect', { x: x - s / 2, y: y - s / 2, width: s, height: s, rx: 1, ...attrs }, g);
  }
  const s = r * 1.22;
  return svg('path', { d: `M${x},${y - s * 1.15}L${x + s},${y + s * 0.8}L${x - s},${y + s * 0.8}Z`, ...attrs }, g);
}
function keySwatch(c) {
  const s = svg('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': 'true' });
  marker(s, c, 6, 6.4, 4, { fill: COL[c] });
  return s;
}

// One tooltip per chart container. Text goes in through textContent only.
function tipLines(lines) {
  return lines.map((l) => {
    const p = h('div');
    for (const part of [].concat(l)) {
      if (typeof part === 'string') p.append(part);
      else if (part.b) p.append(h('b', { text: part.b }));
      else if (part.key) { const k = h('span', { class: 'k' }); k.style.background = part.key; p.append(k); }
    }
    return p;
  });
}
function showTip(box, lines, x, y) {
  let t = box.querySelector('.tip');
  if (!t) { t = h('div', { class: 'tip' }); box.append(t); }
  t.replaceChildren(...tipLines(lines));
  t.hidden = false;
  const W = box.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
  let left = x + 14;
  if (left + tw > W) left = x - tw - 14;
  if (left < 0) left = clamp(W - tw, 0, W);
  let top = y - th - 12;
  if (top < 0) top = y + 16;
  t.style.left = left + 'px';
  t.style.top = top + 'px';
}
function hideTip(box) {
  const t = box.querySelector('.tip');
  if (t) t.hidden = true;
}
function localXY(ev, el) {
  const r = el.getBoundingClientRect();
  return [ev.clientX - r.left, ev.clientY - r.top];
}

// ---------- recomputation from the saved predictions ----------
const memo = new Map();
function repData(mid, rep) {
  const key = mid + ':' + rep;
  if (memo.has(key)) return memo.get(key);
  const P = D.models[mid].p[rep], y = D.y, n = y.length;
  const pred = new Array(n), cm = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) {
    // numpy argmax semantics: the first maximum wins. Probabilities are exact integers (x 1e5).
    let k = 0, best = P[3 * i];
    if (P[3 * i + 1] > best) { k = 1; best = P[3 * i + 1]; }
    if (P[3 * i + 2] > best) k = 2;
    pred[i] = k;
    cm[y[i]][k]++;
  }
  const out = { pred, cm, ba: balAcc(cm) };
  memo.set(key, out);
  return out;
}
function balAcc(cm) {
  let s = 0;
  for (let i = 0; i < 3; i++) s += cm[i][i] / (cm[i][0] + cm[i][1] + cm[i][2]);
  return s / 3;
}
function current() {
  const mid = S.model, m = D.models[mid];
  if (S.rep >= 0) {
    const r = repData(mid, S.rep);
    return { m, cm: r.cm, ba: r.ba, reps: [S.rep] };
  }
  const cm = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let s = 0;
  for (let r = 0; r < 10; r++) {
    const d = repData(mid, r);
    s += d.ba;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cm[i][j] += d.cm[i][j];
  }
  return { m, cm, ba: s / 10, reps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] };
}

// ---------- tabs ----------
const TABS = [['leak', 't-leak'], ['subj', 't-subj'], ['models', 't-models'], ['chance', 't-chance']];
function setTab(name, focus = false) {
  S.tab = name;
  for (const [k, id] of TABS) {
    const t = $(id), p = $(t.getAttribute('aria-controls')), on = k === name;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    p.hidden = !on;
    if (on && focus) t.focus({ preventScroll: true });
  }
  if (name !== 'leak') stopReplay(false);
  render();
}
function render() {
  if (!D) return;
  ({ leak: renderLeak, subj: renderSubj, models: renderForest, chance: renderPerm })[S.tab]();
}

// ---------- 01 the leak ----------
function legacyPeak() {
  let best = { acc: -1 };
  for (const f of D.legacy.folds) f.acc.forEach((a, i) => { if (a > best.acc) best = { acc: a, fold: f.fold, epoch: i + 1 }; });
  return best;
}
function renderLeak() {
  const ep = S.replay ? S.replay.epoch : Infinity;
  drawLeakLines(ep);
  drawLeakBars(S.replay ? S.replay.bars : [1, 1, 1]);
  const pk = legacyPeak();
  if (!S.replay) {
    const lens = D.legacy.folds.map((f) => f.acc.length);
    $('leak-readout').textContent = `${Math.min(...lens)}–${Math.max(...lens)} epochs per fold (early stopping) · peak ${pk.acc.toFixed(2)}%, fold ${pk.fold}, epoch ${pk.epoch}`;
  }
}
function drawLeakLines(progress) {
  const box = $('leak-chart');
  const W = box.clientWidth;
  if (W < 60) return;
  const H = Math.round(clamp(W * 0.46, 200, 270));
  const m = { l: 36, r: 10, t: 10, b: 30 };
  const maxE = 120;
  const x = (e) => m.l + (e / maxE) * (W - m.l - m.r);
  const y = (a) => m.t + (1 - a / 100) * (H - m.t - m.b);
  const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Validation accuracy by epoch for the five chunk-level folds of the 2025 run, rising to a peak of ${legacyPeak().acc}% against 33.3% chance.` });
  for (const v of [0, 25, 50, 75, 100]) {
    svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: GRID }, s);
    stext(s, m.l - 6, y(v) + 3.5, v + '%', { 'text-anchor': 'end' });
  }
  for (const e of [0, 20, 40, 60, 80, 100, 120]) stext(s, x(e), H - m.b + 15, String(e), { 'text-anchor': 'middle' });
  stext(s, W - m.r, H - 3, 'epoch', { 'text-anchor': 'end' });
  svg('line', { x1: m.l, x2: W - m.r, y1: y(100 / 3), y2: y(100 / 3), stroke: MUTED, 'stroke-opacity': 0.7 }, s);
  stext(s, W - m.r, y(100 / 3) - 5, 'chance 33.3%', { 'text-anchor': 'end' });

  const pk = legacyPeak();
  let best = 0;
  for (const f of D.legacy.folds) {
    const n = Math.min(f.acc.length, Math.floor(progress));
    if (n < 1) continue;
    let d = '';
    for (let i = 0; i < n; i++) { d += (i ? 'L' : 'M') + x(i + 1).toFixed(1) + ',' + y(f.acc[i]).toFixed(1); best = Math.max(best, f.acc[i]); }
    svg('path', { d, fill: 'none', stroke: ACC, 'stroke-width': 1.6, 'stroke-opacity': 0.72, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, s);
    svg('circle', { cx: x(n), cy: y(f.acc[n - 1]), r: 3.5, fill: ACC, stroke: SURF, 'stroke-width': 2 }, s);
  }
  if (progress >= pk.epoch) {
    const px = x(pk.epoch), py = y(pk.acc);
    svg('circle', { cx: px, cy: py, r: 5, fill: ACC_HI, stroke: SURF, 'stroke-width': 2 }, s);
    // Label below the cluster of lines, with a leader, so it never sits on the data.
    const ly = y(W < 500 ? 70 : 78);
    svg('line', { x1: px, x2: px, y1: py + 6, y2: ly - 12, stroke: TEXT2, 'stroke-opacity': 0.6 }, s);
    const anchor = px > W * 0.7 ? 'end' : px < W * 0.3 ? 'start' : 'middle';
    stext(s, px, ly, `${pk.acc.toFixed(2)}% peak · fold ${pk.fold}, epoch ${pk.epoch}`, { 'text-anchor': anchor, class: 'val' });
    stext(s, px, ly + 14, 'the checkpoint that was kept', { 'text-anchor': anchor });
  }
  if (S.replay) {
    const e = Math.min(Math.floor(progress), maxE);
    $('leak-readout').textContent = `epoch ${e} · best validation so far ${best.toFixed(2)}%`;
  }
  // Crosshair: snaps to the nearest epoch and lists every fold.
  const cross = svg('line', { y1: m.t, y2: H - m.b, stroke: TEXT2, 'stroke-opacity': 0.5, visibility: 'hidden' }, s);
  const hit = svg('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: 'transparent' }, s);
  const move = (ev) => {
    if (S.replay) return;
    const [mx] = localXY(ev, s);
    const e = clamp(Math.round(((mx - m.l) / (W - m.l - m.r)) * maxE), 1, maxE);
    cross.setAttribute('x1', x(e)); cross.setAttribute('x2', x(e)); cross.setAttribute('visibility', 'visible');
    const lines = [[{ b: `epoch ${e}` }, ' · validation accuracy']];
    for (const f of D.legacy.folds) {
      const v = f.acc[e - 1];
      lines.push([{ key: ACC }, `fold ${f.fold}  `, v === undefined ? `stopped at ${f.stop}` : { b: v.toFixed(2) + '%' }]);
    }
    showTip(box, lines, x(e), m.t + 30);
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(box); });
  const old = box.querySelector('svg');
  if (old) old.replaceWith(s); else box.prepend(s);
}
function drawLeakBars(t) {
  const box = $('leak-bars');
  const W = box.clientWidth;
  if (W < 60) return;
  const ev = D.models.ensemble_vote, pk = legacyPeak(), te = D.legacy.test;
  const rows = [
    { lab: 'Validation, chunk-level folds', sub: `best epoch of the 2025 run · leaky`, v: pk.acc, col: LEAKY },
    { lab: 'Same checkpoint, 18 unseen subjects', sub: `${te.chunks} chunks · chunk accuracy`, v: te.acc, col: ACC },
    { lab: '2026 re-evaluation, soft vote', sub: '88 subjects · 10 × 5-fold CV · subject bal. acc.', v: 100 * ev.bal[0], ci: [100 * ev.bal[2], 100 * ev.bal[3]], col: ACC },
  ];
  const narrow = W < 460;
  const rowH = narrow ? 70 : 58, top = 18, axisH = 26;
  const H = top + rows.length * rowH + axisH;
  const m = { l: 2, r: 8 };
  const x = (v) => m.l + (v / 100) * (W - m.l - m.r);
  const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': rows.map((r) => `${r.lab}: ${r.v.toFixed(1)}%`).join('; ') });
  for (const v of [0, 25, 50, 75, 100]) {
    svg('line', { x1: x(v), x2: x(v), y1: top, y2: H - axisH, stroke: GRID }, s);
    stext(s, x(v), H - axisH + 15, v + '%', { 'text-anchor': v === 0 ? 'start' : v === 100 ? 'end' : 'middle' });
  }
  svg('line', { x1: x(100 / 3), x2: x(100 / 3), y1: top - 4, y2: H - axisH, stroke: MUTED, 'stroke-opacity': 0.8 }, s);
  stext(s, x(100 / 3), top - 8, 'chance 33.3%', { 'text-anchor': 'middle' });
  rows.forEach((r, i) => {
    const y0 = top + i * rowH;
    stext(s, m.l, y0 + 12, r.lab, { class: 'strong halo', style: 'font-family:var(--sans);font-size:12.5px' });
    stext(s, m.l, y0 + 26, r.sub, { class: 'halo' });
    const by = y0 + 33, bh = 16, k = ease(t[i]);
    svg('path', { d: barPath(x(0), by, (x(r.v) - x(0)) * k, bh), fill: r.col }, s);
    if (k > 0.98) {
      let end = x(r.v);
      if (r.ci) {
        const cy = by + bh / 2;
        svg('line', { x1: x(r.ci[0]), x2: x(r.ci[1]), y1: cy, y2: cy, stroke: TEXT, 'stroke-width': 1.5 }, s);
        for (const c of r.ci) svg('line', { x1: x(c), x2: x(c), y1: cy - 5, y2: cy + 5, stroke: TEXT, 'stroke-width': 1.5 }, s);
        end = x(r.ci[1]);
      }
      const label = r.ci ? `${r.v.toFixed(1)}% [${r.ci[0].toFixed(1)}, ${r.ci[1].toFixed(1)}]` : `${r.v.toFixed(r.v > 99 ? 2 : 1)}%`;
      const fits = end + 8 + label.length * 6.6 <= W;
      const onDark = r.col === LEAKY;
      if (fits) stext(s, end + 8, by + bh / 2 + 4, label, { class: 'val' });
      else if (r.ci) stext(s, Math.min(end, W - 2), by + bh + 14, label, { class: 'val', 'text-anchor': 'end' });
      else stext(s, x(r.v) - 8, by + bh / 2 + 4, label, { class: 'val', 'text-anchor': 'end', style: onDark ? '' : 'fill:#140f24' });
    }
  });
  box.replaceChildren(s);
}
function stopReplay(redraw = true) {
  if (!S.replay) return;
  cancelAnimationFrame(S.replay.raf);
  S.replay = null;
  $('replay').textContent = 'Replay the training log';
  if (redraw && S.tab === 'leak') renderLeak();
}
function startReplay() {
  if (S.replay) { stopReplay(); return; }
  if (RM.matches) { renderLeak(); return; }
  const lines = 3600, bar = 700, gap = 250;
  const t0 = performance.now();
  S.replay = { epoch: 0, bars: [0, 0, 0], raf: 0 };
  $('replay').textContent = 'Stop';
  const maxLen = Math.max(...D.legacy.folds.map((f) => f.acc.length));
  const frame = (now) => {
    if (!S.replay) return;
    const dt = now - t0;
    S.replay.epoch = Math.min(maxLen, (dt / lines) * maxLen);
    S.replay.bars = [0, 1, 2].map((i) => (dt - lines - gap - i * (bar + gap)) / bar);
    renderLeak();
    if (dt < lines + 3 * (bar + gap) + 50) S.replay.raf = requestAnimationFrame(frame);
    else stopReplay();
  };
  S.replay.raf = requestAnimationFrame(frame);
}

// ---------- 02 every subject ----------
function buildModelSelect() {
  const sel = $('model-sel');
  for (const [g, name] of GROUPS) {
    const og = h('optgroup', { label: name });
    const ids = Object.keys(D.models).filter((k) => D.models[k].group === g).sort((a, b) => D.models[b].bal[0] - D.models[a].bal[0]);
    for (const id of ids) og.append(h('option', { value: id, text: `${D.models[id].label} · ${f1(D.models[id].bal[0])}%` }));
    sel.append(og);
  }
  sel.value = S.model;
  sel.addEventListener('change', () => { S.model = sel.value; S.cell = null; S.focus = null; renderSubj(); });
}
function points() {
  const pts = [];
  const { reps } = current();
  for (const r of reps) {
    const P = D.models[S.model].p[r], pred = repData(S.model, r).pred;
    for (let i = 0; i < D.y.length; i++) {
      pts.push({ r, i, c: D.y[i], pred: pred[i], p: [P[3 * i] / 1e5, P[3 * i + 1] / 1e5, P[3 * i + 2] / 1e5] });
    }
  }
  return pts;
}
function visible(pt) {
  return !S.cell || (pt.c === S.cell[0] && pt.pred === S.cell[1]);
}
function ptLines(pt) {
  const ok = pt.c === pt.pred;
  return [
    [{ b: D.subjects[pt.i] }, ` · true ${CLS[pt.c]} → predicted ${CLS[pt.pred]} ${ok ? '✓' : '✗'}`],
    [`P(AD) ${pt.p[0].toFixed(3)} · P(CN) ${pt.p[1].toFixed(3)} · P(FTD) ${pt.p[2].toFixed(3)}`],
    [`repeat ${pt.r + 1}, tested in outer fold ${D.folds[pt.r][pt.i] + 1}`],
  ];
}
function ptText(pt) {
  return ptLines(pt).map((l) => l.map((x) => (typeof x === 'string' ? x : x.b || '')).join('')).join(' · ');
}
function renderSubj() {
  const { m, cm, ba, reps } = current();
  const all = S.rep < 0;
  // controls
  $('rep-all').setAttribute('aria-pressed', String(all));
  $('rep-out').textContent = all ? 'all repeats' : `repeat ${S.rep + 1} of 10`;
  $('cm-title').textContent = all ? 'Confusion matrix · summed over 10 repeats' : `Confusion matrix · repeat ${S.rep + 1}`;
  // stats
  $('ba').textContent = pct(ba);
  $('ba-lbl').textContent = all ? 'balanced accuracy, mean of the 10 repeats' : 'balanced accuracy (mean of the 3 recalls)';
  const chk = $('ba-check');
  chk.replaceChildren();
  if (all) {
    const okMean = Math.abs(ba - m.bal[0]) < 1e-9;
    const okCm = cm.every((row, i) => row.every((v, j) => v === m.confusion_summed[i][j]));
    chk.append(`Recomputed here from predictions_subject.csv. The repo's summary.json says ${pct(m.bal[0], 2)} ± ${f1(m.bal[1])} [${f1(m.bal[2])}, ${f1(m.bal[3])}] `,
      h('span', { class: okMean ? 'ok' : 'bad', text: okMean ? '✓ same' : '✗ differs' }),
      '; its summed confusion matrix ', h('span', { class: okCm ? 'ok' : 'bad', text: okCm ? '✓ same' : '✗ differs' }), '.');
  } else {
    const ref = m.per_repeat[S.rep];
    const ok = Math.abs(ba - ref) <= 5e-6;
    chk.append(`Recomputed here: ${pct(ba, 3)}. The repo's metrics_subject_per_repeat.csv, repeat ${S.rep + 1}: ${pct(ref, 3)} `,
      h('span', { class: ok ? 'ok' : 'bad', text: ok ? '✓ same' : '✗ differs' }), '.');
  }
  const r2 = cm[2][0] / (cm[2][0] + cm[2][1] + cm[2][2]), r0 = cm[0][2] / (cm[0][0] + cm[0][1] + cm[0][2]);
  $('ftd-line').textContent = `FTD subjects predicted AD: ${pct(r2, 0)} · AD subjects predicted FTD: ${pct(r0, 0)}`;
  $('model-desc').textContent = `Repo description: ${m.description} · ${m.path}/`;
  drawCM(cm, all);
  drawTernary();
}
function drawCM(cm, all) {
  const box = $('cm');
  const kids = [h('span'), ...CLS.map((c) => h('span', { class: 'h', text: `→ ${c}` })), h('span', { class: 'h', text: 'recall' })];
  for (let i = 0; i < 3; i++) {
    const n = cm[i][0] + cm[i][1] + cm[i][2];
    const rh = h('span', { class: 'rh' }, keySwatch(i), CLS[i], h('small', { text: all ? `${n / 10}×10` : `n=${n}` }));
    kids.push(rh);
    for (let j = 0; j < 3; j++) {
      const frac = cm[i][j] / n;
      const alpha = 0.06 + 0.74 * frac;
      const on = !!S.cell && S.cell[0] === i && S.cell[1] === j;
      const b = h('button', {
        class: 'cell' + (alpha > 0.5 ? ' dark' : '') + (i === j ? ' diag' : ''), type: 'button', 'aria-pressed': String(on),
        'aria-label': `true ${CLS[i]}, predicted ${CLS[j]}: ${cm[i][j]} (${pct(frac, 0)} of the row)${on ? ', highlighted' : ''}`,
      }, String(cm[i][j]), h('small', { text: pct(frac, 0) }));
      b.style.background = `rgba(167, 139, 250, ${alpha.toFixed(3)})`;
      b.addEventListener('click', () => {
        S.cell = on ? null : [i, j];
        S.focus = null;
        renderSubj();
        const again = $('cm').querySelectorAll('.cell')[i * 3 + j];
        if (again) again.focus({ preventScroll: true });
      });
      kids.push(b);
    }
    kids.push(h('span', { class: 'rec', text: pct(cm[i][i] / n, 0) }));
  }
  box.replaceChildren(...kids);
}
function drawTernary() {
  const box = $('tern');
  const W = box.clientWidth;
  if (W < 60) return;
  const padX = 22, padT = 24, padB = 26;
  const side = Math.min(W - 2 * padX, 380);
  const th = (side * Math.sqrt(3)) / 2;
  const H = Math.round(padT + th + padB);
  const ox = (W - side) / 2;
  const V = [[ox, padT + th], [ox + side / 2, padT], [ox + side, padT + th]]; // AD, CN, FTD
  const pos = (p) => {
    const t = p[0] + p[1] + p[2];
    return [(p[0] * V[0][0] + p[1] * V[1][0] + p[2] * V[2][0]) / t, (p[0] * V[0][1] + p[1] * V[1][1] + p[2] * V[2][1]) / t];
  };
  const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  const G = pos([1, 1, 1]);
  const mid = (a, b) => [(V[a][0] + V[b][0]) / 2, (V[a][1] + V[b][1]) / 2];
  const M01 = mid(0, 1), M12 = mid(1, 2), M02 = mid(0, 2);
  const regions = [[V[0], M01, G, M02], [V[1], M12, G, M01], [V[2], M02, G, M12]];
  regions.forEach((poly, k) => svg('path', { d: 'M' + poly.map((q) => q.join(',')).join('L') + 'Z', fill: COL[k], 'fill-opacity': 0.08 }, s));
  for (const q of [M01, M12, M02]) svg('line', { x1: G[0], y1: G[1], x2: q[0], y2: q[1], stroke: AXIS }, s);
  svg('path', { d: `M${V[0]}L${V[1]}L${V[2]}Z`, fill: 'none', stroke: AXIS, 'stroke-width': 1.2 }, s);
  stext(s, V[0][0] - 2, V[0][1] + 17, 'AD', { class: 'strong', 'text-anchor': 'start' });
  stext(s, V[1][0], V[1][1] - 9, 'CN', { class: 'strong', 'text-anchor': 'middle' });
  stext(s, V[2][0] + 2, V[2][1] + 17, 'FTD', { class: 'strong', 'text-anchor': 'end' });
  stext(s, (V[0][0] + V[2][0]) / 2, V[0][1] + 17, 'corner region = predicted class', { 'text-anchor': 'middle' });

  const pts = points();
  const all = S.rep < 0;
  const r = all ? 2.6 : 4.2;
  const layer = svg('g', {}, s);
  const coords = pts.map((pt) => pos(pt.p));
  pts.forEach((pt, k) => {
    const on = visible(pt);
    marker(layer, pt.c, coords[k][0], coords[k][1], r, {
      fill: COL[pt.c], 'fill-opacity': on ? (all ? 0.6 : 0.95) : 0.08,
      stroke: all ? 'none' : SURF, 'stroke-width': all ? 0 : 1.5,
    });
  });
  const ring = svg('circle', { r: r + 5, fill: 'none', stroke: TEXT, 'stroke-width': 1.5, visibility: 'hidden' }, s);
  const showPt = (k, fromKey) => {
    if (k == null) { ring.setAttribute('visibility', 'hidden'); hideTip(box); return; }
    const [cx, cy] = coords[k];
    ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('visibility', 'visible');
    // On narrow screens the readout under the chart carries the details; a tooltip would cover the dots.
    if (W >= 480) showTip(box, ptLines(pts[k]), cx, cy); else hideTip(box);
    $('tern-readout').textContent = ptText(pts[k]);
  };
  const order = pts.map((_, k) => k).filter((k) => visible(pts[k])).sort((a, b) => pts[a].i - pts[b].i || pts[a].r - pts[b].r);
  const nearest = (mx, my) => {
    let best = null, bd = 26 * 26;
    for (const k of order) {
      const dx = coords[k][0] - mx, dy = coords[k][1] - my, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  };
  const hit = svg('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' }, s);
  const move = (ev) => {
    const [mx, my] = localXY(ev, s);
    const k = nearest(mx, my);
    S.focus = k == null ? null : { r: pts[k].r, i: pts[k].i };
    showPt(k);
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', (ev) => { if (ev.pointerType !== 'touch') { ring.setAttribute('visibility', 'hidden'); hideTip(box); } });
  box.onkeydown = (ev) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (ev.key === 'Escape') { S.focus = null; showPt(null); $('tern-readout').textContent = ''; ev.preventDefault(); return; }
    if (!(ev.key in keys) || !order.length) return;
    ev.preventDefault();
    let at = S.focus ? order.findIndex((k) => pts[k].r === S.focus.r && pts[k].i === S.focus.i) : -1;
    at = at < 0 ? (keys[ev.key] > 0 ? 0 : order.length - 1) : (at + keys[ev.key] + order.length) % order.length;
    const k = order[at];
    S.focus = { r: pts[k].r, i: pts[k].i };
    showPt(k);
  };
  box.replaceChildren(s);
  // keep the focused subject across re-renders
  if (S.focus) {
    const k = pts.findIndex((pt) => pt.r === S.focus.r && pt.i === S.focus.i);
    if (k >= 0 && visible(pts[k])) showPt(k); else S.focus = null;
  }
  if (!S.focus) {
    const n = order.length, tot = pts.length;
    $('tern-readout').textContent = S.cell
      ? `${n} of ${tot} ${all ? 'subject-repeats' : 'subjects'} are true ${CLS[S.cell[0]]} predicted ${CLS[S.cell[1]]}.`
      : `${tot} ${all ? 'points, 88 subjects × 10 repeats' : 'subjects'} · hover or tap a dot, or use the arrow keys`;
  }
}

// ---------- 03 all models ----------
function forestDomain() { return [25, 75]; }
function renderForest() {
  $('f-head').setAttribute('aria-pressed', String(!S.forestAll));
  $('f-all').setAttribute('aria-pressed', String(S.forestAll));
  const box = $('forest');
  const wide = box.clientWidth >= 800;
  // Two columns from 800 px; below ~1230 px the value column moves into the details line.
  box.classList.toggle('compact', wide && box.clientWidth < 1230);
  const cols = !wide ? [GROUPS.map((g) => g[0])]
    : S.forestAll ? [['feature'], ['foundation', 'cnn', 'hybrid', 'baseline']] : [['feature', 'baseline'], ['foundation', 'cnn', 'hybrid']];
  const colEls = [];
  const plots = [];
  for (const groups of cols) {
    const col = h('div', { class: 'fcol' });
    const topAxis = h('div', { class: 'faxis' }, h('span'), h('span', { class: 'pl' }), h('span', { class: 'sp' }));
    topAxis.style.height = '22px';
    plots.push({ el: topAxis.querySelector('.pl'), kind: 'top' });
    col.append(topAxis);
    for (const g of groups) {
      const ids = Object.keys(D.models).filter((k) => D.models[k].group === g && (S.forestAll || D.models[k].headline))
        .sort((a, b) => D.models[b].bal[0] - D.models[a].bal[0]);
      if (!ids.length) continue;
      col.append(h('div', { class: 'fhead' }, h('span', { text: GROUPS.find((x) => x[0] === g)[1] })));
      for (const id of ids) {
        const m = D.models[id];
        const nm = h('span', { class: 'nm', text: m.label });
        if (m.post_hoc) nm.append(h('i', { text: 'post hoc' }));
        if (m.exploratory) nm.append(h('i', { text: 'exploratory' }));
        const pl = h('span', { class: 'pl' });
        pl.style.height = '100%';
        const v = h('span', { class: 'v', text: `${f1(m.bal[0])} [${f1(m.bal[2])}, ${f1(m.bal[3])}]` });
        const b = h('button', { class: 'frow', type: 'button', 'aria-pressed': String(S.fsel === id),
          'aria-label': `${m.label}: ${f1(m.bal[0])}% balanced accuracy, 95% CI ${f1(m.bal[2])} to ${f1(m.bal[3])}` }, nm, pl, v);
        b.addEventListener('click', () => { S.fsel = id; renderForest(); const again = $('forest').querySelector(`[data-id="${CSS.escape(id)}"]`); if (again) again.focus({ preventScroll: true }); });
        b.dataset.id = id;
        plots.push({ el: pl, kind: 'row', id });
        col.append(b);
      }
    }
    const axis = h('div', { class: 'faxis' }, h('span'), h('span', { class: 'pl' }), h('span', { class: 'sp' }));
    plots.push({ el: axis.querySelector('.pl'), kind: 'axis' });
    col.append(axis);
    colEls.push(col);
  }
  box.replaceChildren(...colEls);
  box.style.display = 'grid';
  box.style.gridTemplateColumns = wide ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)';
  box.style.columnGap = '28px';
  const [lo, hi] = forestDomain();
  const ev = D.models.ensemble_vote.bal[0] * 100;
  for (const p of plots) {
    const W = p.el.clientWidth, H = p.el.clientHeight || 24;
    if (W < 30) continue;
    const x = (v) => 6 + ((v - lo) / (hi - lo)) * (W - 12);
    const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    if (p.kind === 'axis') {
      for (const t of [30, 40, 50, 60, 70]) stext(s, x(t), 13, t + '%', { 'text-anchor': 'middle' });
    } else if (p.kind === 'top') {
      stext(s, x(100 / 3), H - 6, 'chance', { 'text-anchor': 'middle' });
      stext(s, x(ev), H - 6, 'soft vote', { 'text-anchor': 'middle' });
    } else {
      const m = D.models[p.id], cy = H / 2;
      for (const t of [30, 40, 50, 60, 70]) svg('line', { x1: x(t), x2: x(t), y1: 0, y2: H, stroke: GRID }, s);
      svg('line', { x1: x(100 / 3), x2: x(100 / 3), y1: 0, y2: H, stroke: MUTED, 'stroke-opacity': 0.55 }, s);
      svg('line', { x1: x(ev), x2: x(ev), y1: 0, y2: H, stroke: ACC, 'stroke-opacity': 0.35 }, s);
      const sel = S.fsel === p.id;
      svg('line', { x1: x(100 * m.bal[2]), x2: x(100 * m.bal[3]), y1: cy, y2: cy, stroke: sel ? TEXT : TEXT2, 'stroke-width': 1.5, 'stroke-linecap': 'round' }, s);
      svg('circle', { cx: x(100 * m.bal[0]), cy, r: sel ? 5.5 : 4.2, fill: sel ? ACC_HI : ACC, stroke: SURF, 'stroke-width': 2 }, s);
    }
    p.el.replaceChildren(s);
  }
  drawForestDetail();
}
function drawForestDetail() {
  const m = D.models[S.fsel], box = $('fdetail');
  const rec = m.recall.map((r, i) => `${CLS[i]} ${Math.round(100 * r)}%`).join(' / ');
  const lines = [
    h('div', {}, h('b', { text: m.label }), ` · phase ${m.phase} · ${GROUP_WORD[m.group]}${m.post_hoc ? ' · member chosen after seeing cv3 (post hoc)' : ''}${m.exploratory ? ' · exploratory' : ''}`),
    h('div', { text: `${f1(m.bal[0])}% ± ${f1(m.bal[1])} [${f1(m.bal[2])}, ${f1(m.bal[3])}] subject-level balanced accuracy · macro AUC ${m.auc.toFixed(3)} · recall ${rec}` }),
  ];
  if (m.paired) {
    const v = m.paired.lo > 0 ? 'better' : m.paired.hi < 0 ? 'worse' : 'not distinguishable';
    lines.push(h('div', { text: `vs soft vote, paired bootstrap on identical folds: ${signed(100 * m.paired.mean)} pp [${signed(100 * m.paired.lo)}, ${signed(100 * m.paired.hi)}] → ${v}` }));
  } else if (S.fsel === 'ensemble_vote') {
    lines.push(h('div', { text: 'The pre-specified reference that the phase-2 models are compared with.' }));
  }
  lines.push(h('div', { class: 'desc', text: `Repo description: ${m.description}` }));
  const go = h('button', { class: 'btn', type: 'button', text: 'See its 88 subjects →' });
  go.addEventListener('click', () => {
    S.model = S.fsel; S.rep = -1; S.cell = null; S.focus = null;
    $('model-sel').value = S.model;
    setTab('subj', true);
    // Bring this document's own tab row back into view (inside the frame only; the host page never moves).
    const top = document.querySelector('.tabs').getBoundingClientRect().top;
    if (top < 0) window.scrollTo({ top: window.scrollY + top - 8 });
  });
  lines.push(go);
  box.replaceChildren(...lines);
}

// ---------- 04 versus chance ----------
function buildPermSeg() {
  const seg = $('perm-seg');
  D.permutation.forEach((p, k) => {
    const short = { spectral_lr: 'Spectral', rbp_lr: 'Band power', cbramod_lr: 'CBraMod' }[p.model] || D.models[p.model].label;
    const b = h('button', { type: 'button', 'aria-pressed': String(k === S.perm), text: `${short} · ${p.n_perm}`,
      'aria-label': `${D.models[p.model].label}, ${p.n_perm} permutations` });
    b.addEventListener('click', () => { S.perm = k; renderPerm(); });
    seg.append(b);
  });
}
function renderPerm() {
  [...$('perm-seg').children].forEach((b, k) => b.setAttribute('aria-pressed', String(k === S.perm)));
  const p = D.permutation[S.perm];
  const label = D.models[p.model].label;
  $('perm-title').textContent = `${label} · ${p.n_perm} label permutations`;
  const lo = 15, hi = 65, bw = 2.5, nb = Math.round((hi - lo) / bw);
  const counts = new Array(nb).fill(0);
  for (const v of p.null) counts[clamp(Math.floor((100 * v - lo) / bw), 0, nb - 1)]++;
  const box = $('perm-chart');
  const W = box.clientWidth, H = Math.round(clamp(W * 0.45, 210, 270));
  if (W < 60) return;
  const m = { l: 34, r: 10, t: 34, b: 30 };
  const x = (v) => m.l + ((v - lo) / (hi - lo)) * (W - m.l - m.r);
  const ymax = Math.max(...counts);
  const step = ymax > 60 ? 20 : ymax > 30 ? 10 : ymax > 12 ? 5 : 2;
  const top = Math.ceil(ymax / step) * step;
  const y = (c) => m.t + (1 - c / top) * (H - m.t - m.b);
  const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Histogram of ${p.n_perm} permutation balanced accuracies, highest ${pct(Math.max(...p.null))}, against the observed ${pct(p.observed)}.` });
  for (let c = 0; c <= top; c += step) {
    svg('line', { x1: m.l, x2: W - m.r, y1: y(c), y2: y(c), stroke: GRID }, s);
    stext(s, m.l - 6, y(c) + 3.5, String(c), { 'text-anchor': 'end' });
  }
  for (let t = 20; t <= 60; t += 10) stext(s, x(t), H - m.b + 15, t + '%', { 'text-anchor': 'middle' });
  stext(s, W - m.r, H - 3, 'balanced accuracy', { 'text-anchor': 'end' });
  const bars = [];
  counts.forEach((c, k) => {
    const x0 = x(lo + k * bw) + 1, w = x(lo + (k + 1) * bw) - x(lo + k * bw) - 2;
    const el = c ? svg('path', { d: colPath(x0, y(0), w, y(0) - y(c)), fill: NULLBAR }, s) : null;
    bars.push([x0, w, c, lo + k * bw, el]);
  });
  const p95 = 100 * p.null_95th, obs = 100 * p.observed;
  svg('line', { x1: x(p95), x2: x(p95), y1: m.t - 4, y2: y(0), stroke: MUTED, 'stroke-opacity': 0.9 }, s);
  stext(s, x(p95) - 4, m.t - 8, `null 95th pct ${p95.toFixed(1)}%`, { 'text-anchor': 'end' });
  svg('line', { x1: x(obs), x2: x(obs), y1: m.t - 22, y2: y(0), stroke: ACC_HI, 'stroke-width': 2 }, s);
  svg('circle', { cx: x(obs), cy: y(0), r: 4, fill: ACC_HI, stroke: SURF, 'stroke-width': 2 }, s);
  stext(s, x(obs) + 5, m.t - 18, `observed ${obs.toFixed(1)}%`, { class: 'val', 'text-anchor': x(obs) > W - 120 ? 'end' : 'start', dx: x(obs) > W - 120 ? -10 : 0 });
  const hit = svg('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: 'transparent' }, s);
  const move = (ev) => {
    const [mx] = localXY(ev, s);
    const b = bars.find(([x0, w]) => mx >= x0 - 1 && mx <= x0 + w + 1);
    for (const q of bars) if (q[4]) q[4].setAttribute('fill', q === b ? '#8f89a8' : NULLBAR);
    if (!b) { hideTip(box); return; }
    showTip(box, [[{ b: `${b[2]} of ${p.n_perm}` }, ' permutations'], [`${b[3].toFixed(1)}–${(b[3] + bw).toFixed(1)}% balanced accuracy`]], b[0] + b[1] / 2, y(b[2]));
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { hideTip(box); for (const q of bars) if (q[4]) q[4].setAttribute('fill', NULLBAR); });
  box.replaceChildren(s);

  const mean = p.null.reduce((a, b) => a + b, 0) / p.null.length;
  const sd = Math.sqrt(p.null.reduce((a, b) => a + (b - mean) ** 2, 0) / (p.null.length - 1));
  const mx = Math.max(...p.null);
  $('perm-p').textContent = `p = ${p.p.toFixed(3)}`;
  $('perm-text').textContent = `None of the ${p.n_perm} shuffled-label reruns reached the observed ${obs.toFixed(1)}%; the highest was ${pct(mx)}. ` +
    `With ${p.n_perm} permutations the smallest possible p is 1/${p.n_perm + 1} = ${(1 / (p.n_perm + 1)).toFixed(3)}, which is the value reported. ` +
    `Null mean ${pct(mean)} ± ${f1(sd)}, chance is 33.3%. Source: ${p.path}.`;
}

// ---------- wiring ----------
function wire() {
  const tabs = TABS.map(([k, id]) => [k, $(id)]);
  tabs.forEach(([k, t], i) => {
    t.addEventListener('click', () => setTab(k));
    t.addEventListener('keydown', (ev) => {
      const n = tabs.length;
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1 + n, Home: 0, End: n - 1 }[ev.key];
      if (to === undefined) return;
      ev.preventDefault();
      setTab(tabs[to % n][0], true);
    });
  });
  $('replay').addEventListener('click', startReplay);
  $('rep-all').addEventListener('click', () => { S.rep = -1; S.focus = null; renderSubj(); });
  $('rep-prev').addEventListener('click', () => { S.rep = S.rep <= 0 ? 9 : S.rep - 1; S.focus = null; renderSubj(); });
  $('rep-next').addEventListener('click', () => { S.rep = S.rep >= 9 ? 0 : S.rep + 1; S.focus = null; renderSubj(); });
  $('f-head').addEventListener('click', () => { S.forestAll = false; if (!D.models[S.fsel].headline) S.fsel = 'ensemble_vote'; renderForest(); });
  $('f-all').addEventListener('click', () => { S.forestAll = true; renderForest(); });
  const tern = $('tern');
  tern.tabIndex = 0;
  tern.setAttribute('role', 'group');
  tern.setAttribute('aria-label', 'Probability triangle of subjects. Arrow keys step through subjects, Escape clears.');
  tern.style.touchAction = 'pan-y';
  const lg = $('tern-legend');
  CLS.forEach((c, i) => lg.append(h('span', {}, keySwatch(i), `${c} ${CLS_LONG[i]}`)));
  lg.append(h('span', { class: 'hint', text: '(true diagnosis)' }));
  if (RM.matches) $('replay').hidden = true;
  RM.addEventListener?.('change', () => { $('replay').hidden = RM.matches; if (RM.matches) stopReplay(); });
  let lastW = 0;
  new ResizeObserver(() => {
    const w = document.documentElement.clientWidth;
    if (w === lastW) return;
    lastW = w;
    render();
  }).observe(document.querySelector('.wrap'));
}

async function init() {
  const boot = $('boot');
  try {
    const res = await fetch('data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    D = await res.json();
  } catch (e) {
    boot.textContent = `Could not load data.json (${e.message}).`;
    boot.classList.add('error');
    return;
  }
  boot.remove();
  buildModelSelect();
  buildPermSeg();
  wire();
  setTab('leak');
  window.__demoReady = true;
}
init();
