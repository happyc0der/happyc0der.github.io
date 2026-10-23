// ephys-mcp tool console. Python runs in worker.js; this file builds forms from the tool
// signatures the server reports, sends calls, and shows what comes back.
import { drawFigure } from './charts.js';

const $ = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c);
  return n;
};

// Measured transfer for a cold cache (see BUILD.md); the bar fills against decoded bytes.
const EXPECTED_BYTES = 30_500_000;

const GROUPS = [
  ['Sessions', ['list_sources', 'open_session', 'get_session_info', 'close_session']],
  ['Signal', ['get_signal_quality', 'detect_spikes', 'get_firing_rates', 'plot_raster']],
  ['Decoding', ['fit_decoder', 'decode_window', 'plot_decoding', 'evaluate_cross_session']],
  ['Trials and latents', ['get_psth', 'plot_psth', 'fit_latent_factors', 'plot_latent_factors']],
  ['Probe', ['set_probe_geometry', 'get_probe', 'plot_probe', 'sort_spikes']],
  ['Archive and live streams', ['search_datasets', 'list_dataset_files', 'list_lsl_streams', 'get_stream_status']],
];
const UNAVAILABLE = {
  sort_spikes: 'Needs the sort extra (spikeinterface and its sorters), which this page does not load. In the repo it runs with pip install "ephys-mcp[sort]".',
  list_dataset_files: 'Calls the DANDI Archive API over the network. Python on this page makes no network requests, so it is switched off.',
  list_lsl_streams: 'Needs pylsl and a Lab Streaming Layer stream on your local network.',
  get_stream_status: 'Applies to live Lab Streaming Layer sessions, which need pylsl and a stream on your network.',
};
const SOURCE_OFF = {
  nwb: 'reads a local NWB file with pynwb and h5py, not loaded here',
  wav_dir: 'reads WAV files from a folder on your disk',
  dandi: 'streams an NWB file from the DANDI Archive over the network',
  lsl: 'subscribes to a live stream on your network (pylsl)',
};
// Slider ranges for the synthetic source. The server accepts more (1-1024 units, 1-3600 s);
// the page caps them so calls stay quick in a browser.
const SYN = {
  n_units: { min: 4, max: 96, step: 1, label: 'units' },
  duration_s: { min: 30, max: 600, step: 10, label: 's' },
  noise: { min: 0, max: 3, step: 0.1, label: '' },
  seed: { min: 0, max: 99, step: 1, label: '' },
  pitch_um: { min: 0, max: 100, step: 5, label: 'µm' },
};
const SLOW = { fit_latent_factors: 'GPFA runs 60 EM iterations; expect around 20 s here (PCA takes well under a second).', evaluate_cross_session: 'Cross-validates the decoder on every session; expect several seconds.', fit_decoder: 'Ridge picks its penalty by 5-fold blocked cross-validation; expect a few seconds.' };

const state = {
  meta: null,
  tools: new Map(),
  sessions: new Map(), // id -> session info returned by open_session
  decoders: new Map(), // session id -> last fit_decoder result
  log: [],
  current: null,
  viewing: null,
  busy: false,
  values: new Map(), // tool -> {param: value} the visitor set
};

// ---- worker ---------------------------------------------------------------------------------
let worker = null;
let nextId = 1;
const pending = new Map();
let testHandlers = null;

function startWorker() {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'status') setStatus(data.text, data.frac);
    else if (data.type === 'bytes') setBytes(data.received);
    else if (data.type === 'ready') onReady(data);
    else if (data.type === 'result' || data.type === 'tests-done') { pending.get(data.id)?.(data); pending.delete(data.id); }
    else if (data.type === 'test-row') testHandlers?.row(data.row);
    else if (data.type === 'test-log') testHandlers?.log(data.line);
    else if (data.type === 'fatal') {
      if (data.id && pending.has(data.id)) { pending.get(data.id)({ ok: false, error: data.error, ms: 0, fatal: true }); pending.delete(data.id); }
      else showFatal(data.error);
    }
  };
  worker.onerror = (e) => showFatal(e.message || 'the worker failed to start');
  worker.postMessage({ type: 'init' });
}
const send = (msg) => new Promise((resolve) => { const id = nextId++; pending.set(id, resolve); worker.postMessage({ ...msg, id }); });

