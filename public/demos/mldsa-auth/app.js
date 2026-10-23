// Page logic for the mldsa-auth demo. All protocol work happens in worker.js,
// inside the compiled C; this file only sends requests and draws results.

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('aria-') || k === 'role' || k === 'title') n.setAttribute(k, v);
    else n[k] = v;
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
}

const fmtMs = (ms) => (ms >= 10 ? ms.toFixed(1) : ms >= 1 ? ms.toFixed(2) : ms.toFixed(3)) + ' ms';
// A single timing, honest about the browser's timer: below its resolution we
// only know "less than one tick".
const fmtT = (ms) => (S.timerRes && ms < S.timerRes ? `< ${fmtMs(S.timerRes)}` : fmtMs(ms));
const fmtB = (n) => n.toLocaleString('en-US') + ' B';
const spaced = (hex, max = 24) => {
  const out = [];
  for (let i = 0; i < Math.min(hex.length, max * 2); i += 2) out.push(hex.slice(i, i + 2));
  return out.join(' ') + (hex.length > max * 2 ? ' …' : '');
};
const hexToText = (hex) => {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16);
  return new TextDecoder().decode(b);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- worker RPC ---------------------------------------------------------

let worker = null;
let nextId = 1;
const pending = new Map();
let onProgress = () => {};
let onLines = () => {};

function call(op, args) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, args });
  });
}

function startWorker() {
  worker = new Worker(new URL('worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === 'result' || m.type === 'error') {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (!p) return;
      m.type === 'result' ? p.resolve(m.result) : p.reject(new Error(m.message));
    } else if (m.type === 'progress' || m.type === 'stage') onProgress(m);
    else if (m.type === 'lines') onLines(m.lines);
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'worker failed'));
    pending.clear();
  };
}

// ---- state ----------------------------------------------------------------

const S = { init: null, timerRes: null, busy: false, session: null, seq: [0, 0] };

function setBusy(b) {
  S.busy = b;
  for (const btn of document.querySelectorAll('#app button.btn')) btn.disabled = b;
  if (!b && S.init) renderSessLine();
}

// ---- poster / loading -----------------------------------------------------

$('start').addEventListener('click', async () => {
  $('start').disabled = true;
  $('loading').hidden = false;
  const bar = $('prog-bar');
  const status = $('load-status');
  onProgress = (m) => {
    if (m.type === 'stage') {
      const pct = m.stage === 'compile' ? 80 : 92;
      bar.style.width = pct + '%';
      $('prog').setAttribute('aria-valuenow', String(pct));
      status.textContent = m.stage === 'compile' ? 'Compiling the WebAssembly module…' : 'Generating three ML-DSA-65 keypairs…';
    } else if (m.stage === 'module') {
      const pct = m.total ? Math.round((m.got / m.total) * 75) : 40;
      bar.style.width = pct + '%';
      $('prog').setAttribute('aria-valuenow', String(pct));
      status.textContent = `Downloading hd.wasm: ${(m.got / 1024).toFixed(0)} KB${m.total ? ' of ' + (m.total / 1024).toFixed(0) + ' KB' : ''}`;
    }
  };
  try {
    startWorker();
    const r = await call('init');
    if (!r.init.ok) throw new Error(r.init.error);
    S.init = r.init;
    S.timerRes = r.timerRes;
    bar.style.width = '100%';
    showParties();
    $('poster').hidden = true;
    $('app').hidden = false;
    $('t-hs').focus({ preventScroll: true });
    onProgress = () => {};
    runHandshake();
  } catch (e) {
    status.textContent = 'Could not start: ' + e.message;
    status.classList.add('error');
    $('start').disabled = false;
  }
});

