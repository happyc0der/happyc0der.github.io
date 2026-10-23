// LFP2Vec audit demo: charts over data.json, which export_data.py copies from the repo's
// committed result files. Every number on the page is read from that file or computed from it
// here (ratios, shares of channels, seed means), and each panel names the file it came from.

const SVGNS = 'http://www.w3.org/2000/svg';
const $ = (sel, root = document) => root.querySelector(sel);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

let D = null;          // data.json
let BY_RUN = {};       // run tag -> postprocess entry
let COLORS = {};

const state = {
  tab: 'spectra',
  spec: { i: null },
  probes: { dir: 'cross_lab_ibl_to_allen', seed: 0, config: 'finetune', smooth: true },
  transfer: { metric: 'margin', stage: 'spatial' },
  calib: { dir: 'cross_lab_ibl_to_allen', config: 'finetune', seed: 0, when: 'before' },
};

// ---------------------------------------------------------------- helpers

function svg(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function h(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) {
    node.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
  }
  return node;
}

const MINUS = '−';
// A value that rounds to zero is printed without a sign.
const signed = (v, d = 2) => { const t = Math.abs(v).toFixed(d); return (Number(t) === 0 ? '' : v < 0 ? MINUS : '+') + t; };
const fixed = (v, d = 2) => (v < 0 ? MINUS + Math.abs(v).toFixed(d) : v.toFixed(d));
const pct = (v) => `${Math.round(v * 100)}%`;
const int = (v) => Math.round(v).toLocaleString('en-US');
const times = (r) => (r < 10 ? r.toFixed(1) : int(r)) + '×';
const sci = (v) => {
  const e = Math.floor(Math.log10(v));
  const m = v / 10 ** e;
  return `${m.toFixed(1)}e${e}`;
};
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const pow10 = (e) => (e === 0 ? '1' : e === 1 ? '10' : e === 2 ? '100' : '10' + String(e).split('').map((c) => SUP[c]).join(''));

function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
  return ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / (xs[hi] - xs[lo]);
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };

const blob = (path) => `${D.source.repo}/blob/${D.source.commit}/${path}`;
const tree = (path) => `${D.source.repo}/tree/${D.source.commit}/${path}`;
function cite(...items) {
  // items: [label, path] pairs or plain strings
  const parts = ['Source: '];
  items.forEach((it, i) => {
    if (i) parts.push(' · ');
    if (typeof it === 'string') parts.push(it);
    else parts.push(h('a', { href: it[2] === 'tree' ? tree(it[1]) : blob(it[1]), target: '_blank', rel: 'noopener', text: it[0] }));
  });
  return parts;
}
function setCite(id, ...items) { const el = $(id); el.replaceChildren(...cite(...items)); }

const runTag = (dir, seed, config) => `${dir}__all_target_groups__seed${seed}${config === 'finetune__lp100' ? '__lp100' : ''}`;
const DIR_LABEL = { cross_lab_ibl_to_allen: 'IBL → Allen', cross_lab_allen_to_ibl: 'Allen → IBL' };

function seg(label, options, current, onPick, extra = {}) {
  const group = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  for (const opt of options) {
    group.appendChild(h('button', {
      type: 'button',
      'aria-pressed': String(opt.value === current),
      disabled: opt.disabled || false,
      title: opt.title,
      onclick: () => onPick(opt.value),
      text: opt.label,
    }));
  }
  return h('div', { class: 'ctl', ...extra }, h('span', { class: 'label', text: label }), group);
}

// One tooltip for the page; values via textContent only.
const tip = $('#tip');
function showTip(evt, lines) {
  tip.replaceChildren(...lines.map((ln, i) => {
    const row = h('div');
    if (Array.isArray(ln)) { row.appendChild(h('b', { text: ln[0] })); row.appendChild(document.createTextNode(' ' + ln[1])); }
    else if (i === 0) row.appendChild(h('b', { text: ln }));
    else row.textContent = ln;
    return row;
  }));
  tip.hidden = false;
  const pad = 12, w = tip.offsetWidth, ht = tip.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + w > window.innerWidth - 4) x = Math.max(4, evt.clientX - w - pad);
  if (y + ht > window.innerHeight - 4) y = Math.max(4, evt.clientY - ht - pad);
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}
const hideTip = () => { tip.hidden = true; };
// Mouse: show on move, hide on leave. Touch and pen: a tap shows it and it stays until the next
// tap elsewhere, since lifting a finger fires pointerleave straight away.
const leaveTip = (e) => { if (e.pointerType === 'mouse') hideTip(); };
function hover(el, lines) {
  const show = (e) => showTip(e, lines(e));
  el.addEventListener('pointermove', show);
  el.addEventListener('pointerdown', show);
  el.addEventListener('pointerleave', leaveTip);
  el.dataset.tip = '';
}
document.addEventListener('pointerdown', (e) => { if (!e.target.closest || !e.target.closest('[data-tip]')) hideTip(); }, true);

function axisText(parent, x, y, text, attrs = {}) {
  const t = svg('text', { x, y, fill: css('--muted'), 'font-size': 11, ...attrs }, parent);
  t.textContent = text;
  return t;
}

// ---------------------------------------------------------------- tabs

const TABS = ['spectra', 'probes', 'transfer', 'calib'];
const RENDER = {};

function selectTab(name, focus = false) {
  state.tab = name;
  for (const t of TABS) {
    const tab = $(`#t-${t}`), panel = $(`#p-${t}`);
    const on = t === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    panel.hidden = !on;
  }
  hideTip();
  if (focus) $(`#t-${name}`).focus({ preventScroll: true });
  RENDER[name]();
}