// ---- poster ---------------------------------------------------------------------------------
let loadStarted = 0;
function setStatus(text, frac) {
  $('status-text').textContent = text;
  if (frac !== undefined) $('progress').firstElementChild.style.width = `${Math.round(frac * 100)}%`;
}
function setBytes(n) {
  const frac = Math.min(0.97, n / EXPECTED_BYTES);
  $('progress').firstElementChild.style.width = `${Math.round(frac * 100)}%`;
  $('progress').setAttribute('aria-valuenow', Math.round(frac * 100));
  $('status').dataset.mb = (n / 1e6).toFixed(1);
  $('mb').textContent = `· ${(n / 1e6).toFixed(1)} MB`;
}
function showFatal(msg) {
  const s = $('status');
  s.classList.add('error');
  $('status-text').textContent = `Python failed to start: ${msg}`;
  $('mb').textContent = '';
  $('start').disabled = false;
  $('start').textContent = 'Try again';
}
$('start').addEventListener('click', () => {
  $('start').disabled = true;
  $('start').textContent = 'Starting…';
  $('progress').hidden = false;
  $('progress').setAttribute('role', 'progressbar');
  $('progress').setAttribute('aria-label', 'Loading Python');
  $('status').classList.remove('error');
  loadStarted = performance.now();
  if (worker) worker.terminate();
  startWorker();
});

function onReady({ meta, loadMs, importMs }) {
  state.meta = meta;
  for (const t of meta.tools) state.tools.set(t.name, t);
  $('progress').firstElementChild.style.width = '100%';
  $('poster').hidden = true;
  $('console').hidden = false;
  $('runline').textContent = `Python ${meta.python} · NumPy ${meta.numpy} · SciPy ${meta.scipy} · ready in ${((performance.now() - loadStarted) / 1000).toFixed(1)} s (import ${importMs} ms)`;
  buildNav();
  buildLog();
  selectTool('list_sources');
  $('announce').textContent = 'Python is ready. Pick a tool and call it.';
  window.addEventListener('resize', debounce(() => { if (state.viewing) renderResult(state.viewing, false); }, 150));
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---- navigation -----------------------------------------------------------------------------
function grouped() {
  const seen = new Set();
  const out = GROUPS.map(([g, names]) => [g, names.filter((n) => state.tools.has(n) && (seen.add(n) || true))]);
  const rest = [...state.tools.keys()].filter((n) => !seen.has(n));
  if (rest.length) out.push(['Other', rest]);
  return out;
}
function buildNav() {
  const nav = $('tools-nav');
  nav.replaceChildren();
  const sel = $('tool-select');
  sel.replaceChildren();
  for (const [g, names] of grouped()) {
    nav.append(h('h3', { class: 'label', text: g }));
    const ul = h('ul');
    const og = h('optgroup', { label: g });
    for (const n of names) {
      const off = n in UNAVAILABLE;
      const tag = off ? 'off' : state.tools.get(n).figure ? 'fig' : '';
      ul.append(h('li', {}, h('button', { type: 'button', class: `tool-btn${off ? ' off' : ''}`, 'data-tool': n, onclick: () => selectTool(n) }, h('span', { text: n }), tag ? h('span', { class: 'tag', text: tag }) : null)));
      og.append(h('option', { value: n, text: off ? `${n} (off here)` : n }));
    }
    nav.append(ul);
    sel.append(og);
  }
  sel.addEventListener('change', () => selectTool(sel.value));
  nav.addEventListener('keydown', (e) => { // arrow keys move through the list
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const btns = [...nav.querySelectorAll('.tool-btn')];
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length].focus({ preventScroll: false });
  });
}
function selectTool(name) {
  state.current = name;
  for (const b of document.querySelectorAll('.tool-btn')) b.setAttribute('aria-current', String(b.dataset.tool === name));
  $('tool-select').value = name;
  renderCard();
  const last = [...state.log].reverse().find((e) => e.name === name);
  if (last) renderResult(last, false);
  else {
    state.viewing = null;
    $('result').replaceChildren(h('p', { class: 'empty', text: name in UNAVAILABLE ? 'This tool is switched off on this page.' : 'Call the tool to see what it returns.' }));
    markLog();
  }
}

