// NYC AutoDDG demo: the repo's pandas profiler in Pyodide (tab 1), recorded LLM outputs (tab 2)
// and recorded benchmarks (tab 3). Nothing heavy loads until the visitor presses Run.
import { startPython } from '../_shared/pyodide.js';
import { lineChart, hbars, table, legend } from './charts.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const int = (n) => Number(n).toLocaleString('en-US');
const pct = (f, d = 1) => `${(f * 100).toFixed(f > 0 && f < 0.01 ? 2 : d).replace(/\.0+$/, '')}%`;
const num = (v) => {
  if (v == null) return '–';
  if (typeof v !== 'number') return String(v);
  // column statistics: no thousands separators, so years and IDs read as written
  if (Math.abs(v) >= 1e12 || (Math.abs(v) < 1e-3 && v !== 0)) return v.toExponential(3);
  return v.toLocaleString('en-US', { maximumFractionDigits: 4, useGrouping: false });
};
const fetchJSON = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };
const fetchText = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.text(); };
const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ---------------------------------------------------------------- tabs */
const tabs = [...document.querySelectorAll('[role="tab"]')];
const inits = { 'p-desc': initDescriptions, 'p-bench': initBench };
function selectTab(t) {
  for (const o of tabs) {
    const on = o === t;
    o.setAttribute('aria-selected', on);
    o.tabIndex = on ? 0 : -1;
    $(o.getAttribute('aria-controls')).hidden = !on;
  }
  const id = t.getAttribute('aria-controls');
  if (inits[id]) { const f = inits[id]; inits[id] = null; f(); }
  if (id === 'p-bench') renderBench();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', (e) => {
    const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (k == null) return;
    e.preventDefault();
    const n = tabs[(k + tabs.length) % tabs.length];
    selectTab(n); n.focus({ preventScroll: true });
  });
});

/* ------------------------------------------------------------ profiler */
const FILES = Object.fromEntries([
  'autoddg/__init__.py', 'autoddg/paths.py', 'autoddg/profile.py', 'autoddg/profile_pandas.py',
  'pyspark/__init__.py', 'pyspark/sql/__init__.py', 'pyspark/sql/functions.py', 'demo_driver.py',
].map((p) => [p, `./py/${p}`]));
const MAX_BYTES = 20 * 1024 * 1024;
const SHORT = { '25th-nujf': 'Baby names', 'wxhr-qbhz': 'Drinking fountains', 'a4qt-mpr5': 'Playground closures' };

let sources = [];
let choice = { kind: 'bundled', id: '25th-nujf' };
let userFile = null;
let py = null, driver = null, busy = false, currentId = '';
const written = new Set();
const chipEls = [];

function setStatus(text, frac, isError = false) {
  const s = $('status');
  s.textContent = text;
  s.classList.toggle('error', isError);
  if (frac != null) $('bar').style.width = `${Math.round(frac * 100)}%`;
}

function renderChips() {
  const box = $('ds-chips');
  box.replaceChildren();
  const add = (label, n, pick) => {
    const b = el('button', 'chip');
    b.type = 'button';
    b.append(document.createTextNode(label));
    if (n) b.append(el('span', 'n', n));
    b.addEventListener('click', () => pick(b));
    box.appendChild(b); chipEls.push(b);
    return b;
  };
  for (const s of sources) {
    add(SHORT[s.id] || s.title, `${int(s.rows)} rows`, () => { choice = { kind: 'bundled', id: s.id }; onChoice(); });
  }
  add('Your CSV', null, () => { choice = { kind: 'file' }; onChoice(); });
  syncChips();
}
function syncChips() {
  const keys = [...sources.map((s) => s.id), 'file'];
  chipEls.forEach((b, i) => {
    const on = choice.kind === 'file' ? keys[i] === 'file' : keys[i] === choice.id;
    b.setAttribute('aria-pressed', on);
    b.disabled = busy;
  });
  $('file-wrap').hidden = choice.kind !== 'file';
}

function onChoice() {
  syncChips();
  renderSource();
  const runBtn = $('run');
  if (choice.kind === 'file' && !userFile) {
    runBtn.textContent = 'Run profiler';
    if (py) $('results').hidden = true; // nothing to show until a file is chosen
  } else if (choice.kind === 'file') {
    runBtn.textContent = `Run profiler on ${userFile.name}`;
  } else runBtn.textContent = 'Run profiler';
  if (py && !busy && (choice.kind === 'bundled' || userFile)) profileChoice();
}

$('file').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > MAX_BYTES) {
    $('file-name').textContent = `${f.name} is ${(f.size / 1048576).toFixed(1)} MB; the limit here is 20 MB`;
    userFile = null; return;
  }
  userFile = f;
  $('file-name').textContent = `${f.name}, ${(f.size / 1048576).toFixed(2)} MB, read in this tab only`;
  onChoice();
});