function wireTabs() {
  for (const t of TABS) {
    const tab = $(`#t-${t}`);
    tab.addEventListener('click', () => selectTab(t));
    tab.addEventListener('keydown', (e) => {
      const i = TABS.indexOf(t);
      let next = null;
      if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
      else if (e.key === 'ArrowLeft') next = TABS[(i + TABS.length - 1) % TABS.length];
      else if (e.key === 'Home') next = TABS[0];
      else if (e.key === 'End') next = TABS[TABS.length - 1];
      if (next) { e.preventDefault(); selectTab(next, true); }
    });
  }
}

// ---------------------------------------------------------------- spectra

let SPEC = null; // prepared series

function prepSpectra() {
  const S = D.spectra;
  const lab = (name) => {
    const f = S[name].f, p = S[name].psd;
    const ref = interp(f, p, S.ref_hz);
    const pts = [];
    for (let i = 0; i < f.length; i++) if (f[i] > 0.5) pts.push([f[i], p[i] / ref]); // skip 0 Hz only
    return { f, p, ref, pts };
  };
  const ibl = lab('ibl'), allen = lab('allen');
  // D11's measure: Allen and IBL each normalised to its own 10 Hz value, Allen interpolated
  // onto the frequency asked for, as scripts/make_figures.py does with np.interp.
  const ratio = (hz) => (interp(allen.f, allen.p, hz) / allen.ref) / (interp(ibl.f, ibl.p, hz) / ibl.ref);
  const nearest = (hz) => {
    let best = 0;
    for (let i = 1; i < ibl.pts.length; i++) if (Math.abs(ibl.pts[i][0] - hz) < Math.abs(ibl.pts[best][0] - hz)) best = i;
    return best;
  };
  SPEC = { ibl, allen, ratio, nearest };
  state.spec.i = nearest(500);
}

function renderSpectra() {
  const host = $('#spec-chart');
  host.replaceChildren();
  const S = D.spectra;
  const { ibl, allen, ratio } = SPEC;
  const W = Math.max(280, host.clientWidth);
  const H = Math.round(Math.max(250, Math.min(410, W * 0.54)));
  const narrow = W < 560;
  const m = { l: 44, r: 14, t: narrow ? 48 : 34, b: 34 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const fMin = 0.95, fMax = 640;
  const all = ibl.pts.concat(allen.pts).map((p) => p[1]);
  const eLo = Math.floor(Math.log10(Math.min(...all))), eHi = Math.ceil(Math.log10(Math.max(...all)));
  const X = (f) => m.l + (Math.log10(f) - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin)) * pw;
  const Y = (v) => m.t + (eHi - Math.log10(v)) / (eHi - eLo) * ph;

  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, host);
  const g = svg('g', {
    class: 'focusable', tabindex: 0, role: 'slider',
    'aria-label': 'Frequency readout for the spectra chart',
    'aria-valuemin': 1, 'aria-valuemax': Math.round(ibl.pts[ibl.pts.length - 1][0]),
  }, root);
  svg('rect', { class: 'plot-frame', x: m.l, y: m.t, width: pw, height: ph, fill: 'none', stroke: 'transparent', rx: 2 }, g);

  // above IBL's 300 Hz corner
  svg('rect', { x: X(300), y: m.t, width: X(fMax) - X(300), height: ph, fill: css('--text'), 'fill-opacity': 0.045 }, g);
  axisText(g, X(fMax) - 4, m.t + 14, '> 300 Hz', { fill: css('--text-2'), 'text-anchor': 'end' });
  if (W >= 520) axisText(g, X(300) - 6, m.t + 14, 'IBL band-pass corner', { fill: css('--text-2'), 'text-anchor': 'end' });

  // grid + ticks
  for (let e = eLo; e <= eHi; e++) {
    svg('line', { x1: m.l, x2: m.l + pw, y1: Y(10 ** e), y2: Y(10 ** e), stroke: css('--grid') }, g);
    if ((eHi - eLo) <= 8 || e % 2 === 0) axisText(g, m.l - 6, Y(10 ** e) + 4, pow10(e), { 'text-anchor': 'end' });
  }
  const xt = W < 520 ? [1, 10, 100, 300, 600] : [1, 3, 10, 30, 100, 300, 600];
  for (const f of xt) {
    svg('line', { x1: X(f), x2: X(f), y1: m.t, y2: m.t + ph, stroke: css('--grid') }, g);
    axisText(g, X(f), m.t + ph + 16, String(f), { 'text-anchor': 'middle' });
  }
  axisText(g, m.l + pw, m.t + ph + 30, 'frequency (Hz)', { 'text-anchor': 'end' });
  axisText(g, m.l - 40, narrow ? 12 : m.t - 14, 'power ÷ power at 10 Hz', {});
  svg('line', { x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph, stroke: css('--axis') }, g);

  // the fix's corner
  svg('line', { x1: X(100), x2: X(100), y1: m.t, y2: m.t + ph, stroke: css('--accent'), 'stroke-width': 1.5 }, g);
  axisText(g, X(100) - 6, m.t + ph - 8, '100 Hz', { 'text-anchor': 'end', fill: css('--accent-hi') });

  const path = (pts) => 'M' + pts.map(([f, v]) => `${X(f).toFixed(1)},${Y(v).toFixed(1)}`).join('L');
  svg('path', { d: path(allen.pts), fill: 'none', stroke: css('--allen'), 'stroke-width': 1.75, 'stroke-linejoin': 'round' }, g);
  svg('path', { d: path(ibl.pts), fill: 'none', stroke: css('--ibl'), 'stroke-width': 1.75, 'stroke-linejoin': 'round' }, g);

  // crosshair
  const cross = svg('line', { y1: m.t, y2: m.t + ph, stroke: css('--text'), 'stroke-opacity': 0.55 }, g);
  const dotI = svg('circle', { r: 4.5, fill: css('--ibl'), stroke: css('--bg'), 'stroke-width': 2 }, g);
  const dotA = svg('circle', { r: 4.5, fill: css('--allen'), stroke: css('--bg'), 'stroke-width': 2 }, g);
  const label = svg('text', { y: m.t - (narrow ? 10 : 14), fill: css('--text'), 'font-size': 12, 'font-weight': 600 }, g);

  const overlay = svg('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent', style: 'touch-action: pan-y; cursor: crosshair' }, g);

  const update = () => {
    const i = state.spec.i;
    const [f, vI] = ibl.pts[i];
    const vA = interp(allen.f, allen.p, f) / allen.ref;
    const r = ratio(f);
    const x = X(f);
    cross.setAttribute('x1', x); cross.setAttribute('x2', x);
    dotI.setAttribute('cx', x); dotI.setAttribute('cy', Y(vI));
    dotA.setAttribute('cx', x); dotA.setAttribute('cy', Y(vA));
    const text = `${Math.round(f)} Hz · Allen ${times(r)} IBL`;
    label.textContent = text;
    const lw = text.length * 7.2;
    label.setAttribute('x', narrow ? m.l + pw - lw : Math.min(Math.max(m.l, x - lw / 2), m.l + pw - lw));
    g.setAttribute('aria-valuenow', Math.round(f));
    g.setAttribute('aria-valuetext', `${Math.round(f)} hertz, Allen power ${times(r)} IBL's`);
    $('#spec-ratio').replaceChildren(times(r), h('small', { text: `at ${Math.round(f)} Hz` }));
    $('#spec-detail').replaceChildren(
      'Allen ', h('b', { text: sci(vA) }), ', IBL ', h('b', { text: sci(vI) }),
      ', each as a fraction of its own power at 10 Hz.',
    );
    for (const row of document.querySelectorAll('#spec-table tr.jump')) row.classList.toggle('on', +row.dataset.i === i);
  };

  const pick = (evt) => {
    const rect = root.getBoundingClientRect();
    const px = evt.clientX - rect.left;
    const f = 10 ** (Math.log10(fMin) + (px - m.l) / pw * (Math.log10(fMax) - Math.log10(fMin)));
    state.spec.i = SPEC.nearest(Math.min(Math.max(f, 1), fMax));
    update();
  };
  overlay.addEventListener('pointerdown', pick);
  overlay.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) pick(e); });
  g.addEventListener('keydown', (e) => {
    const n = ibl.pts.length;
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 25, PageDown: -25 }[e.key];
    let i = state.spec.i;
    if (step !== undefined) i += e.shiftKey ? step * 10 : step;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = n - 1;
    else return;
    e.preventDefault();
    state.spec.i = Math.min(n - 1, Math.max(0, i));
    update();
  });

  // checkpoint table, from export_data.py's Python computation of the same measure
  const table = $('#spec-table');
  table.replaceChildren(
    h('tr', {}, h('th', { text: 'Hz' }), h('th', { text: 'this file' }), h('th', { text: 'D11 table' })),
    ...S.checkpoints.map((c) => {
      const i = SPEC.nearest(c.hz);
      return h('tr', {
        class: 'jump', 'data-i': i, tabindex: 0, title: `Move the readout to ${c.hz} Hz`,
        onclick: () => { state.spec.i = i; update(); },
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.spec.i = i; update(); } },
      }, h('td', { text: String(c.hz) }), h('td', { text: times(c.from_csv) }), h('td', { text: times(c.d11) }));
    }),
  );
  const mx = S.max_ratio;
  $('#spec-note').replaceChildren(
    `Same measure as D11. ${S.file.split('/').pop()} is the 4,000-chunk subsample behind the README’s spectra figure; D11 does not name its sample, and its table differs slightly. The file’s largest ratio is ${times(mx.ratio)}, on a narrow Allen line at ${Math.round(mx.hz)} Hz.`,
  );
  update();
}

