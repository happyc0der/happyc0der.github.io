// Page logic for the one-time-pad allocation demo. All protocol work happens in Python in
// worker.js; this file only draws the state it gets back and forwards clicks and keys.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = (x) => Number(x).toLocaleString('en-US');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const M = 5; // parties in the playground

const CLASS_OF = {
  'chunk-reserve': 'ChunkReserveProtocol',
  'static-partition': 'StaticPartitionProtocol',
  grant: 'GrantProtocol',
  broken: 'AlwaysPadOne',
};
const NOTES = {
  'chunk-reserve': '<b>ChunkReserveProtocol.</b> Pads come in chunks of d. Each party spends a private current chunk and holds a public reserve chunk. Everyone replays one rule over the delivered messages: when a party\'s message from inside its reserve lands, its reserve moves to the next chunk nobody has had.',
  'static-partition': '<b>StaticPartitionProtocol</b>, the baseline (this is the 2026 re-implementation in protocol.py). Five fixed slices, no coordination, trivially secret, but a party can only spend its own slice, so one talkative party strands the rest.',
  grant: '<b>GrantProtocol,</b> for senders that never see their own messages land. Chunk C starts with party C mod m; a party running low broadcasts a request, and others give chunks away before their grant is even sent. Control messages use network slots too.',
  broken: '<b>AlwaysPadOne,</b> copied from test_protocol.py: a deliberately broken protocol that puts every message on pad 1. The second send trips the same reuse check simulation.run applies to every pad.',
};

// ---------------------------------------------------------------- worker plumbing
let worker = null;
let nextId = 1;
const pending = new Map();
let onProgress = null;
let onStream = null;
let statusSink = null;

function spawn() {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'status') return statusSink && statusSink(m.text, m.frac);
    if (m.type === 'progress') return onProgress && onProgress(m);
    if (m.type === 'stream') return onStream && onStream(m.text);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.result);
    else p.reject(new Error(m.error));
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || 'the Python worker failed to start');
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };
}

function call(op, args = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, args });
  });
}

function killWorker() {
  if (worker) worker.terminate();
  const err = new Error('stopped');
  for (const p of pending.values()) p.reject(err);
  pending.clear();
  worker = null;
}

const lastLine = (msg) => String(msg).trim().split('\n').filter(Boolean).pop() || String(msg);

// ---------------------------------------------------------------- the pad strip
function stripHTML(groups, pads, { finished = false, size = 16 } = {}) {
  const digits = size >= 13;
  return groups.map((g) => {
    const owner = g.owner;
    const glyph = { current: '●', reserve: '○', both: '◐', transit: '→' }[g.role] || '';
    let label = '';
    if (g.label) label = g.label;
    else if (owner !== null && owner !== undefined && g.role !== 'spent' && g.role !== 'free') label = g.role === 'transit' ? `→P${owner}` : `P${owner}${glyph}`;
    const title = g.chunk !== undefined
      ? `chunk ${g.chunk}: ${g.role === 'free' ? 'never assigned' : g.role === 'spent' ? 'spent' : `${g.role} of P${owner}`}`
      : `${label}`;
    let cells = '';
    for (let k = 0; k < g.size; k++) {
      const padNo = g.start + k;
      const [st, who] = pads[padNo - 1];
      const cls = st ? `s${st}` : finished ? 'waste' : '';
      const what = ['unused', 'in flight', 'delivered', 'REUSED'][st];
      const style = who !== null && who !== undefined ? ` style="--pc:var(--p${who})"` : '';
      const tip = `pad ${padNo}${who !== null && who !== undefined ? ` · P${who}` : ''} · ${finished && !st ? 'never used' : what}`;
      cells += `<i class="${cls}"${style} title="${tip}">${digits && st ? (st === 3 ? '!' : who) : ''}</i>`;
    }
    const ownerAttr = owner !== null && owner !== undefined ? ` data-owner="${owner}" style="--c:var(--p${owner})"` : '';
    return `<div class="g role-${g.role}"${ownerAttr} title="${esc(title)}"><b>${esc(label)}</b><span class="pads">${cells}</span></div>`;
  }).join('');
}