function renderSource() {
  const box = $('source');
  box.replaceChildren();
  if (choice.kind === 'file') {
    box.append(el('p', 'label', 'Your file'),
      el('p', null, 'It is read inside this tab and written to Pyodide\'s in-memory file system. Nothing is uploaded, and it is gone when you close the tab. There is no committed Spark profile for it, so there is nothing to compare against.'));
    return;
  }
  const s = sources.find((x) => x.id === choice.id);
  if (!s) return;
  const p1 = el('p');
  const a = el('a', null, s.title); a.href = s.portal_url; a.target = '_blank'; a.rel = 'noopener';
  p1.append(a, document.createTextNode(` (${s.id}), published by the ${s.agency} on NYC Open Data. ${int(s.rows)} rows, ${s.columns} columns, ${(s.bytes / 1e6).toFixed(2)} MB.`));
  const p2 = el('p', null, `Version: the CSV export downloaded on ${s.downloaded}; the portal last updated its rows on ${s.rows_updated}. Bundled unmodified (sha256 ${s.sha256.slice(0, 12)}…), and its row count matches the committed profile.`);
  const p3 = el('p', 'muted', 'Terms: the portal lists no licence for this dataset. NYC\'s Open Data Law (Administrative Code §23-502(d)) makes public datasets available without registration, licence requirements or restrictions on use, and lets the City ask anyone republishing one to name its source and version and describe any changes, as above. The City provides the data as is.');
  box.append(el('p', 'label', 'Data source'), p1, p2, p3);
}

async function loadRuntime() {
  if (busy) return;
  if (typeof WebAssembly !== 'object') {
    setStatus('This browser cannot run WebAssembly, so the profiler cannot start here. The recorded tabs still work.', 0, true);
    return;
  }
  busy = true; syncChips();
  $('run').disabled = true;
  try {
    py = await startPython({ packages: ['numpy', 'pandas'], files: FILES, onStatus: (t, f) => setStatus(t, f) });
    setStatus('Importing pandas and the profiler', 1);
    await nextPaint();
    py.runPython("import sys\nif '/home/pyodide' not in sys.path: sys.path.insert(0, '/home/pyodide')");
    driver = py.pyimport('demo_driver');
    py.FS.mkdirTree('/home/pyodide/data');
  } catch (err) {
    py = null;
    setStatus(`Could not start Python: ${err.message || err}`, 0, true);
    $('run').disabled = false;
    busy = false; syncChips();
    return;
  }
  busy = false;
  $('poster').hidden = true;
  $('results').hidden = false;
  if (choice.kind === 'file' && !userFile) { $('results').hidden = true; syncChips(); return; }
  profileChoice();
}
$('run').addEventListener('click', loadRuntime);

function setResStatus(t, isError = false) {
  const s = $('res-status');
  s.textContent = t; s.classList.toggle('error', isError);
}

async function profileChoice() {
  busy = true; syncChips();
  $('results').hidden = false;
  let path, id, title, spark = null;
  try {
    if (choice.kind === 'file') {
      id = userFile.name.replace(/\.[^.]+$/, '') || 'upload';
      title = userFile.name;
      path = '/tmp/upload.csv';
      setResStatus(`Reading ${userFile.name}`);
      py.FS.writeFile(path, new Uint8Array(await userFile.arrayBuffer()));
    } else {
      const s = sources.find((x) => x.id === choice.id);
      id = s.id; title = s.title; path = `/home/pyodide/data/${id}.csv`;
      if (!written.has(id)) {
        setResStatus(`Fetching ${id}.csv (${(s.bytes / 1e6).toFixed(1)} MB, same origin)`);
        py.FS.writeFile(path, new Uint8Array(await (await fetch(`./data/${id}.csv`)).arrayBuffer()));
        written.add(id);
      }
      spark = await fetchText(`./data/profiles/${id}.json`);
    }
    setResStatus(`Profiling ${title} with profile_pandas(). The page may pause while Python works.`);
    $('results').classList.add('stale');
    await nextPaint();
    const out = driver.run_profile(path, id);
    const prof = JSON.parse(out);
    const cmp = spark ? JSON.parse(driver.compare(out, spark)) : null;
    renderProfile(prof, title, cmp);
    setResStatus(`profile_seconds: ${prof.profile_seconds} in this tab, including reading the CSV. That is pandas in WebAssembly on one thread, not a benchmark; the measured runs are under Benchmarks.`);
  } catch (err) {
    const msg = String(err.message || err).trim().split('\n').filter(Boolean).at(-1);
    setResStatus(`The profiler raised an error: ${msg}`, true);
  } finally {
    $('results').classList.remove('stale');
    busy = false; syncChips();
  }
}