function showParties() {
  const i = S.init;
  const short = (fp) => fp.slice(0, 4) + ' ' + fp.slice(4, 8) + '…';
  $('pa').replaceChildren(
    el('span', { text: `id ${i.id_a} · key ` }), el('span', { class: 'k', text: short(i.fp.a) }), el('br'),
    el('span', { text: `pins ${i.id_b} → ` }), el('span', { class: 'k', id: 'pin-a', text: short(i.fp.b) }));
  $('pb').replaceChildren(
    el('span', { text: `id ${i.id_b} · key ` }), el('span', { class: 'k', text: short(i.fp.b) }), el('br'),
    el('span', { text: `pins ${i.id_a} → ` }), el('span', { class: 'k', id: 'pin-b', text: short(i.fp.a) }));
  S.short = short;
}

// ---- tabs (WAI-ARIA tabs pattern) ----------------------------------------

const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(t, focus) {
  for (const x of tabs) {
    const on = x === t;
    x.setAttribute('aria-selected', String(on));
    x.tabIndex = on ? 0 : -1;
    $(x.getAttribute('aria-controls')).hidden = !on;
  }
  if (focus) t.focus({ preventScroll: true });
  if (t.id === 'p-rec' || t.id === 't-rec') renderSessLine();
}
for (const t of tabs) {
  t.addEventListener('click', () => selectTab(t, false));
  t.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(t);
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    if (j != null) { e.preventDefault(); selectTab(tabs[j], true); }
  });
}

// ---- handshake ----------------------------------------------------------------

const modeVal = () => Number(document.querySelector('input[name="mode"]:checked').value);
for (const r of document.querySelectorAll('input[name="mode"]')) {
  r.addEventListener('change', () => {
    $('field-pick').hidden = modeVal() !== 1;
    const wrong = modeVal() === 2, nopin = modeVal() === 3;
    if (!S.init) return;
    $('pin-a').textContent = S.short(wrong ? S.init.fp.m : S.init.fp.b) + (wrong ? ' (a third key)' : '');
    $('pin-b').textContent = nopin ? 'nothing pinned' : S.short(S.init.fp.a);
  });
}
$('run-hs').addEventListener('click', () => runHandshake());

const SHORT = (call) => call.replace(/^handshake_(initiator|responder)_/, '');
const ARROWS = {
  handshake_initiator_create_client_hello: 'to-b',
  handshake_responder_create_server_hello: 'to-a',
  handshake_initiator_create_client_auth: 'to-b',
};

// Plain-language reading of the library's own refusal, per the contracts in
// src/protocol/handshake.h.
function explain(step) {
  const s = step.status, who = step.party === 'A' ? 'A' : 'B';
  if (s === 'HANDSHAKE_ERR_SIGNATURE' && who === 'A')
    return 'sig_B does not verify against the key A pinned for server-b, over the transcript A saw. Every initiator failure is terminal.';
  if (s === 'HANDSHAKE_ERR_SIGNATURE' && who === 'B')
    return 'sig_A does not verify. Below the limit of 3 this is retryable: B keeps its state and pending entry and counts the failure.';
  if (s === 'HANDSHAKE_ERR_PEER_IDENTITY_MISMATCH') return 'The ServerHello names a responder other than the server-b A dialed.';
  if (s === 'HANDSHAKE_ERR_SESSION_ID_MISMATCH') return "The ServerHello does not echo A's session id. This is checked before any ML-DSA work.";
  if (s === 'HANDSHAKE_ERR_MALFORMED') return 'The message no longer passes the strict decoder (exact type byte, length fields, total size).';
  if (s === 'HANDSHAKE_ERR_UNKNOWN_IDENTITY') return 'B has no pinned key for device-a, so it refuses the ClientHello before any signature work and creates no pending entry.';
  if (s === 'HANDSHAKE_ERR_KEX') return 'The key exchange refused a key (an X25519 low-order point or a malformed ML-KEM key).';
  return '';
}

