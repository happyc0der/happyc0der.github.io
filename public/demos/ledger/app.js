// Ledger demo: the page is a thin view. Every check, drop, finding and score shown comes from the
// repo's Python (py/ledger/*, unchanged) via py/ledger_demo.py, running in Pyodide.
import { startPython, PYODIDE_VERSION } from '../_shared/pyodide.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const usd = (x) => (x == null ? '—' : `$${Math.round(x).toLocaleString('en-US')}`);
const paint = () => new Promise((r) => {
  let done = false;
  const f = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(() => setTimeout(f, 0));
  setTimeout(f, 80);
});

const TYPE = {
  S1_past_close_date: 'Past close date', S2_no_next_step: 'No next step', S3_dormant: 'Dormant',
  S4_amount_blank_late: 'Amount blank in a late stage', S5_stalled_early_stage: 'Stalled in an early stage',
  S6_duplicate_deal: 'Duplicate deal', S7_activity_before_creation: 'Activity before creation',
  S8_last_activity_field_wrong: 'Last-activity field wrong', M1_stage_vs_buyer: 'Stage vs buyer',
  M2_contact_contradiction: 'Contact contradiction', M3_expired_promise: 'Expired promise',
  M4_timeline_contradiction: 'Timeline contradiction', M5_scope_vs_amount: 'Scope vs amount', M6_zombie: 'Zombie deal',
  M7_cross_deal_contact: 'Cross-deal contact', M8_happy_ears: 'Happy ears', M9_missing_economic_buyer: 'Missing economic buyer',
  M10_arithmetic: 'Arithmetic',
};
const code = (t) => t.split('_')[0];
const tname = (t) => TYPE[t] || t;

// The numbers published in the repo at 617c985 (docs/reports/issues_sonnet.md, docs/reports/v1_v3_sonnet.md),
// used only to mark whether the browser's recomputation matches them. The scoreboard names and links both files.
const PUBLISHED = {
  rules: { semR: 0, synR: 0.99, clean: 0, findings: 68 },
  naive: { semR: 0.72, semP: 0.87, synR: 0.86, clean: 10, findings: 234 },
  v3: { semR: 0.94, semP: 0.99, synR: 0.99, clean: 0, findings: 238 },
  fab: { v1: 6, v3: 0 },
};

const MODULES = ['__init__', 'config', 'data', 'attribution', 'tools', 'rules', 'consistency', 'claims', 'redact',
  'score_issues', 'forecast', 'evaluate', 'llm'];
const DATA = ['accounts.csv', 'activities.csv', 'anomalies.csv', 'company.md', 'contacts.csv', 'deals.csv',
  'ground_truth.csv', 'products.csv', 'profile.json', 'team.csv'];
const RUNS = ['v3.jsonl', 'naive.jsonl', 'v1.jsonl'];
// CSV and JSONL files are stored gzip-compressed (v3.jsonl alone is 1 MB, and a static host may serve .jsonl
// uncompressed) and unpacked to their original names in Pyodide's file system before the ledger package is imported.
const gz = (f) => (/\.(csv|jsonl)$/.test(f) ? `${f}.gz` : f);
const FILES = {
  'ledger_demo.py': './py/ledger_demo.py',
  'dotenv/__init__.py': './py/dotenv/__init__.py',
  ...Object.fromEntries(MODULES.map((m) => [`ledger/${m}.py`, `./py/ledger/${m}.py`])),
  ...Object.fromEntries(DATA.map((f) => [`data/company_nicrron/${gz(f)}`, `./data/company_nicrron/${gz(f)}`])),
  ...Object.fromEntries(RUNS.map((f) => [`runs/company_nicrron/${gz(f)}`, `./runs/company_nicrron/${gz(f)}`])),
};
// Unpack with Python's own gzip module. If a server already decoded the file (Content-Encoding), keep it as is.
const UNPACK = `
import gzip, pathlib
for p in pathlib.Path('/home/pyodide').glob('*/company_nicrron/*.gz'):
    b = p.read_bytes()
    p.with_suffix('').write_bytes(gzip.decompress(b) if b[:2] == b'\\x1f\\x8b' else b)
    p.unlink()
`;

const app = $('#app');
const runBtn = $('#run');
const bar = $('#progress');
const statusEl = $('#status');
let L = null;
const st = { deals: [], filter: 'all', q: '', sel: null, detail: null, editing: false, result: null, info: {}, tab: 'deals' };

function setStatus(text, frac) {
  statusEl.textContent = text;
  statusEl.classList.remove('error');
  if (frac != null) bar.firstElementChild.style.width = `${Math.round(frac * 100)}%`;
}

async function call(fn, ...args) {
  await paint();
  return JSON.parse(L[fn](...args));
}