const FIELD_NOTE = {
  distinct_approx: 'Spark: approx_count_distinct (2% error); here: exact nunique()',
  unique_frac: 'derived from distinct_approx',
  p25: 'Spark: percentile_approx; here: interpolated quantile',
  median: 'Spark: percentile_approx; here: interpolated quantile',
  p75: 'Spark: percentile_approx; here: interpolated quantile',
};
const show = (v) => (v == null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : num(v));

function renderProfile(prof, title, cmp) {
  currentId = prof.id;
  $('res-title').textContent = title;
  $('res-meta').textContent = `${int(prof.rows)} rows · ${prof.n_columns} columns · id ${prof.id}`;

  const badge = $('badge');
  badge.replaceChildren();
  badge.className = 'badge';
  const ic = el('span', 'ic'), tx = el('span');
  if (!cmp) {
    badge.classList.add('none'); ic.textContent = '–';
    tx.textContent = 'No committed Spark profile exists for your file, so there is nothing to compare against. The cards show what the repo\'s profiler found.';
  } else {
    const n = (s) => cmp.filter((r) => r.status === s).length;
    const [m, a, d] = [n('match'), n('approx'), n('differs')];
    if (d) {
      badge.classList.add('bad'); ic.textContent = '✗';
      tx.textContent = `${d} of ${cmp.length} fields differ from the committed Spark profile in values both sides compute exactly. See “vs Spark”.`;
    } else {
      ic.textContent = '✓';
      tx.textContent = a
        ? `Matches the profile Spark committed to the repo: ${m} of ${cmp.length} fields identical. The other ${a} are distinct counts and quartiles, which Spark only estimates; see “vs Spark”.`
        : `Matches the profile Spark committed to the repo on all ${cmp.length} fields.`;
    }
  }
  badge.append(ic, tx);

  // column cards
  const byCol = {};
  if (cmp) for (const r of cmp) if (r.column) (byCol[r.column] ||= []).push(r);
  const cards = $('view-cards');
  cards.replaceChildren();
  for (const c of prof.columns) cards.appendChild(card(c, prof.rows, byCol[c.name]));

  // diff table
  renderDiff(cmp, false);

  const json = JSON.stringify(prof, null, 1);
  $('json').textContent = json;
  const save = $('save-json');
  if (save.href.startsWith('blob:')) URL.revokeObjectURL(save.href);
  save.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  save.download = `${prof.id}.profile.json`;
}

function card(c, rows, vs) {
  const k = el('article', 'card');
  k.appendChild(el('h3', null, c.name));
  const pills = el('div', 'pills');
  pills.appendChild(el('span', 'pill type', c.type));
  if (c.semantic) pills.appendChild(el('span', 'pill', c.semantic));
  k.appendChild(pills);
  const kv = el('div', 'kv');
  const pair = (l, v) => { const s = el('span', null, `${l} `); s.appendChild(el('b', null, v)); kv.appendChild(s); };
  pair('nulls', c.null_frac == null ? '–' : pct(c.null_frac));
  pair('distinct', int(c.distinct_approx));
  if (c.unique_frac != null) pair('unique', pct(c.unique_frac));
  k.appendChild(kv);

  if (c.type === 'integer' || c.type === 'float') {
    k.appendChild(rangeBar(c));
    const r = el('div', 'range-labels');
    r.append(el('span', null, `min ${num(c.min)}`), el('span', null, `median ${num(c.median)}`), el('span', null, `max ${num(c.max)}`));
    k.appendChild(r);
    const kv2 = el('div', 'kv');
    kv2.append(el('span', null, `p25 ${num(c.p25)}`), el('span', null, `p75 ${num(c.p75)}`), el('span', null, `mean ${num(c.mean)}`), el('span', null, `std ${num(c.std)}`));
    k.appendChild(kv2);
  } else if (c.type === 'datetime') {
    const kv2 = el('div', 'kv');
    const d = (s) => (s && s.endsWith('T00:00:00') ? s.slice(0, 10) : (s || '–').replace('T', ' '));
    kv2.append(el('span', null, `from ${d(c.min)}`), el('span', null, `to ${d(c.max)}`));
    k.appendChild(kv2);
  } else if (c.len_min != null) {
    k.appendChild(el('div', 'kv', `length ${c.len_min}–${c.len_max}, avg ${num(c.len_avg)}`));
  } else if (c.type === 'empty') {
    k.appendChild(el('div', 'kv', 'no non-empty values'));
  }

  if (c.top_values?.length) {
    const t = el('div', 'tops');
    t.appendChild(el('p', 'label', 'Top values'));
    for (const tv of c.top_values) {
      const r = el('div', 'top-row');
      r.append(el('span', 'v', tv.value), el('span', 'c', int(tv.count)));
      const tr = el('span', 'track'); const bar = el('i'); bar.style.width = `${(tv.count / rows) * 100}%`;
      tr.appendChild(bar); r.appendChild(tr);
      t.appendChild(r);
    }
    k.appendChild(t);
  }
  if (c.flags?.length) {
    const ul = el('ul', 'flags');
    for (const f of c.flags) ul.appendChild(el('li', null, f));
    k.appendChild(ul);
  }
  if (vs) {
    const v = el('div', 'vs');
    const ok = vs.filter((r) => r.status === 'match').length;
    const line = el('div'); line.appendChild(el('span', 'ok', `✓ ${ok} of ${vs.length}`));
    line.appendChild(document.createTextNode(' fields identical to Spark'));
    v.appendChild(line);
    for (const r of vs.filter((x) => x.status !== 'match')) {
      const d = el('div', r.status === 'differs' ? 'bad' : null,
        `${r.status === 'differs' ? '✗' : '≈'} ${r.field}: Spark ${show(r.spark)}, here ${show(r.browser)}`);
      v.appendChild(d);
    }
    k.appendChild(v);
  }
  return k;
}