// ---------------------------------------------------------------- probes

function classColor(c) { return COLORS[c]; }

function renderProbes() {
  const st = state.probes;
  const P = D.probes[st.dir];
  const tag = runTag(st.dir, st.seed, st.config);
  const run = P.runs[tag];
  const stage = st.smooth ? 'spatial' : 'temporal';
  const truth = P.label, pred = run[stage];
  const N = truth.length;

  const ctl = $('#probe-controls');
  ctl.replaceChildren(
    seg('Train → test', Object.keys(DIR_LABEL).map((v) => ({ value: v, label: DIR_LABEL[v] })), st.dir, (v) => { st.dir = v; renderProbes(); }),
    seg('Input', [{ value: 'finetune', label: 'Full band' }, { value: 'finetune__lp100', label: '100 Hz low-pass' }], st.config, (v) => { st.config = v; renderProbes(); }),
    seg('Seed', [0, 1, 2].map((s) => ({ value: s, label: String(s) })), st.seed, (v) => { st.seed = v; renderProbes(); }),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: st.smooth, onchange: (e) => { st.smooth = e.target.checked; renderProbes(); } }),
      'Neighbour vote (paper’s spatial step)'),
  );

  const used = [...new Set(truth + pred)].map(Number).sort();
  $('#probe-legend').replaceChildren(
    ...used.map((c) => h('span', {}, h('i', { class: 'key', style: `background:${classColor(c)}` }), D.classes[c])),
    h('span', { class: 'muted', text: `y: µm from probe tip · ${D.classes.filter((_, c) => !used.includes(c)).join(', ')} not present` }));

  // chart
  const host = $('#probe-chart');
  host.replaceChildren();
  const W = Math.max(280, host.clientWidth);
  const H = Math.round(Math.max(300, Math.min(372, W * 0.5)));
  const m = { l: 46, r: 4, t: 8, b: 22 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  let dMin = Infinity, dMax = -Infinity;
  const spacing = {};
  for (const gr of P.groups) {
    const ds = [...new Set(gr.depth_um)].sort((a, b) => a - b);
    let sp = Infinity;
    for (let i = 1; i < ds.length; i++) sp = Math.min(sp, ds[i] - ds[i - 1]);
    spacing[gr.id] = sp;
    dMin = Math.min(dMin, ds[0] - sp); dMax = Math.max(dMax, ds[ds.length - 1] + sp);
  }
  const Y = (d) => m.t + (dMax - d) / (dMax - dMin) * ph;
  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `${P.groups.length} ${P.test} insertions, histology label beside prediction for each channel. Counts are in the table beside the chart.` }, host);
  const tickStep = (dMax - dMin) > 3000 ? 1000 : 500;
  for (let d = Math.ceil(dMin / tickStep) * tickStep; d <= dMax; d += tickStep) {
    svg('line', { x1: m.l, x2: m.l + pw, y1: Y(d), y2: Y(d), stroke: css('--grid') }, root);
    axisText(root, m.l - 6, Y(d) + 4, int(d), { 'text-anchor': 'end' });
  }

  const n = P.groups.length;
  const slot = pw / n;
  const gap = Math.min(12, slot * 0.22);
  const colW = slot - gap;
  const truthW = Math.max(3, Math.round(colW * 0.26));
  const predX0 = truthW + 2;
  const predW = colW - predX0;
  const cells = svg('g', {}, root);
  P.groups.forEach((gr, gi) => {
    const x0 = m.l + gi * slot + gap / 2;
    const sp = spacing[gr.id];
    // channels sharing a depth (IBL's staggered pairs) split the strip side by side
    const byDepth = new Map();
    gr.depth_um.forEach((d, k) => { if (!byDepth.has(d)) byDepth.set(d, []); byDepth.get(d).push(k); });
    for (const [d, ks] of byDepth) {
      // +0.6 px overlap so neighbouring channels of one region read as one block, not stripes
      const y = Y(d + sp / 2), hgt = Math.max(1, Y(d - sp / 2) - Y(d + sp / 2)) + 0.6;
      ks.forEach((k, j) => {
        const idx = gr.start + k;
        const tw = truthW / ks.length, pwid = predW / ks.length;
        svg('rect', { class: 'cell', x: (x0 + j * tw).toFixed(2), y: y.toFixed(2), width: tw.toFixed(2), height: hgt.toFixed(2), fill: classColor(+truth[idx]), 'data-k': idx }, cells);
        svg('rect', { class: 'cell', x: (x0 + predX0 + j * pwid).toFixed(2), y: y.toFixed(2), width: pwid.toFixed(2), height: hgt.toFixed(2), fill: classColor(+pred[idx]), 'data-k': idx }, cells);
      });
    }
    axisText(root, x0 + colW / 2, m.t + ph + 16, String(gi + 1), { 'text-anchor': 'middle' });
  });
  const groupOf = (idx) => P.groups.find((gr) => idx >= gr.start && idx < gr.start + gr.channel.length);
  const onCell = (e) => {
    const k = e.target.getAttribute && e.target.getAttribute('data-k');
    if (k === null) return hideTip();
    const idx = +k, gr = groupOf(idx), j = idx - gr.start;
    const ok = truth[idx] === pred[idx];
    showTip(e, [
      `${gr.id} · channel ${gr.channel[j]}`,
      `${int(gr.depth_um[j])} µm from tip`,
      ['label', D.classes[+truth[idx]]],
      ['predicted', D.classes[+pred[idx]] + (ok ? '' : '  (wrong)')],
    ]);
  };
  cells.addEventListener('pointermove', onCell);
  cells.addEventListener('pointerdown', onCell);
  cells.addEventListener('pointerleave', leaveTip);
  cells.dataset.tip = '';

  // side
  const count = (s) => { const c = new Array(D.classes.length).fill(0); for (const ch of s) c[+ch]++; return c; };
  const tc = count(truth), pc = count(pred);
  const top = pc.indexOf(Math.max(...pc));
  const row = BY_RUN[tag].stages[stage].channel;
  const chunk = D.chunks[tag];
  const cal = D.calibration[tag];
  const ctop = chunk.predicted.indexOf(Math.max(...chunk.predicted));
  const side = $('#probe-side');
  side.replaceChildren(
    h('div', { class: 'card' },
      h('h2', { text: `${DIR_LABEL[st.dir]} · seed ${st.seed}` }),
      h('div', { class: 'big' }, pct(pc[top] / N), h('small', { text: `of ${int(N)} ${P.test} channels predicted ${D.classes[top]}` })),
      h('p', {}, 'Balanced accuracy ', h('b', { text: row.balanced_accuracy.toFixed(2) }), ` (chance ${row.chance.toFixed(2)}); raw `, h('b', { text: row.raw_accuracy.toFixed(2) }), ` against a majority rate of ${row.majority.toFixed(2)}.`),
      h('p', {}, 'Per chunk, before post-processing: ', h('b', { text: pct(chunk.predicted[ctop] / chunk.n_chunks) }), ` of ${int(chunk.n_chunks)} predicted ${D.classes[ctop]}, at a mean confidence of `, h('b', { text: cal.cross_lab.mean_confidence_before.toFixed(2) }), '.'),
    ),
    h('div', { class: 'card' },
      h('h2', { text: 'Channels per region' }),
      h('table', {},
        h('tr', {}, h('th', { text: 'region' }), h('th', { text: 'label' }), h('th', { text: 'predicted' })),
        ...used.map((c) => h('tr', {}, h('td', {}, h('i', { class: 'key', style: `background:${classColor(c)}` }), D.classes[c]), h('td', { text: String(tc[c]) }), h('td', { text: String(pc[c]) }))),
      ),
    ),
  );
  setCite('#probe-cite',
    [`postprocess/${tag}__channels.csv`, `results/postprocess/${tag}__channels.csv`],
    [`postprocess/${tag}.csv`, BY_RUN[tag].file],
    [chunk.file.replace('results/', '').replace(`/${tag}/`, '/…/'), chunk.file],
    [cal.file.replace('results/', ''), cal.file]);
}