// ---- tool card and argument form ------------------------------------------------------------
function sessionOptions(select, allowNone) {
  if (allowNone) select.append(h('option', { value: '', text: '(none)' }));
  for (const [id, info] of state.sessions) select.append(h('option', { value: id, text: `${id} · ${info.n_channels} units, ${info.duration_s} s` }));
}
function currentSession(values) {
  const id = values.session_id || values.train_session_id || [...state.sessions.keys()].pop();
  return state.sessions.get(id);
}

function fieldFor(tool, p, values, onChange) {
  const id = `f-${tool.name}-${p.name}`;
  const v = values[p.name];
  // Changing the session (or the source) changes which other choices exist, so the card is rebuilt;
  // anything else only refreshes the call line, keeping focus where it is.
  const set = (val) => { values[p.name] = val; onChange(['session_id', 'train_session_id', 'source'].includes(p.name)); };
  const label = h('label', { for: id, text: p.name });
  const hint = (s) => h('span', { class: 'hint', text: s });
  const sess = currentSession(values);

  if (tool.name === 'search_datasets' && p.name === 'query') {
    return h('div', { class: 'field wide' }, label, h('input', { id, type: 'text', value: '', disabled: true }),
      hint('Locked to an empty query: that returns the curated list built into the server, offline. Any other query calls the DANDI API.'));
  }
  if (p.type === 'session') {
    const s = h('select', { id, onchange: (e) => set(e.target.value) });
    sessionOptions(s, false);
    if (!state.sessions.size) {
      s.disabled = true;
      return h('div', { class: 'field' }, label, s, hint('No session yet: call open_session first.'));
    }
    s.value = v || '';
    return h('div', { class: 'field' }, label, s);
  }
  if (p.type === 'sessions') {
    const train = values.train_session_id;
    const box = h('div', { class: 'checks', id, role: 'group', 'aria-label': p.name });
    const others = [...state.sessions.keys()].filter((k) => k !== train);
    for (const k of others) {
      const cb = h('input', { type: 'checkbox', value: k, checked: (v || []).includes(k), onchange: () => set([...box.querySelectorAll('input:checked')].map((c) => c.value)) });
      box.append(h('label', {}, cb, k));
    }
    return h('div', { class: 'field wide' }, h('span', { class: 'flabel', text: p.name }), others.length ? box : hint('Open a second synthetic session to test on.'),
      hint('The simulator has no notion of days. A different seed draws new units, so a decoder should not transfer; the same seed, units and duration with another noise level keeps the units and the trajectory.'));
  }
  if (p.type === 'params') {
    const src = values.source || 'synthetic';
    const defaults = state.meta.sources[src]?.params || {};
    const keys = Object.keys(defaults);
    const box = h('fieldset', { class: 'params-box' }, h('legend', { text: `params (${src})` }));
    if (!keys.length) { box.append(hint('This source takes no params.')); return box; }
    const cur = { ...defaults, ...(v || {}) };
    for (const k of keys) {
      const r = SYN[k];
      const fid = `${id}-${k}`;
      if (src === 'synthetic' && r) {
        const out = h('output', { for: fid, text: `${cur[k]}${r.label ? ` ${r.label}` : ''}` });
        const input = h('input', { id: fid, type: 'range', min: r.min, max: r.max, step: r.step, value: cur[k],
          oninput: (e) => { const val = +e.target.value; out.textContent = `${val}${r.label ? ` ${r.label}` : ''}`; values[p.name] = { ...(values[p.name] || {}), [k]: val }; onChange(); } });
        box.append(h('div', { class: 'field' }, h('label', { for: fid, text: k }), h('div', { class: 'range-row' }, input, out),
          k === 'pitch_um' ? hint('0 = isolated electrodes; above 0, a linear probe where units bleed onto neighbours.') : null));
      } else {
        box.append(h('div', { class: 'field' }, h('label', { for: fid, text: k }), h('input', { id: fid, type: 'text', value: cur[k], disabled: true })));
      }
    }
    return box;
  }
  if (tool.name === 'open_session' && p.name === 'source') {
    const s = h('select', { id, onchange: (e) => { values.params = null; set(e.target.value); } });
    for (const [k, info] of Object.entries(state.meta.sources)) {
      const off = SOURCE_OFF[k];
      s.append(h('option', { value: k, disabled: !!off, text: off ? `${k} (off: ${off})` : k === 'n1_stub' ? `${k} (${info.status})` : k }));
    }
    s.value = v;
    const desc = state.meta.sources[v]?.description;
    return h('div', { class: 'field wide' }, label, s, desc ? hint(desc) : null);
  }
  // Names whose choices come from the selected session's metadata.
  const pick = (choices, noneText) => {
    const s = h('select', { id, onchange: (e) => set(e.target.value || null) });
    s.append(h('option', { value: '', text: noneText }));
    for (const c of choices) s.append(h('option', { value: c, text: c }));
    s.value = choices.includes(v) ? v : '';
    return h('div', { class: 'field' }, label, s);
  };
  if (p.name === 'group_by' && sess) return pick(sess.group_columns || [], '(none)');
  if (p.name === 'event' && sess) return pick(sess.event_columns || [], '(default: movement onset)');
  if (p.name === 'target' && sess) return pick(Object.keys(sess.behavior_signals || {}), '(first velocity-like signal)');
  if (p.name === 'mask' && sess) {
    const sig = Object.entries(sess.behavior_signals || {}).filter(([, d]) => d === 1).map(([k]) => k);
    const f = pick(sig, '(none)');
    if (v && !sig.includes(v)) f.append(hint(`server default ${JSON.stringify(v)} applies only where the file has it; the simulator does not`));
    return f;
  }
  if (p.type === 'choice') {
    const s = h('select', { id, onchange: (e) => set(e.target.value) });
    for (const c of p.choices) s.append(h('option', { value: c, text: c }));
    s.value = v;
    return h('div', { class: 'field' }, label, s);
  }
  if (p.type === 'int' || p.type === 'float') {
    const input = h('input', { id, type: 'number', step: p.type === 'int' ? 1 : 'any', value: v ?? '', inputmode: 'decimal',
      onchange: (e) => set(e.target.value === '' ? (p.optional ? null : p.default) : +e.target.value) });
    if (p.optional) input.placeholder = 'none';
    return h('div', { class: 'field' }, label, input, p.required && p.name === 't0' ? hint('Pick a window in the test split for an honest picture.') : null);
  }
  if (p.type === 'int_list') {
    const input = h('input', { id, type: 'text', value: (v || []).join(', '), placeholder: 'all, or e.g. 0, 3, 7',
      onchange: (e) => { const xs = e.target.value.split(/[\s,]+/).filter(Boolean).map(Number); set(xs.length ? xs : null); } });
    return h('div', { class: 'field' }, label, input);
  }
  if (p.type === 'json') {
    const ta = h('textarea', { id, placeholder: 'none, or JSON such as [[0, 0], [0, 400]]', onchange: (e) => { try { set(e.target.value.trim() ? JSON.parse(e.target.value) : null); } catch { e.target.setCustomValidity('Not valid JSON'); e.target.reportValidity(); } } });
    ta.value = v ? JSON.stringify(v) : '';
    return h('div', { class: 'field wide' }, label, ta);
  }
  const input = h('input', { id, type: 'text', value: v ?? '', placeholder: p.optional ? 'none' : '', onchange: (e) => set(e.target.value === '' && p.optional ? null : e.target.value) });
  return h('div', { class: 'field' }, label, input);
}

