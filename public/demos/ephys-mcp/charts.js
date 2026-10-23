// SVG figures drawn from the arrays ephys-mcp's plot tools hand to plots.py (captured by
// py/plots_capture.py). Same panels and encodings as the repo's matplotlib figures, in the
// site's dark palette. Every chart has a hover/tap readout.

const NS = 'http://www.w3.org/2000/svg';
const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
const HEX = { s1: '#3987e5', s2: '#d95926', s3: '#199e70', s4: '#c98500' };

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
function text(parent, x, y, s, attrs = {}) {
  const t = el('text', { x, y, ...attrs }, parent);
  t.textContent = s;
  return t;
}
const scale = (d0, d1, r0, r1) => {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = (v) => r0 + (v - d0) * k;
  f.inv = (p) => d0 + (p - r0) / (k || 1);
  return f;
};
// Tick labels share one decimal count, taken from the step of the ticks() call that made them.
let tickDecimals = 0;
const tl = (v) => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(tickDecimals);
function ticks(lo, hi, n = 5) {
  if (!(hi > lo)) { tickDecimals = 1; return [lo]; }
  const raw = (hi - lo) / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || raw;
  tickDecimals = Math.min(4, (String(+step.toPrecision(6)).split('.')[1] || '').length);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
const extent = (arrs) => {
  let lo = Infinity, hi = -Infinity;
  for (const a of arrs) for (const v of a) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return lo === Infinity ? [0, 1] : lo === hi ? [lo - 1, hi + 1] : [lo, hi];
};
const pad = ([lo, hi], f = 0.06) => [lo - (hi - lo) * f, hi + (hi - lo) * f];

function frame(host, title, height) {
  const wrap = document.createElement('figure');
  wrap.className = 'fig';
  wrap.style.margin = '0';
  const h = document.createElement('h4');
  h.textContent = title;
  wrap.appendChild(h);
  host.appendChild(wrap);
  const W = Math.max(280, Math.round(host.clientWidth - 18));
  return { wrap, W, H: height };
}
function svgIn(wrap, W, H, label) {
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': label });
  wrap.appendChild(svg);
  return svg;
}
function legend(wrap, items) {
  const box = document.createElement('div');
  box.className = 'legend';
  for (const { label, color } of items) {
    const s = document.createElement('span');
    s.innerHTML = `<i style="background:${color}"></i>`;
    s.appendChild(document.createTextNode(label));
    box.appendChild(s);
  }
  wrap.appendChild(box);
}
function note(wrap, s) {
  const p = document.createElement('p');
  p.className = 'fig-note';
  p.textContent = s;
  wrap.appendChild(p);
}

function axes(svg, x, y, box, { xlabel, ylabel, xt, yt, ygrid = true, yfmt = tl, xfmt = tl }) {
  const g = el('g', { class: 'ax' }, svg);
  for (const v of yt) {
    if (ygrid) el('line', { x1: box.l, x2: box.r, y1: y(v), y2: y(v), class: 'gridline' }, g);
    text(g, box.l - 6, y(v) + 3.5, yfmt(v), { 'text-anchor': 'end' });
  }
  el('line', { x1: box.l, x2: box.r, y1: box.b, y2: box.b, class: 'axisline' }, g);
  for (const v of xt) {
    el('line', { x1: x(v), x2: x(v), y1: box.b, y2: box.b + 4, class: 'axisline' }, g);
    text(g, x(v), box.b + 15, xfmt(v), { 'text-anchor': 'middle' });
  }
  if (xlabel) text(g, (box.l + box.r) / 2, box.b + 30, xlabel, { 'text-anchor': 'middle' });
  if (ylabel) text(g, -(box.t + box.b) / 2, 11, ylabel, { transform: 'rotate(-90)', 'text-anchor': 'middle' });
}

const linePath = (xs, ys, x, y, breaks = new Set()) => {
  let d = '';
  let pen = false;
  for (let i = 0; i < xs.length; i++) {
    if (!Number.isFinite(ys[i]) || breaks.has(i)) pen = false;
    if (!Number.isFinite(ys[i])) continue;
    d += `${pen ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(ys[i]).toFixed(1)}`;
    pen = true;
  }
  return d;
};

// A shared readout: crosshair for line charts, nearest cell or mark for the rest.
function readout(wrap, svg, box, onMove) {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  wrap.appendChild(tip);
  const cross = el('line', { y1: box.t, y2: box.b, class: 'axisline', visibility: 'hidden' }, svg);
  const hit = el('rect', { x: box.l, y: box.t, width: Math.max(1, box.r - box.l), height: Math.max(1, box.b - box.t), fill: 'transparent' }, svg);
  const move = (ev) => {
    const pt = svg.getBoundingClientRect();
    const sx = svg.viewBox.baseVal.width / pt.width;
    const px = (ev.clientX - pt.left) * sx, py = (ev.clientY - pt.top) * sx;
    const res = onMove(px, py);
    if (!res) { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); return; }
    if (res.x !== undefined) {
      cross.setAttribute('x1', res.x); cross.setAttribute('x2', res.x); cross.setAttribute('visibility', 'visible');
    } else cross.setAttribute('visibility', 'hidden');
    tip.innerHTML = res.html;
    tip.hidden = false;
    const wr = wrap.getBoundingClientRect();
    let left = ev.clientX - wr.left + 12;
    if (left + tip.offsetWidth > wr.width - 4) left = ev.clientX - wr.left - tip.offsetWidth - 12;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, ev.clientY - wr.top - tip.offsetHeight - 10)}px`;
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  // A mouse readout follows the pointer and clears on leave; a tap's readout stays until the next tap.
  hit.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); } });
  return hit;
}
const nearest = (arr, v) => {
  let lo = 0, hi = arr.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m; else hi = m; }
  return Math.abs(arr[lo] - v) <= Math.abs(arr[hi] - v) ? lo : hi;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---- raster ---------------------------------------------------------------------------------
function raster(host, f) {
  const n = f.spikes.length;
  const H = Math.min(440, Math.max(200, n * 6 + 60));
  const { wrap, W } = frame(host, f.title, H);
  const svg = svgIn(wrap, W, H, `${f.title}: one row of ticks per unit`);
  const box = { l: 44, r: W - 8, t: 6, b: H - 36 };
  const x = scale(f.t0, f.t1, box.l, box.r);
  const y = scale(0, n, box.t, box.b);
  for (const [a, b] of f.unrecorded) el('rect', { x: x(a), y: box.t, width: x(b) - x(a), height: box.b - box.t, fill: 'var(--surface-2)' }, svg);
  axes(svg, x, y, box, { xlabel: 'Time (s)', ylabel: 'Unit', xt: ticks(f.t0, f.t1, 6), yt: [], ygrid: false });
  const rowH = (box.b - box.t) / n;
  let d = '';
  f.spikes.forEach((s, u) => {
    const y0 = (box.t + (u + 0.1) * rowH).toFixed(1), h = (rowH * 0.8).toFixed(1);
    for (const t of s) d += `M${x(t).toFixed(1)},${y0}v${h}`;
  });
  el('path', { d, stroke: 'var(--text-2)', 'stroke-width': 0.8, fill: 'none' }, svg);
  for (const u of ticks(0, n - 1, 5).filter((v) => Number.isInteger(v))) text(svg, box.l - 6, y(u + 0.5) + 3.5, u, { class: 'ax', 'text-anchor': 'end' });
  readout(wrap, svg, box, (px, py) => {
    if (px < box.l || px > box.r || py < box.t || py > box.b) return null;
    const u = Math.min(n - 1, Math.floor((py - box.t) / rowH));
    const t = x.inv(px);
    return { html: `unit ${u} · ${f.spikes[u].length} spikes<br>t ${t.toFixed(2)} s` };
  });
  if (f.unrecorded.length) note(wrap, 'Shaded = not recorded.');
}

// ---- decoded vs actual -----------------------------------------------------------------------
function decode(host, f) {
  const dims = f.true[0].length;
  const names = dims <= 3 ? ['x', 'y', 'z'] : [...Array(dims).keys()].map(String);
  const panelH = 150;
  const H = dims * panelH + 34;
  const { wrap, W } = frame(host, f.title, H);
  legend(wrap, [{ label: 'Actual', color: HEX.s1 }, { label: 'Decoded', color: HEX.s2 }]);
  const svg = svgIn(wrap, W, H, `${f.title}: actual and decoded traces per dimension`);
  const breaks = new Set(f.gaps);
  const x = scale(f.t[0], f.t[f.t.length - 1], 48, W - 8);
  const panels = [];
  for (let i = 0; i < dims; i++) {
    const box = { l: 48, r: W - 8, t: i * panelH + 18, b: (i + 1) * panelH - 6 };
    const tr = f.true.map((r) => r[i]), dc = f.decoded.map((r) => r[i]);
    const yr = pad(extent([tr, dc]));
    const y = scale(yr[0], yr[1], box.b, box.t);
    const g = el('g', { class: 'ax' }, svg);
    for (const v of ticks(yr[0], yr[1], 4)) {
      el('line', { x1: box.l, x2: box.r, y1: y(v), y2: y(v), class: 'gridline' }, g);
      text(g, box.l - 6, y(v) + 3.5, tl(v), { 'text-anchor': 'end' });
    }
    if (yr[0] < 0 && yr[1] > 0) el('line', { x1: box.l, x2: box.r, y1: y(0), y2: y(0), class: 'axisline' }, g);
    text(g, -(box.t + box.b) / 2, 11, `${names[i]} (${f.unit})`, { transform: 'rotate(-90)', 'text-anchor': 'middle' });
    text(svg, box.r, box.t - 6, `R² ${f.r2[i].toFixed(2)}`, { class: 'lbl', 'text-anchor': 'end' });
    el('path', { d: linePath(f.t, tr, x, y, breaks), stroke: 'var(--s1)', 'stroke-width': 2, fill: 'none', 'stroke-linejoin': 'round' }, svg);
    el('path', { d: linePath(f.t, dc, x, y, breaks), stroke: 'var(--s2)', 'stroke-width': 2, fill: 'none', 'stroke-linejoin': 'round' }, svg);
    panels.push({ box, tr, dc });
  }
  const last = panels[panels.length - 1].box;
  const g = el('g', { class: 'ax' }, svg);
  el('line', { x1: last.l, x2: last.r, y1: last.b, y2: last.b, class: 'axisline' }, g);
  for (const v of ticks(f.t[0], f.t[f.t.length - 1], 6)) text(g, x(v), last.b + 15, tl(v), { 'text-anchor': 'middle' });
  text(g, (last.l + last.r) / 2, last.b + 29, 'Time (s)', { 'text-anchor': 'middle' });
  const all = { l: 48, r: W - 8, t: 18, b: last.b };
  readout(wrap, svg, all, (px) => {
    if (px < all.l || px > all.r) return null;
    const i = nearest(f.t, x.inv(px));
    const rows = panels.map((p, k) => `${names[k]}: <i style="background:${HEX.s1}"></i>${p.tr[i].toFixed(2)} <i style="background:${HEX.s2}"></i>${p.dc[i].toFixed(2)}`);
    return { x: x(f.t[i]), html: `t ${f.t[i].toFixed(2)} s<br>${rows.join('<br>')}` };
  });
}

// ---- PSTH + heatmap --------------------------------------------------------------------------
function divColor(v, lim) {
  const a = Math.max(-1, Math.min(1, v / lim));
  const mid = [0x38, 0x38, 0x35], neg = [0x39, 0x87, 0xe5], pos = [0xe6, 0x67, 0x67];
  const end = a < 0 ? neg : pos, k = Math.abs(a);
  return `rgb(${mid.map((m, i) => Math.round(m + (end[i] - m) * k)).join(',')})`;
}
function psth(host, f) {
  const narrow = host.clientWidth < 520;
  const topH = 210;
  const heatRows = f.heat ? f.heat.z.length : 0;
  const heatH = f.heat ? Math.min(300, Math.max(140, heatRows * 5)) : 0;
  const H = f.heat ? topH + 4 + heatH + 80 : topH + 34;
  const { wrap, W } = frame(host, f.title, H);
  const multi = f.groups.length > 1;
  if (multi) legend(wrap, f.groups.map((g, i) => ({ label: `${g.label} (n=${g.n})`, color: HEX[`s${(i % 4) + 1}`] })));
  const svg = svgIn(wrap, W, H, `${f.title}: population rate per group, then change from baseline per unit`);
  const rightPad = multi && !narrow ? 46 : 10;
  const box = { l: 48, r: W - rightPad, t: 8, b: topH - 10 };
  const t = f.t;
  const step = t.length > 1 ? t[1] - t[0] : 0.02;
  const x = scale(t[0] - step / 2, t[t.length - 1] + step / 2, box.l, box.r);
  const yr = pad(extent(f.groups.flatMap((g) => [g.mean.map((m, i) => m - g.sem[i]), g.mean.map((m, i) => m + g.sem[i])])));
  const y = scale(yr[0], yr[1], box.b, box.t);
  const g0 = el('g', { class: 'ax' }, svg);
  for (const v of ticks(yr[0], yr[1], 4)) {
    el('line', { x1: box.l, x2: box.r, y1: y(v), y2: y(v), class: 'gridline' }, g0);
    text(g0, box.l - 6, y(v) + 3.5, tl(v), { 'text-anchor': 'end' });
  }
  text(g0, -(box.t + box.b) / 2, 11, f.rate_label, { transform: 'rotate(-90)', 'text-anchor': 'middle' });
  el('line', { x1: x(0), x2: x(0), y1: box.t, y2: box.b, class: 'evt' }, svg);
  f.groups.forEach((g, i) => {
    const col = SERIES[i % 4];
    let band = '';
    t.forEach((tv, k) => { band += `${k ? 'L' : 'M'}${x(tv).toFixed(1)},${y(g.mean[k] + g.sem[k]).toFixed(1)}`; });
    for (let k = t.length - 1; k >= 0; k--) band += `L${x(t[k]).toFixed(1)},${y(g.mean[k] - g.sem[k]).toFixed(1)}`;
    el('path', { d: `${band}Z`, fill: col, opacity: 0.16 }, svg);
    el('path', { d: linePath(t, g.mean, x, y), stroke: col, 'stroke-width': 2, fill: 'none', 'stroke-linejoin': 'round' }, svg);
  });
  if (multi && !narrow && f.groups.length <= 4) { // direct labels at line ends, nudged apart as plots.py does
    const ends = f.groups.map((g, i) => ({ label: g.label, i, y: y(g.mean[g.mean.length - 1]) })).sort((a, b) => b.y - a.y);
    let prev = Infinity;
    for (const e of ends) {
      const yy = Math.min(e.y, prev - 12);
      el('line', { x1: box.r + 3, x2: box.r + 9, y1: yy, y2: yy, stroke: SERIES[e.i % 4], 'stroke-width': 2 }, svg);
      text(svg, box.r + 12, yy + 3.5, e.label, { class: 'lbl' });
      prev = yy;
    }
  }
  let hb = null, hy = null;
  if (f.heat) {
    hb = { l: 48, r: box.r, t: topH + 4, b: topH + 4 + heatH };
    hy = scale(0, heatRows, hb.t, hb.b);
    const cw = (hb.r - hb.l) / t.length, ch = (hb.b - hb.t) / heatRows;
    const g = el('g', {}, svg);
    f.heat.z.forEach((row, r) => row.forEach((v, c) => {
      el('rect', { x: (hb.l + c * cw).toFixed(2), y: (hb.t + r * ch).toFixed(2), width: (cw + 0.3).toFixed(2), height: (ch + 0.3).toFixed(2), fill: divColor(v, f.heat.lim) }, g);
    }));
    el('line', { x1: x(0), x2: x(0), y1: hb.t, y2: hb.b, class: 'evt' }, svg);
    text(svg, -(hb.t + hb.b) / 2, 11, 'Units by time of peak', { class: 'ax', transform: 'rotate(-90)', 'text-anchor': 'middle' });
  }
  const base = f.heat ? hb.b : box.b;
  const gx = el('g', { class: 'ax' }, svg);
  el('line', { x1: box.l, x2: box.r, y1: box.b, y2: box.b, class: 'axisline' }, gx);
  for (const v of ticks(t[0], t[t.length - 1], 6)) text(gx, x(v), base + 15, tl(v), { 'text-anchor': 'middle' });
  text(gx, (box.l + box.r) / 2, base + 29, `Time from ${f.event} (s)`, { 'text-anchor': 'middle' });
  if (f.heat) { // colour key for the heatmap: title, bar, then -lim / 0 / +lim beneath
    const kx = hb.l, kw = Math.min(180, hb.r - hb.l), ky = base + 54;
    text(svg, kx, ky - 4, 'Change from baseline (SD)', { class: 'ax' });
    const grad = el('linearGradient', { id: `dv${Math.random().toString(36).slice(2, 8)}` }, el('defs', {}, svg));
    [[0, -1], [0.5, 0], [1, 1]].forEach(([o, v]) => el('stop', { offset: o, 'stop-color': divColor(v * f.heat.lim, f.heat.lim) }, grad));
    el('rect', { x: kx, y: ky, width: kw, height: 7, rx: 2, fill: `url(#${grad.id})` }, svg);
    text(svg, kx, ky + 19, `−${f.heat.lim.toFixed(1)}`, { class: 'ax' });
    text(svg, kx + kw / 2, ky + 19, '0', { class: 'ax', 'text-anchor': 'middle' });
    text(svg, kx + kw, ky + 19, `+${f.heat.lim.toFixed(1)}`, { class: 'ax', 'text-anchor': 'end' });
  }
  const all = { l: box.l, r: box.r, t: box.t, b: f.heat ? hb.b : box.b };
  readout(wrap, svg, all, (px, py) => {
    if (px < box.l || px > box.r) return null;
    const k = nearest(t, x.inv(px));
    if (f.heat && py >= hb.t) {
      const r = Math.min(heatRows - 1, Math.max(0, Math.floor(hy.inv(py))));
      return { html: `unit ${f.heat.units[r]} · t ${t[k].toFixed(2)} s<br>${f.heat.z[r][k].toFixed(2)} SD from baseline` };
    }
    const rows = f.groups.map((g, i) => `<i style="background:${HEX[`s${(i % 4) + 1}`]}"></i>${esc(g.label)} ${g.mean[k].toFixed(1)} ± ${g.sem[k].toFixed(1)} Hz`);
    return { x: x(t[k]), html: `t ${t[k].toFixed(2)} s<br>${rows.join('<br>')}` };
  });
}