async function run() {
  runBtn.disabled = true;
  bar.hidden = false;
  try {
    // The shared loader's first message reads "Python <version>", but that number is Pyodide's; say which is which.
    const said = (t) => (t.startsWith('Downloading Python') ? `Downloading Pyodide ${PYODIDE_VERSION} (Python 3.13 in WebAssembly)` : t);
    const py = await startPython({ packages: ['pandas'], files: FILES, onStatus: (t, f) => setStatus(said(t), f * 0.7) });
    setStatus('Unpacking the data and importing the ledger package', 0.72);
    await paint();
    py.runPython(UNPACK);
    py.runPython('import ledger_demo');
    L = py.pyimport('ledger_demo');
    setStatus('Loading the company: deals, activities, contacts, planted labels', 0.75);
    st.info.load = await call('step_load');
    setStatus(`Re-verifying every recorded claim against ${st.info.load.activities} activities, rebuilding findings`, 0.8);
    st.info.recompute = await call('step_recompute');
    setStatus('Scoring rules, the naive agent and Ledger against the planted anomalies', 0.9);
    st.info.score = await call('step_score');
    setStatus('Checking every amount, day gap and quote for fabrication', 0.95);
    st.info.evaluate = await call('step_evaluate');
    st.deals = await call('deal_list');
    setStatus('Ready', 1);
    $('#poster').hidden = true;
    $('#tabs').hidden = false;
    $('#view-deals').hidden = false;
    renderFilters();
    renderList();
    const first = st.deals.find((d) => d.id === 'IJNOVBGU') || st.deals[0];
    await select(first.id, { focus: false });
  } catch (e) {
    console.error(e);
    statusEl.textContent = `Could not start: ${e.message || e}`;
    statusEl.classList.add('error');
    runBtn.disabled = false;
    runBtn.textContent = 'Try again';
  }
}
runBtn.addEventListener('click', run);

/* ---------------------------------------------------------------- tabs */
const TABS = ['deals', 'score', 'forecast'];
function showTab(name, focus = false) {
  st.tab = name;
  for (const t of TABS) {
    const b = $(`#tab-${t}`);
    const on = t === name;
    b.setAttribute('aria-selected', on);
    b.tabIndex = on ? 0 : -1;
    $(`#view-${t}`).hidden = !on;
    if (on && focus) b.focus({ preventScroll: true });
  }
  if (name === 'score') renderScore();
  if (name === 'forecast') renderForecast();
}
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[role="tab"]');
  if (b) showTab(b.id.slice(4));
});
$('#tabs').addEventListener('keydown', (e) => {
  const i = TABS.indexOf(st.tab);
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    showTab(TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length], true);
  }
});

/* ---------------------------------------------------------------- deal list */
const FILTERS = [
  ['all', 'All', () => true],
  ['planted', 'Planted', (d) => d.planted.length > 0],
  ['clean', 'Clean', (d) => d.planted.length === 0],
  ['flagged', 'Flagged', (d) => d.found.length > 0],
  ['missed', 'Missed', (d) => d.fn > 0],
  ['falsealarm', 'False alarm', (d) => d.fp > 0],
  ['edited', 'Edited', (d) => d.edited],
];
function renderFilters() {
  $('#filters').innerHTML = FILTERS.map(([k, label, f]) => {
    const n = st.deals.filter(f).length;
    return `<button type="button" data-f="${k}" aria-pressed="${st.filter === k}">${label} ${n}</button>`;
  }).join('');
}
$('#filters').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  st.filter = b.dataset.f;
  renderFilters();
  renderList();
  $('#list').scrollTop = 0; // a new filter starts at its first row, not at the old list's scroll position
});
$('#q').addEventListener('input', (e) => { st.q = e.target.value.trim().toLowerCase(); renderList(); $('#list').scrollTop = 0; });