function padSize(el, groups, n, maxRows = 6) {
  const W = el.clientWidth || 320;
  const G = groups.length;
  let s = 8;
  for (let rows = 1; rows <= maxRows; rows++) {
    s = Math.floor((W * rows - G * 12) / n) - 2;
    if (s >= 15) break;
  }
  return Math.max(8, Math.min(s, 24));
}

function drawStrip(el, groups, pads, finished, maxRows) {
  const s = padSize(el, groups, pads.length, maxRows);
  el.style.setProperty('--pad', `${s}px`);
  el.innerHTML = stripHTML(groups, pads, { finished, size: s });
}

function posterStrip() {
  const el = $('#posterStrip');
  const groups = Array.from({ length: 20 }, (_, c) => ({ start: c * 3 + 1, size: 3, owner: c < M ? c : null, role: c < M ? 'both' : 'free', chunk: c }));
  const pads = Array.from({ length: 60 }, () => [0, null]);
  el.style.width = '100%';
  drawStrip(el, groups, pads, false, 2);
}

// ---------------------------------------------------------------- status and loading
function posterStatus(text, frac) {
  $('#status').textContent = text;
  const bar = $('#bar');
  bar.hidden = false;
  if (typeof frac === 'number') bar.firstElementChild.style.width = `${Math.round(frac * 100)}%`;
}

async function boot(sink) {
  statusSink = sink;
  spawn();
  return call('init');
}

let info = null;
async function start() {
  const btn = $('#start');
  btn.hidden = true;
  $('#status').classList.remove('error');
  try {
    info = await boot(posterStatus);
  } catch (err) {
    $('#status').textContent = `Could not start Python: ${lastLine(err.message)}`;
    $('#status').classList.add('error');
    btn.hidden = false;
    btn.textContent = 'Try again';
    killWorker();
    return;
  }
  fillSelects();
  $('#poster').hidden = true;
  $('#app').hidden = false;
  $('#tabs').hidden = false;
  await newPlay();
  $('#tab-play').focus({ preventScroll: true });
}

function fillSelects() {
  const opts = (list, sel) => list.map((v) => `<option${v === sel ? ' selected' : ''}>${v}</option>`).join('');
  $('#schedule').innerHTML = opts(info.schedules, 'one_shot');
  $('#delivery').innerHTML = opts(info.deliveries, 'random');
  $('#cmpForm [name=schedule]').innerHTML = opts(info.schedules, 'one_shot');
  $('#cmpForm [name=delivery]').innerHTML = opts(info.deliveries, 'random');
}

// ---------------------------------------------------------------- Play
const play = { kind: 'chunk-reserve', state: null, playing: false, chain: Promise.resolve() };

function playCfg() {
  const seed = Math.max(0, Math.min(999, Math.floor(+$('#seed').value || 0)));
  $('#seed').value = seed;
  return {
    kind: play.kind, n: +$('#n').value, d: +$('#d').value, m: M,
    schedule: $('#schedule').value, delivery: $('#delivery').value, pressure: $('#pressure').value, seed,
  };
}

function playOp(op, args) {
  play.chain = play.chain
    .then(() => call(op, args))
    .then(renderPlay)
    .catch((err) => {
      if (err.message !== 'stopped') showPlayError(err);
      return null;
    });
  return play.chain;
}

function showPlayError(err) {
  const box = $('#alarm');
  box.hidden = false;
  box.textContent = `Python raised: ${lastLine(err.message)}`;
}

function newPlay() {
  play.playing = false;
  updatePlayBtn();
  return playOp('play.new', playCfg());
}

function buildParties() {
  const wrap = $('#parties');
  wrap.innerHTML = '';
  for (let j = 0; j < M; j++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'party';
    b.dataset.j = j;
    b.dataset.act = '';
    b.style.setProperty('--c', `var(--p${j})`);
    b.innerHTML = `<strong><span class="dot"></span>P${j}<small></small></strong><span class="info"></span>`;
    b.addEventListener('click', () => playOp('play.send', { j }));
    wrap.appendChild(b);
  }
}