function initialValues(tool) {
  const vals = {};
  for (const p of tool.params) if ('default' in p) vals[p.name] = p.default;
  const sid = [...state.sessions.keys()].pop();
  for (const p of tool.params) {
    if (p.type === 'sessions') vals[p.name] = [];
    if (p.type === 'session' && sid) vals[p.name] = sid;
    if (p.name === 't0' && p.required) {
      const d = state.decoders.get(sid);
      vals.t0 = d ? d.test_window_s[0] : 0;
    }
  }
  const sess = state.sessions.get(sid);
  if (sess && tool.params.some((p) => p.name === 'group_by') && (sess.group_columns || []).includes('direction')) vals.group_by = 'direction';
  return vals;
}
function valuesFor(tool) {
  if (!state.values.has(tool.name)) state.values.set(tool.name, initialValues(tool));
  const vals = state.values.get(tool.name);
  for (const p of tool.params) { // a session that was closed is no longer a valid choice
    if (p.type === 'session' && vals[p.name] && !state.sessions.has(vals[p.name])) vals[p.name] = [...state.sessions.keys()].pop() || '';
    if (p.type === 'session' && !vals[p.name] && state.sessions.size) vals[p.name] = [...state.sessions.keys()].pop();
    if (p.type === 'sessions' && vals[p.name]) vals[p.name] = vals[p.name].filter((k) => state.sessions.has(k) && k !== vals.train_session_id);
  }
  return vals;
}
function kwargsFor(tool, vals) {
  const kw = {};
  for (const p of tool.params) {
    const v = vals[p.name];
    if (tool.name === 'search_datasets' && p.name === 'query') continue;
    if (p.required || JSON.stringify(v) !== JSON.stringify(p.default)) if (v !== undefined) kw[p.name] = v;
  }
  if (tool.name === 'open_session' && kw.params) {
    const defs = state.meta.sources[vals.source || 'synthetic']?.params || {};
    const diff = Object.fromEntries(Object.entries(kw.params).filter(([k, v]) => defs[k] !== v));
    if (Object.keys(diff).length) kw.params = diff; else delete kw.params;
  }
  return kw;
}
const callText = (name, kw) => `${name}(${Object.entries(kw).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')})`;