// ---------------------------------------------------------------- transfer

const ROWS = [
  { config: 'finetune', label: 'Fine-tuned, full band', color: '--text-2' },
  { config: 'finetune__lp100', label: 'Fine-tuned, 100 Hz low-pass', color: '--accent' },
  { config: 'finetune__whiten', label: 'Fine-tuned, per-probe whitening', color: '--muted' },
  { config: 'baseline_w2v2_frozen_lp100', label: 'Untrained checkpoint + linear head, 100 Hz', color: '--muted' },
  { config: 'baseline_bandpower_full', label: 'Band power (control)', color: '--muted' },
  { config: 'baseline_position', label: 'Electrode position (control)', color: '--muted' },
];

function transferValue(run) {
  const r = run.stages[state.transfer.stage].chunk;
  return state.transfer.metric === 'margin' ? r.raw_accuracy - r.majority : r.balanced_accuracy;
}

// The summary sentences are built from the same files, on the margin metric and current stage.
function readingCard() {
  const stage = state.transfer.stage;
  const marginOf = (run) => { const c = run.stages[stage].chunk; return c.raw_accuracy - c.majority; };
  const pick = (dir, config) => D.runs.filter((r) => r.kind === 'cross_lab' && r.direction === dir && r.config === config).map(marginOf);
  const dirs = Object.keys(DIR_LABEL);
  const full = dirs.flatMap((d) => pick(d, 'finetune'));
  const fmt = (vals) => signed(mean(vals)) + (vals.length > 1 ? ` ± ${sd(vals).toFixed(2)}` : '');
  const lp = dirs.map((d) => [d, pick(d, 'finetune__lp100')]);
  const frozen = dirs.map((d) => [d, pick(d, 'baseline_w2v2_frozen_lp100')]);
  return h('div', { class: 'card' },
    h('h2', { text: `Margins, ${stage === 'raw' ? 'per chunk' : 'post-processed'}` }),
    h('p', {}, `Full band, all ${full.length} fine-tunes: `, h('b', { text: signed(Math.min(...full)) }), ' to ', h('b', { text: signed(Math.max(...full)) }), '.'),
    h('p', {}, '100 Hz low-pass: ', ...lp.flatMap(([d, v], i) => [i ? '; ' : '', `${DIR_LABEL[d]} `, h('b', { text: fmt(v) }), ` (published ${signed(D.published.cross_lab[d].margin)})`]), '.'),
    h('p', {}, 'Untrained checkpoint, same inputs: ', ...frozen.flatMap(([d, v], i) => [i ? ', ' : '', `${DIR_LABEL[d]} `, h('b', { text: fmt(v) })]), '.'),
  );
}