function visibleDeals() {
  const f = FILTERS.find((x) => x[0] === st.filter)[2];
  return st.deals.filter((d) => f(d) && (!st.q || `${d.account} ${d.product} ${d.rep} ${d.id} ${d.stage}`.toLowerCase().includes(st.q)));
}
function marks(d) {
  const m = [];
  if (d.tp) m.push(`<span class="mk tp" title="${d.tp} planted anomal${d.tp === 1 ? 'y' : 'ies'} found">✓${d.tp}</span>`);
  if (d.fn) m.push(`<span class="mk fn" title="${d.fn} planted anomal${d.fn === 1 ? 'y' : 'ies'} missed">missed ${d.fn}</span>`);
  if (d.fp) m.push(`<span class="mk fp" title="${d.fp} finding${d.fp === 1 ? '' : 's'} not planted">false ${d.fp}</span>`);
  if (!d.planted.length && !d.found.length) m.push('<span class="mk" title="no planted anomaly, nothing flagged">clean</span>');
  if (d.edited) m.push('<span class="mk ed">edited</span>');
  return m.join('');
}
function renderList() {
  const ds = visibleDeals();
  $('#count').textContent = `${ds.length} of ${st.deals.length} deals`;
  const sel = ds.some((d) => d.id === st.sel) ? st.sel : (ds[0] && ds[0].id);
  $('#list').innerHTML = ds.map((d) => `<li id="o-${d.id}">
    <button type="button" data-id="${d.id}" tabindex="${d.id === sel ? 0 : -1}"${d.id === st.sel ? ' aria-current="true"' : ''}>
      <span class="nm">${esc(d.account)} · ${esc(d.product)}</span>
      <span class="sub">${d.id} · ${esc(d.stage)} · ${usd(d.amount)}</span>
      <span class="marks">${marks(d)}</span>
    </button></li>`).join('') || '<li class="note" style="padding:10px">No deals match.</li>';
}
$('#list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-id]');
  if (b) select(b.dataset.id, { focus: true });
});
$('#list').addEventListener('keydown', (e) => {
  const btns = [...$('#list').querySelectorAll('button[data-id]')];
  const i = btns.indexOf(document.activeElement);
  if (i < 0) return;
  let j = null;
  if (e.key === 'ArrowDown') j = Math.min(btns.length - 1, i + 1);
  if (e.key === 'ArrowUp') j = Math.max(0, i - 1);
  if (e.key === 'Home') j = 0;
  if (e.key === 'End') j = btns.length - 1;
  if (j == null) return;
  e.preventDefault();
  btns[i].tabIndex = -1;
  btns[j].tabIndex = 0;
  btns[j].focus({ preventScroll: true });
  keepVisible($('#list'), btns[j]);
  if (window.matchMedia('(min-width: 900px)').matches) select(btns[j].dataset.id, { focus: false });
});
// Scroll only inside the list; scrollIntoView would also scroll the page that embeds this iframe.
function keepVisible(box, el, center = false) {
  const c = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (center && (r.top < c.top || r.bottom > c.bottom)) box.scrollTop += r.top - c.top - (c.height - r.height) / 2;
  else if (r.top < c.top) box.scrollTop -= c.top - r.top;
  else if (r.bottom > c.bottom) box.scrollTop += r.bottom - c.bottom;
}
// Bring the top of el into a scrolling pane when it is above the pane or too low to read (again without
// scrollIntoView, which would move the embedding page too).
function revealTop(box, el, need = 160) {
  const c = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.top < c.top || r.top + Math.min(r.height, need) > c.bottom) box.scrollTop += r.top - c.top - 6;
}

async function select(id, { focus } = {}) {
  st.sel = id;
  st.editing = false;
  st.result = null;
  for (const x of $('#list').querySelectorAll('button[data-id]')) {
    if (x.dataset.id === id) x.setAttribute('aria-current', 'true');
    else x.removeAttribute('aria-current');
  }
  st.detail = await call('deal_detail', id);
  renderDetail();
  app.dataset.view = 'detail';
  $('#detail').scrollTop = 0;
  const lb = $(`#list button[data-id="${id}"]`);
  if (lb && window.matchMedia('(min-width: 900px)').matches) {
    for (const x of $('#list').querySelectorAll('button[data-id]')) x.tabIndex = x === lb ? 0 : -1;
    keepVisible($('#list'), lb, true);
  }
  if (focus && !window.matchMedia('(min-width: 900px)').matches) $('#detail').focus({ preventScroll: true });
}

function backToList() {
  app.dataset.view = 'list';
  const b = $(`#list button[data-id="${st.sel}"]`);
  if (b) { b.focus({ preventScroll: true }); keepVisible($('#list'), b); }
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && app.dataset.view === 'detail' && !window.matchMedia('(min-width: 900px)').matches) backToList();
});