function renderPlay(s) {
  if (!s) return s;
  play.state = s;
  const kind = s.cfg.kind;
  $('#protoNote').innerHTML = NOTES[kind];
  const box = $('#alarm');
  box.hidden = !s.alarm;
  if (s.alarm) box.textContent = `${s.alarm}. simulation.run raises the same error and stops: that is the check that every completed run passes.`;

  const strip = $('#strip');
  drawStrip(strip, s.groups, s.pads, s.finished);
  strip.setAttribute('aria-label', `${s.n} pads: ${s.used} used, ${s.inflight.filter((x) => x.kind === 'data').length} in flight${s.finished ? `, ${s.wasted} never used` : ''}`);

  // parties
  const labels = {
    'chunk-reserve': 'Parties: current chunk is private, reserve is in every ledger. Click to send',
    'static-partition': 'Parties and their fixed slices. Click to send',
    grant: 'Parties and the chunks they own. Click to send',
    broken: 'Parties. Click to send',
  };
  $('#partiesLabel').textContent = labels[kind];
  if ($$('#parties .party').length !== M) buildParties();
  for (const p of s.parties) {
    const b = $(`#parties .party[data-j="${p.j}"]`);
    b.classList.toggle('out', !p.can);
    b.classList.toggle('full', p.can && !p.room);
    let detail = '';
    if (kind === 'chunk-reserve') detail = `cur ${p.current} · ${p.left} left<br>res ${p.reserve === null ? 'none' : p.reserve}`;
    else if (kind === 'static-partition') detail = `slice ${p.lo}–${p.hi}<br>${p.left} left`;
    else if (kind === 'grant') detail = `cur ${p.current === null ? '–' : p.current} · ${p.left} left<br>pool ${p.pool} chunk${p.pool === 1 ? '' : 's'}${p.asking ? ', asking' : ''}`;
    else detail = 'always pad 1<br>&nbsp;';
    $('.info', b).innerHTML = detail;
    $('small', b).textContent = `${p.sent} sent`;
    const state = !p.can ? 'has no pad it may use' : !p.room ? 'must wait, network full' : 'can send';
    b.setAttribute('aria-label', `Send from party ${p.j}: ${state}; ${p.sent} sent, ${p.inflight} in flight`);
  }

  // in flight
  const hadChipFocus = document.activeElement && document.activeElement.classList.contains('chip');
  const data = s.inflight.filter((x) => x.kind === 'data').length;
  $('#flightLabel').textContent = `In flight: ${s.inflight.length} of d = ${s.d}, oldest first${s.pending ? ` (+${s.pending} control message waiting)` : ''}. Click one to deliver it`;
  $('#flight').innerHTML = s.inflight.length
    ? s.inflight.map((x, k) => {
      const what = x.kind === 'data' ? `pad ${x.pad}` : x.kind === 'request' ? 'request' : `grant ${x.chunks.join(',')} → P${x.to}`;
      return `<button type="button" class="chip" data-act data-i="${x.i}" style="--c:var(--p${x.sender})" aria-label="Deliver party ${x.sender}'s ${what}">P${x.sender} · ${what}${k === 0 ? ' <span class="age">oldest</span>' : ''}</button>`;
    }).join('')
    : `<span class="empty">${s.finished ? 'Nothing in flight. The run is over.' : 'Nothing in flight. Send something.'}</span>`;
  if (hadChipFocus) ($('#flight .chip') || $('[data-policy="fifo"]')).focus({ preventScroll: true });
  void data;

  // stats
  const stat = (v, l, cls = '', tip = '') => `<div class="stat ${cls}"${tip ? ` title="${esc(tip)}"` : ''}><b>${v}</b><span>${l}</span></div>`;
  const reuse = s.alarm
    ? stat('repeat', 'reuse check failed', 'bad')
    : stat(fmt(s.used), 'pads checked, no reuse', 'ok', 'Every pad handed out is checked against every pad before it, as simulation.run does.');
  let sixth;
  if (s.views_agree !== null) {
    sixth = stat(`${Math.min(s.next_chunk, s.chunks)}<small class="muted"> / ${s.chunks}</small>`, `chunks out · ledgers ${s.views_agree ? 'agree' : 'DIFFER'}`, '', `Chunks handed out so far; all ${s.m} parties' reserve maps ${s.views_agree ? 'are identical' : 'differ'}.`);
  } else sixth = stat(fmt(s.steps), 'auto steps');
  const formula = s.bound === null ? '' : `d(2m−1) − m + (n mod d) = ${s.d}·${2 * s.m - 1} − ${s.m} + ${s.n % s.d}`;
  $('#stats').innerHTML = [
    stat(`${fmt(s.used)}<small class="muted"> / ${fmt(s.n)}</small>`, 'pads used'),
    s.finished ? stat(fmt(s.wasted), 'wasted, never used') : stat(fmt(s.n - s.used), 'unused so far'),
    s.bound === null
      ? stat('none', 'proved worst case', '', 'This protocol has no proved waste bound.')
      : stat(`${fmt(s.bound)}<small class="muted"> worst case</small>`, formula, '', 'The proved, exact worst-case waste: waste_bound() in protocol.py.'),
    stat(fmt(s.blocked), 'times blocked', '', 'Wanted to send, the network had room, pads were still unallocated, and the protocol had none to give: the count simulation.run keeps.'),
    reuse,
    sixth,
  ].join('');

  // events
  $('#log').innerHTML = s.events.slice().reverse().slice(0, 7)
    .map((e) => `<li class="${e.k}"${e.p !== null && e.p !== undefined ? ` style="--c:var(--p${e.p})"` : ''}>${esc(e.t)}</li>`).join('');

  // cross-check against simulation.run
  const check = $('#check');
  check.hidden = !s.finished && !s.check;
  check.classList.toggle('same', !!(s.check && s.check.same));
  if (s.check && s.check.error) {
    check.innerHTML = `simulation.run with the same settings raised too: <span class="bad-text">${esc(s.check.error)}</span>`;
  } else if (s.check) {
    const c = s.cfg;
    const r = s.check.run;
    const mine = s.check.mine;
    check.innerHTML = `<span class="label">Checked against the repo</span><br>simulation.run(${CLASS_OF[c.kind]}(${c.n}, ${c.d}, ${c.m}), schedule=Schedule("${c.schedule}", ${c.m}), delivery="${c.delivery}", pressure="${c.pressure}", seed=${c.seed})<br>→ wasted ${r.wasted}, sends ${r.sends}, blocked ${r.blocked}, steps ${r.steps}<br>This auto-played run: wasted ${mine.wasted}, sends ${mine.sends}, blocked ${mine.blocked}, steps ${mine.steps}. ${s.check.same ? '<span class="good-text">Identical.</span>' : '<span class="bad-text">Different.</span>'}`;
  } else if (s.finished) {
    check.innerHTML = `Run over after ${s.manual ? 'hand-driven moves' : 'auto steps'}: ${s.wasted} of ${s.n} pads never used${s.bound !== null ? `, against a proved worst case of ${s.bound}` : ''}. Only an untouched auto run is compared with simulation.run; press Reset, then Run to end, to see that.`;
  }

  // controls that make no sense once the run is over
  const over = s.finished || !!s.alarm;
  for (const b of $$('#parties .party, #flight .chip, [data-policy], #endRun, #step, #play, #finish')) {
    if (!document.body.classList.contains('busy')) b.disabled = over;
  }
  return s;
}