function renderTransfer() {
  const st = state.transfer;
  const margin = st.metric === 'margin';
  $('#transfer-lede').textContent = margin
    ? 'Margin: raw accuracy minus the test lab’s majority-class rate, the paper’s cross-lab metric. Dots are seeds, the tick is their mean, the dashed line is the published margin. Post-processed adds the paper’s per-channel vote and neighbour smoothing.'
    : 'Balanced accuracy: the mean recall over the regions the test lab contains. The paper gives its cross-lab result only as raw accuracy, so there is no published line. Post-processed adds the paper’s per-channel vote and neighbour smoothing.';
  $('#transfer-controls').replaceChildren(
    seg('Metric', [{ value: 'margin', label: 'Margin', title: 'Raw accuracy minus the majority-class rate' }, { value: 'balanced', label: 'Balanced', title: 'Balanced accuracy' }], st.metric, (v) => { st.metric = v; renderTransfer(); }),
    seg('Stage', [{ value: 'raw', label: 'Per chunk', title: 'Each three-second chunk on its own' }, { value: 'spatial', label: 'Post-processed', title: 'The paper’s per-channel vote and neighbour smoothing' }], st.stage, (v) => { st.stage = v; renderTransfer(); }),
  );

  const dirs = Object.keys(DIR_LABEL);
  const facets = dirs.map((dir) => ({
    dir,
    rows: ROWS.map((r) => {
      const runs = D.runs.filter((x) => x.kind === 'cross_lab' && x.direction === dir && x.config === r.config && x.stages[st.stage]);
      runs.sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
      return { ...r, runs, values: runs.map(transferValue) };
    }).filter((r) => r.runs.length),
    chance: D.runs.find((x) => x.direction === dir).stages[st.stage].chunk.chance,
    published: D.published.cross_lab[dir].margin,
  }));
  const vals = facets.flatMap((f) => f.rows.flatMap((r) => r.values));
  const refs = margin ? [0, ...facets.map((f) => f.published)] : facets.map((f) => f.chance);
  let lo = Math.min(...vals, ...refs), hi = Math.max(...vals, ...refs);
  lo = Math.floor((lo - 0.02) * 20) / 20; hi = Math.ceil((hi + 0.02) * 20) / 20;

  const host = $('#transfer-chart');
  host.replaceChildren();
  const W = Math.max(280, host.clientWidth);
  const cols = W >= 520 ? 2 : 1;
  const fw = (W - (cols - 1) * 24) / cols;
  const rowH = 40, headH = 26, axisH = 28;
  const fh = headH + facets[0].rows.length * rowH + axisH;
  const H = cols === 2 ? fh : fh * 2 + 16;
  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': 'Cross-lab results per configuration and seed; each mean is printed beside its row.' }, host);

  facets.forEach((fc, fi) => {
    const ox = cols === 2 ? fi * (fw + 24) : 0;
    const oy = cols === 2 ? 0 : fi * (fh + 16);
    const g = svg('g', { transform: `translate(${ox},${oy})` }, root);
    const m = { l: 6, r: 88 };
    const X = (v) => m.l + (v - lo) / (hi - lo) * (fw - m.l - m.r);
    const top = headH, bottom = headH + fc.rows.length * rowH;
    const title = svg('text', { x: 0, y: 15, fill: css('--text'), 'font-size': 13, 'font-weight': 600, style: 'font-family: var(--sans)' }, g);
    title.textContent = `Train ${DIR_LABEL[fc.dir].replace(' → ', ', test ')}`;
    const step = (hi - lo) > 0.5 ? 0.2 : 0.1;
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) {
      svg('line', { x1: X(v), x2: X(v), y1: top, y2: bottom, stroke: css('--grid') }, g);
      const tv = Math.abs(v) < 1e-9 ? 0 : v;
      axisText(g, X(v), bottom + 16, margin ? (tv === 0 ? '0' : signed(tv, 1)) : tv.toFixed(1), { 'text-anchor': 'middle' });
    }
    const refV = margin ? 0 : fc.chance;
    svg('line', { x1: X(refV), x2: X(refV), y1: top - 4, y2: bottom, stroke: css('--axis'), 'stroke-width': 1.5 }, g);
    axisText(g, X(refV) + 4, bottom + 27, margin ? 'majority rate' : `chance ${fc.chance.toFixed(2)}`, { 'font-size': 10 });
    if (margin) {
      svg('line', { x1: X(fc.published), x2: X(fc.published), y1: top - 4, y2: bottom, stroke: css('--accent-hi'), 'stroke-dasharray': '4 3', 'stroke-width': 1.5 }, g);
      const pt = axisText(g, X(fc.published) + 4, top - 6, `published ${signed(fc.published)}`, { fill: css('--accent-hi'), 'font-size': 10.5 });
      if (X(fc.published) + 110 > fw) { pt.setAttribute('text-anchor', 'end'); pt.setAttribute('x', X(fc.published) - 4); }
    }
    fc.rows.forEach((r, ri) => {
      const y = top + ri * rowH;
      const lab = svg('text', { x: m.l, y: y + 13, fill: css('--text-2'), 'font-size': 11.5, style: 'font-family: var(--sans)' }, g);
      lab.textContent = r.label + (r.runs.length > 1 ? ` (${r.runs.length} seeds)` : r.config.startsWith('finetune') ? ' (seed 0)' : '');
      const cy = y + 27;
      svg('line', { x1: X(lo), x2: X(hi), y1: cy, y2: cy, stroke: css('--line') }, g);
      const color = css(r.color);
      const mu = mean(r.values), s = sd(r.values);
      r.runs.forEach((run, k) => {
        const v = r.values[k];
        svg('circle', { cx: X(v), cy, r: 5, fill: color, stroke: css('--bg'), 'stroke-width': 2, 'fill-opacity': r.values.length > 1 ? 0.75 : 1 }, g);
        const hit = svg('circle', { cx: X(v), cy, r: 12, fill: 'transparent' }, g);
        const c = run.stages[st.stage].chunk;
        hover(hit, () => [
          `${margin ? signed(v, 3) : v.toFixed(3)} · ${r.label}${run.seed !== null && run.seed !== undefined ? `, seed ${run.seed}` : ''}`,
          `raw ${c.raw_accuracy.toFixed(3)}, majority ${c.majority.toFixed(3)}, balanced ${c.balanced_accuracy.toFixed(3)}`,
          `${int(c.n)} chunks · ${run.file.split('/').pop()}`,
        ]);
      });
      if (r.values.length > 1) {
        svg('line', { x1: X(mu), x2: X(mu), y1: cy - 9, y2: cy + 9, stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'pointer-events': 'none' }, g);
      }
      const txt = svg('text', { x: fw - m.r + 8, y: cy + 4, fill: css('--text'), 'font-size': 11.5 }, g);
      txt.textContent = (margin ? signed(mu) : mu.toFixed(2)) + (s !== null ? ` ±${s.toFixed(2)}` : '');
    });
  });

  // within a lab
  const loso = D.runs.filter((r) => r.kind === 'loso');
  const lv = loso.map((r) => r.stages[st.stage].chunk.balanced_accuracy);
  const pub = D.published.within.within_ibl;
  const ch = loso.map((r) => r.stages[st.stage].chunk.chance);
  const chanceRange = Math.min(...ch) === Math.max(...ch) ? Math.min(...ch).toFixed(2) : `${Math.min(...ch).toFixed(2)} to ${Math.max(...ch).toFixed(2)}`;
  const side = $('#transfer-side');
  const mini = h('div', { class: 'chart' });
  side.replaceChildren(
    h('div', { class: 'card' },
      h('h2', { text: 'Within one lab, for scale' }),
      h('div', { class: 'big' }, `${mean(lv).toFixed(2)} ± ${sd(lv).toFixed(2)}`, h('small', { text: `balanced accuracy, ${loso.length} held-out IBL sessions` })),
      h('p', {}, 'The paper reports ', h('b', { text: pub.toFixed(2) }), ' (its Figure 2a). Chance is ', h('b', { text: chanceRange }), ', set by how many regions a session has.'),
      mini,
    ),
    readingCard(),
  );
  // mini strip chart
  const MW = Math.max(220, mini.clientWidth), MH = 58;
  const mlo = Math.min(...lv, pub) - 0.05, mhi = Math.max(...lv, pub) + 0.05;
  const MX = (v) => 8 + (v - mlo) / (mhi - mlo) * (MW - 16);
  const ms = svg('svg', { width: MW, height: MH, viewBox: `0 0 ${MW} ${MH}`, role: 'img', 'aria-label': `${loso.length} sessions between ${Math.min(...lv).toFixed(2)} and ${Math.max(...lv).toFixed(2)}; the paper reports ${pub.toFixed(2)}.` }, mini);
  svg('line', { x1: 8, x2: MW - 8, y1: 26, y2: 26, stroke: css('--line') }, ms);
  svg('line', { x1: MX(pub), x2: MX(pub), y1: 10, y2: 40, stroke: css('--accent-hi'), 'stroke-dasharray': '4 3', 'stroke-width': 1.5 }, ms);
  axisText(ms, MX(pub), 54, `paper ${pub.toFixed(2)}`, { 'text-anchor': 'middle', fill: css('--accent-hi'), 'font-size': 10.5 });
  svg('line', { x1: MX(mean(lv)), x2: MX(mean(lv)), y1: 18, y2: 34, stroke: css('--accent'), 'stroke-width': 2.5, 'stroke-linecap': 'round' }, ms);
  loso.forEach((r, k) => {
    svg('circle', { cx: MX(lv[k]), cy: 26, r: 5, fill: css('--accent'), 'fill-opacity': 0.75, stroke: css('--surface'), 'stroke-width': 2 }, ms);
    const hit = svg('circle', { cx: MX(lv[k]), cy: 26, r: 12, fill: 'transparent' }, ms);
    hover(hit, () => [`${lv[k].toFixed(3)} · session ${r.session}`, r.file.split('/').pop()]);
  });

  // the table view of every dot
  const rows = facets.flatMap((fc) => fc.rows.flatMap((r) => r.runs.map((run, k) => {
    const c = run.stages[st.stage].chunk;
    return h('tr', {},
      h('td', { text: DIR_LABEL[fc.dir] }), h('td', { text: r.label }), h('td', { text: run.seed === null || run.seed === undefined ? '' : String(run.seed) }),
      h('td', { text: c.raw_accuracy.toFixed(3) }), h('td', { text: c.majority.toFixed(3) }),
      h('td', { text: signed(c.raw_accuracy - c.majority, 3) }), h('td', { text: c.balanced_accuracy.toFixed(3) }));
  })));
  $('#transfer-values .scroll-x').replaceChildren(h('table', {},
    h('tr', {}, ...['direction', 'configuration', 'seed', 'raw', 'majority', 'margin', 'balanced'].map((t) => h('th', { text: t }))),
    ...rows));

  setCite('#transfer-cite',
    ['results/postprocess/*.csv', 'results/postprocess', 'tree'],
    ['published margins: docs/RESULTS_FIXES.md', D.published.cross_lab_file],
    ['within-lab: README.md', D.published.within.file]);
}