/* ---------------------------------------------------------------- deal detail */
function highlight(text, quotes) {
  let html = esc(text);
  for (const q of quotes) {
    const eq = esc(q);
    if (eq.length > 3 && html.includes(eq)) html = html.split(eq).join(`<mark>${eq}</mark>`);
  }
  return html;
}
function verdictLine(d) {
  const found = new Set(d.issues.map((i) => i.type));
  const planted = d.planted.map((p) => p.type);
  const fp = d.issues.filter((i) => !i.planted).length;
  if (!planted.length && !found.size) return 'Clean deal: nothing planted, nothing flagged.';
  const parts = [];
  if (planted.length) parts.push(`Ledger found ${planted.filter((t) => found.has(t)).length} of ${planted.length} planted anomal${planted.length === 1 ? 'y' : 'ies'}`);
  if (fp) parts.push(`${fp} finding${fp === 1 ? '' : 's'} not in the planted labels`);
  return `${parts.join('; ')}.`;
}
function slotValue(r, which) {
  const v = r[which];
  if (v == null || v === '') return '<span class="val null">null</span>';
  return `<span class="val">${esc(typeof v === 'number' && r.slot === 'total_stated_usd' ? usd(v) : v)}</span>`;
}
function receiptChip(r) {
  if (r.status === 'kept') return `<span class="chip kept" title="verbatim in activity #${r.row_n}">✓ kept${r.grade ? ` · ${r.grade}` : ''}</span>`;
  if (r.status === 'dropped') return '<span class="chip dropped">✗ dropped</span>';
  if (r.status === 'derived') return '<span class="chip derived">from record</span>';
  if (r.status === 'no-quote') return '<span class="chip no-quote">no quote needed</span>';
  return '';
}
const GRADE = { A: 'buyer or system message by direction or address', B: 'buyer message by author name', C: "buyer's words quoted inside a rep note" };
function renderSlot(r) {
  const val = r.status === 'dropped'
    ? `<span class="val"><s>${esc(r.claimed)}</s> → null</span>`
    : slotValue(r, r.status === 'derived' ? 'kept' : 'claimed');
  let why = '';
  if (r.status === 'kept') why = `<span class="why">verbatim in #${r.row_n} (${esc(r.row_date)}, ${esc(r.role)}${r.grade ? `, grade ${r.grade}: ${GRADE[r.grade] || ''}` : ''})</span>`;
  if (r.status === 'dropped') why = `<span class="why dropped">${esc(r.why)}</span>`;
  if (r.status === 'derived') why = '<span class="why">date taken from the activity that holds the promise quote, not from the model</span>';
  if (r.status === 'no-quote') why = '<span class="why">the rep\'s tone, read from rep notes; not a buyer claim</span>';
  const q = r.quote && r.status !== 'derived' && r.status !== 'no-quote' ? `<q>${esc(r.quote)}</q>` : '';
  return `<div class="slot"><span><span class="nm">${r.slot}</span><br>${val}</span><span class="status">${receiptChip(r)}</span>${q}${why}</div>`;
}
function renderEdit(d) {
  const fields = d.receipts.filter((r) => r.status !== 'derived' && r.slot !== 'last_buyer_promise_date').map((r) => {
    const cur = r.claimed ?? '';
    const ctl = r.options
      ? `<select id="e-${r.slot}" data-slot="${r.slot}"><option value="">null</option>${r.options.map((o) => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
      : `<input id="e-${r.slot}" data-slot="${r.slot}" value="${esc(cur)}" placeholder="null" ${r.slot === 'decision_date' ? 'inputmode="numeric"' : ''}>`;
    const quote = r.slot === 'rep_sentiment_after_last_buyer_message' ? ''
      : `<textarea data-quote="${r.slot}" aria-label="Quote for ${r.slot}" placeholder="${r.parent ? `empty: uses the ${r.parent} quote` : 'verbatim quote from the record'}">${esc(r.quote || '')}</textarea>`;
    return `<div class="f"><label for="e-${r.slot}">${r.slot}</label><div class="two">${ctl}${quote}</div></div>`;
  }).join('');
  return `<form class="edit" id="editform">${fields}<div class="acts"><button class="btn primary" type="submit">Re-check this deal</button><button class="btn" type="button" id="cancel-edit">Cancel</button></div></form>`;
}
function renderDetail() {
  const d = st.detail;
  if (!d) return;
  const c = d.crm;
  const filled = d.receipts.filter((r) => r.status !== 'empty');
  const empty = d.receipts.filter((r) => r.status === 'empty').map((r) => r.slot);
  const quotes = d.receipts.filter((r) => r.status === 'kept' && r.quote).map((r) => r.quote);
  const checks = d.checks;
  const n = (s) => checks.filter((x) => x.status === s).length;
  const planted = d.planted.map((p) => `<span class="mk ${d.issues.some((i) => i.type === p.type) ? 'tp' : 'fn'}" title="${esc(p.detail)}">${code(p.type)}</span>`).join(' ');
  $('#detail').innerHTML = `
  <button class="btn back" type="button" id="back">← All deals</button>
  <div class="d-head">
    <p class="label">${d.id} · ${esc(c.rep)}${d.edited ? ' · <span style="color:var(--accent-hi)">edited</span>' : ''}</p>
    <h2>${esc(c.account)} · ${esc(c.product)}</h2>
    <div class="d-meta"><span>stage <b>${esc(c.stage)}</b></span><span>amount <b>${c.amount == null ? 'blank' : usd(c.amount)}</b></span>
      <span>close <b>${esc(c.expected_close || '—')}</b></span><span>review date <b>${esc(st.info.load.as_of)}</b></span></div>
    <div class="verdict">${planted ? `<span class="label">planted</span> ${planted}` : '<span class="label">no planted anomaly</span>'} <span>${esc(verdictLine(d))}</span></div>
  </div>
  <div class="tries" id="tries">
    <p class="hint"><b style="color:var(--text)">Try to fool it.</b> Each button edits this deal's claim ledger and re-runs the repo's verifier and checks on it.</p>
    <div class="row">${d.tries.map((t) => `<button class="btn" type="button" data-try="${t.id}" title="${esc(t.says)}">${esc(t.label)}</button>`).join('')}
      <button class="btn" type="button" id="edit-toggle" aria-pressed="${st.editing}">${st.editing ? 'Close editor' : 'Edit claims by hand'}</button>
      ${d.edited ? '<button class="btn" type="button" id="reset">Reset this deal</button>' : ''}</div>
    ${st.result ? `<div class="result ${st.result.cls}" role="status">${st.result.html}</div>` : ''}
  </div>
  <div class="cols">
    <section class="card"><h3>The CRM says</h3>
      <dl class="kv">
        <dt>stage</dt><dd>${esc(c.stage)}</dd>
        <dt>amount</dt><dd>${c.amount == null ? `blank (list price ${usd(c.list_price)} used)` : usd(c.amount)}</dd>
        <dt>list price</dt><dd>${usd(c.list_price)}</dd>
        <dt>created</dt><dd>${esc(c.created || '—')}</dd>
        <dt>expected close</dt><dd>${esc(c.expected_close || '—')}</dd>
        <dt>last activity</dt><dd>${esc(c.last_activity_date || '—')}</dd>
        <dt>next step</dt><dd>${esc(c.next_step || '—')}</dd>
        <dt>primary contact</dt><dd>${esc(c.primary_contact)}</dd>
      </dl>
      <ul class="contacts">${d.contacts.map((p) => `<li>${esc(p.name)}, ${esc(p.title)} <span class="role">${esc(p.role)}</span></li>`).join('')}</ul>
    </section>
    <section class="card"><h3>The buyer said <em>· ${d.edited ? 'claim ledger with your edits, verified here' : 'claim ledger from Sonnet 5.5, re-verified here'}</em></h3>
      ${st.editing ? renderEdit(d) : `<div class="slots">${filled.map(renderSlot).join('') || '<p class="note">No buyer-stated facts.</p>'}</div>
      ${empty.length ? `<p class="empties">null: ${empty.join(', ')}</p>` : ''}
      ${d.day.dropped.length ? `<p class="empties" style="color:var(--fail)">dropped on the day (no verbatim quote): ${d.day.dropped.join(', ')}</p>` : ''}`}
    </section>
  </div>
  <div class="stack">
    <section class="card"><h3>Findings · ${d.issues.length}</h3><div class="findings">
      ${d.issues.map((i) => `<div class="finding ${i.planted ? 'planted' : ''}">
        <div class="t">${code(i.type)} ${esc(tname(i.type))} <span class="mk ${i.planted ? 'tp' : 'fp'}">${i.planted ? 'matches a planted anomaly' : 'not planted'}</span></div>
        <p>${esc(i.detail)}</p>${i.evidence ? `<p><q>${esc(i.evidence)}</q></p>` : ''}<p class="act">${esc(i.action)}</p></div>`).join('') || '<p class="note" style="margin:0">No findings.</p>'}
      ${d.missed.map((m) => `<div class="missed"><b>Missed:</b> ${code(m.type)} ${esc(tname(m.type))}. Planted as: ${esc(m.detail)}</div>`).join('')}
    </div></section>
    <section class="card"><h3>Checks run · ${n('pass')} pass · ${n('fail')} fail · ${n('skipped')} skipped</h3>
      <ul class="checks">${checks.map((x) => `<li><span class="chip ${x.status}">${x.status === 'pass' ? '✓' : x.status === 'fail' ? '✗' : '–'} ${code(x.type)}</span><span><span class="ty">${esc(tname(x.type))}</span> <span class="r">${esc(x.reason)}</span></span></li>`).join('')}</ul>
    </section>
    <section class="card"><h3>The record · ${d.record.length} activities</h3>
      <ol class="record">${d.record.map((a) => `<li><span class="n">#${a.n}</span><span class="who">${esc(a.date)} · ${esc(a.type)} · ${esc(a.author)} · <span class="role ${esc(a.role)}">${esc(a.role)}</span></span><span class="tx">${highlight(a.text, quotes)}</span></li>`).join('')}</ol>
    </section>
    <section class="card day"><h3>Decision layer · recorded on the day, not recomputed</h3>
      <p>win probability <b>${Math.round(d.day.win_probability * 100)}%</b> · objection <b>${esc(d.day.objection)}</b> · next action <b>${esc(d.day.next_action)}</b></p>
      ${d.day.buyer_quote ? `<p><q>${esc(d.day.buyer_quote)}</q></p>` : ''}<p class="note">${esc(d.day.rationale)}</p>
    </section>
  </div>`;
}

const TRY_NOTE = {
  invent: { dropped: 'The quote is not in the record, so the claim is nulled before any check sees it.' },
  repwords: { dropped: "The sentence is in the record, but it is the rep's note. Only buyer or system messages, or buyer words quoted inside a rep note, count as evidence." },
  misread: { kept: "This one gets through: the quote is real and the buyer wrote it, so the verifier keeps the claim and the checks fire. The verifier proves the words exist and who wrote them; whether they mean 'left the company' is the model's reading, and that reading is what the scoreboard's precision measures." },
  total: { kept: 'The quote is untouched, so the claim is kept; the consistency check then recomputes units × list price from the catalogue.' },
};

function describe(before, after, res, tryId) {
  const prev = Object.fromEntries(before.receipts.map((r) => [r.slot, r]));
  const lines = [];
  let anyDrop = false;
  let anyKeep = false;
  for (const r of after.receipts) {
    const p = prev[r.slot];
    const changed = !p || JSON.stringify([p.claimed, p.quote]) !== JSON.stringify([r.claimed, r.quote]);
    if (!changed || r.status === 'empty' || r.status === 'derived') continue;
    if (r.status === 'dropped') { anyDrop = true; lines.push(`<b>${r.slot} = ${esc(r.claimed)}</b> dropped: ${esc(r.why)}.`); }
    if (r.status === 'kept') { anyKeep = true; lines.push(`<b>${r.slot} = ${esc(r.claimed)}</b> kept: verbatim in #${r.row_n}, ${esc(r.role)}.`); }
  }
  const was = new Set(before.issues.map((i) => i.type));
  const now = new Set(after.issues.map((i) => i.type));
  const added = [...now].filter((t) => !was.has(t));
  const removed = [...was].filter((t) => !now.has(t));
  if (added.length) lines.push(`New finding${added.length > 1 ? 's' : ''}: ${added.map((t) => `<b>${code(t)} ${esc(tname(t))}</b>`).join(', ')}.`);
  if (removed.length) lines.push(`Finding${removed.length > 1 ? 's' : ''} gone: ${removed.map((t) => `${code(t)} ${esc(tname(t))}`).join(', ')}.`);
  if (!added.length && !removed.length) lines.push('Findings on this deal: unchanged.');
  if (res.others.length) lines.push(`Other deals changed: ${res.others.map((o) => `${o.id} ${o.added.map((t) => `+${code(t)}`).join(' ')}${o.removed.map((t) => ` −${code(t)}`).join('')}`).join('; ')}.`);
  const s = res.score.v3_now;
  const day = res.score.v3_day;
  const delta = s.semantic.recall !== day.semantic.recall || s.semantic.precision !== day.semantic.precision || s.clean_flagged !== day.clean_flagged;
  lines.push(`Ledger's score with your edits: semantic recall ${pct(s.semantic.recall)}, precision ${pct(s.semantic.precision)}, ${s.clean_flagged} of ${s.clean_deals} clean deals flagged${delta ? ` (on the day: ${pct(day.semantic.recall)}, ${pct(day.semantic.precision)}, ${day.clean_flagged})` : ' (unchanged)'}.`);
  const note = tryId && TRY_NOTE[tryId] && (anyDrop ? TRY_NOTE[tryId].dropped : anyKeep ? TRY_NOTE[tryId].kept : null);
  const fpAdded = after.issues.some((i) => added.includes(i.type) && !i.planted);
  return { cls: anyDrop && !added.length ? 'good' : (fpAdded ? 'bad' : ''), html: `${note ? `<p style="margin:0 0 4px">${esc(note)}</p>` : ''}<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` };
}

async function applyEdit(edit, tryId) {
  const before = st.detail;
  const box = $('#tries');
  box.classList.add('busy');
  try {
    const res = await call('recheck', before.id, JSON.stringify(edit));
    st.detail = res.detail;
    st.editing = false;
    st.result = describe(before, res.detail, res, tryId);
    await refreshList();
    renderDetail();
    revealTop($('#detail'), $('#tries')); // a hand edit is submitted from lower down; show its result
  } catch (e) {
    console.error(e);
    st.result = { cls: 'bad', html: `Re-check failed: ${esc(e.message || e)}` };
    renderDetail();
  }
}
async function refreshList() {
  st.deals = await call('deal_list');
  renderFilters();
  renderList();
}

$('#detail').addEventListener('click', async (e) => {
  const t = e.target.closest('[data-try]');
  if (t) {
    const tr = st.detail.tries.find((x) => x.id === t.dataset.try);
    if (tr) await applyEdit(tr.edit, tr.id);
    return;
  }
  if (e.target.closest('#back')) return backToList();
  if (e.target.closest('#edit-toggle') || e.target.closest('#cancel-edit')) {
    st.editing = !st.editing;
    renderDetail();
    if (st.editing) {
      // On a phone the editor card sits below the CRM card, out of view: scroll the pane to it, then focus.
      revealTop($('#detail'), $('#editform').closest('.card'));
      const f = $('#editform select, #editform input');
      if (f) f.focus({ preventScroll: true });
    }
    return;
  }
  if (e.target.closest('#reset')) {
    const before = st.detail;
    const res = await call('reset', before.id);
    st.detail = res.detail;
    st.result = describe(before, res.detail, res, null);
    await refreshList();
    renderDetail();
    revealTop($('#detail'), $('#tries'));
  }
});
$('#detail').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const slots = {};
  const quotes = {};
  for (const r of st.detail.receipts) slots[r.slot] = r.claimed ?? null;
  for (const el of form.querySelectorAll('[data-slot]')) slots[el.dataset.slot] = el.value === '' ? null : el.value;
  for (const el of form.querySelectorAll('[data-quote]')) if (el.value.trim()) quotes[el.dataset.quote] = el.value.trim();
  await applyEdit({ slots, quotes }, null);
});

