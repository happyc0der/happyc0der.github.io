// Page logic. All cryptography happens in worker.js, in the repo's Python; this file only
// moves bytes around (tampering is done here, on copies of what Alice sent) and renders.

const $ = (id) => document.getElementById(id);
const NAME = { 8: 'Hawk-256', 9: 'Hawk-512', 10: 'Hawk-1024' };
// Native CPython, median of 5 on an M-series laptop, from the repo README's Performance table.
const NATIVE_S = { 8: [0.09, 0.007, 0.02], 9: [0.74, 0.015, 0.04], 10: [4.27, 0.036, 0.08] };

// ---- worker RPC ---------------------------------------------------------------------------
let worker = null;
let nextId = 1;
const pending = new Map();
let onReady = null;
let onFatal = null;

function startWorker() {
  worker = new Worker(new URL('worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'status') return loadProgress(data.text, data.frac);
    if (data.type === 'stdout') return testLine(data.line);
    if (data.type === 'ready') return onReady && onReady(data);
    if (data.type === 'fatal') return onFatal && onFatal(data.error);
    if (data.type === 'result') {
      const p = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error));
      else p.resolve(data.result);
    }
  };
  worker.onerror = (e) => onFatal && onFatal(e.message || 'the worker failed to start');
  worker.postMessage({ type: 'boot' });
}

const call = (cmd, ...args) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  worker.postMessage({ id, cmd, args });
});

// ---- bytes ----------------------------------------------------------------------------------
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
};
const hex = (u8, max = Infinity) => {
  const n = Math.min(u8.length, max);
  let s = '';
  for (let i = 0; i < n; i++) s += u8[i].toString(16).padStart(2, '0');
  return n < u8.length ? `${s}…` : s;
};
const utf8Len = (s) => new TextEncoder().encode(s).length;

const fmtMs = (ms) => (ms < 0.1 ? '< 0.1 ms' : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : ms >= 10 ? `${ms.toFixed(0)} ms` : `${ms.toFixed(1)} ms`);
const fmtS = (s) => (s >= 1 ? `${s.toFixed(2)} s` : `${Math.round(s * 1000)} ms`);
const fmtMB = (b) => `${(b / 1e6).toFixed(1)} MB`;
const randInt = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

// ---- state --------------------------------------------------------------------------------
const S = {
  logn: 9,
  spec: null,   // {priv, pub, sig} from params.py
  alice: null,  // {priv, pub, priv_len, pub_len, ms}
  eve: null,    // a second key pair, for the wrong-key check
  sent: null,   // {message, sig, sig_len, ms}
  recv: null,   // {message, sig, note, key: 'alice' | 'eve'}
  verdict: null,
  busy: false,
  chain: false, // "Run all three steps" in progress
  ready: false,
};

// ---- busy indicator -----------------------------------------------------------------------
let busyTimer = 0;
async function busy(label, fn) {
  S.busy = true;
  render();
  const t0 = performance.now();
  const tick = () => { $('busy').textContent = `${label} … ${((performance.now() - t0) / 1000).toFixed(1)} s`; };
  tick();
  busyTimer = setInterval(tick, 100);
  try {
    return await fn();
  } catch (err) {
    $('busy').textContent = '';
    showError(err);
    throw err;
  } finally {
    clearInterval(busyTimer);
    S.busy = false;
    render();
  }
}

function showError(err) {
  const msg = String(err.message || err).trim().split('\n').filter(Boolean).slice(-1)[0];
  S.verdict = { kind: 'raised', head: 'ERROR', text: msg };
  render();
}

// ---- actions ------------------------------------------------------------------------------
async function setVariant(logn) {
  if (S.busy || logn === S.logn) return;
  S.logn = logn;
  S.alice = S.eve = S.sent = S.recv = S.verdict = null;
  S.spec = await call('sizes', logn);
  $('busy').textContent = logn === 10
    ? 'Hawk-1024 key generation solves a much larger NTRU equation: 4.27 s in native CPython (README); expect twice that or more here.'
    : '';
  render();
}

async function keygen() {
  const r = await busy(`hawkkeygen(${S.logn})`, () => call('keygen', S.logn));
  S.alice = r;
  S.eve = S.sent = S.recv = S.verdict = null;
  $('busy').textContent = `${NAME[S.logn]} key pair in ${fmtMs(r.ms)}.`;
  render();
}