// ---------------------------------------------------------------- calibration

function reliability(host, title, block, when) {
  const rel = block[`reliability_${when}`];
  const ece = block[`ece_${when}`];
  const wrap = h('div', {});
  wrap.appendChild(h('div', { class: 'calib-head' },
    h('h3', { text: title }),
    h('span', { class: 'chip' }, 'ECE ', h('b', { text: ece.toFixed(2) }), ` · ${int(block.n_samples)} chunks`)));
  const box = h('div', { class: 'chart' });
  wrap.appendChild(box);
  host.appendChild(wrap);
  const W = Math.max(240, box.clientWidth);
  const side = Math.min(W - 44, 440);           // plot width
  const tall = Math.min(side, 270);              // plot height
  const m = { l: 34, t: 6 };
  const stripH = 30;
  const H = m.t + tall + 22 + stripH + 18;
  const X = (v) => m.l + v * side, Y = (v) => m.t + (1 - v) * tall;
  const SW = m.l + side + 6;
  const root = svg('svg', { width: SW, height: H, viewBox: `0 0 ${SW} ${H}`, role: 'img',
    'aria-label': `${title}: expected calibration error ${ece.toFixed(2)}.` }, box);
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    svg('line', { x1: X(0), x2: X(1), y1: Y(v), y2: Y(v), stroke: css('--grid') }, root);
    axisText(root, m.l - 5, Y(v) + 4, v.toFixed(v % 0.5 ? 2 : 1), { 'text-anchor': 'end', 'font-size': 10 });
    axisText(root, X(v), m.t + tall + 14, v.toFixed(v % 0.5 ? 2 : 1), { 'text-anchor': 'middle', 'font-size': 10 });
  }
  svg('line', { x1: X(0), y1: Y(0), x2: X(1), y2: Y(1), stroke: css('--text-2'), 'stroke-opacity': 0.6, 'stroke-dasharray': '3 3' }, root);
  const total = rel.count.reduce((s, v) => s + v, 0);
  const maxShare = Math.max(...rel.count) / total;
  const stripTop = m.t + tall + 22;
  rel.count.forEach((cnt, i) => {
    if (!cnt) return;
    const x0 = X(rel.lower[i]) + 1, w = Math.max(1, X(rel.upper[i]) - X(rel.lower[i]) - 2);
    const acc = rel.accuracy[i], conf = rel.confidence[i];
    svg('rect', { x: x0, y: Y(acc), width: w, height: Math.max(0, Y(0) - Y(acc)), fill: css('--accent'), 'fill-opacity': 0.85, rx: 2 }, root);
    svg('line', { x1: x0, x2: x0 + w, y1: Y(conf), y2: Y(conf), stroke: css('--text'), 'stroke-width': 2 }, root);
    const share = cnt / total;
    const sh = Math.max(1, share / maxShare * stripH);
    svg('rect', { x: x0, y: stripTop + stripH - sh, width: w, height: sh, fill: css('--muted'), rx: 1 }, root);
    const hit = svg('rect', { x: x0 - 1, y: m.t, width: w + 2, height: stripTop + stripH - m.t, fill: 'transparent' }, root);
    hover(hit, () => [
      `confidence ${rel.lower[i].toFixed(2)}–${rel.upper[i].toFixed(2)}`,
      ['accuracy', acc.toFixed(3)], ['mean confidence', conf.toFixed(3)],
      [int(cnt), `chunks (${pct(share)})`],
    ]);
  });
  axisText(root, X(1), stripTop + stripH + 13, 'share of chunks per bin', { 'text-anchor': 'end', 'font-size': 10 });
  axisText(root, X(0), stripTop + stripH + 13, 'confidence →', { 'font-size': 10 });
  wrap.style.maxWidth = `${SW}px`;
}