function updatePlayBtn() {
  const b = $('#play');
  b.textContent = play.playing ? 'Pause' : 'Play';
  b.setAttribute('aria-pressed', String(play.playing));
}

async function togglePlay() {
  if (play.playing) {
    play.playing = false;
    updatePlayBtn();
    return;
  }
  if (play.state && (play.state.finished || play.state.alarm)) return;
  play.playing = true;
  updatePlayBtn();
  while (play.playing) {
    const s = await playOp('play.step', { k: 1 });
    if (!s || s.finished || s.alarm) break;
    await sleep(260);
  }
  play.playing = false;
  updatePlayBtn();
}

function wirePlay() {
  for (const b of $$('#proto button')) {
    b.addEventListener('click', () => {
      play.kind = b.dataset.v;
      for (const o of $$('#proto button')) o.setAttribute('aria-pressed', String(o === b));
      newPlay();
    });
  }
  for (const id of ['#n', '#d', '#schedule', '#delivery', '#pressure', '#seed']) $(id).addEventListener('change', () => newPlay());
  $('#reset').addEventListener('click', () => newPlay());
  $('#flight').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) playOp('play.deliver', { i: +chip.dataset.i });
  });
  for (const b of $$('[data-policy]')) b.addEventListener('click', () => playOp('play.deliver_by', { policy: b.dataset.policy }));
  $('#endRun').addEventListener('click', () => { play.playing = false; playOp('play.end'); });
  $('#step').addEventListener('click', () => { play.playing = false; playOp('play.step', { k: 1 }); });
  $('#play').addEventListener('click', togglePlay);
  $('#finish').addEventListener('click', () => { play.playing = false; playOp('play.finish'); });

  document.addEventListener('keydown', (e) => {
    if (tab !== 'play' || !play.state || document.body.classList.contains('busy')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    const over = play.state.finished || play.state.alarm;
    if (/^[0-9]$/.test(k) && +k < M) { if (!over) playOp('play.send', { j: +k }); }
    else if (k === 'f') { if (!over) playOp('play.deliver_by', { policy: 'fifo' }); }
    else if (k === 'l') { if (!over) playOp('play.deliver_by', { policy: 'lifo' }); }
    else if (k === 'a') { if (!over) playOp('play.deliver_by', { policy: 'adversarial' }); }
    else if (k === 's') { if (!over) { play.playing = false; playOp('play.step', { k: 1 }); } }
    else if (k === 'p') togglePlay();
    else return;
    e.preventDefault();
  });

  let raf = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (play.state && tab === 'play') drawStrip($('#strip'), play.state.groups, play.state.pads, play.state.finished);
    });
  }).observe($('#strip'));
}