function renderCard() {
  const tool = state.tools.get(state.current);
  const card = $('card');
  card.replaceChildren();
  const off = UNAVAILABLE[tool.name];
  card.append(h('div', { class: 'card-head' }, h('h2', { text: tool.name }),
    tool.figure ? h('span', { class: 'pill', text: 'figure' }) : null, off ? h('span', { class: 'pill', text: 'off here' }) : null));
  card.append(h('p', { class: 'doc', text: tool.doc }));
  if (off) { card.append(h('p', { class: 'reason', text: off })); return; }
  const vals = valuesFor(tool);
  const line = h('p', { class: 'callline' });
  const btn = h('button', { class: 'btn primary', type: 'submit', text: 'Call tool', disabled: state.busy });
  const needsSession = tool.params.some((p) => p.type === 'session') && !state.sessions.size;
  const refresh = (rebuild = false) => {
    const kw = kwargsFor(tool, vals);
    line.replaceChildren(h('b', { text: 'tools/call ' }), callText(tool.name, kw));
    if (rebuild) {
      const focused = document.activeElement && document.activeElement.id;
      renderCard();
      if (focused && $(focused)) $(focused).focus({ preventScroll: true });
    }
  };
  const form = h('form', { class: 'args', onsubmit: (e) => { e.preventDefault(); if (!state.busy) invoke(tool.name, kwargsFor(tool, vals)); } });
  for (const p of tool.params) form.append(fieldFor(tool, p, vals, refresh));
  const actions = h('div', { class: 'actions' }, btn);
  if (needsSession) {
    btn.disabled = true;
    actions.append(h('button', { type: 'button', class: 'btn', text: 'Open a default session', disabled: state.busy, onclick: () => invoke('open_session', {}, { stay: true }) }));
  }
  actions.append(h('span', { class: 'runline', 'data-busy': '' }));
  if (SLOW[tool.name]) actions.append(h('span', { class: 'hint', text: SLOW[tool.name] }));
  form.append(actions, h('div', { class: 'field wide' }, line));
  card.append(form);
  refresh(false);
}

// ---- calling --------------------------------------------------------------------------------
// A running timer next to the Call button and in the call log; screen readers get one
// announcement at the start and one at the end instead of every tick.
let ticker = null;
function setBusy(on, label = '') {
  state.busy = on;
  for (const b of document.querySelectorAll('#card button, .log-actions button')) b.disabled = on;
  clearInterval(ticker);
  const lines = () => document.querySelectorAll('[data-busy]');
  if (on) {
    $('announce').textContent = `Running ${label}`;
    const t0 = performance.now();
    const tick = () => { for (const l of lines()) l.textContent = `Running ${label} · ${((performance.now() - t0) / 1000).toFixed(1)} s`; };
    tick();
    ticker = setInterval(tick, 100);
  } else for (const l of lines()) l.textContent = '';
}