function rangeBar(c) {
  const w = el('div', 'rng');
  w.setAttribute('aria-hidden', 'true');
  const span = c.max - c.min;
  const at = (v) => (span > 0 && v != null ? ((v - c.min) / span) * 100 : 50);
  const box = el('i', 'box');
  box.style.left = `${at(c.p25)}%`;
  box.style.width = `${Math.max(0.8, at(c.p75) - at(c.p25))}%`;
  const med = el('i', 'med'); med.style.left = `${at(c.median)}%`;
  w.append(el('i', 'line'), box, med);
  return w;
}

function renderDiff(cmp, all) {
  const box = $('view-diff');
  box.replaceChildren();
  if (!cmp) { box.appendChild(el('p', 'muted', 'Nothing to compare: there is no committed Spark profile for your file.')); return; }
  const rowsShown = all ? cmp : cmp.filter((r) => r.status !== 'match');
  const head = el('p', 'small');
  head.textContent = `${cmp.length} fields compared with profiles/${currentId}.json, committed by the Spark profiler. `;
  const lab = el('label', 'small');
  const cb = el('input'); cb.type = 'checkbox'; cb.checked = all;
  cb.addEventListener('change', () => renderDiff(cmp, cb.checked));
  lab.append(cb, document.createTextNode(' show identical fields too'));
  head.appendChild(lab);
  box.appendChild(head);
  if (!rowsShown.length) { box.appendChild(el('p', 'muted small', 'Every field is identical.')); return; }
  const wrap = el('div', 'tbl-wrap'); wrap.style.marginTop = '8px';
  const t = el('table', 'diff');
  const hr = el('tr');
  for (const h of ['Column', 'Field', 'Spark (committed)', 'pandas (this tab)', 'Result']) hr.appendChild(el('th', null, h));
  const thead = el('thead'); thead.appendChild(hr); t.appendChild(thead);
  const tb = el('tbody');
  for (const r of rowsShown) {
    const tr = el('tr');
    tr.append(el('td', 'm', r.column ?? '(dataset)'), el('td', 'm', r.field));
    const cut = (s) => (s.length > 140 ? `${s.slice(0, 140)}…` : s);
    tr.append(el('td', 'm', cut(show(r.spark))), el('td', 'm', cut(show(r.browser))));
    const res = el('td', `st-${r.status}`, { match: '✓ identical', approx: '≈ Spark estimate', differs: '✗ differs' }[r.status]);
    if (FIELD_NOTE[r.field] && r.status !== 'match') res.appendChild(el('div', 'muted small', FIELD_NOTE[r.field]));
    tr.appendChild(res);
    tb.appendChild(tr);
  }
  t.appendChild(tb); wrap.appendChild(t); box.appendChild(wrap);
}

for (const b of $('views').querySelectorAll('button')) {
  b.addEventListener('click', () => {
    for (const o of $('views').querySelectorAll('button')) o.setAttribute('aria-pressed', o === b);
    for (const v of ['cards', 'diff', 'json']) $(`view-${v}`).hidden = v !== b.dataset.view;
  });
}