// ---------------------------------------------------------------- Compare
let compared = false;
let lastCompare = null;
let scale = 'linear';
const HUE = { 'chunk-reserve': 'var(--accent)', grant: 'var(--p1)', 'static-partition': 'var(--p2)' };

async function runCompare() {
  const f = new FormData($('#cmpForm'));
  const args = {
    schedule: f.get('schedule'), delivery: f.get('delivery'), pressure: f.get('pressure'),
    seed: Math.max(0, Math.min(999, Math.floor(+f.get('seed') || 0))), m: +f.get('m'), d: +f.get('d'), n: +f.get('n'),
  };
  const out = $('#cmpOut');
  out.innerHTML = '<p class="status">Running simulation.run for three protocols…</p>';
  compared = true;
  let res;
  try {
    res = await call('compare', args);
  } catch (err) {
    if (err.message !== 'stopped') out.innerHTML = `<p class="status error">Python raised: ${esc(lastLine(err.message))}</p>`;
    return;
  }
  lastCompare = { args, res };
  drawCompare();
}

function drawCompare() {
  if (!lastCompare) return;
  const { args, res } = lastCompare;
  const out = $('#cmpOut');
  const n = args.n;
  const x = scale === 'log' ? (v) => (100 * Math.log10(1 + v)) / Math.log10(1 + n) : (v) => (100 * v) / n;
  const cr = res.find((r) => r.protocol === 'chunk-reserve');
  const sp = res.find((r) => r.protocol === 'static-partition');
  const gr = res.find((r) => r.protocol === 'grant');
  const bars = res.map((r) => {
    let bound = '';
    if (r.bound !== null) {
      const at = x(r.bound);
      bound = `<u class="${at > 55 ? 'flip' : ''}" style="left:${at.toFixed(2)}%" data-l="proved worst case ${fmt(r.bound)}"></u>`;
    }
    const committed = r.committed ? ` · committed summary.csv cell: worst ${fmt(r.committed.max_wasted)} wasted, ${fmt(r.committed.max_blocked)} blocked over 12 runs` : '';
    return `<div class="barrow${r.bound !== null ? ' has-bound' : ''}" style="--c:${HUE[r.protocol]}">
      <header><strong>${r.protocol}</strong><span><span class="big">${fmt(r.wasted)}</span> of ${fmt(n)} pads wasted</span></header>
      <div class="track" role="img" aria-label="${r.protocol}: ${r.wasted} of ${n} pads wasted"><i style="width:${x(r.wasted).toFixed(2)}%"></i>${bound}</div>
      <div class="sub">${fmt(r.sends)} sent · ${fmt(r.blocked)} blocked · ${r.ms} ms in your browser${committed}</div>
    </div>`;
  }).join('');
  out.innerHTML = `<div class="bars">${bars}<div class="axis"><span>0</span><span>${scale} scale</span><span>${fmt(n)} pads</span></div></div>
    <p class="proto-note">chunk-reserve left <b>${fmt(cr.wasted)}</b> of ${fmt(n)} pads unused, ${cr.wasted <= cr.bound ? 'within' : 'over'} its proved worst case of ${fmt(cr.bound)}, and was blocked ${fmt(cr.blocked)} times. grant: ${fmt(gr.wasted)} wasted, ${fmt(gr.blocked)} blocked. Static partition: ${fmt(sp.wasted)} wasted.</p>`;
}