function renderCalib() {
  const st = state.calib;
  $('#calib-controls').replaceChildren(
    seg('Train → test', Object.keys(DIR_LABEL).map((v) => ({ value: v, label: DIR_LABEL[v] })), st.dir, (v) => { st.dir = v; renderCalib(); }),
    seg('Input', [{ value: 'finetune', label: 'Full band' }, { value: 'finetune__lp100', label: '100 Hz low-pass' }], st.config, (v) => { st.config = v; renderCalib(); }),
    seg('Seed', [0, 1, 2].map((s) => ({ value: s, label: String(s) })), st.seed, (v) => { st.seed = v; renderCalib(); }),
    seg('Temperature', [{ value: 'before', label: 'None' }, { value: 'after', label: 'Fitted in lab' }], st.when, (v) => { st.when = v; renderCalib(); }),
  );
  const tag = runTag(st.dir, st.seed, st.config);
  const C = D.calibration[tag];
  const host = $('#calib-charts');
  host.replaceChildren();
  const [train, test] = DIR_LABEL[st.dir].split(' → ');
  reliability(host, `In lab: held-out ${train} session`, C.in_lab, st.when);
  reliability(host, `Across labs: every ${test} probe`, C.cross_lab, st.when);
  const o = C.cross_lab_oracle;
  $('#calib-side').replaceChildren(
    h('div', { class: 'card' },
      h('h2', { text: 'Expected calibration error' }),
      h('table', {},
        h('tr', {}, h('th', { text: '' }), h('th', { text: 'no T' }), h('th', { text: `T ${C.temperature_in_lab.toFixed(2)}` })),
        h('tr', {}, h('td', { text: 'in lab' }), h('td', { text: C.in_lab.ece_before.toFixed(2) }), h('td', { text: C.in_lab.ece_after.toFixed(2) })),
        h('tr', {}, h('td', { text: 'across labs' }), h('td', { text: C.cross_lab.ece_before.toFixed(2) }), h('td', { text: C.cross_lab.ece_after.toFixed(2) })),
      ),
      h('p', {}, 'Accuracy across labs is ', h('b', { text: C.cross_lab.accuracy.toFixed(2) }), ' at a mean confidence of ', h('b', { text: C.cross_lab[`mean_confidence_${st.when}`].toFixed(2) }), st.when === 'after' ? ' with the in-lab temperature.' : ' with no temperature.'),
    ),
    h('div', { class: 'card' },
      h('h2', { text: 'The temperature it would need' }),
      h('div', { class: 'big' }, `T ${o.temperature.toFixed(2)}`, h('small', { text: `vs ${C.temperature_in_lab.toFixed(2)} fitted in lab` })),
      h('p', { text: `Fitted on the test lab’s own labels, which zero-shot transfer does not have, it would bring the cross-lab error to ${o.ece_after.toFixed(2)}.` }),
    ),
  );
  setCite('#calib-cite', [C.file, C.file]);
  const a = C.in_lab[`reliability_${st.when}`], b = C.cross_lab[`reliability_${st.when}`];
  const cell = (v) => (v === null ? '' : v.toFixed(3));
  $('#calib-values .scroll-x').replaceChildren(h('table', {},
    h('tr', {}, ...['confidence bin', 'in lab: chunks', 'accuracy', 'confidence', 'across: chunks', 'accuracy', 'confidence'].map((t) => h('th', { text: t }))),
    ...a.lower.map((lo, i) => h('tr', {},
      h('td', { text: `${lo.toFixed(2)}–${a.upper[i].toFixed(2)}` }),
      h('td', { text: int(a.count[i]) }), h('td', { text: cell(a.accuracy[i]) }), h('td', { text: cell(a.confidence[i]) }),
      h('td', { text: int(b.count[i]) }), h('td', { text: cell(b.accuracy[i]) }), h('td', { text: cell(b.confidence[i]) }))),
  ));
}