/* -------------------------------------------------------- descriptions */
let recorded = null;
async function initDescriptions() {
  const body = $('desc-body');
  body.textContent = 'Loading recorded outputs…';
  try { recorded = await fetchJSON('./data/recorded.json'); } catch (e) { body.textContent = `Could not load: ${e.message}`; return; }
  const ds = recorded.datasets;
  const sum = (kind, f) => ds.reduce((a, d) => a + (d.faithfulness?.[kind]?.[f] || 0), 0);
  const mean = (kind, f) => { const v = ds.map((d) => d.judge?.[kind]?.[f]).filter((x) => x != null); return v.reduce((a, b) => a + b, 0) / v.length; };
  const kp = $('desc-kpis');
  const kpi = (v, l) => { const k = el('div', 'kpi'); k.append(el('div', 'v', v), el('div', 'l', l)); kp.appendChild(k); };
  kpi(pct(sum('ufd', 'supported') / sum('ufd', 'claims')), `of ${sum('ufd', 'claims')} checkable claims in the user-focused descriptions matched the profile`);
  kpi(pct(sum('sfd', 'supported') / sum('sfd', 'claims')), `of ${sum('sfd', 'claims')} in the search-focused ones`);
  kpi(`${mean('ufd', 'completeness').toFixed(2)} vs ${mean('original', 'completeness').toFixed(2)}`, `mean completeness, generated vs the portal's own text (${recorded.judge_model.join(', ')} judge, 1 to 10)`);
  const sel = $('desc-select');
  const sorted = [...ds].sort((a, b) => a.title.localeCompare(b.title));
  for (const d of sorted) { const o = el('option', null, d.title); o.value = d.id; sel.appendChild(o); }
  sel.value = '25th-nujf';
  sel.addEventListener('change', () => renderDesc(sel.value));
  const step = (k) => { const i = sorted.findIndex((d) => d.id === sel.value); sel.value = sorted[(i + k + sorted.length) % sorted.length].id; renderDesc(sel.value); };
  $('desc-prev').addEventListener('click', () => step(-1));
  $('desc-next').addEventListener('click', () => step(1));
  renderDesc(sel.value);
  initSearch();
}

function renderDesc(id) {
  const d = recorded.datasets.find((x) => x.id === id);
  const body = $('desc-body');
  body.replaceChildren();
  const head = el('div', 'dhead');
  const h = el('h2', null, d.title);
  const a = el('a', null, `${d.id} on NYC Open Data ↗`); a.href = `https://data.cityofnewyork.us/d/${d.id}`; a.target = '_blank'; a.rel = 'noopener';
  head.append(h, a);
  body.appendChild(head);
  body.appendChild(el('p', 'dmeta', `profile: ${int(d.rows)} rows × ${d.n_columns} columns · generator: ${d.model} · recorded output`));
  const cols = el('div', 'dcols'); cols.style.marginTop = '10px';
  for (const [kind, name] of [['ufd', 'User-focused description (UFD)'], ['sfd', 'Search-focused description (SFD)']]) {
    const f = d.faithfulness?.[kind];
    const c = el('div', 'dcard');
    c.appendChild(el('p', 'label', name));
    if (f) c.appendChild(el('p', 'dmeta', `${f.words} words · names ${pct(f.column_coverage, 0)} of the columns`));
    c.appendChild(el('p', 'txt', d[kind]));
    if (f) {
      const ok = f.claims ? `${f.supported} of ${f.claims} checkable numbers, dates and percentages match the profile` : 'no checkable numbers or dates';
      c.appendChild(el('p', 'dmeta', `faithfulness check: ${ok}${f.unsupported ? `; not in the profile: ${f.unsupported}` : ''}`));
    }
    cols.appendChild(c);
  }
  body.appendChild(cols);
  const j = d.judge;
  const o = d.faithfulness?.original;
  const jw = el('div', 'judge');
  jw.appendChild(el('p', 'label', `Judge scores (${recorded.judge_model.join(', ')}, 1 to 10, blind to which text is which)`));
  const tb = el('div');
  const crit = ['completeness', 'conciseness', 'readability', 'faithfulness'];
  table(tb, ['', "Portal's description", 'UFD'], crit.map((k) => [k, j?.original?.[k] ?? 'no score', j?.ufd?.[k] ?? 'no score']), [1, 2]);
  jw.appendChild(tb);
  if (o) jw.appendChild(el('p', 'dmeta', `The portal's description has ${o.words} words and names ${pct(o.column_coverage, 0)} of the columns. Its text is in the repo's git-ignored catalog, so it is not shown here.`));
  body.appendChild(jw);
}

