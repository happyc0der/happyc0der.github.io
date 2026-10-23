// Page side of the bandits demo. Every number shown here comes out of the repo's Python
// (via worker.js and demo_entry.py); this file only lays it out and draws charts.

const ALGOS = [
  { id: 'TS-GE', label: 'TS-GE', color: '#9085e9' },
  { id: 'M-UCB', label: 'M-UCB', color: '#d55181' },
  { id: 'FastAdSwitch', label: 'AdSwitch', color: '#3987e5' },
  { id: 'UCB1', label: 'UCB1', color: '#d95926' },
  { id: 'EpsilonGreedy', label: 'ε-greedy', color: '#199e70' },
];
const TYPO_KEY = 'TS-GE (as printed)';
const series = (key) => key === TYPO_KEY
  ? { key, label: 'TS-GE as printed', color: '#9085e9', dash: true }
  : { key, ...ALGOS.find((a) => a.id === key) };

const SURFACE = '#14121c';
const GRID = '#23202e';
const AXIS_TEXT = '#8f8aa3';
const TEXT = '#e7e5ee';
const MONO = "11px 'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";
const PHASES = ['ETC', 'TS', 'BP', 'GE', 'RECOVERY'];
const PHASE_NAMES = { ETC: 'round-robin', TS: 'Thompson', BP: 'probe all arms', GE: 'probe groups', RECOVERY: 'recheck' };

const $ = (sel) => document.querySelector(sel);
const pct = (v) => `${(Math.abs(v) < 0.05 ? 0 : v).toFixed(1)}%`;
const fmt = (v) => (v == null || Number.isNaN(v) ? '–' : Math.round(v).toLocaleString('en-US'));
const fmtCompact = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `${+v.toFixed(0)}`;
};

const state = {
  busy: false,
  preset: 'case1',
  caseInfo: null,        // describe() of the selected case
  run: null,             // { preset, seed, delta, info } of the results on screen
  order: [],             // result keys in display order
  results: new Map(),    // key -> run_one() output
  pending: new Map(),    // key -> 'queued' | 'running'
  measure: 'total',
  rasterKey: null,
  phaseVariant: 'corrected',
  check: null,           // ts_phase_check() output
  hoverRegret: null,
  hoverRaster: null,
};

// ---------------------------------------------------------------------------
// Worker plumbing
// ---------------------------------------------------------------------------
let worker = null;
let nextId = 1;
const handlers = new Map();
const TERMINAL = new Set(['ready', 'case', 'done', 'ts_phase_check', 'regression']);

function send(cmd, payload = {}, onMessage = null) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    handlers.set(id, { resolve, reject, onMessage });
    worker.postMessage({ cmd, id, ...payload });
  });
}