async function invoke(name, kwargs, { quiet = false, stay = false } = {}) {
  const hadFocus = $('card').contains(document.activeElement); // the card is rebuilt below
  setBusy(true, name);
  const t0 = performance.now();
  const r = await send({ type: 'call', name, kwargs });
  const entry = { n: state.log.length + 1, name, kwargs, ok: r.ok, result: r.result, error: r.error, figure: r.figure, ms: r.ms, roundMs: performance.now() - t0 };
  state.log.push(entry);
  if (r.ok && name === 'open_session') state.sessions.set(r.result.session_id, r.result);
  if (r.ok && name === 'close_session') { state.sessions.delete(kwargs.session_id); state.decoders.delete(kwargs.session_id); }
  if (r.ok && name === 'fit_decoder') {
    state.decoders.set(kwargs.session_id, r.result);
    for (const t of ['decode_window', 'plot_decoding']) { const v = state.values.get(t); if (v && v.session_id === kwargs.session_id) v.t0 = r.result.test_window_s[0]; }
  }
  if (name === 'open_session' && r.ok) for (const [t, v] of state.values) if (t !== 'open_session') { // point other tools at the new session
    const tool = state.tools.get(t);
    for (const p of tool.params) if (p.type === 'session') v[p.name] = r.result.session_id;
    if (tool.params.some((p) => p.name === 'group_by') && (r.result.group_columns || []).includes('direction') && v.group_by == null) v.group_by = 'direction';
  }
  setBusy(false);
  $('announce').textContent = r.ok ? `${name} returned in ${fmtMs(r.ms)}` : `${name} returned an error`;
  if (r.fatal) entry.error = `Python stopped: ${r.error}`;
  addLogEntry(entry);
  if (!quiet || !r.ok) {
    if (!stay && state.current !== name) { state.current = name; for (const b of document.querySelectorAll('.tool-btn')) b.setAttribute('aria-current', String(b.dataset.tool === name)); $('tool-select').value = name; }
    renderCard();
    renderResult(entry);
    if (hadFocus) $('card').querySelector('button[type=submit]')?.focus({ preventScroll: true });
  }
  return entry;
}