/* ---------------------------------------------------------------- scoreboard */
const REPO_AT = 'https://github.com/happyc0der/ledger/blob/617c985371ec21e90d36d5d190ff4186feccd471/';
const REPORT = { issues: 'docs/reports/issues_sonnet.md', outcomes: 'docs/reports/v1_v3_sonnet.md' };
const reportLink = (k) => `<a class="mono" href="${REPO_AT}${REPORT[k]}" target="_blank" rel="noopener">${REPORT[k]}</a>`;
function mark(v, pub, fmt = pct, src = 'issues') {
  if (pub == null) return '';
  const same = fmt === pct ? Math.round(v * 100) === Math.round(pub * 100) : v === pub;
  return `<span class="pub ${same ? 'ok' : 'no'}" title="${same ? 'matches' : 'differs from'} ${REPORT[src]} at 617c985"><span class="long">report </span>${fmt(pub)} ${same ? '✓' : '≠'}</span>`;
}
async function renderScore() {
  const sb = await call('scoreboard');
  const ev = sb.evaluate;
  const rc = st.info.recompute;
  const edited = sb.edited.length > 0;
  const cols = [['rules', 'CRM rules', sb.rules, 'Rules'], ['naive', 'Naive “list the issues” agent', sb.naive, 'Naive'], ['v3', 'Ledger v3', sb.v3_day, 'Ledger']];
  if (edited) cols.push(['now', `Ledger v3 with your edits (${sb.edited.length} deal${sb.edited.length === 1 ? '' : 's'})`, sb.v3_now, 'Edited']);
  const th = ([, h, , sh]) => `<th><span class="long">${esc(h)}</span><span class="short">${esc(sh)}</span></th>`;
  const row = (label, get, pubKey, fmt = pct, hi = false) => `<tr><td>${label}</td>${cols.map(([k, , s]) => {
    const v = get(s);
    return `<td class="${hi && (k === 'v3' || k === 'now') ? 'hi' : ''}">${fmt(v)}${k !== 'now' ? mark(v, PUBLISHED[k]?.[pubKey], fmt) : ''}</td>`;
  }).join('')}</tr>`;
  const n = (x) => String(x);
  const types = Object.keys(sb.v3_day.per_type);
  const s6 = sb.v3_day.per_type.S6_duplicate_deal;
  const dup = s6 ? s6.tp + s6.fn : 0; // S6 rows in anomalies.csv
  const cell = (p) => (p.tp + p.fn === 0 && p.fp === 0 ? '—' : `${pct(p.precision ?? 0)} / ${pct(p.recall ?? 0)} <span class="pub">${p.tp}/${p.tp + p.fn}${p.fp ? `, ${p.fp} false` : ''}</span>`);
  $('#view-score').innerHTML = `
    <p class="sb-intro">Computed in your browser just now: the CRM rules run on the fields, Ledger's findings rebuilt by the repo's checks from the recorded claims,
      and the naive agent's recorded findings, all scored by <span class="mono">score_issues.score</span> against <span class="mono">anomalies.csv</span>
      (${st.info.load.planted} planted anomalies of ${types.length} types on ${st.info.load.planted_deals} deals, ${sb.v3_day.clean_deals} deals clean;
      the ${st.info.load.deals} deals are ${st.info.load.deals - dup} open deals plus ${dup} planted duplicates).
      The small line under each number is the value published in the repo at 617c985, from ${reportLink('issues')} for this table
      and ${reportLink('outcomes')} for fabrications: green ✓ when the browser's number matches it, red ≠ when it does not.</p>
    <div class="repro">
      <span class="chip ${rc.identical ? 'pass' : 'fail'}">${rc.identical ? '✓' : '✗'} ${rc.recomputed_findings} findings recomputed, ${rc.identical ? 'identical to' : 'differ from'} the ${rc.recorded_findings} recorded</span>
      <span class="chip ${rc.newly_dropped ? 'fail' : 'pass'}">${rc.quotes_reverified.toLocaleString('en-US')} recorded quoted claims re-verified against the record, ${rc.newly_dropped} newly dropped</span>
      <span class="chip">${rc.day_dropped_claims} claims on ${rc.day_dropped_deals.length} deals dropped on the day for lack of a verbatim quote</span>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Planted anomalies, ${st.info.load.deals} deals</th>${cols.map(th).join('')}</tr></thead>
      <tbody>
        ${row('Semantic recall (M1–M10)', (s) => s.semantic.recall, 'semR', pct, true)}
        ${row('Semantic precision', (s) => (s.name === 'rules' ? null : s.semantic.precision), 'semP', pct, true)}
        ${row(`Clean deals falsely flagged (of ${sb.v3_day.clean_deals})`, (s) => s.clean_flagged, 'clean', n, true)}
        ${row('Syntactic recall (S1–S8)', (s) => s.syntactic.recall, 'synR')}
        ${row('Findings', (s) => s.findings, 'findings', n)}
      </tbody></table></div>
    <h3 class="sec">Invented numbers and quotes, checked by evaluate.summarize</h3>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Against the CRM and the record</th><th>Naive v1<span class="long"> agent</span></th><th>Ledger<span class="long"> v3</span></th></tr></thead>
      <tbody>
        <tr><td>Fabrications (amounts + day gaps + quotes)</td><td>${ev.v1.fabrications}${mark(ev.v1.fabrications, PUBLISHED.fab.v1, n, 'outcomes')}</td><td class="hi">${ev.v3.fabrications}${mark(ev.v3.fabrications, PUBLISHED.fab.v3, n, 'outcomes')}</td></tr>
        <tr><td>Amounts that differ from the CRM</td><td>${ev.v1.fab_amount}</td><td>${ev.v3.fab_amount}</td></tr>
        <tr><td>“Days since the buyer last replied” that differ from the record</td><td>${ev.v1.fab_gap}</td><td>${ev.v3.fab_gap}</td></tr>
        <tr><td>Quotes not in the record</td><td>${ev.v1.fab_quote}</td><td>${ev.v3.fab_quote}</td></tr>
        <tr><td>Pipeline total error</td><td>${(ev.v1.pipeline_error_pct * 100).toFixed(1)}%</td><td>${(ev.v3.pipeline_error_pct * 100).toFixed(1)}%</td></tr>
      </tbody></table></div>
    <p class="note">Two different naive runs, both Claude Sonnet 5.5 on 2026-10-17: recall and false alarms are scored on the “list the issues” agent
      (<span class="mono">runs/company_nicrron/naive.jsonl</span>), fabrications on the naive v1 forecaster (<span class="mono">v1.jsonl</span>).
      Ledger's amounts and day gaps come from code, so their zero is by construction; the quote count is the model's.
      The fabrication check reads the recorded outputs and does not change with your edits.</p>
    <details><summary>Per anomaly type (precision / recall)</summary>
      <div class="tbl-wrap" style="margin-top:8px"><table>
        <thead><tr><th>Type</th>${cols.map(th).join('')}</tr></thead>
        <tbody>${types.map((t) => `<tr><td>${code(t)} ${esc(tname(t))}</td>${cols.map(([, , s]) => `<td>${cell(s.per_type[t])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div></details>`;
}

/* ---------------------------------------------------------------- forecast */
async function renderForecast() {
  const fc = await call('forecast_now');
  const t = fc.team;
  const reps = Object.entries(fc.per_rep).sort((a, b) => b[1].pipeline - a[1].pipeline);
  $('#view-forecast').innerHTML = `
    <div class="big">
      <div class="card"><span>pipeline · ${t.deals} deals</span><b>${usd(t.pipeline)}</b></div>
      <div class="card"><span>probability-weighted</span><b>${usd(t.weighted)}</b></div>
      <div class="card"><span>commit</span><b>${usd(t.commit)}</b></div>
      <div class="card"><span>best case</span><b>${usd(t.best_case)}</b></div>
      <div class="card"><span>excluded with receipts · ${fc.excluded.length} deals</span><b>${usd(fc.excluded_amount)}</b></div>
    </div>
    <p class="note">Computed in your browser by <span class="mono">forecast.rollup</span>. Commit counts deals with win probability ≥ ${fc.commit_p}, no open semantic finding and no past close date;
      best case counts p ≥ ${fc.best_case_p} without a stage-vs-buyer or zombie finding. Win probabilities are the recorded output of the day's decision layer;
      the findings are recomputed here${fc.edited ? `, including your edits on ${fc.edited} deal${fc.edited === 1 ? '' : 's'}` : ''}. No finding is muted. ${esc(fc.calibration.charAt(0).toUpperCase() + fc.calibration.slice(1))}.</p>
    <h3 class="sec">Per rep</h3>
    <div class="tbl-wrap"><table><thead><tr><th>Rep</th><th>Deals</th><th>Pipeline</th><th>Commit</th><th>Best case</th><th>Excluded</th></tr></thead>
      <tbody>${reps.map(([name, b]) => `<tr><td>${esc(name)}</td><td>${b.deals}</td><td>${usd(b.pipeline)}</td><td>${usd(b.commit)}</td><td>${usd(b.best_case)}</td><td>${b.excluded}</td></tr>`).join('')}</tbody></table></div>
    <h3 class="sec">Every excluded dollar, with its reason</h3>
    <div class="tbl-wrap excl"><table><thead><tr><th>Deal</th><th>Amount</th><th>p</th><th>Why</th></tr></thead>
      <tbody>${fc.excluded.map((e) => `<tr><td><button type="button" data-open="${e.opportunity_id}">${esc(e.account)} · ${esc(e.product)}</button> <span class="pub">${e.opportunity_id} · ${esc(e.rep)}</span></td><td>${usd(e.amount)}</td><td>${Math.round(e.p * 100)}%</td>
        <td>${e.why.map((w) => `<span class="mk fp" title="${esc(tname(w))}">${code(w)} ${esc(tname(w))}</span>`).join(' ')}</td></tr>`).join('')}</tbody></table></div>`;
}
$('#view-forecast').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-open]');
  if (!b) return;
  st.filter = 'all';
  st.q = '';
  $('#q').value = '';
  renderFilters();
  renderList();
  showTab('deals');
  await select(b.dataset.open, { focus: true });
});