async function sign() {
  if (!S.alice) return;
  const message = $('msg').value;
  const r = await busy(`hawksign(${S.logn}, priv, msg)`, () => call('sign', S.logn, S.alice.priv, message));
  S.sent = { message, ...r };
  S.recv = { message, sig: r.sig, note: 'as Alice sent it', key: 'alice' };
  S.verdict = null;
  $('busy').textContent = `Signed ${r.msg_len} bytes in ${fmtMs(r.ms)}. Sent to Bob with the message.`;
  render();
}

async function verify() {
  if (!S.recv) return;
  S.recv.message = $('recv-msg').value;
  const pub = S.recv.key === 'eve' ? S.eve.pub : S.alice.pub;
  const r = await busy(`hawkverify(${S.logn}, pub, msg, sig)`, () => call('verify', S.logn, pub, S.recv.message, S.recv.sig));
  if (r.raised) S.verdict = { kind: 'raised', head: 'RAISED', text: `hawkverify raised ${r.raised} after ${fmtMs(r.ms)}` };
  else if (r.valid) S.verdict = { kind: 'valid', head: 'VALID', text: `hawkverify returned ${r.returned} in ${fmtMs(r.ms)}` };
  else S.verdict = { kind: 'invalid', head: 'REJECTED', text: `hawkverify returned ${r.returned} in ${fmtMs(r.ms)}` };
  $('busy').textContent = '';
  render();
}

async function runAll() {
  await keygen();
  await sign();
  await verify();
}

async function tamper(kind) {
  if (!S.recv) return;
  const R = S.recv;
  if (kind === 'reset') {
    S.recv = { message: S.sent.message, sig: S.sent.sig, note: 'as Alice sent it', key: 'alice' };
  } else if (kind === 'char') {
    const m = $('recv-msg').value || S.sent.message;
    const chars = Array.from(m);
    if (!chars.length) chars.push('!');
    else {
      const i = randInt(chars.length);
      const c = chars[i];
      chars[i] = c === c.toUpperCase() ? (c === c.toLowerCase() ? (c === 'x' ? 'y' : 'x') : c.toLowerCase()) : c.toUpperCase();
    }
    R.message = chars.join('');
  } else if (kind === 'bit') {
    const u8 = fromB64(R.sig);
    if (!u8.length) return;
    const i = randInt(u8.length);
    const b = randInt(8);
    u8[i] ^= 1 << b;
    R.sig = toB64(u8);
    R.note = `${R.note === 'as Alice sent it' ? '' : `${R.note}; `}bit ${b} of byte ${i} flipped`;
  } else if (kind === 'cut') {
    const u8 = fromB64(R.sig);
    if (!u8.length) return;
    R.sig = toB64(u8.slice(0, -1));
    R.note = `${R.note === 'as Alice sent it' ? '' : `${R.note}; `}last byte cut`;
  } else if (kind === 'eve') {
    if (!S.eve) {
      S.eve = await busy(`hawkkeygen(${S.logn}) for a second key pair`, () => call('keygen', S.logn));
    }
    R.key = R.key === 'eve' ? 'alice' : 'eve';
  } else if (kind === 'garbage') {
    const pub = R.key === 'eve' ? S.eve.pub : S.alice.pub;
    const r = await busy(`hawkverify on 64 random byte strings`, () => call('garbage', S.logn, pub, $('recv-msg').value, 64));
    const rejected = r.false;
    S.verdict = r.raised
      ? { kind: 'raised', head: `${r.raised} RAISED`, text: `of ${r.count} random ${r.siglen}-byte signatures; first: ${r.first_error}` }
      : r.true
        ? { kind: 'valid', head: `${r.true} ACCEPTED`, text: `of ${r.count} random ${r.siglen}-byte signatures (${fmtMs(r.ms)})` }
        : { kind: 'invalid', head: `${rejected} / ${r.count} REJECTED`, text: `random ${r.siglen}-byte signatures: hawkverify returned False for each, none raised (${fmtMs(r.ms)})` };
    $('busy').textContent = '';
    render();
    return;
  }
  render();
  await verify();
}