let searchRows = null;
async function initSearch() {
  const txt = await fetchText('./data/eval_search.csv');
  const [h, ...lines] = txt.trim().split(/\r?\n/);
  const keys = h.split(',');
  searchRows = lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [keys[i], v])));
  const sets = [...new Set(searchRows.map((r) => r.queries_from))].reverse();
  const seg = $('search-set');
  const label = (s) => (s === 'portal tags' ? 'Portal-tag queries' : 'LLM queries from the originals');
  for (const s of sets) {
    const b = el('button', null, `${label(s)} (${searchRows.find((r) => r.queries_from === s).queries})`);
    b.type = 'button'; b.setAttribute('aria-pressed', s === sets[0]);
    b.addEventListener('click', () => { for (const o of seg.children) o.setAttribute('aria-pressed', o === b); drawSearch(s); });
    seg.appendChild(b);
  }
  drawSearch(sets[0]);
}
function drawSearch(set) {
  const names = { original: "Portal's description", ufd: 'UFD only', sfd: 'SFD only', 'ufd+sfd': 'UFD + SFD', 'original+sfd': 'Portal + SFD' };
  const rows = searchRows.filter((r) => r.queries_from === set).map((r) => ({
    label: names[r.variant] || r.variant, sub: `R@5 ${r['recall@5']} · MRR ${r.mrr}`,
    value: +r['recall@1'], color: css('--series-1'), text: `R@1 ${(+r['recall@1']).toFixed(3)}`,
  }));
  hbars($('search-chart'), rows, { max: 1 });
}

/* ---------------------------------------------------------- benchmarks */
let bench = null, benchKey = 'size';
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const rowsFmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : `${Math.round(n / 1e3)}k`);
const sec = (v) => `${v < 10 ? v.toFixed(1) : v.toFixed(v < 100 ? 1 : 0)} s`;

async function initBench() {
  const txt = await fetchText('./data/bench.csv');
  const [h, ...lines] = txt.trim().split(/\r?\n/);
  const keys = h.split(',');
  bench = lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [keys[i], v]))).filter((r) => r.seconds !== '');
  const seg = $('bench-pick');
  for (const [k, name] of [['size', 'Spark vs pandas'], ['cores', 'Core scaling'], ['batch', '100 small datasets'], ['naive', 'One pass vs naive']]) {
    const b = el('button', null, name); b.type = 'button'; b.dataset.k = k;
    b.setAttribute('aria-pressed', k === benchKey);
    b.addEventListener('click', () => { benchKey = k; for (const o of seg.children) o.setAttribute('aria-pressed', o === b); renderBench(); });
    seg.appendChild(b);
  }
  new ResizeObserver(() => { if (!$('p-bench').hidden) renderBenchSoon(); }).observe($('bench-chart'));
  renderBench();
}
let rz = 0, lastW = 0;
function renderBenchSoon() {
  const w = $('bench-chart').clientWidth;
  if (Math.abs(w - lastW) < 8) return;
  clearTimeout(rz); rz = setTimeout(renderBench, 120);
}

function group(filter, keyFn) {
  const g = new Map();
  for (const r of bench.filter(filter)) {
    const k = keyFn(r);
    if (!g.has(k)) g.set(k, { rows: [], key: k });
    g.get(k).rows.push(r);
  }
  return [...g.values()].map((v) => ({ ...v, median: median(v.rows.map((r) => +r.seconds)), n: v.rows.length, load: v.rows.reduce((a, r) => a + +r.load1, 0) / v.rows.length }));
}