function onWorkerMessage({ data }) {
  if (data.type === 'status') { bootStatus(data.text, data.fraction); return; }
  const handler = handlers.get(data.id);
  if (!handler) return;
  if (data.type === 'error') { handlers.delete(data.id); handler.reject(new Error(data.message)); return; }
  if (TERMINAL.has(data.type)) { handlers.delete(data.id); handler.resolve(data.data); return; }
  handler.onMessage?.(data);
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
function setStatus(text, isError = false) {
  const el = $('#status');
  el.textContent = text;
  el.classList.toggle('error', isError);
}
function setRunProgress(fraction) {
  const bar = $('#run-progress');
  if (fraction == null) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.firstElementChild.style.width = `${Math.round(100 * fraction)}%`;
}
function bootStatus(text, fraction) {
  $('#boot-status').textContent = text;
  const bar = $('#boot-progress');
  bar.hidden = false;
  bar.firstElementChild.style.width = `${Math.round(100 * (fraction || 0))}%`;
}

function setBusy(busy) {
  state.busy = busy;
  for (const el of document.querySelectorAll('#controls button:not(#run), #controls input, #delta-check, #delta-reset, #regression-run, #phase-variant button')) {
    el.disabled = busy;
  }
  // Run stays focusable while busy, so keyboard focus is not dropped mid-run.
  $('#run').setAttribute('aria-disabled', String(busy));
  if (!busy) syncPhaseVariant();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function start() {
  const button = $('#start');
  button.disabled = true;
  button.textContent = 'Starting…';
  $('#boot-status').classList.remove('error');
  bootStatus('Starting a worker', 0);
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = onWorkerMessage;
    worker.onerror = (event) => {
      event.preventDefault?.();
      failBoot(new Error(event.message || 'the worker could not start'));
    };
    const { versions } = await send('boot');
    $('#versions').textContent = versions;
    $('#poster').hidden = true;
    $('#app').hidden = false;
    buildChips();
    observeResize();
    await selectPreset('case1', { quiet: true });
    $('#run').focus({ preventScroll: true });
    await runJobs(defaultJobs(), { fresh: true });
  } catch (error) {
    failBoot(error);
  }
}

function failBoot(error) {
  if (!$('#poster').hidden) {
    $('#boot-status').textContent = `Could not start Python: ${error.message}`;
    $('#boot-status').classList.add('error');
    const button = $('#start');
    button.disabled = false;
    button.textContent = 'Try again';
    worker?.terminate();
    worker = null;
  } else {
    setStatus(`Error: ${error.message}`, true);
  }
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
function buildChips() {
  const box = $('#algo-chips');
  box.innerHTML = '';
  for (const a of ALGOS) {
    const label = document.createElement('label');
    label.className = 'chip';
    label.style.setProperty('--sw', a.color);
    label.innerHTML = `<input type="checkbox" checked value="${a.id}"><span class="sw"></span>${a.label}`;
    box.appendChild(label);
  }
  // The paper's printed Beta update, as one more series to switch on.
  const typo = document.createElement('label');
  typo.className = 'chip chip-typo';
  typo.style.setProperty('--sw', ALGOS[0].color);
  typo.title = 'TS-GE with the Beta update exactly as the paper prints it (reproduce_paper_beta_typo=True)';
  typo.innerHTML = '<input type="checkbox" id="typo"><span class="sw dash"></span>TS-GE as printed';
  box.appendChild(typo);
}

const selectedAlgos = () => [...document.querySelectorAll('#algo-chips input:checked:not(#typo)')].map((i) => i.value);

function defaultJobs() {
  const jobs = selectedAlgos().map((id) => ({ algorithm: id, key: id }));
  if ($('#typo').checked) jobs.push({ algorithm: 'TS-GE', typo: true, key: TYPO_KEY });
  return jobs;
}

function readSeed() {
  const value = $('#seed').value.trim();
  if (!/^\d{1,5}$/.test(value)) return null;
  return Number(value);
}

function readDelta() {
  const raw = $('#delta').value.trim();
  if (!raw || !state.caseInfo) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return NaN;
  return value === state.caseInfo.default_delta ? null : value;
}

async function selectPreset(preset, { quiet = false } = {}) {
  state.preset = preset;
  for (const b of document.querySelectorAll('.case-btn')) b.setAttribute('aria-pressed', String(b.dataset.preset === preset));
  const info = await send('describe', { preset });
  info.default_delta = info.ts_ge_delta;
  state.caseInfo = info;
  $('#delta').value = info.ts_ge_delta;
  renderCaseLine(info);
  renderFindings(info);
  if (!quiet) {
    clearResults();
    setStatus(preset === 'case5'
      ? 'case5 is 100,000 slots at K=16: all five take 15 s or more here, most of it AdSwitch. Press Run.'
      : 'Press Run.');
  }
}

function renderCaseLine(info) {
  const means = info.means.length <= 4
    ? info.means.map((m) => m.toFixed(1)).join(', ')
    : `${info.means[0].toFixed(1)} … ${info.means[info.means.length - 1].toFixed(1)}`;
  const changes = info.change_schedule
    .map(([t, arm, m]) => `at t=${t.toLocaleString('en-US')} arm ${arm} moves to ${m.toFixed(1)}`).join('; ');
  $('#case-line').innerHTML =
    `<b>${info.name}</b> · K=${info.K} arms · T=${info.T.toLocaleString('en-US')} slots · arm means ${means} · σ=${info.sigma} · ${changes}`;
}

function renderFindings(info, refusedFor = null) {
  const list = $('#findings');
  list.innerHTML = '';
  for (const f of info.preflight) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="lv ${f.level}">${f.level}</span><span><span class="ck">${f.check}</span> ${escapeHtml(f.message)}</span>`;
    list.appendChild(li);
  }
  const old = $('#preflight-box .refused');
  old?.remove();
  if (refusedFor) {
    const p = document.createElement('p');
    p.className = 'refused';
    p.textContent = refusedFor;
    list.after(p);
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function clearResults() {
  state.results.clear();
  state.pending.clear();
  state.order = [];
  state.run = null;
  state.check = null;
  state.hoverRegret = null;
  state.hoverRaster = null;
  renderAll();
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------
async function runJobs(jobs, { fresh }) {
  if (state.busy) return;
  const seed = fresh ? readSeed() : state.run.seed;
  if (seed == null) { setStatus('Seed must be a whole number from 0 to 99999.', true); return; }
  const delta = fresh ? readDelta() : state.run.delta;
  if (Number.isNaN(delta)) { setStatus('TS-GE delta must be a positive number.', true); return; }
  if (!jobs.length) { setStatus('Pick at least one algorithm.', true); return; }
  const preset = fresh ? state.preset : state.run.preset;

  setBusy(true);
  try {
    // test_algorithms.py runs preflight first and skips a case with any ERROR.
    const info = await send('describe', { preset, delta });
    info.default_delta = state.caseInfo.default_delta;
    if (!info.preflight_ok) {
      const errors = info.preflight.filter((f) => f.level === 'ERROR').map((f) => `  ${f.check}: ${f.message}`).join('\n');
      const text = `Preflight refused this case (delta=${info.ts_ge_delta}):\n${errors}`;
      renderFindings(info, text);
      $('#preflight-box').open = true;
      setStatus('Preflight refused the run: see Preflight below.', true);
      return;
    }
    if (fresh) {
      clearResults();
      state.run = { preset, seed, delta, info };
      renderFindings(info);
    }
    for (const job of jobs) {
      if (!state.order.includes(job.key)) state.order.push(job.key);
      state.pending.set(job.key, 'queued');
    }
    renderAll();

    const started = performance.now();
    let current = null;
    let finished = 0;
    const tick = () => {
      const s = Math.round((performance.now() - started) / 1000);
      setStatus(`Running ${current ? series(current.key).label : ''} · ${finished + 1} of ${jobs.length} · ${s} s`);
      setRunProgress(finished / jobs.length);
    };
    const timer = setInterval(tick, 500);
    try {
      await send('run', { preset, seed, delta, jobs }, (msg) => {
        if (msg.type === 'progress') {
          current = msg.job;
          state.pending.set(msg.job.key, 'running');
          renderTable();
          tick();
        } else if (msg.type === 'result') {
          state.pending.delete(msg.job.key);
          state.results.set(msg.job.key, msg.data);
          finished += 1;
          renderAll();
          tick();
        }
      });
    } finally {
      clearInterval(timer);
      setRunProgress(null);
    }
    await refreshCheck();
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    setStatus(`Done: ${jobs.length} run${jobs.length > 1 ? 's' : ''} in ${secs} s, seed ${seed}.`);
  } catch (error) {
    state.pending.clear();
    renderAll();
    setStatus(`Error: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function refreshCheck() {
  const run = state.run;
  if (!run) return;
  const c = state.results.get('TS-GE');
  const p = state.results.get(TYPO_KEY);
  if (!c && !p) { state.check = null; renderPhases(); return; }
  state.check = await send('ts_phase_check', {
    preset: run.preset,
    seed: run.seed,
    corrected: c?.phase_regret?.TS?.regret ?? null,
    as_printed: p?.phase_regret?.TS?.regret ?? null,
    bp_share: c?.phase_regret?.BP?.regret_share ?? null,
  });
  // A non-default delta is not the README's configuration.
  if (run.delta != null) state.check = { ...state.check, applies: false, table: { ...state.check.table, applies: false } };
  renderPhases();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderAll() {
  renderTable();
  renderLegend();
  renderRasterPicker();
  renderPhases();
  drawRegret();
  drawRaster();
  const run = state.run;
  $('#table-seed').textContent = run ? `· ${run.info.name.split('_')[0]}, seed ${run.seed}${run.delta != null ? `, delta ${run.delta}` : ''}` : '';
  $('#regret-sub').textContent = state.measure === 'total'
    ? 'every slot, TS-GE\'s mandatory probes included'
    : 'single-arm slots only; probe slots count zero';
}

function renderTable() {
  const body = $('#results tbody');
  body.innerHTML = '';
  if (!state.order.length) {
    body.innerHTML = '<tr><td colspan="7" class="muted">No results yet.</td></tr>';
    return;
  }
  for (const key of state.order) {
    const s = series(key);
    const d = state.results.get(key);
    const tr = document.createElement('tr');
    const sw = `<span class="sw${s.dash ? ' dash' : ''}" style="--sw:${s.color}"></span>`;
    if (!d) {
      tr.className = 'pending';
      tr.innerHTML = `<td class="name">${sw}${s.label}</td><td class="num" colspan="6">${state.pending.get(key) === 'running' ? 'running…' : 'queued'}</td>`;
    } else {
      const latency = d.latency == null ? 'none' : d.latency.toLocaleString('en-US');
      const reason = d.first_detection_reason ? ` title="first restart after the change: ${d.first_detection_reason}"` : '';
      tr.innerHTML = `<td class="name">${sw}${s.label}</td>
        <td class="num">${fmt(d.total_regret)}</td>
        <td class="num">${fmt(d.decision_regret)}</td>
        <td class="num"${reason}>${latency}</td>
        <td class="num c-age">${d.max_probe_age == null ? 'n/a' : d.max_probe_age.toLocaleString('en-US')}</td>
        <td class="num c-best">${(100 * d.on_best_share).toFixed(1)}%</td>
        <td class="num c-time">${d.wall_time_s.toFixed(2)} s</td>`;
    }
    body.appendChild(tr);
  }
}

function renderLegend() {
  const ul = $('#legend');
  ul.innerHTML = '';
  const field = state.measure === 'total' ? 'total_regret' : 'decision_regret';
  for (const key of state.order) {
    const s = series(key);
    const d = state.results.get(key);
    const li = document.createElement('li');
    li.innerHTML = `<i class="${s.dash ? 'dash' : ''}" style="--sw:${s.color}"></i>${s.label} <span class="v">${d ? fmt(d[field]) : '…'}</span>`;
    ul.appendChild(li);
  }
}

function syncPhaseVariant() {
  for (const b of document.querySelectorAll('#phase-variant button')) {
    b.setAttribute('aria-pressed', String(b.dataset.variant === state.phaseVariant));
    b.disabled = state.busy || !state.run;
  }
}

function renderPhases() {
  syncPhaseVariant();
  const box = $('#phases');
  const callout = $('#callout');
  const key = state.phaseVariant === 'typo' ? TYPO_KEY : 'TS-GE';
  const d = state.results.get(key);
  box.innerHTML = '';
  if (!d) {
    const msg = state.pending.has(key) ? 'Running…'
      : !state.run ? 'Run TS-GE to see its regret split by phase.'
      : state.phaseVariant === 'typo' ? 'Press "As printed" to run TS-GE with the paper\'s Beta update.'
      : 'TS-GE was not in this run.';
    box.innerHTML = `<p class="empty">${msg}</p>`;
  } else {
    for (const phase of PHASES) {
      const p = d.phase_regret[phase];
      if (!p) continue;
      const row = document.createElement('div');
      row.className = 'phase';
      row.title = `${phase}: ${p.slots.toLocaleString('en-US')} slots (${pct(p.slot_share)}), regret ${fmt(p.regret)} (${pct(p.regret_share)})`;
      row.innerHTML = `<span class="nm">${phase} <span class="muted">${PHASE_NAMES[phase]}</span></span>
        <span class="bars">
          <span class="bar regret" style="width:${Math.max(0, Math.min(100, p.regret_share))}%"></span>
          <span class="bar slots" style="width:${Math.max(0, Math.min(100, p.slot_share))}%"></span>
        </span>
        <span class="val"><b>${pct(p.regret_share)}</b> ${pct(p.slot_share)}</span>`;
      box.appendChild(row);
    }
    const legend = document.createElement('div');
    legend.className = 'phase-key';
    legend.innerHTML = '<span><i style="background:var(--c-tsge)"></i>share of regret (bold)</span><span><i style="background:var(--slot-bar)"></i>share of slots</span>';
    box.appendChild(legend);
  }

  const c = state.results.get('TS-GE');
  const p = state.results.get(TYPO_KEY);
  if (!c && !p) { callout.hidden = true; return; }
  callout.hidden = false;
  const seed = state.run?.seed;
  const cell = (r, label) => `<div><b>${r ? fmt(r.phase_regret.TS?.regret) : '–'}</b><span>${label}</span></div>`;
  const notes = [];
  const check = state.check;
  const n = (v) => v.toLocaleString('en-US');
  if (check?.applies) {
    if (check.corrected_matches != null) notes.push(`${check.corrected_matches ? '<span class="ok">Same as</span>' : '<span class="bad">Differs from</span>'} the README's ${n(check.corrected)} corrected`);
    if (check.as_printed_matches != null) notes.push(`${check.as_printed_matches ? '<span class="ok">same as</span>' : '<span class="bad">differs from</span>'} its ${n(check.as_printed)} as printed`);
  } else if (check) {
    notes.push(`The README quotes ${n(check.corrected)} and ${n(check.as_printed)} for case1, seed 42`);
  }
  if (check?.table?.applies && check.table.matches != null) {
    notes.push(`${check.table.matches ? '<span class="ok">matches</span>' : '<span class="bad">differs from</span>'} the README's seed-1 phase table (BP ${check.table.bp_share}% of regret, TS ${check.table.ts_regret})`);
  } else if (check && !check.table?.applies && state.run?.preset === 'case1' && state.run?.delta == null) {
    notes.push('the README\'s phase table is seed 1');
  }
  const note = notes.length ? `${notes.join('; ')}.` : '';
  const action = p ? '' : ' Press "As printed" above to run the paper\'s version.';
  callout.innerHTML = `<span>TS-phase regret, seed ${seed}. As printed, the Beta update samples each arm's failure rate, so the arg-max picks the arm likeliest to fail.</span>
    <div class="big">${cell(c, 'corrected update')}${cell(p, 'as printed in the paper')}</div>
    <span class="small">${note}${action}</span>`;
}

function renderRasterPicker() {
  const box = $('#raster-pick');
  const keys = state.order.filter((k) => state.results.has(k));
  if (!keys.includes(state.rasterKey)) state.rasterKey = keys.includes('TS-GE') ? 'TS-GE' : keys[0] ?? null;
  box.innerHTML = '';
  for (const key of keys) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = series(key).label;
    b.setAttribute('aria-pressed', String(key === state.rasterKey));
    b.addEventListener('click', () => { state.rasterKey = key; state.hoverRaster = null; renderRasterPicker(); drawRaster(); });
    box.appendChild(b);
  }
  const d = state.results.get(state.rasterKey);
  const info = state.run?.info;
  if (d && info) {
    const per = info.T / d.raster_columns;
    $('#raster-cols').textContent = per === 1 ? 'one' : `${+per.toFixed(1)}`;
  }
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------
function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function niceStep(span, count) {
  const raw = span / Math.max(count, 1);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
}

function emptyMessage(ctx, w, h, text) {
  ctx.fillStyle = AXIS_TEXT;
  ctx.font = MONO;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
}

function nearestIndex(xs, value) {
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < value) lo = mid; else hi = mid;
  }
  return Math.abs(xs[lo] - value) <= Math.abs(xs[hi] - value) ? lo : hi;
}

function placeTip(tip, container, px, py) {
  tip.hidden = false;
  const cw = container.clientWidth;
  const tw = tip.offsetWidth;
  let left = px + 14;
  if (left + tw > cw) left = Math.max(0, px - tw - 14);
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(0, py)}px`;
}

// ---------------------------------------------------------------------------
// Regret chart
// ---------------------------------------------------------------------------
const regretGeom = {};

function drawRegret() {
  const canvas = $('#regret-chart canvas');
  const tip = $('#regret-chart .tip');
  const { ctx, w, h } = setupCanvas(canvas);
  const keys = state.order.filter((k) => state.results.has(k));
  const info = state.run?.info;
  if (!keys.length || !info) {
    tip.hidden = true;
    emptyMessage(ctx, w, h, state.busy ? 'Running…' : 'Press Run');
    return;
  }
  const field = state.measure === 'total' ? 'total_curve' : 'decision_curve';
  const xs = state.results.get(keys[0]).x;
  let ymin = 0;
  let ymax = 1;
  for (const k of keys) {
    for (const v of state.results.get(k)[field]) { if (v > ymax) ymax = v; if (v < ymin) ymin = v; }
  }
  const m = { l: 46, r: 10, t: 14, b: 24 };
  const pw = w - m.l - m.r;
  const ph = h - m.t - m.b;
  const ystep = niceStep(ymax - Math.min(ymin, 0), h < 230 ? 3 : 4);
  // Realised regret can dip just below zero early on (a lucky draw beats the best mean).
  const y0 = Math.min(0, ymin);
  const y1 = Math.ceil(ymax / ystep) * ystep;
  const X = (t) => m.l + (pw * (t - 1)) / Math.max(info.T - 1, 1);
  const Y = (v) => m.t + ph - (ph * (v - y0)) / (y1 - y0 || 1);
  Object.assign(regretGeom, { m, pw, ph, X, Y, xs, T: info.T, keys, field });

  ctx.font = MONO;
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let v = Math.ceil(y0 / ystep) * ystep; v <= y1 + ystep / 2; v += ystep) {
    const y = Math.round(Y(v)) + 0.5;
    ctx.strokeStyle = GRID;
    ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
    ctx.fillStyle = AXIS_TEXT;
    ctx.fillText(fmtCompact(v), m.l - 6, y);
  }
  const xstep = niceStep(info.T, w < 520 ? 3 : 6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let t = 0; t <= info.T; t += xstep) {
    ctx.fillStyle = AXIS_TEXT;
    ctx.fillText(fmtCompact(t), Math.min(Math.max(X(Math.max(t, 1)), m.l + 8), w - m.r - 12), h - m.b + 7);
  }
  ctx.strokeStyle = '#3a3550';
  ctx.beginPath(); ctx.moveTo(m.l, Math.round(Y(0)) + 0.5); ctx.lineTo(w - m.r, Math.round(Y(0)) + 0.5); ctx.stroke();

  // Change points: an event marker, so dashed.
  for (const [t] of info.change_schedule) {
    const x = Math.round(X(t)) + 0.5;
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#6b6684';
    ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = AXIS_TEXT;
    ctx.textAlign = x > w - 80 ? 'right' : 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`change t=${fmtCompact(t)}`, x + (ctx.textAlign === 'left' ? 5 : -5), m.t - 12);
  }

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Draw TS-GE last so the series the story is about sits on top.
  const drawOrder = [...keys].sort((a, b) => (a.startsWith('TS-GE') ? 1 : 0) - (b.startsWith('TS-GE') ? 1 : 0));
  for (const k of drawOrder) {
    const s = series(k);
    const ys = state.results.get(k)[field];
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    if (s.dash) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      const x = X(xs[i]);
      const y = Y(ys[i]);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  const idx = state.hoverRegret;
  if (idx == null || idx >= xs.length) { tip.hidden = true; return; }
  const x = X(xs[idx]);
  ctx.strokeStyle = '#5d5775';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, m.t); ctx.lineTo(Math.round(x) + 0.5, m.t + ph); ctx.stroke();
  const rows = keys.map((k) => ({ s: series(k), v: state.results.get(k)[field][idx] })).sort((a, b) => b.v - a.v);
  for (const { s, v } of rows) {
    ctx.beginPath();
    ctx.arc(x, Y(v), 4, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.strokeStyle = SURFACE;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }
  tip.innerHTML = `<b>slot ${xs[idx].toLocaleString('en-US')}</b>` + rows.map(({ s, v }) =>
    `<div class="row"><span><i class="${s.dash ? 'dash' : ''}" style="--sw:${s.color}"></i>${s.label}</span><span>${fmt(v)}</span></div>`).join('');
  placeTip(tip, $('#regret-chart'), x, m.t);
}

function regretPointer(event) {
  const g = regretGeom;
  if (!g.xs) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const t = 1 + ((px - g.m.l) / g.pw) * (g.T - 1);
  state.hoverRegret = nearestIndex(g.xs, Math.min(Math.max(t, 1), g.T));
  drawRegret();
}

function regretKey(event) {
  const g = regretGeom;
  if (!g.xs) return;
  const n = g.xs.length;
  let i = state.hoverRegret ?? n - 1;
  const step = event.shiftKey ? Math.ceil(n / 10) : Math.ceil(n / 100);
  if (event.key === 'ArrowRight') i = Math.min(n - 1, i + step);
  else if (event.key === 'ArrowLeft') i = Math.max(0, i - step);
  else if (event.key === 'Home') i = 0;
  else if (event.key === 'End') i = n - 1;
  else if (event.key === 'Escape') { state.hoverRegret = null; drawRegret(); return; }
  else return;
  event.preventDefault();
  state.hoverRegret = i;
  drawRegret();
}

// ---------------------------------------------------------------------------
// Arm raster
// ---------------------------------------------------------------------------
const rasterGeom = {};
const HI = [0xc4, 0xb5, 0xfd];
const LO = [0x1d, 0x1a, 0x28];

function drawRaster() {
  const canvas = $('#raster-chart canvas');
  const tip = $('#raster-chart .tip');
  const d = state.results.get(state.rasterKey);
  const info = state.run?.info;
  const K = info?.K ?? 2;
  const rowH = K <= 4 ? 22 : 7;
  const m = { l: 52, r: 10, t: 6, b: 22, gap: K <= 4 ? 6 : 9 };
  canvas.style.height = `${m.t + (K + 1) * rowH + m.gap + m.b}px`;
  const { ctx, w, h } = setupCanvas(canvas);
  if (!d || !info) {
    tip.hidden = true;
    emptyMessage(ctx, w, h, state.busy ? 'Running…' : 'Press Run');
    return;
  }
  const rows = d.raster_rows;
  const cols = d.raster_columns;
  const pw = w - m.l - m.r;
  const X = (t) => m.l + (pw * (t - 1)) / info.T; // left edge of slot t
  const rowY = (r) => m.t + r * rowH + (r === rows - 1 ? m.gap : 0);
  Object.assign(rasterGeom, { m, pw, rowH, rows, cols, X, rowY, T: info.T, K });

  // Cells: one pixel per (column, row) in an offscreen image, scaled up unsmoothed.
  const off = document.createElement('canvas');
  off.width = cols;
  off.height = rows;
  const octx = off.getContext('2d');
  const img = octx.createImageData(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const share = d.raster[r * cols + c] / 255;
      const o = 4 * (r * cols + c);
      img.data[o] = LO[0] + (HI[0] - LO[0]) * share;
      img.data[o + 1] = LO[1] + (HI[1] - LO[1]) * share;
      img.data[o + 2] = LO[2] + (HI[2] - LO[2]) * share;
      img.data[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  for (let r = 0; r < rows; r++) {
    ctx.drawImage(off, 0, r, cols, 1, m.l, rowY(r), pw, rowH - (rowH > 10 ? 2 : 1));
  }

  // Best arm at each moment, outlined.
  ctx.strokeStyle = TEXT;
  ctx.lineWidth = 1.25;
  for (const [s, e, arm] of info.best_segments) {
    const x0 = X(s);
    const x1 = X(e + 1);
    ctx.strokeRect(x0 + 0.5, rowY(arm) - 0.5, Math.max(1, x1 - x0 - 1), rowH - (rowH > 10 ? 1 : 0));
  }
  for (const [t] of info.change_schedule) {
    const x = Math.round(X(t)) + 0.5;
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#6b6684';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, m.t - 4); ctx.lineTo(x, h - m.b + 2); ctx.stroke();
    ctx.restore();
  }

  ctx.font = MONO;
  ctx.fillStyle = AXIS_TEXT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const every = K <= 4 ? 1 : 3;
  for (let r = 0; r < rows - 1; r++) {
    if (r % every && r !== rows - 2) continue;
    ctx.fillText(K <= 4 ? `arm ${r}` : `${r}`, m.l - 6, rowY(r) + rowH / 2);
  }
  ctx.fillText('probe', m.l - 6, rowY(rows - 1) + rowH / 2);
  if (K > 4) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('arm', 2, m.t);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xstep = niceStep(info.T, w < 520 ? 3 : 6);
  for (let t = 0; t <= info.T; t += xstep) {
    ctx.fillText(fmtCompact(t), Math.min(Math.max(X(Math.max(t, 1)), m.l + 8), w - m.r - 12), h - m.b + 7);
  }

  const hv = state.hoverRaster;
  if (!hv) { tip.hidden = true; return; }
  const { r, c } = hv;
  const start = Math.ceil((c * info.T) / cols) + 1;
  const end = Math.ceil(((c + 1) * info.T) / cols);
  const share = d.raster[r * cols + c] / 255;
  const best = info.best_segments.find(([s, e]) => start >= s && start <= e)?.[2];
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  const cx0 = X(start);
  ctx.strokeRect(cx0 - 0.5, rowY(r) - 0.5, Math.max(2, X(end + 1) - cx0) + 1, rowH);
  const who = r === rows - 1 ? 'group probes (BP/GE)' : `arm ${r}`;
  tip.innerHTML = `<b>${series(state.rasterKey).label} · slots ${start.toLocaleString('en-US')}–${end.toLocaleString('en-US')}</b>
    <div>${who}: ${(100 * share).toFixed(0)}% of these slots</div><div class="muted">best arm then: ${best ?? '–'}</div>`;
  placeTip(tip, $('#raster-chart'), X(start), Math.max(0, rowY(r) - 64));
}

function rasterPointer(event) {
  const g = rasterGeom;
  if (!g.cols || !state.results.has(state.rasterKey)) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  const c = Math.floor(((px - g.m.l) / g.pw) * g.cols);
  let r = -1;
  for (let i = 0; i < g.rows; i++) if (py >= g.rowY(i) && py < g.rowY(i) + g.rowH) r = i;
  state.hoverRaster = c >= 0 && c < g.cols && r >= 0 ? { r, c } : null;
  drawRaster();
}

function rasterKey(event) {
  const g = rasterGeom;
  if (!g.cols || !state.results.has(state.rasterKey)) return;
  const hv = state.hoverRaster ?? { r: 0, c: 0 };
  const step = event.shiftKey ? Math.ceil(g.cols / 10) : 1;
  if (event.key === 'ArrowRight') hv.c = Math.min(g.cols - 1, hv.c + step);
  else if (event.key === 'ArrowLeft') hv.c = Math.max(0, hv.c - step);
  else if (event.key === 'ArrowDown') hv.r = Math.min(g.rows - 1, hv.r + 1);
  else if (event.key === 'ArrowUp') hv.r = Math.max(0, hv.r - 1);
  else if (event.key === 'Escape') { state.hoverRaster = null; drawRaster(); return; }
  else return;
  event.preventDefault();
  state.hoverRaster = { ...hv };
  drawRaster();
}

// ---------------------------------------------------------------------------
// README regression check
// ---------------------------------------------------------------------------
async function runRegression() {
  if (state.busy) return;
  setBusy(true);
  const table = $('#regression');
  const body = table.querySelector('tbody');
  table.hidden = true;
  const started = performance.now();
  try {
    const rows = await send('regression', {}, (msg) => {
      if (msg.type === 'regression_progress') {
        const s = Math.round((performance.now() - started) / 1000);
        setStatus(`README check: seed ${msg.seed} of ${msg.total}, all five algorithms · ${s} s`);
        setRunProgress(msg.index / msg.total);
      }
    });
    body.innerHTML = '';
    let all = true;
    for (const a of ALGOS) {
      const row = rows[a.id];
      if (!row) continue;
      all &&= row.matches;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="name"><span class="sw" style="--sw:${a.color}"></span>${a.label}</td>
        <td class="num">${row.live.mean.toFixed(6)}</td><td class="num">${row.readme.mean.toFixed(6)}</td>
        <td class="num opt">${row.live.std.toFixed(6)}</td>
        <td class="${row.matches ? 'ok' : 'bad'}">${row.matches ? 'yes' : 'no'}</td>`;
      body.appendChild(tr);
    }
    table.hidden = false;
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    setStatus(all
      ? `README check: all five match the README's mean, std, min and max to 6 decimals (${secs} s).`
      : `README check: some values differ from the README (${secs} s); see the table.`, !all);
  } catch (error) {
    setStatus(`Error: ${error.message}`, true);
  } finally {
    setRunProgress(null);
    setBusy(false);
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
let resizeQueued = false;
function observeResize() {
  const ro = new ResizeObserver(() => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; drawRegret(); drawRaster(); });
  });
  ro.observe($('#regret-chart'));
  ro.observe($('#raster-chart'));
}