function actCell(step) {
  const ok = step.ok;
  const cls = 'act' + (step.party === 'B' ? ' b' : '') + (ok ? '' : ' bad');
  const res = S.timerRes;
  return el('div', { class: cls },
    el('div', { class: 'l1' },
      el('span', { class: 'who', text: step.party }),
      el('span', { class: 'fn', text: SHORT(step.call) }),
      el('span', { class: ok ? 'st-ok' : 'st-bad', text: ok ? 'OK' : step.status }),
      el('span', { class: 'ms', text: fmtT(step.ms), title: res ? `timer resolution here: ${fmtMs(res)}` : '' })),
    el('div', { class: 'l2', text: '→ ' + step.state + (step.note ? ' · ' + step.note : '') }));
}

function laneCell(step) {
  const dir = ARROWS[step.call];
  const arrow = el('div', { class: 'arrow ' + dir }, el('span', { class: 'pkt' }));
  return el('div', { class: 'lane' },
    el('div', { class: 'lbl' }, el('span', { text: step.msg }), el('span', { class: 'dir', text: (dir === 'to-b' ? 'A → B · ' : 'B → A · ') + fmtB(step.bytes) })),
    arrow,
    el('div', { class: 'hex', text: spaced(step.head, 16) }));
}

function rowFor(step) {
  if (step.party === 'wire') {
    return el('div', { class: 'row grid3' }, el('div', { class: 'lane tamper', text: '⚡ ' + step.tamper }));
  }
  const kids = [actCell(step)];
  if (ARROWS[step.call] && step.ok) kids.push(laneCell(step));
  return el('div', { class: 'row grid3' }, ...kids);
}

async function runHandshake() {
  if (S.busy) return;
  setBusy(true);
  const tl = $('timeline');
  const sum = $('hs-summary');
  try {
    const mode = modeVal();
    const r = await call('handshake', { mode, field: Number($('field').value) });
    if (!r.ok) throw new Error(r.error);
    tl.replaceChildren();
    sum.replaceChildren();
    for (const step of r.steps) {
      const row = rowFor(step);
      if (!reduceMotion) row.classList.add('in');
      tl.append(row);
      if (!reduceMotion) await sleep(110);
    }
    sum.replaceChildren(summaryFor(r));
    sum.dataset.run = String((S.runs = (S.runs || 0) + 1));
    S.session = r.established && r.confirm && r.confirm.open === 'SESSION_OK' ? { a: 'ACTIVE', b: 'ACTIVE' } : null;
    S.seq = [0, S.session ? 1 : 0]; // B already sent its confirmation record (seq 0)
    S.lastHs = r;
    $('reclog').replaceChildren();
    renderSessLine();
  } catch (e) {
    sum.replaceChildren(el('div', { class: 'summary bad' }, el('p', { class: 'error', text: 'Error: ' + e.message })));
  } finally {
    setBusy(false);
  }
}

function summaryFor(r) {
  const last = [...r.steps].reverse().find((s) => s.party !== 'wire');
  const res = S.timerRes;
  const resNote = res && res >= 0.02 ? ` Your browser's timer moves in ${fmtMs(res)} steps here, so single calls are rounded; the Bench tab averages 100 runs.` : '';
  if (r.established) {
    const k = r.keys;
    const calls = r.steps.filter((s) => s.party !== 'wire').length;
    return el('div', { class: 'summary' },
      el('p', { text: `Both sides reached ESTABLISHED. The ${({ 8: 'eight', 9: 'nine' })[calls] || calls} calls took ${fmtMs(r.handshake_ms)} of compute in this browser, and the three handshake messages total ${fmtB(r.sizes.ch + r.sizes.sh + r.sizes.ca)}.${resNote}` }),
      el('p', { class: 'mono', text: `Session keys match: ${k.match ? 'yes' : 'NO'} · c2s ${k.a_c2s.slice(0, 8)}… on A and ${k.b_c2s.slice(0, 8)}… on B · s2c ${k.a_s2c.slice(0, 8)}… / ${k.b_s2c.slice(0, 8)}… (BLAKE2b fingerprints, not the keys)` }),
      el('p', { class: 'mono', text: `B's empty confirmation record (${fmtB(r.confirm.record_bytes)}) opened on A: ${r.confirm.open}, so A is now peer-confirmed. Try the Records tab.` }));
  }
  const failed = r.steps.filter((s) => s.party !== 'wire' && !s.ok);
  const fatal = failed[failed.length - 1] || last;
  return el('div', { class: 'summary bad' },
    el('p', {},
      el('span', { text: `Refused by ${fatal.party}: ` }),
      el('span', { class: 'st-bad', text: fatal.status }),
      el('span', { text: ` from ${fatal.call}().` })),
    el('p', { text: explain(fatal) }),
    el('p', { class: 'mono', text: `A is ${r.state_a}, B is ${r.state_b}. No session keys exist on either side.` }));
}

