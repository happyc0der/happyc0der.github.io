// Small SVG/HTML chart helpers for the recorded results. Text goes in through textContent only.
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const scale = (d0, d1, r0, r1, log) => {
  const f = log ? Math.log10 : (v) => v;
  const a = f(d0), b = f(d1);
  const s = (v) => r0 + ((f(v) - a) / (b - a)) * (r1 - r0);
  s.invert = (p) => { const t = a + ((p - r0) / (r1 - r0)) * (b - a); return log ? 10 ** t : t; };
  return s;
};

export function marker(parent, shape, x, y, color, surface) {
  // >= 8 px marks with a 2 px surface ring; the shape is the second channel besides colour
  if (shape === 'square') return svgEl('rect', { x: x - 4.5, y: y - 4.5, width: 9, height: 9, rx: 1.5, fill: color, stroke: surface, 'stroke-width': 2 }, parent);
  return svgEl('circle', { cx: x, cy: y, r: 4.5, fill: color, stroke: surface, 'stroke-width': 2 }, parent);
}

export function legend(el, items) {
  el.replaceChildren();
  const surface = cssVar('--surface') || '#14121c';
  for (const it of items) {
    const s = document.createElement('span');
    const k = svgEl('svg', { width: 22, height: 12, viewBox: '0 0 22 12', 'aria-hidden': 'true' });
    if (it.line !== false) svgEl('line', { x1: 1, y1: 6, x2: 21, y2: 6, stroke: it.color, 'stroke-width': 2, 'stroke-linecap': 'round' }, k);
    if (it.shape) marker(k, it.shape, 11, 6, it.color, surface);
    else if (it.line === false) svgEl('rect', { x: 3, y: 2, width: 16, height: 8, rx: 2, fill: it.color }, k);
    s.append(k, document.createTextNode(it.name));
    el.appendChild(s);
  }
}