$('#start').addEventListener('click', start);
$('#controls').addEventListener('submit', (event) => {
  event.preventDefault();
  runJobs(defaultJobs(), { fresh: true });
});
for (const b of document.querySelectorAll('.case-btn')) {
  b.addEventListener('click', () => {
    if (state.busy || b.dataset.preset === state.preset) return;
    selectPreset(b.dataset.preset).catch((e) => setStatus(`Error: ${e.message}`, true));
  });
}
for (const b of document.querySelectorAll('[data-measure]')) {
  b.addEventListener('click', () => {
    state.measure = b.dataset.measure;
    for (const o of document.querySelectorAll('[data-measure]')) o.setAttribute('aria-pressed', String(o === b));
    renderAll();
  });
}
for (const b of document.querySelectorAll('#phase-variant button')) {
  b.addEventListener('click', async () => {
    state.phaseVariant = b.dataset.variant;
    renderPhases();
    if (b.dataset.variant === 'typo' && state.run && !state.results.has(TYPO_KEY) && !state.pending.has(TYPO_KEY)) {
      $('#typo').checked = true;
      await runJobs([{ algorithm: 'TS-GE', typo: true, key: TYPO_KEY }], { fresh: false });
    }
  });
}
$('#delta-check').addEventListener('click', async () => {
  const delta = readDelta();
  if (Number.isNaN(delta)) { setStatus('TS-GE delta must be a positive number.', true); return; }
  try {
    const info = await send('describe', { preset: state.preset, delta });
    renderFindings(info, info.preflight_ok ? null : 'The repo would refuse to run this case: see the ERROR lines above.');
    setStatus(info.preflight_ok
      ? `Preflight passes at delta=${info.ts_ge_delta}. Run uses it for TS-GE.`
      : `Preflight refuses delta=${info.ts_ge_delta}.`, !info.preflight_ok);
  } catch (e) { setStatus(`Error: ${e.message}`, true); }
});
$('#delta-reset').addEventListener('click', () => {
  if (!state.caseInfo) return;
  $('#delta').value = state.caseInfo.default_delta;
  renderFindings(state.caseInfo);
  setStatus(`TS-GE delta back to the case's ${state.caseInfo.default_delta}.`);
});
$('#regression-run').addEventListener('click', runRegression);

const regretCanvas = $('#regret-chart canvas');
regretCanvas.addEventListener('pointermove', regretPointer);
regretCanvas.addEventListener('pointerdown', regretPointer);
// A finger lifting also fires pointerleave; keep a tapped readout until the next tap.
regretCanvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && document.activeElement !== regretCanvas) { state.hoverRegret = null; drawRegret(); } });
regretCanvas.addEventListener('keydown', regretKey);
regretCanvas.addEventListener('blur', () => { state.hoverRegret = null; drawRegret(); });
const rasterCanvas = $('#raster-chart canvas');
rasterCanvas.addEventListener('pointermove', rasterPointer);
rasterCanvas.addEventListener('pointerdown', rasterPointer);
rasterCanvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && document.activeElement !== rasterCanvas) { state.hoverRaster = null; drawRaster(); } });
rasterCanvas.addEventListener('keydown', rasterKey);
rasterCanvas.addEventListener('blur', () => { state.hoverRaster = null; drawRaster(); });