// ---------------------------------------------------------------- CI
let activeJob = null;

function setBusy(on, jobEl) {
  document.body.classList.toggle('busy', on);
  for (const el of $$('[data-act]')) el.disabled = on;
  for (const el of $$('[data-stop]')) el.hidden = true;
  if (on && jobEl) for (const el of $$('[data-stop]', jobEl)) el.hidden = false;
  if (on) { play.playing = false; updatePlayBtn(); }
  if (!on && play.state) renderPlay(play.state);
}

async function runJob(kind) {
  const jobEl = kind === 'tests' ? $('#job-tests') : kind === 'main' ? $('#job-main') : $('#job-eval');
  const verdict = $('.verdict', jobEl);
  const out = $('.out', jobEl);
  const rowsEl = $('.rows', jobEl);
  const bar = $('.progress', jobEl);
  const stat = $('.status', jobEl);
  verdict.textContent = '';
  verdict.className = 'verdict';
  out.textContent = '';
  if (rowsEl) rowsEl.innerHTML = '';
  activeJob = { kind, jobEl };
  setBusy(true, jobEl);
  const t0 = performance.now();
  statusSink = (text) => { verdict.textContent = text; };
  try {
    if (kind === 'tests') {
      verdict.textContent = 'Starting pytest…';
      let buf = '';
      let raf = 0;
      onStream = (text) => {
        buf += text;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => { out.textContent = buf; out.scrollTop = out.scrollHeight; });
      };
      const r = await call('ci.tests');
      out.textContent = buf;
      out.scrollTop = out.scrollHeight;
      const summary = (buf.match(/\d+ (?:passed|failed)[^\n]*/g) || []).pop() || '';
      verdict.textContent = `${r.code === 0 ? '✓ exit code 0' : `✗ exit code ${r.code}`} · ${summary.replace(/=+/g, '').trim()} · pytest ${r.pytest} on Python ${r.python}`;
      verdict.classList.add(r.code === 0 ? 'good-text' : 'bad-text');
    } else if (kind === 'main') {
      verdict.textContent = 'Running main.py…';
      const r = await call('ci.main');
      out.textContent = r.stdout;
      verdict.textContent = `✓ exit code 0 · ${r.seconds} s in your browser`;
      verdict.classList.add('good-text');
    } else {
      bar.hidden = false;
      bar.firstElementChild.style.width = '0%';
      onProgress = (m) => {
        bar.firstElementChild.style.width = `${Math.round((100 * m.k) / m.total)}%`;
        stat.textContent = `${m.k} of ${m.total} cells · ${m.label} · ${Math.round((performance.now() - t0) / 1000)} s`;
      };
      verdict.textContent = kind === 'slice' ? 'Measuring 18 cells…' : 'Running eval_protocol.main()…';
      if (kind === 'slice') {
        const r = await call('ci.slice');
        rowsEl.innerHTML = r.rows.map((x) => (x.same
          ? `<div class="same">✓ ${esc(x.new)}</div>`
          : `<div class="diff">✗ new ${esc(x.new)}<br>&nbsp; old ${esc(x.old || '(missing)')}</div>`)).join('');
        const ok = r.identical === r.total;
        verdict.textContent = `${ok ? '✓' : '✗'} ${r.identical} of ${r.total} regenerated rows are byte-identical to the committed summary.csv lines · ${r.seconds} s in your browser`;
        verdict.classList.add(ok ? 'good-text' : 'bad-text');
      } else {
        const r = await call('ci.full');
        if (r.identical) {
          verdict.textContent = `✓ diff prints nothing: ${r.rows} rows, ${fmt(r.new_bytes)} bytes, SHA-256 ${r.new_sha.slice(0, 16)}… on both sides · ${r.seconds} s in your browser`;
          verdict.classList.add('good-text');
        } else {
          verdict.textContent = `✗ the regenerated file differs (${fmt(r.new_bytes)} vs ${fmt(r.old_bytes)} bytes)`;
          verdict.classList.add('bad-text');
        }
        out.textContent = (r.identical ? '' : `${r.diff.join('\n')}\n\n`) + `stdout of eval_protocol.py:\n${r.stdout}`;
      }
      stat.textContent = '';
    }
  } catch (err) {
    if (err.message === 'stopped') {
      verdict.textContent = 'Stopped. Python is restarting.';
    } else {
      verdict.textContent = `✗ ${lastLine(err.message)}`;
      verdict.classList.add('bad-text');
      if (!out.textContent) out.textContent = err.message;
    }
  } finally {
    onStream = null;
    onProgress = null;
    if (bar) bar.hidden = true;
    activeJob = null;
    if (worker) setBusy(false);
  }
}