// ---- result view ----------------------------------------------------------------------------
function highlight(json) {
  const esc = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (m, s, colon, b, n) => {
    if (s) return colon ? `<span class="k">${s}</span>${colon}` : `<span class="s">${s}</span>`;
    if (b) return `<span class="b">${b}</span>`;
    return `<span class="n">${n}</span>`;
  });
}
function chips(result) {
  const obj = Array.isArray(result) ? result[0] : result;
  if (!obj || typeof obj !== 'object') return null;
  const flat = [];
  const visit = (o, prefix) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number') flat.push([prefix + k, v]);
      else if (v && typeof v === 'object' && !Array.isArray(v) && prefix === '' && ['vs_ground_truth', 'behaviour_explained'].includes(k)) visit(v, `${k}.`);
    }
  };
  visit(obj, '');
  if (!flat.length) return null;
  return h('div', { class: 'chips' }, flat.slice(0, 12).map(([k, v]) => h('span', { class: 'chip' }, h('span', { text: k }), String(v))));
}
function renderResult(entry, reveal = true) {
  state.viewing = entry;
  const box = $('result');
  box.replaceChildren();
  box.append(h('div', { class: 'result-head' },
    h('span', { class: entry.ok ? 'ok' : 'error', text: entry.ok ? `#${entry.n} returned` : `#${entry.n} ToolError` }),
    h('span', { class: 'muted', text: `${fmtMs(entry.ms)} in Python here` }),
    h('span', { class: 'muted callline', text: callText(entry.name, entry.kwargs) })));
  if (!entry.ok) {
    box.append(h('div', { class: 'err-box', text: entry.error }));
    box.append(h('p', { class: 'empty', text: 'This is the message the server would send back to the model as an error result.' }));
  } else {
    const c = chips(entry.result);
    if (c) box.append(c);
    if (entry.figure) {
      const host = h('div');
      box.append(host);
      drawFigure(host, entry.figure);
    }
    const text = JSON.stringify(entry.result, null, 2);
    const pre = h('pre');
    pre.innerHTML = highlight(text);
    box.append(h('details', { class: 'json', open: !entry.figure }, h('summary', { text: `Tool result JSON · ${(text.length / 1024).toFixed(1)} KB` }), pre));
  }
  markLog();
  if (reveal) revealResult(box);
}
// Bring the result into view inside this document only. scrollIntoView could also scroll the
// page that embeds the demo, so offsets are set by hand on the pane or on this frame's window.
function revealResult(box) {
  const pane = box.closest('.pane');
  if (pane && getComputedStyle(pane).overflowY === 'auto') {
    const top = box.offsetTop - pane.offsetTop;
    if (top - pane.scrollTop > pane.clientHeight * 0.55 || top < pane.scrollTop) pane.scrollTop = Math.max(0, top - 8);
  } else {
    const r = box.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.7 || r.top < 0) window.scrollTo({ top: window.scrollY + r.top - 8 });
  }
}
const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.max(ms, 0.1).toFixed(ms < 10 ? 1 : 0)} ms`);

// ---- call log, analyze_session, self-check --------------------------------------------------
function logPanel() {
  return h('div', { class: 'log-wrap', style: 'display:flex;flex-direction:column;gap:12px' },
    h('section', { class: 'panel' },
      h('h3', { class: 'label', text: 'Replay a session' }),
      h('p', { text: 'Runs the tool sequence in the server\'s analyze_session prompt, one call after another, on the newest session (or a default one).' }),
      h('div', { class: 'log-actions actions' }, h('button', { class: 'btn primary', type: 'button', onclick: runAnalyze, text: 'Run analyze_session' })),
      h('details', { class: 'more' }, h('summary', { class: 'label', text: 'Prompt text' }), h('p', { class: 'mono', style: 'font-size:11.5px;margin-top:8px', text: state.meta.prompt })),
      h('div', { class: 'run-summary' })),
    h('section', { class: 'panel' },
      h('h3', { class: 'label', text: 'Open sessions' }),
      h('div', { class: 'sessions' })),
    h('section', { class: 'panel' },
      h('h3', { class: 'label', text: 'Call log' }),
      h('p', { class: 'runline', 'data-busy': '' }),
      h('ol', { class: 'log-list' })),
    h('section', { class: 'panel' },
      h('h3', { class: 'label', text: 'Self-check' }),
      h('p', { text: 'Runs the repo\'s own offline tests (5 files) with pytest in this tab. Loads pytest (about 1.6 MB more) and takes around a minute.' }),
      h('div', { class: 'log-actions actions' }, h('button', { class: 'btn', type: 'button', onclick: runTests, text: 'Run the tests' })),
      h('div', { class: 'tests-out' })));
}
function buildLog() {
  $('log-panel-side').replaceChildren(logPanel());
  $('log-panel-inline').replaceChildren(logPanel());
  renderSessions();
}
function renderSessions() {
  for (const box of document.querySelectorAll('.sessions')) {
    box.replaceChildren();
    if (!state.sessions.size) box.append(h('span', { class: 'empty', text: 'None yet.' }));
    for (const [id, s] of state.sessions) box.append(h('span', { class: 'sess', text: `${id} · ${s.n_channels} units, ${s.duration_s} s, ${s.n_trials} trials` }));
  }
}
function addLogEntry(entry) {
  for (const list of document.querySelectorAll('.log-list')) {
    const b = h('button', { type: 'button', class: `log-item${entry.ok ? '' : ' bad'}`, 'data-n': entry.n, onclick: () => { selectToolQuiet(entry.name); renderResult(entry); } },
      h('span', { class: 'n', text: `#${entry.n}` }), h('span', { class: 'nm', text: entry.name }), h('span', { class: 'ms', text: fmtMs(entry.ms) }));
    list.prepend(h('li', {}, b));
  }
  renderSessions();
  markLog();
}
function selectToolQuiet(name) {
  state.current = name;
  for (const b of document.querySelectorAll('.tool-btn')) b.setAttribute('aria-current', String(b.dataset.tool === name));
  $('tool-select').value = name;
  renderCard();
}
function markLog() {
  for (const b of document.querySelectorAll('.log-item')) b.setAttribute('aria-current', String(state.viewing && +b.dataset.n === state.viewing.n));
}