// ---- records ---------------------------------------------------------------

function renderSessLine() {
  const s = S.session;
  const line = $('sessline');
  if (!s) {
    line.replaceChildren(el('span', { text: 'No live session. ' }),
      el('span', { text: S.lastHs && S.lastHs.established ? 'The last one was closed by a refused record; ' : 'Run an honest handshake first; ' }),
      el('a', { href: '#', text: 'run one now', onclick: (e) => { e.preventDefault(); runHonestThenRecords(); } }), el('span', { text: '.' }));
    $('send').disabled = true;
    return;
  }
  line.replaceChildren(el('span', { text: 'Session ' }), el('b', { text: `A ${s.a} · B ${s.b}` }),
    el('span', { text: ` · next seq A→B ${S.seq[0]}, B→A ${S.seq[1]} · pad bucket 256 B (the default)` }));
  $('send').disabled = S.busy;
}

async function runHonestThenRecords() {
  document.querySelector('input[name="mode"][value="0"]').checked = true;
  $('field-pick').hidden = true;
  $('pin-a').textContent = S.short(S.init.fp.b);
  $('pin-b').textContent = S.short(S.init.fp.a);
  await runHandshake();
  renderSessLine();
}

$('send').addEventListener('click', sendRecord);
$('msg').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendRecord(); } });

const REC_EXPLAIN = {
  SESSION_ERR_AUTH: 'Poly1305 authentication failed, so nothing was decrypted for the caller. Every receive failure is terminal: the session is now FAILED.',
  SESSION_ERR_REPLAY: 'The seq is lower than the next one expected: a replay. Terminal; the session is now FAILED.',
  SESSION_ERR_OUT_OF_ORDER: 'The seq is higher than the next one expected: a gap. Terminal; the session is now FAILED.',
  SESSION_ERR_UNEXPECTED_STATE: 'This session is no longer ACTIVE. Run a new handshake.',
};