// ---- latent factors --------------------------------------------------------------------------
function latents(host, f) {
  const nShow = f.trials.length ? f.trials[0].x[0].length : Object.values(f.means)[0][0].length;
  const wide = host.clientWidth >= 640;
  const panelH = 118;
  const leftH = nShow * panelH + 30;
  const sideW = wide ? Math.min(330, Math.round(host.clientWidth * 0.4)) : 0;
  const stateH = wide ? Math.max(180, leftH - 170) : 260;
  const barsH = 150;
  const H = wide ? Math.max(leftH, stateH + barsH + 20) : leftH + stateH + barsH + 56;
  const { wrap, W } = frame(host, f.title, H);
  const col = Object.fromEntries(f.groups.map((g, i) => [g, HEX[`s${(i % 4) + 1}`]]));
  if (f.groups.length > 1) legend(wrap, f.groups.map((g) => ({ label: g, color: col[g] })));
  const svg = svgIn(wrap, W, H, `${f.title}: factors over time, state space and variance per factor`);
  const leftR = wide ? W - sideW - 24 : W - 8;
  const x = scale(f.t[0], f.t[f.t.length - 1], 50, leftR);
  const ys = [];
  for (let k = 0; k < nShow; k++) {
    const box = { l: 50, r: leftR, t: k * panelH + 6, b: (k + 1) * panelH - 8 };
    const series = [...f.trials.map((tr) => tr.x.map((r) => r[k])), ...f.groups.map((g) => f.means[g].map((r) => r[k]))];
    const yr = pad(extent(series));
    const y = scale(yr[0], yr[1], box.b, box.t);
    ys.push({ box, y });
    const g = el('g', { class: 'ax' }, svg);
    for (const v of ticks(yr[0], yr[1], 3)) {
      el('line', { x1: box.l, x2: box.r, y1: y(v), y2: y(v), class: 'gridline' }, g);
      text(g, box.l - 6, y(v) + 3.5, tl(v), { 'text-anchor': 'end' });
    }
    text(g, -(box.t + box.b) / 2, 11, `Factor ${k + 1}`, { transform: 'rotate(-90)', 'text-anchor': 'middle' });
    el('line', { x1: x(0), x2: x(0), y1: box.t, y2: box.b, class: 'evt' }, svg);
    for (const tr of f.trials) el('path', { d: linePath(f.t, tr.x.map((r) => r[k]), x, y), stroke: col[tr.label], 'stroke-width': 0.8, opacity: 0.22, fill: 'none' }, svg);
    for (const gname of f.groups) el('path', { d: linePath(f.t, f.means[gname].map((r) => r[k]), x, y), stroke: col[gname], 'stroke-width': 2.2, fill: 'none', 'stroke-linejoin': 'round' }, svg);
  }
  const lastB = ys[ys.length - 1].box.b;
  const gx = el('g', { class: 'ax' }, svg);
  el('line', { x1: 50, x2: leftR, y1: lastB, y2: lastB, class: 'axisline' }, gx);
  for (const v of ticks(f.t[0], f.t[f.t.length - 1], 5)) text(gx, x(v), lastB + 15, tl(v), { 'text-anchor': 'middle' });
  text(gx, (50 + leftR) / 2, lastB + 28, 'Time from event (s)', { 'text-anchor': 'middle' });
  readout(wrap, svg, { l: 50, r: leftR, t: 6, b: lastB }, (px) => {
    if (px < 50 || px > leftR) return null;
    const i = nearest(f.t, x.inv(px));
    const rows = f.groups.map((gname) => `<i style="background:${col[gname]}"></i>${esc(gname)} ${f.means[gname][i].slice(0, nShow).map((v) => v.toFixed(2)).join(' / ')}`);
    return { x: x(f.t[i]), html: `t ${f.t[i].toFixed(2)} s · mean factors 1–${nShow}<br>${rows.join('<br>')}` };
  });

  // state space (factor 1 vs 2) and variance bars
  const sx0 = wide ? W - sideW : 50, sx1 = W - 8;
  const st = wide ? { l: sx0 + 34, r: sx1, t: 22, b: 22 + stateH - 40 } : { l: 50, r: W - 8, t: leftH + 26, b: leftH + stateH - 14 };
  if (nShow >= 2) {
    const all1 = [...f.trials.map((tr) => tr.x.map((r) => r[0])), ...f.groups.map((g) => f.means[g].map((r) => r[0]))];
    const all2 = [...f.trials.map((tr) => tr.x.map((r) => r[1])), ...f.groups.map((g) => f.means[g].map((r) => r[1]))];
    let [a0, a1] = pad(extent(all1)), [b0, b1] = pad(extent(all2));
    // equal aspect, as plots.py sets for the state-space panel
    const w = st.r - st.l, h = st.b - st.t, k = Math.max((a1 - a0) / w, (b1 - b0) / h);
    const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
    [a0, a1] = [ca - (k * w) / 2, ca + (k * w) / 2];
    [b0, b1] = [cb - (k * h) / 2, cb + (k * h) / 2];
    const X = scale(a0, a1, st.l, st.r), Y = scale(b0, b1, st.b, st.t);
    text(svg, st.l, st.t - 8, 'State space · ○ start ■ event ▲ end', { class: 'ttl' });
    const g = el('g', { class: 'ax' }, svg);
    for (const v of ticks(a0, a1, 4)) { el('line', { x1: X(v), x2: X(v), y1: st.t, y2: st.b, class: 'gridline' }, g); text(g, X(v), st.b + 14, tl(v), { 'text-anchor': 'middle' }); }
    for (const v of ticks(b0, b1, 4)) { el('line', { x1: st.l, x2: st.r, y1: Y(v), y2: Y(v), class: 'gridline' }, g); text(g, st.l - 5, Y(v) + 3.5, tl(v), { 'text-anchor': 'end' }); }
    text(g, (st.l + st.r) / 2, st.b + 27, 'Factor 1', { 'text-anchor': 'middle' });
    text(g, -(st.t + st.b) / 2, st.l - 26, 'Factor 2', { transform: 'rotate(-90)', 'text-anchor': 'middle' });
    for (const tr of f.trials) el('path', { d: linePath(tr.x.map((r) => r[0]), tr.x.map((r) => r[1]), X, Y), stroke: col[tr.label], 'stroke-width': 0.7, opacity: 0.18, fill: 'none' }, svg);
    for (const gname of f.groups) {
      const m = f.means[gname];
      el('path', { d: linePath(m.map((r) => r[0]), m.map((r) => r[1]), X, Y), stroke: col[gname], 'stroke-width': 2.2, fill: 'none', 'stroke-linejoin': 'round' }, svg);
      const ring = { stroke: 'var(--bg)', 'stroke-width': 1.5, fill: col[gname] };
      el('circle', { cx: X(m[0][0]), cy: Y(m[0][1]), r: 4, ...ring }, svg);
      const z = m[f.zero];
      el('rect', { x: X(z[0]) - 4.5, y: Y(z[1]) - 4.5, width: 9, height: 9, ...ring }, svg);
      const e = m[m.length - 1], ex = X(e[0]), ey = Y(e[1]);
      el('path', { d: `M${ex},${ey - 5.5}L${ex + 5},${ey + 4}L${ex - 5},${ey + 4}Z`, ...ring }, svg);
    }
  }
  const bb = wide ? { l: sx0 + 34, r: sx1, t: st.b + 50, b: H - 26 } : { l: 50, r: W - 8, t: leftH + stateH + 42, b: H - 26 };
  const v = f.variance.map((q) => q * 100);
  const by = scale(0, Math.max(...v) * 1.18, bb.b, bb.t);
  const bw = (bb.r - bb.l) / v.length;
  text(svg, bb.l, bb.t - 8, f.variance_label, { class: 'ttl' });
  const g = el('g', { class: 'ax' }, svg);
  for (const tv of ticks(0, Math.max(...v) * 1.18, 3)) { el('line', { x1: bb.l, x2: bb.r, y1: by(tv), y2: by(tv), class: 'gridline' }, g); text(g, bb.l - 5, by(tv) + 3.5, tl(tv), { 'text-anchor': 'end' }); }
  el('line', { x1: bb.l, x2: bb.r, y1: bb.b, y2: bb.b, class: 'axisline' }, g);
  v.forEach((val, i) => {
    const cx = bb.l + bw * (i + 0.5), w = Math.min(28, bw * 0.62);
    const top = by(val), r = Math.min(4, (bb.b - top) / 2);
    el('path', { d: `M${cx - w / 2},${bb.b}V${top + r}Q${cx - w / 2},${top} ${cx - w / 2 + r},${top}H${cx + w / 2 - r}Q${cx + w / 2},${top} ${cx + w / 2},${top + r}V${bb.b}Z`, fill: 'var(--accent)' }, svg);
    text(svg, cx, top - 4, val.toFixed(1), { class: 'ax', 'text-anchor': 'middle' });
    text(g, cx, bb.b + 14, i + 1, { 'text-anchor': 'middle' });
  });
  text(g, (bb.l + bb.r) / 2, bb.b + 25, 'Factor', { 'text-anchor': 'middle' });
  note(wrap, `${f.trials.length} single trials drawn thin (the subset plots.py would draw); group means bold.`);
}