async function runAnalyze() {
  if (state.busy) return;
  const summary = [];
  const t0 = performance.now();
  let sid = [...state.sessions.keys()].pop();
  if (!sid) {
    const r = await invoke('open_session', {}, { quiet: true });
    if (!r.ok) return;
    sid = r.result.session_id;
  }
  const info = state.sessions.get(sid);
  const group = (info.group_columns || []).includes('direction') ? { group_by: 'direction' } : {};
  const steps = [
    ['get_session_info', { session_id: sid }],
    ['get_signal_quality', { session_id: sid }, (r) => [`get_signal_quality median SNR`, r.median_snr]],
    ['get_firing_rates', { session_id: sid }, (r) => ['get_firing_rates mean rate (Hz)', r.mean_rate_hz]],
    ['fit_decoder', { session_id: sid, kind: 'kalman' }, (r) => ['fit_decoder kalman held-out R²', r.test_r2_mean]],
    ['fit_decoder', { session_id: sid, kind: 'ridge' }, (r) => ['fit_decoder ridge held-out R²', r.test_r2_mean]],
    ['plot_decoding', () => ({ session_id: sid, t0: state.decoders.get(sid).test_window_s[0] })],
    ['get_psth', { session_id: sid, ...group }, (r) => ['get_psth peak / baseline (Hz)', `${r.peak_hz} / ${r.baseline_hz}`]],
    ['plot_psth', { session_id: sid, ...group }],
    ['fit_latent_factors', { session_id: sid, ...group }, (r) => ['GPFA top-2 shared variance', r.cumulative_variance_explained[1]], (r) => r.behaviour_explained && ['GPFA top-2 → velocity R²', r.behaviour_explained.r2_top2]],
    ['plot_latent_factors', { session_id: sid }],
  ];
  const out = document.querySelectorAll('.run-summary');
  const show = (done) => {
    for (const o of out) {
      o.replaceChildren();
      if (!summary.length) continue;
      o.append(h('table', { class: 'summary-table' }, h('tbody', {}, summary.map(([k, v]) => h('tr', {}, h('td', { text: k }), h('td', { text: String(v) }))))));
      if (done) o.append(h('p', { class: 'runline', style: 'margin-top:6px', text: `${steps.length} calls on ${sid} in ${((performance.now() - t0) / 1000).toFixed(1)} s. The prompt then asks the model to summarise findings and caveats; there is no model here.` }));
    }
  };
  for (const [name, kw, ...picks] of steps) {
    const kwargs = typeof kw === 'function' ? kw() : kw;
    const r = await invoke(name, kwargs, { quiet: name !== 'plot_latent_factors' && !name.startsWith('plot_') });
    if (!r.ok) { summary.push([name, `error: ${r.error}`]); break; }
    for (const p of picks) { const row = p(r.result); if (row) summary.push(row); }
    show(false);
  }
  show(true);
}

async function runTests() {
  if (state.busy) return;
  const outs = document.querySelectorAll('.tests-out');
  const rows = [];
  const logs = [];
  const draw = (final) => {
    for (const o of outs) {
      o.replaceChildren();
      const tb = h('tbody');
      for (const r of rows) tb.append(h('tr', {}, h('td', { class: `o ${r.outcome}`, text: r.outcome }), h('td', { text: r.id.replace('tests/', '') + (r.detail ? ` · ${r.detail.split('\n').slice(-1)[0].slice(0, 160)}` : '') }), h('td', { class: 'o', text: r.ms ? fmtMs(r.ms) : '' })));
      o.append(h('table', { class: 'tests' }, tb));
      if (final) o.append(h('p', { class: 'runline', style: 'margin-top:8px', text: final }));
      o.append(h('details', { class: 'more' }, h('summary', { class: 'label', text: 'pytest output' }), h('pre', { class: 'testlog', text: logs.join('\n') })));
    }
  };
  testHandlers = { row: (r) => { rows.push(r); draw(); }, log: (l) => { logs.push(l); } };
  $('announce').textContent = 'Running the repo\'s tests';
  setBusy(true, 'the repo\'s tests');
  draw();
  const r = await send({ type: 'tests' });
  setBusy(false);
  testHandlers = null;
  if (r.fatal) { draw(`Could not run: ${r.error}`); return; }
  for (const [id, why] of Object.entries(r.deselected)) rows.push({ id, outcome: 'deselected', ms: 0, detail: why });
  const count = (o) => rows.filter((x) => x.outcome === o).length;
  $('announce').textContent = `Tests finished: ${count('passed')} passed, ${count('failed')} failed`;
  draw(`${count('passed')} passed, ${count('failed')} failed, ${count('skipped')} skipped (module), ${count('deselected')} deselected · pytest exit ${r.exit_code} · ${(r.ms / 1000).toFixed(1)} s in this tab`);
}