async function sendRecord() {
  if (S.busy || !S.session) return;
  const dir = Number(document.querySelector('input[name="dir"]:checked').value);
  const attack = Number(document.querySelector('input[name="rattack"]:checked').value);
  const text = $('msg').value;
  setBusy(true);
  try {
    const r = await call('send', { dir, text, attack });
    if (!r.ok) throw new Error(r.error);
    const tx = dir === 0 ? 'A' : 'B', rx = dir === 0 ? 'B' : 'A';
    const rec = attack === 3 ? r.record2 : r.record;
    const flipAt = r.tamper ? r.tamper.offset : -1;
    const body = rec.bytes - 9 - 16;
    const bytes = el('div', { class: 'bytes', 'aria-label': 'Record bytes' },
      el('span', {}, el('i', { text: 'type' }), rec.header.slice(0, 2)),
      el('span', {}, el('i', { text: 'seq' }), spaced(rec.header.slice(2), 8)),
      el('span', { class: 'ct' + (flipAt >= 9 && flipAt < rec.bytes - 16 ? ' flip' : '') }, el('i', { text: `ciphertext ${body} B` }), spaced(rec.body_head, 12)),
      el('span', { class: flipAt >= rec.bytes - 16 ? 'flip' : '' }, el('i', { text: 'tag' }), spaced(rec.tag, 8)));
    const res = [];
    if (r.open === 'SESSION_OK') {
      res.push(el('div', {}, el('span', { text: `${rx}: session_open → ` }), el('span', { class: 'st-ok', text: 'SESSION_OK' }),
        el('span', { text: ` in ${fmtT(r.open_ms)}. ${rx} reads: ` }), el('b', { text: JSON.stringify(hexToText(r.plaintext)) })));
    }
    if (attack === 2 && r.open2) {
      res.push(el('div', {}, el('span', { text: `The same record again: session_open → ` }), el('span', { class: 'st-bad', text: r.open2 })));
      res.push(el('div', { class: 'muted', text: REC_EXPLAIN[r.open2] || '' }));
    }
    if (r.open !== 'SESSION_OK') {
      res.push(el('div', {}, el('span', { text: `${rx}: session_open → ` }), el('span', { class: 'st-bad', text: r.open })));
      res.push(el('div', { class: 'muted', text: REC_EXPLAIN[r.open] || '' }));
    }
    const head = attack === 1 ? `⚡ bit flipped in the ${r.tamper.region} (byte ${r.tamper.offset}) · ` :
      attack === 3 ? `⚡ seq ${r.record.seq} was lost; seq ${r.record2.seq} arrives · ` : attack === 2 ? '⚡ delivered twice · ' : '';
    const card = el('div', { class: 'recard' + (reduceMotion ? '' : ' in') },
      el('div', { class: 't' },
        el('span', { text: `${tx} → ${rx} · seq ${rec.seq} · ${fmtB(r.content_bytes)} of content → ${fmtB(rec.bytes)} record` }),
        el('span', { class: 'muted', text: `seal ${fmtT(r.seal_ms)}` })),
      head ? el('div', { class: 'error', text: head.replace(/ · $/, '') }) : null,
      bytes,
      el('div', { class: 'res' }, ...res));
    $('reclog').prepend(card);
    while ($('reclog').children.length > 5) $('reclog').lastChild.remove();
    S.seq[dir] = rec.seq + 1;
    const aState = dir === 0 ? r.tx_state : r.rx_state, bState = dir === 0 ? r.rx_state : r.tx_state;
    S.session = aState === 'ACTIVE' && bState === 'ACTIVE' ? { a: aState, b: bState } : null;
    if (!S.session) S.lastHs = { established: true };
  } catch (e) {
    $('reclog').prepend(el('div', { class: 'recard error', text: 'Error: ' + e.message }));
  } finally {
    setBusy(false);
    renderSessLine();
  }
}

// ---- benchmark --------------------------------------------------------------

const PHASES = [
  ['A', 'create ClientHello', 'X25519 + ML-KEM keygen'],
  ['B', 'accept ClientHello', 'decode + pin lookup'],
  ['B', 'create ServerHello', 'encaps + ML-DSA sign'],
  ['A', 'verify ServerHello', 'ML-DSA verify'],
  ['A', 'create ClientAuth', 'ML-DSA sign'],
  ['B', 'verify ClientAuth', 'ML-DSA verify + KDF'],
  ['A', 'finish', 'X25519 + decaps + KDF'],
  ['B', 'finish', ''],
];
const quant = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

$('run-bench').addEventListener('click', async () => {
  if (S.busy) return;
  setBusy(true);
  const st = $('bench-status');
  onProgress = (m) => { if (m.stage === 'bench') st.textContent = `${m.got} / ${m.total} handshakes…`; };
  try {
    const r = await call('bench', { n: 100 });
    st.textContent = '';
    drawBench(r);
  } catch (e) {
    st.textContent = 'Error: ' + e.message;
  } finally {
    onProgress = () => {};
    setBusy(false);
  }
});