// ---- probe map -------------------------------------------------------------------------------
function seqColor(v, lo, hi) {
  const a = hi > lo ? (v - lo) / (hi - lo) : 0.5;
  const c0 = [0x18, 0x4f, 0x95], c1 = [0xcd, 0xe2, 0xfb];
  return `rgb(${c0.map((c, i) => Math.round(c + (c1[i] - c) * a)).join(',')})`;
}
function probe(host, f) {
  const xs = f.pos.map((p) => p[0]), ys = f.pos.map((p) => p[1]);
  const [x0, x1] = extent([xs]), [y0, y1] = extent([ys]);
  const span = Math.max(x1 - x0, y1 - y0) || 1;
  const W0 = Math.max(280, Math.round(host.clientWidth - 18));
  const plotW = Math.min(W0 - 60, 420);
  const aspect = Math.min(3, Math.max(0.4, (y1 - y0 + span * 0.15) / (x1 - x0 + span * 0.15)));
  const plotH = Math.min(420, plotW * aspect);
  const H = plotH + 70;
  const { wrap, W } = frame(host, f.title, H);
  const svg = svgIn(wrap, W, H, `${f.title}: contacts coloured by firing rate`);
  const box = { l: 56, r: 56 + plotW, t: 8, b: 8 + plotH };
  const padU = span * 0.08;
  const k = Math.max((x1 - x0 + 2 * padU) / plotW, (y1 - y0 + 2 * padU) / plotH);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const X = scale(cx - (k * plotW) / 2, cx + (k * plotW) / 2, box.l, box.r);
  const Y = scale(cy - (k * plotH) / 2, cy + (k * plotH) / 2, box.b, box.t);
  const g = el('g', { class: 'ax' }, svg);
  for (const v of ticks(X.inv(box.l), X.inv(box.r), 4)) { el('line', { x1: X(v), x2: X(v), y1: box.t, y2: box.b, class: 'gridline' }, g); text(g, X(v), box.b + 14, tl(v), { 'text-anchor': 'middle' }); }
  for (const v of ticks(Y.inv(box.b), Y.inv(box.t), 4)) { el('line', { x1: box.l, x2: box.r, y1: Y(v), y2: Y(v), class: 'gridline' }, g); text(g, box.l - 5, Y(v) + 3.5, tl(v), { 'text-anchor': 'end' }); }
  text(g, (box.l + box.r) / 2, box.b + 28, 'x (µm)', { 'text-anchor': 'middle' });
  text(g, -(box.t + box.b) / 2, 12, 'y (µm)', { transform: 'rotate(-90)', 'text-anchor': 'middle' });
  const [r0, r1] = extent([f.rates]);
  let pitch = Infinity;
  for (let i = 1; i < f.pos.length; i++) pitch = Math.min(pitch, Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) || Infinity);
  const rad = Math.max(3, Math.min(12, (0.33 * (Number.isFinite(pitch) ? pitch : span)) / k));
  f.pos.forEach((p, i) => {
    const c = el('circle', { cx: X(p[0]), cy: Y(p[1]), r: rad, fill: seqColor(f.rates[i], r0, r1), stroke: 'var(--axis)', 'stroke-width': 0.6 }, svg);
    const tt = el('title', {}, c);
    tt.textContent = `channel ${i}: ${f.rates[i].toFixed(1)} Hz`;
  });
  const kx = box.r + 16, kw = 10;
  if (kx + 50 < W) {
    const grad = el('linearGradient', { id: `sq${Math.random().toString(36).slice(2, 8)}`, x1: 0, x2: 0, y1: 1, y2: 0 }, el('defs', {}, svg));
    [[0, r0], [1, r1]].forEach(([o, v]) => el('stop', { offset: o, 'stop-color': seqColor(v, r0, r1) }, grad));
    el('rect', { x: kx, y: box.t + 10, width: kw, height: Math.min(140, plotH - 20), rx: 2, fill: `url(#${grad.id})` }, svg);
    text(svg, kx + kw + 4, box.t + 18, `${r1.toFixed(1)} Hz`, { class: 'ax' });
    text(svg, kx + kw + 4, box.t + 10 + Math.min(140, plotH - 20), `${r0.toFixed(1)}`, { class: 'ax' });
  }
  readout(wrap, svg, box, (px, py) => {
    let best = -1, bd = Infinity;
    f.pos.forEach((p, i) => { const d = Math.hypot(X(p[0]) - px, Y(p[1]) - py); if (d < bd) { bd = d; best = i; } });
    if (best < 0 || bd > rad * 2.2) return null;
    return { html: `channel ${best} · (${f.pos[best][0]}, ${f.pos[best][1]}) µm<br>${f.rates[best].toFixed(2)} Hz` };
  });
}

export function drawFigure(host, figure) {
  host.replaceChildren();
  ({ raster, decode, psth, latents, probe })[figure.kind]?.(host, figure);
}