async function stopJob() {
  const job = activeJob;
  killWorker();
  const verdict = job ? $('.verdict', job.jobEl) : null;
  try {
    info = await boot((text) => { if (verdict) verdict.textContent = `Stopped. Restarting Python: ${text}`; });
    if (verdict) verdict.textContent = 'Stopped. Python restarted; the playground was reset.';
  } catch (err) {
    if (verdict) verdict.textContent = `Could not restart Python: ${lastLine(err.message)}`;
  }
  setBusy(false);
  play.chain = Promise.resolve();
  await newPlay();
}

// ---------------------------------------------------------------- tabs
let tab = 'play';
const TABS = ['play', 'compare', 'ci'];
function selectTab(name, focus) {
  tab = name;
  for (const t of TABS) {
    const b = $(`#tab-${t}`);
    b.setAttribute('aria-selected', String(t === name));
    b.tabIndex = t === name ? 0 : -1;
    $(`#panel-${t}`).hidden = t !== name;
  }
  if (focus) $(`#tab-${name}`).focus({ preventScroll: true });
  if (name !== 'play') { play.playing = false; updatePlayBtn(); }
  if (name === 'play' && play.state) renderPlay(play.state);
  if (name === 'compare' && !compared && !document.body.classList.contains('busy')) runCompare();
}

function wireTabs() {
  for (const t of TABS) $(`#tab-${t}`).addEventListener('click', () => selectTab(t));
  $('#tabs').addEventListener('keydown', (e) => {
    const i = TABS.indexOf(tab);
    let next = null;
    if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
    else if (e.key === 'ArrowLeft') next = TABS[(i + TABS.length - 1) % TABS.length];
    else if (e.key === 'Home') next = TABS[0];
    else if (e.key === 'End') next = TABS[TABS.length - 1];
    if (next) { e.preventDefault(); selectTab(next, true); }
  });
}

// ---------------------------------------------------------------- go
posterStrip();
wireTabs();
wirePlay();
$('#cmpForm').addEventListener('submit', (e) => { e.preventDefault(); runCompare(); });
for (const b of $$('#scale button')) {
  b.addEventListener('click', () => {
    scale = b.dataset.v;
    for (const o of $$('#scale button')) o.setAttribute('aria-pressed', String(o === b));
    drawCompare();
  });
}
for (const b of $$('[data-job]')) b.addEventListener('click', () => runJob(b.dataset.job));
for (const b of $$('[data-stop]')) b.addEventListener('click', stopJob);
$('#start').addEventListener('click', start);
$('#start').hidden = false;