// ---- tests --------------------------------------------------------------------------------
let testsRunning = false;
function testLine(line) {
  const out = $('testout');
  if (!testsRunning) return;
  const el = document.createElement('span');
  if (/ PASSED/.test(line) || /\bpassed\b/.test(line) && !/failed/.test(line)) el.className = 'pass';
  if (/ FAILED| ERROR/.test(line) || /\bfailed\b|\berror\b/.test(line)) el.className = 'fail';
  el.textContent = `${line}\n`;
  out.appendChild(el);
  out.scrollTop = out.scrollHeight; // scrolls the box only, never the page around the iframe
}

async function runTests() {
  const out = $('testout');
  out.hidden = false;
  out.textContent = '';
  testsRunning = true;
  try {
    const r = await busy('pytest tests/test_hawk.py', () => call('tests'));
    testLine(`# pytest exit code ${r.exit_code} after ${fmtMs(r.ms)} in this browser`);
    $('busy').textContent = r.exit_code === 0 ? `All tests passed in ${fmtMs(r.ms)}.` : `pytest exit code ${r.exit_code}.`;
  } catch (err) {
    testLine(`# ${err.message}`);
  } finally {
    testsRunning = false;
  }
}

// ---- render -------------------------------------------------------------------------------
function sizeCell(got, want) {
  const ok = got === want;
  return `${got} B <span class="${ok ? 'ok' : 'bad'}">${ok ? '= spec' : `spec ${want}`}</span>`;
}

function render() {
  const { logn, spec, alice, sent, recv, verdict } = S;
  const b = S.busy || S.chain;
  // While Python is busy, buttons are only marked aria-disabled (and ignore clicks), so the
  // button you just pressed keeps keyboard focus. `disabled` is for "not possible yet".
  const set = (el, notYet) => {
    el.disabled = notYet;
    el.setAttribute('aria-disabled', String(notYet || b));
  };
  document.querySelectorAll('#variants button').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(+btn.dataset.logn === logn));
    set(btn, false);
  });
  set($('run-all'), false);
  set($('do-keygen'), false);
  set($('do-sign'), !alice);
  set($('do-verify'), !recv);
  set($('do-tests'), false);
  $('msg').readOnly = b;
  $('recv-msg').disabled = !recv;
  $('recv-msg').readOnly = b;
  document.querySelectorAll('[data-tamper]').forEach((btn) => set(btn, !recv));
  document.body.classList.toggle('busy', b);

  const [nk, ns, nv] = NATIVE_S[logn];
  $('call-keygen').textContent = `priv, pub = hawkkeygen(${logn})  # ${NAME[logn]}`;
  const ref = (s) => `Repo README, native CPython on an M-series laptop: ${fmtS(s)}`;
  $('ref-keygen').textContent = ref(nk);
  $('ref-sign').textContent = ref(ns);
  $('ref-verify').textContent = ref(nv);

  if (alice && spec) {
    $('f-priv').innerHTML = sizeCell(alice.priv_len, spec.priv);
    $('f-pub').innerHTML = sizeCell(alice.pub_len, spec.pub);
    $('f-kg-ms').textContent = `${fmtMs(alice.ms)} on this device`;
    const pub = fromB64(alice.pub);
    $('p-pub').textContent = hex(pub, 40);
    $('s-pub').textContent = `All ${pub.length} public key bytes`;
    $('x-pub').textContent = hex(pub);
    $('d-pub').hidden = false;
    $('p-pub').hidden = false;
  } else {
    $('f-priv').textContent = spec ? `${spec.priv} B in the spec` : '–';
    $('f-pub').textContent = spec ? `${spec.pub} B in the spec` : '–';
    $('f-kg-ms').textContent = '–';
    $('d-pub').hidden = true;
    $('p-pub').hidden = true;
  }

  if (sent && spec) {
    $('f-sig').innerHTML = sizeCell(sent.sig_len, spec.sig);
    $('f-sg-ms').textContent = `${fmtMs(sent.ms)} on this device`;
    const sig = fromB64(sent.sig);
    $('p-sig').textContent = hex(sig, 40);
    $('s-sig').textContent = `All ${sig.length} signature bytes`;
    $('x-sig').textContent = hex(sig);
    $('d-sig').hidden = false;
    $('p-sig').hidden = false;
  } else {
    $('f-sig').textContent = spec ? `${spec.sig} B in the spec` : '–';
    $('f-sg-ms').textContent = '–';
    $('d-sig').hidden = true;
    $('p-sig').hidden = true;
  }

  const rm = $('recv-msg');
  if (recv) {
    if (document.activeElement !== rm) rm.value = recv.message;
    rm.classList.toggle('changed', rm.value !== sent.message);
    const len = fromB64(recv.sig).length;
    $('r-sig').innerHTML = `${len} B, ${recv.note === 'as Alice sent it' ? recv.note : `<span class="bad">${recv.note}</span>`}`;
    $('r-key').innerHTML = recv.key === 'eve'
      ? '<span class="bad">another key pair&rsquo;s public key</span>'
      : 'Alice&rsquo;s public key';
  } else {
    rm.value = '';
    rm.classList.remove('changed');
    $('r-sig').textContent = '–';
    $('r-key').textContent = '–';
  }

  const v = $('verdict');
  if (verdict) {
    v.dataset.kind = verdict.kind;
    v.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = verdict.head;
    const span = document.createElement('span');
    span.textContent = verdict.text;
    v.append(strong, span);
  } else {
    delete v.dataset.kind;
    v.innerHTML = `<strong>–</strong><span>${recv ? 'Press Verify, or tamper with the message, signature or key.' : 'Run steps 1 and 2 first.'}</span>`;
  }
}