// series: [{name, color, shape, points: [{x, y}]}]; ref: optional {name, fn} drawn as a thin muted line
export function lineChart(el, { series, xLog, yLog, xTicks, yTicks, xFmt, yFmt, xTitle, yTitle, ref, vline, tipHead, tipVal }) {
  el.replaceChildren();
  const W = Math.max(280, el.clientWidth || 600);
  const H = Math.round(Math.min(360, Math.max(230, W * 0.5)));
  const m = { l: 50, r: 16, t: 14, b: 42 };
  const xs = xTicks, ys = yTicks;
  const x = scale(xs[0], xs[xs.length - 1], m.l, W - m.r, xLog);
  const y = scale(ys[0], ys[ys.length - 1], H - m.b, m.t, yLog);
  const surface = cssVar('--surface') || '#14121c';
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, tabindex: 0, role: 'img' }, el);
  svg.setAttribute('aria-label', `${yTitle} by ${xTitle}. Use left and right arrow keys to read values.`);

  const grid = svgEl('g', { class: 'grid' }, svg);
  for (const t of ys) {
    svgEl('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }, grid);
    const tx = svgEl('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, svg);
    tx.textContent = yFmt(t);
  }
  const narrow = W < 460;
  xs.forEach((t, i) => {
    if (narrow && xs.length > 6 && i % 2 === 1) return;
    const tx = svgEl('text', { x: x(t), y: H - m.b + 16, 'text-anchor': 'middle' }, svg);
    tx.textContent = xFmt(t);
  });
  svgEl('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: cssVar('--muted'), 'stroke-width': 1, opacity: 0.6 }, svg);
  const xt = svgEl('text', { x: (m.l + W - m.r) / 2, y: H - 6, 'text-anchor': 'middle' }, svg);
  xt.textContent = xTitle;
  const yt = svgEl('text', { x: 12, y: (m.t + H - m.b) / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})` }, svg);
  yt.textContent = yTitle;

  if (ref) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const xv = xLog ? 10 ** (Math.log10(xs[0]) + (i / 40) * (Math.log10(xs.at(-1)) - Math.log10(xs[0]))) : xs[0] + (i / 40) * (xs.at(-1) - xs[0]);
      const yv = ref.fn(xv);
      if (yv >= ys[0] && yv <= ys.at(-1)) pts.push(`${x(xv).toFixed(1)},${y(yv).toFixed(1)}`);
    }
    svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: cssVar('--muted'), 'stroke-width': 1, opacity: 0.7 }, svg);
    const last = pts.at(-1).split(',');
    const rt = svgEl('text', { x: +last[0] - 4, y: +last[1] + 14, 'text-anchor': 'end' }, svg);
    rt.textContent = ref.name;
  }
  if (vline) {
    svgEl('line', { x1: x(vline.x), x2: x(vline.x), y1: m.t, y2: H - m.b, stroke: cssVar('--text-2'), 'stroke-width': 1, opacity: 0.55 }, svg);
    const vt = svgEl('text', { x: x(vline.x) + 6, y: H - m.b - 8, class: 'dl' }, svg);
    vt.textContent = vline.label;
  }

  for (const s of series) {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
    svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
  }
  for (const s of series) for (const p of s.points) marker(svg, s.shape, x(p.x), y(p.y), s.color, surface);
  // direct label at the end of each series when there is room
  // (skipped when the ends sit within 16 px of each other: the legend carries identity then)
  const ends = series.map((s) => y(s.points.at(-1).y));
  const apart = ends.every((a, i) => ends.every((b, j) => i === j || Math.abs(a - b) >= 16));
  if (!narrow && apart) for (const s of series) {
    const p = s.points.at(-1);
    const t = svgEl('text', { x: x(p.x) - 8, y: y(p.y) - 10, 'text-anchor': 'end', class: 'dl' }, svg);
    t.textContent = s.name;
  }

  // crosshair + one tooltip listing every series at the nearest x
  const allX = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  const cross = svgEl('line', { y1: m.t, y2: H - m.b, stroke: cssVar('--text'), 'stroke-width': 1, opacity: 0, 'pointer-events': 'none' }, svg);
  const tip = document.createElement('div');
  tip.className = 'tip'; tip.hidden = true; el.appendChild(tip);
  let idx = -1;
  const show = (i) => {
    idx = Math.max(0, Math.min(allX.length - 1, i));
    const xv = allX[idx], px = x(xv);
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('opacity', 0.35);
    tip.replaceChildren();
    const h = document.createElement('div'); h.className = 'h'; h.textContent = tipHead(xv); tip.appendChild(h);
    for (const s of series) {
      const p = s.points.find((q) => q.x === xv);
      const r = document.createElement('div'); r.className = 'r';
      const k = document.createElement('i'); k.className = 'k'; k.style.background = s.color;
      const b = document.createElement('b'); b.textContent = p ? tipVal(p, s) : 'not run';
      r.append(k, b, document.createTextNode(s.name));
      tip.appendChild(r);
    }
    tip.hidden = false;
    const scaleX = el.clientWidth / W;
    const left = px * scaleX;
    tip.style.left = `${Math.min(el.clientWidth - tip.offsetWidth - 4, Math.max(4, left + 12 > el.clientWidth / 2 ? left - tip.offsetWidth - 12 : left + 12))}px`;
    tip.style.top = `${m.t * (el.clientHeight / H || 1)}px`;
  };
  const hide = () => { cross.setAttribute('opacity', 0); tip.hidden = true; };
  const nearest = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0;
    allX.forEach((v, i) => { if (Math.abs(x(v) - px) < Math.abs(x(allX[best]) - px)) best = i; });
    return best;
  };
  svg.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  svg.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  svg.addEventListener('focus', () => show(idx < 0 ? 0 : idx));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { show(idx + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { show(idx - 1); e.preventDefault(); }
    else if (e.key === 'Escape') hide();
  });
}

// rows: [{label, sub, value, color, text}]; horizontal bars, value at the tip
export function hbars(el, rows, { max } = {}) {
  el.replaceChildren();
  const top = max ?? Math.max(...rows.map((r) => r.value));
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'hbar'; row.tabIndex = 0;
    row.setAttribute('aria-label', `${r.label}${r.sub ? `, ${r.sub}` : ''}: ${r.text}`);
    const lab = document.createElement('div'); lab.className = 'lab'; lab.textContent = r.label;
    if (r.sub) { const s = document.createElement('small'); s.textContent = r.sub; lab.appendChild(s); }
    const trk = document.createElement('div'); trk.className = 'trk';
    const b = document.createElement('i'); b.className = 'b';
    b.style.width = `calc((100% - 120px) * ${Math.max(0, r.value) / top})`;
    b.style.background = r.color;
    const v = document.createElement('span'); v.className = 'val'; v.textContent = r.text;
    trk.append(b, v);
    row.append(lab, trk);
    el.appendChild(row);
  }
}

export function table(el, head, rows, numeric = []) {
  el.replaceChildren();
  const wrap = document.createElement('div'); wrap.className = 'tbl-wrap';
  const t = document.createElement('table');
  const tr = document.createElement('tr');
  head.forEach((h, i) => { const th = document.createElement('th'); th.textContent = h; if (numeric.includes(i)) th.className = 'num'; tr.appendChild(th); });
  const thead = document.createElement('thead'); thead.appendChild(tr); t.appendChild(thead);
  const tb = document.createElement('tbody');
  for (const r of rows) {
    const row = document.createElement('tr');
    r.forEach((c, i) => { const td = document.createElement('td'); td.textContent = c; if (numeric.includes(i)) td.className = 'num'; row.appendChild(td); });
    tb.appendChild(row);
  }
  t.appendChild(tb); wrap.appendChild(t); el.appendChild(wrap);
}