// ---------------------------------------------------------------- start

async function main() {
  const status = $('#status');
  try {
    const res = await fetch('data.json');
    if (!res.ok) throw new Error(`data.json: HTTP ${res.status}`);
    D = await res.json();
  } catch (err) {
    status.textContent = `Could not load the results: ${err.message}`;
    status.classList.add('error');
    return;
  }
  status.remove();
  for (const r of D.runs) BY_RUN[r.run] = r;
  D.classes.forEach((_, i) => { COLORS[i] = css(`--r${i}`); });
  const short = D.source.commit.slice(0, 7);
  $('#foot-source').replaceChildren('Source: ',
    h('a', { href: `${D.source.repo}/tree/${D.source.commit}`, target: '_blank', rel: 'noopener', text: `happyc0der/lfp2vec-audit @ ${short}` }),
    ` (${D.source.commit_date.slice(0, 10)})`);
  prepSpectra();
  setCite('#spec-cite', [D.spectra.file, D.spectra.file], ['method: DEVIATIONS.md D11', D.spectra.method_file], ['figure code', D.spectra.figure_code]);
  Object.assign(RENDER, { spectra: renderSpectra, probes: renderProbes, transfer: renderTransfer, calib: renderCalib });
  wireTabs();
  selectTab('spectra');
  let raf = 0, lastW = document.documentElement.clientWidth;
  new ResizeObserver(() => {
    const w = document.documentElement.clientWidth;
    if (w === lastW) return;
    lastW = w;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => RENDER[state.tab]());
  }).observe(document.documentElement);
  window.addEventListener('scroll', hideTip, { passive: true });
}

main();