$('run-rbench').addEventListener('click', async () => {
  if (S.busy) return;
  setBusy(true);
  const st = $('bench-status');
  st.textContent = 'Sealing and opening for about 1 s…';
  try {
    const r = await call('recbench', { budgetMs: 1000 });
    const mib = (r.records * r.contentBytes) / 1048576;
    const box = $('rbench') || el('div', { id: 'rbench', class: 'tiles' });
    box.replaceChildren(
      tile('Sealing, 64 KiB records', (mib / (r.sealMs / 1000)).toFixed(0), 'MiB/s'),
      tile('Opening, 64 KiB records', (mib / (r.openMs / 1000)).toFixed(0), 'MiB/s'),
      tile('Records each way', r.records.toLocaleString('en-US'), `of ${r.contentBytes.toLocaleString('en-US')} B`));
    if (!box.isConnected) $('bench-ref').before(box);
    st.textContent = 'Timed in batches of 16 records, default 256-byte pad bucket.';
  } catch (e) {
    st.textContent = 'Error: ' + e.message;
  } finally {
    setBusy(false);
  }
});

function tile(label, value, unit) {
  return el('div', { class: 'tile' }, el('div', { class: 'label', text: label }),
    el('div', { class: 'v' }, value, ' ', el('small', { text: unit })));
}

function drawBench(r) {
  const tot = r.rows.map((x) => x[0]);
  const sorted = [...tot].sort((a, b) => a - b);
  const n = tot.length;
  const med = quant(sorted, 0.5);
  const mean = tot.reduce((a, b) => a + b, 0) / n;
  const out = $('bench-out');
  const tiles = el('div', { class: 'tiles' },
    tile('Median, per handshake', med.toFixed(2), 'ms'),
    tile('10th to 90th pct', `${quant(sorted, 0.1).toFixed(2)}–${quant(sorted, 0.9).toFixed(2)}`, 'ms'),
    tile('Fastest', sorted[0].toFixed(2), 'ms'),
    tile('Mean', mean.toFixed(2), 'ms'));

  const spark = el('div', { class: 'spark' });
  // Mean time per phase: where the handshake spends its time.
  const means = PHASES.map((_, p) => r.rows.reduce((a, row) => a + row[p + 1], 0) / n);
  const pmax = Math.max(...means);
  const phases = el('div', { class: 'phases', role: 'table', 'aria-label': 'Mean time per phase' },
    ...PHASES.map(([who, name, what], p) => el('div', { class: 'ph', role: 'row', title: `${who}: ${name}, mean ${fmtMs(means[p])} over ${n} runs` },
      el('div', { class: 'n', role: 'cell' }, `${who} ${name} `, what ? el('em', { text: what }) : null),
      el('div', { class: 'bar', role: 'presentation' }, Object.assign(el('i'), { style: `width:${(means[p] / pmax) * 100}%` })),
      el('div', { class: 'v', role: 'cell', text: means[p] < 0.01 ? '<0.01' : means[p].toFixed(3) }))));

  const res = r.timerRes;
  out.replaceChildren(tiles,
    el('div', { class: 'benchgrid' },
      el('div', {}, el('div', { class: 'label', text: `Each of ${n} handshakes, in order (ms) · light rule = median` }), spark),
      el('div', {}, el('div', { class: 'label', text: 'Mean ms per call, over the same runs' }), phases)),
    el('p', { class: 'note', text: `Measured in your browser with performance.now() inside the worker, same method as bench/bench_handshake.c: fresh contexts are prepared outside the timed region, then the eight calls are timed.${res ? ` Timer resolution here: ${fmtMs(res)}.` : ''}` }));
  drawSpark(spark, tot, med);
  if (S.sparkRO) S.sparkRO.disconnect();
  let lastW = spark.clientWidth;
  S.sparkRO = new ResizeObserver(() => { if (spark.clientWidth !== lastW) { lastW = spark.clientWidth; drawSpark(spark, tot, med); } });
  S.sparkRO.observe(spark);
}