// ---- wiring -------------------------------------------------------------------------------
function loadProgress(text, frac) {
  $('bar').style.width = `${Math.round(frac * 100)}%`;
  $('load-status').textContent = `${text} · ${Math.round(frac * 100)}%`;
}

function start() {
  const poster = $('poster');
  const btn = $('start');
  if (poster.dataset.state === 'loading') return;
  poster.dataset.state = 'loading';
  btn.setAttribute('aria-disabled', 'true');
  btn.textContent = 'Starting…';
  $('load-status').classList.remove('error');
  onFatal = (error) => {
    poster.dataset.state = 'error';
    $('load-status').textContent = `Could not start Python: ${error}`;
    $('load-status').classList.add('error');
    btn.setAttribute('aria-disabled', 'false');
    btn.textContent = 'Try again';
    worker && worker.terminate();
    worker = null;
  };
  onReady = async (info) => {
    $('bar').style.width = '100%';
    const hadFocus = document.activeElement === btn;
    poster.hidden = true;
    $('app').hidden = false;
    S.ready = true;
    const loaded = $('loaded');
    loaded.hidden = false;
    loaded.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = 'This run: ';
    loaded.append(b, `${info.versions}; ${info.files} repo files at ${info.commit.slice(0, 7)}; `
      + `${info.transferred > 1e6 ? `${fmtMB(info.transferred)} transferred` : 'runtime from the browser cache'}, ready in ${fmtMs(info.loadMs)}`
      + ` (import hawk_crypto ${fmtMs(info.importMs)}).`);
    S.spec = await call('sizes', S.logn);
    render();
    // Keep keyboard users where they were, without scrolling the page that embeds this one.
    if (hadFocus && document.hasFocus()) $('run-all').focus({ preventScroll: true });
    S.chain = true;
    runAll().catch(() => {}).finally(() => { S.chain = false; render(); });
  };
  startWorker();
}

// Every action goes through here: one Python call (or chain) at a time.
const idle = () => S.ready && !S.busy && !S.chain;
const act = (fn) => () => {
  if (!idle()) return;
  fn().catch(() => {});
};
$('start').addEventListener('click', start);
$('run-all').addEventListener('click', act(async () => {
  S.chain = true;
  try { await runAll(); } finally { S.chain = false; render(); }
}));
$('do-keygen').addEventListener('click', act(keygen));
$('do-sign').addEventListener('click', act(sign));
$('do-verify').addEventListener('click', act(verify));
$('do-tests').addEventListener('click', act(runTests));
$('msg').addEventListener('keydown', (e) => { if (e.key === 'Enter' && S.alice) act(sign)(); });
$('recv-msg').addEventListener('keydown', (e) => { if (e.key === 'Enter' && S.recv) act(verify)(); });
$('recv-msg').addEventListener('input', () => {
  if (!S.recv) return;
  S.recv.message = $('recv-msg').value;
  S.verdict = null;
  render();
});
document.querySelectorAll('#variants button').forEach((btn) => btn.addEventListener('click', act(() => setVariant(+btn.dataset.logn))));
document.querySelectorAll('[data-tamper]').forEach((btn) => btn.addEventListener('click', act(() => tamper(btn.dataset.tamper))));