function renderBench() {
  if (!bench) return;
  lastW = $('bench-chart').clientWidth;
  const chart = $('bench-chart'), cap = $('bench-caption'), tbl = $('bench-table'), lg = $('bench-legend');
  chart.replaceChildren(); lg.replaceChildren(); cap.replaceChildren();
  const S1 = css('--series-1'), S2 = css('--series-2');

  if (benchKey === 'size') {
    const gs = group((r) => r.experiment === 'size', (r) => `${r.engine}|${r.rows}`);
    const ser = (eng) => gs.filter((g) => g.key.startsWith(eng)).map((g) => ({ x: +g.rows[0].rows, y: g.median, n: g.n })).sort((a, b) => a.x - b.x);
    const spark = ser('spark'), pandas = ser('pandas');
    // crossover: first measured size where Spark is no longer clearly slower, from the medians
    let cross = null;
    for (let i = 0; i < pandas.length - 1; i++) {
      const s0 = spark.find((p) => p.x === pandas[i].x), s1 = spark.find((p) => p.x === pandas[i + 1].x);
      if (s0 && s1 && s0.y >= pandas[i].y && s1.y < pandas[i + 1].y) {
        const close0 = Math.abs(s0.y - pandas[i].y) / pandas[i].y, close1 = Math.abs(s1.y - pandas[i + 1].y) / pandas[i + 1].y;
        cross = close0 <= close1 ? { x: s0.x, s: s0.y, p: pandas[i].y } : { x: s1.x, s: s1.y, p: pandas[i + 1].y };
        break;
      }
    }
    $('bench-title').textContent = 'Seconds to profile the 311 data, by size';
    $('bench-sub').textContent = '311 Service Requests 2024 (3.46M rows) sampled down and replicated up; log scales. Spark in local mode on all 14 cores; pandas in one process.';
    legend(lg, [{ name: 'Spark', color: S1, shape: 'circle' }, { name: 'pandas', color: S2, shape: 'square' }]);
    lineChart(chart, {
      series: [{ name: 'Spark', color: S1, shape: 'circle', points: spark }, { name: 'pandas', color: S2, shape: 'square', points: pandas }],
      xLog: true, yLog: true, xTicks: [3e5, 1e6, 3e6, 1e7, 3e7], yTicks: [2, 5, 10, 20, 50, 100, 200],
      xFmt: rowsFmt, yFmt: (v) => `${v}s`, xTitle: 'rows', yTitle: 'seconds',
      vline: cross && { x: cross.x, label: `crossover ≈ ${rowsFmt(cross.x)} rows` },
      tipHead: (x) => `${int(x)} rows`, tipVal: (p) => `${sec(p.y)}${p.n > 1 ? ` (median of ${p.n})` : ''}`,
    });
    const s0 = spark[0], p0 = pandas[0], pl = pandas.at(-1), sl = spark.find((p) => p.x === pl.x);
    cap.textContent = `On ${rowsFmt(s0.x)} rows Spark takes ${sec(s0.y)} and pandas ${sec(p0.y)}.${cross ? ` At ${rowsFmt(cross.x)} rows they meet (Spark ${sec(cross.s)}, pandas ${sec(cross.p)}).` : ''} At ${rowsFmt(pl.x)} rows Spark takes ${sec(sl.y)} and pandas ${sec(pl.y)}; the harness runs pandas no larger, since bigger tiers need more than the machine's 24 GB.`;
    table(tbl, ['engine', 'rows', 'runs', 'median s', 'mean load1'],
      gs.sort((a, b) => a.key.localeCompare(b.key) || +a.rows[0].rows - +b.rows[0].rows).map((g) => [g.rows[0].engine, int(g.rows[0].rows), g.n, g.median.toFixed(2), g.load.toFixed(2)]), [1, 2, 3, 4]);
  }

  if (benchKey === 'cores') {
    const gs = group((r) => r.experiment === 'cores', (r) => `${r.factor}|${r.cores}`);
    const ser = (f) => {
      const pts = gs.filter((g) => g.rows[0].factor === f).map((g) => ({ c: +g.rows[0].cores, t: g.median, n: g.n })).sort((a, b) => a.c - b.c);
      const base = pts.find((p) => p.c === 1).t;
      return pts.map((p) => ({ x: p.c, y: base / p.t, t: p.t, n: p.n }));
    };
    const x1 = ser('1'), x4 = ser('4');
    $('bench-title').textContent = 'Speedup over one core';
    $('bench-sub').textContent = 'Spark local[k] on the 3.46M-row 311 file (three timed runs per point) and on it replicated 4× to 13.8M rows (one run per point).';
    legend(lg, [{ name: '3.46M rows', color: S1, shape: 'circle' }, { name: '13.8M rows', color: S2, shape: 'square' }, { name: 'linear', color: css('--muted') }]);
    lineChart(chart, {
      series: [{ name: '3.46M rows', color: S1, shape: 'circle', points: x1 }, { name: '13.8M rows', color: S2, shape: 'square', points: x4 }],
      xTicks: [0, 2, 4, 6, 8, 10, 12, 14], yTicks: [0, 2, 4, 6, 8, 10, 12, 14], xFmt: (v) => `${v}`, yFmt: (v) => `${v}×`,
      xTitle: 'cores', yTitle: 'speedup', ref: { name: 'linear', fn: (v) => v },
      tipHead: (x) => `${x} cores`, tipVal: (p) => `${p.y.toFixed(2)}× (${sec(p.t)})`,
    });
    const at = (s, c) => s.find((p) => p.x === c);
    const best = x1.reduce((a, b) => (b.y > a.y ? b : a));
    cap.textContent = `Best on 3.46M rows: ${best.y.toFixed(1)}× on ${best.x} cores (${sec(best.t)} vs ${sec(x1[0].t)} on one). On 14 cores it drops to ${at(x1, 14).y.toFixed(1)}×. The report's explanation: the input is 16 Parquet row groups that Spark cannot split, and the M4 Pro's efficiency cores become stragglers.`;
    table(tbl, ['rows', 'cores', 'runs', 'median s', 'speedup'],
      [...x1.map((p) => ['3.46M', p.x, p.n, p.t.toFixed(2), p.y.toFixed(2)]), ...x4.map((p) => ['13.8M', p.x, p.n, p.t.toFixed(2), p.y.toFixed(2)])], [1, 2, 3, 4]);
  }

  if (benchKey === 'batch') {
    const gs = group((r) => r.experiment === 'batch', (r) => `${r.engine}|${r.concurrency}`)
      .sort((a, b) => a.rows[0].engine.localeCompare(b.rows[0].engine) * -1 || +a.rows[0].concurrency - +b.rows[0].concurrency);
    $('bench-title').textContent = 'Seconds to profile all 100 catalog datasets';
    $('bench-sub').textContent = '4.8M rows in total, mostly small files. Spark runs several jobs at once in one session; pandas runs a pool of processes.';
    legend(lg, [{ name: 'Spark', color: S1, line: false }, { name: 'pandas', color: S2, line: false }]);
    const rows = gs.map((g) => {
      const r = g.rows[0], c = +r.concurrency, sp = r.engine === 'spark';
      return { label: sp ? `Spark, ${c === 1 ? '1 job' : `${c} jobs`} at a time` : `pandas, ${c} process${c > 1 ? 'es' : ''}`, value: g.median, color: sp ? S1 : S2, text: sec(g.median), g };
    });
    const wrap = el('div', 'hbars'); chart.appendChild(wrap);
    hbars(wrap, rows);
    const bestSpark = rows.filter((r) => r.g.rows[0].engine === 'spark').reduce((a, b) => (b.value < a.value ? b : a));
    const bestPandas = rows.filter((r) => r.g.rows[0].engine === 'pandas').reduce((a, b) => (b.value < a.value ? b : a));
    cap.textContent = `${bestPandas.label}: ${sec(bestPandas.value)}, ${(bestSpark.value / bestPandas.value).toFixed(1)}× faster than the best Spark setup (${bestSpark.label}: ${sec(bestSpark.value)}). Each small file is one Spark task, so a single job keeps one core busy.`;
    table(tbl, ['engine', 'concurrency', 'runs', 'seconds', 'load1'], gs.map((g) => [g.rows[0].engine, g.rows[0].concurrency, g.n, g.median.toFixed(2), g.load.toFixed(2)]), [1, 2, 3, 4]);
  }

  if (benchKey === 'naive') {
    const gs = group((r) => r.experiment === 'naive', (r) => `${r.data}|${r.mode}`);
    $('bench-title').textContent = 'One aggregation pass vs one Spark job per statistic';
    $('bench-sub').textContent = 'The profiler computes every statistic in one pass; --naive rescans the data for each statistic of each column, the textbook loop. Spark on 14 cores, one run each.';
    legend(lg, [{ name: 'one pass (profile.py default)', color: S1, line: false }, { name: 'naive', color: S2, line: false }]);
    const datasets = [...new Set(gs.map((g) => g.rows[0].data))];
    const rows = [];
    const ratios = [];
    for (const d of datasets) {
      const one = gs.find((g) => g.rows[0].data === d && g.rows[0].mode === 'single');
      const nv = gs.find((g) => g.rows[0].data === d && g.rows[0].mode === 'naive');
      const name = d === 'restaurants' ? 'Restaurant inspections' : d.replace('311 x0.125', '311 requests, 1/8 sample');
      rows.push({ label: name, sub: `${int(one.rows[0].rows)} rows, one pass`, value: one.median, color: S1, text: sec(one.median) });
      rows.push({ label: '', sub: 'naive', value: nv.median, color: S2, text: `${sec(nv.median)} · ${(nv.median / one.median).toFixed(1)}×` });
      ratios.push(`${(nv.median / one.median).toFixed(1)}× on ${rowsFmt(+one.rows[0].rows)} rows`);
    }
    const wrap = el('div', 'hbars'); chart.appendChild(wrap);
    hbars(wrap, rows);
    cap.textContent = `The naive loop is slower by ${ratios.join(' and ')}, and the gap grows with size.`;
    table(tbl, ['data', 'mode', 'rows', 'seconds'], gs.map((g) => [g.rows[0].data, g.rows[0].mode, int(g.rows[0].rows), g.median.toFixed(2)]), [2, 3]);
  }
}

/* --------------------------------------------------------------- start */
(async () => {
  try {
    sources = await fetchJSON('./data/sources.json');
  } catch (e) {
    setStatus(`Could not load the dataset list: ${e.message}`, 0, true);
  }
  renderChips();
  renderSource();
  if (typeof WebAssembly !== 'object') {
    $('run').disabled = true;
    setStatus('This browser cannot run WebAssembly, so the profiler cannot start here. The recorded tabs still work.', 0, true);
  }
})();