// Per-run line in run order, with the median as a rule. Drawn at the
// container's real pixel width so the text is never stretched.
function drawSpark(spark, tot, med) {
  const n = tot.length;
  const W = Math.max(240, spark.clientWidth || 480), H = 150, P = { l: 34, r: 8, t: 10, b: 20 };
  const raw = Math.max(...tot);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const max = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw);
  const x = (i) => P.l + (i / Math.max(1, n - 1)) * (W - P.l - P.r);
  const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Per-handshake time for ${n} runs, median ${med.toFixed(2)} ms`);
  const add = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); svg.append(e); return e; };
  const mono = { fill: '#8f8aa3', 'font-size': 10, 'font-family': 'ui-monospace, Menlo, monospace' };
  for (const t of [0, max / 2, max]) {
    add('line', { x1: P.l, x2: W - P.r, y1: y(t), y2: y(t), stroke: '#262233', 'stroke-width': 1 });
    add('text', { x: P.l - 6, y: y(t) + 3, 'text-anchor': 'end', ...mono }).textContent = String(+t.toFixed(2));
  }
  add('line', { x1: P.l, x2: W - P.r, y1: y(med), y2: y(med), stroke: '#c4b5fd', 'stroke-width': 1, 'stroke-opacity': 0.7 });
  const d = tot.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  add('path', { d: `${d}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`, fill: '#a78bfa', 'fill-opacity': 0.1, stroke: 'none' });
  add('path', { d, fill: 'none', stroke: '#a78bfa', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  add('text', { x: W - P.r, y: H - 5, 'text-anchor': 'end', ...mono }).textContent = `run 1 → ${n} (ms)`;
  const cross = add('line', { x1: 0, x2: 0, y1: P.t, y2: H - P.b, stroke: '#cfcbdb', 'stroke-width': 1, visibility: 'hidden' });
  const dot = add('circle', { r: 4, fill: '#a78bfa', stroke: '#0b0a10', 'stroke-width': 2, visibility: 'hidden' });
  const tip = el('div', { class: 'tip', hidden: true });
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };
  svg.addEventListener('pointermove', (e) => {
    const rect = svg.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((fx - P.l) / (W - P.l - P.r)) * (n - 1));
    if (i < 0 || i >= n) return hide();
    for (const a of ['x1', 'x2']) cross.setAttribute(a, x(i));
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(tot[i]));
    cross.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.textContent = `run ${i + 1}: ${tot[i].toFixed(2)} ms`;
    tip.style.left = Math.min(Math.max(x(i), 60), W - 60) + 'px';
    tip.style.top = y(tot[i]) + 'px';
  });
  svg.addEventListener('pointerleave', hide);
  spark.replaceChildren(svg, tip);
}

// ---- repo tests ----------------------------------------------------------------

for (const b of document.querySelectorAll('[data-suite]')) {
  b.addEventListener('click', async () => {
    if (S.busy) return;
    setBusy(true);
    const which = Number(b.dataset.suite);
    const name = which === 0 ? 'tests/test_handshake.c' : 'tests/test_session.c';
    const pre = $('testout');
    const st = $('tests-status');
    pre.replaceChildren();
    $('counts').textContent = '';
    let pass = 0, fail = 0;
    onProgress = (m) => { if (m.stage === 'tests') st.textContent = `Downloading tests.wasm: ${(m.got / 1024).toFixed(0)} KB`; };
    onLines = (lines) => {
      const frag = document.createDocumentFragment();
      for (const l of lines) {
        if (l.startsWith('PASS')) pass++;
        if (l.startsWith('FAIL')) fail++;
        frag.append(l.startsWith('FAIL') || l.startsWith('[stderr]') ? el('span', { class: 'f', text: l + '\n' }) : l + '\n');
      }
      pre.append(frag);
      pre.scrollTop = pre.scrollHeight;
      $('counts').textContent = `${name}: ${pass} PASS · ${fail} FAIL so far…`;
    };
    st.textContent = `Running ${name}…`;
    try {
      const r = await call('tests', { which });
      $('counts').textContent = `${name}: ${pass} PASS · ${fail} FAIL · exit code ${r.rc} · ${(r.ms / 1000).toFixed(2)} s in your browser`;
      st.textContent = r.threw ? `stopped: ${r.threw}` : '';
    } catch (e) {
      st.textContent = 'Error: ' + e.message;
    } finally {
      onProgress = () => {};
      onLines = () => {};
      setBusy(false);
      renderSessLine();
    }
  });
}
