// The page around the agent (written for this demo). Everything the cycles do happens in
// ./agent.js, which is the gtnh-agent repo's own code bundled for the browser (see BUILD.md);
// this file only starts it, calls it, and draws what comes back from its event log.

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVGNS = 'http://www.w3.org/2000/svg';

const GROUPS = [
  ['Routine', ['nominal', 'machine-busy', 'generator-out-of-fuel', 'inventory-full', 'inventory-full-far', 'no-task']],
  ['Health and food', ['hungry', 'hungry-no-food-cow', 'hungry-no-food-garden', 'starving-no-food-garden', 'starving-no-food-task', 'low-health', 'low-health-hungry']],
  ['Danger', ['lava-nearby', 'hostiles-nearby']],
  ['Planner (mock)', ['needs-planner', 'planner-needs-approval', 'planner-escalates', 'planner-invalid-output', 'planner-unsafe-plan']],
  ['Fail closed', ['stale-state', 'unknown-health', 'out-of-bounds', 'protected-item-step']],
  ['Dig and place', ['dig', 'dig-under-feet', 'dig-sand-overhead', 'dig-not-diggable', 'dig-verification-fails', 'place', 'place-sand-overhead', 'place-verification-fails']],
  ['Crafting', ['craft-known-step', 'craft-recipe-differs']],
  ['Injected faults', ['action-fails', 'verification-fails']],
];

const S = {
  agent: null,
  session: null,
  scenarios: [],
  byName: new Map(),
  current: 'lava-nearby',
  mode: 'kept',
  view: 'after',
  history: [],
  shown: null,
  busy: false,
  safety: null,
  home: { x: 0, y: 64, z: 0 },
  n: 0,
  ranCount: new Map(),
};

// ---------------------------------------------------------------- loading

const setProgress = (fraction, text) => {
  $('progress').hidden = false;
  $('progress').firstElementChild.style.width = `${Math.round(fraction * 100)}%`;
  if (text !== undefined) $('status').textContent = text;
};

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(s);
  });

async function fetchBytes(url, onFraction) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || total === 0) {
    const b = await res.arrayBuffer();
    onFraction(1, b.byteLength);
    return b;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.byteLength;
    onFraction(Math.min(1, got / total), got);
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out.buffer;
}

const kb = (n) => `${Math.round(n / 1024)} KB`;

async function start() {
  const btn = $('start');
  btn.disabled = true;
  $('status').classList.remove('error');
  try {
    setProgress(0.03, 'Loading sql.js, SQLite compiled to WebAssembly');
    await loadScript('vendor/sql-wasm-browser.js');
    const wasm = await fetchBytes('vendor/sql-wasm-browser.wasm', (f, n) =>
      setProgress(0.05 + 0.4 * f, `Downloading SQLite WebAssembly: ${kb(n)}`),
    );
    // One request for the bundle: a module import (no byte progress for it).
    setProgress(0.5, 'Downloading and starting the agent bundle (agent.js, about 850 KB)');
    S.agent = await import('./agent.js');
    setProgress(0.93, 'Starting SQLite and applying the repo migrations');
    await S.agent.init(globalThis.initSqlJs, wasm);
    S.session = new S.agent.Session();
    S.scenarios = S.agent.scenarios();
    S.byName = new Map(S.scenarios.map((s) => [s.name, s]));
    S.safety = S.agent.safetyConfig();
    S.home = S.agent.homeLocation;
    setProgress(1, `Ready: ${S.session.tables().length} SQLite tables from the repo's migrations`);
    showApp();
  } catch (e) {
    $('status').textContent = `Could not start: ${e.message}`;
    $('status').classList.add('error');
    btn.disabled = false;
    console.error(e);
  }
}

// ---------------------------------------------------------------- app shell

function showApp() {
  $('poster').hidden = true;
  $('app').hidden = false;
  buildScenarioPicker();
  selectScenario(S.byName.has(S.current) ? S.current : S.scenarios[0].name, false);
  updateDb();
  renderHistory();
  $('run').focus({ preventScroll: true });
}

function groupsFor(scenarios) {
  const placed = new Set();
  const groups = [];
  for (const [title, names] of GROUPS) {
    const list = names.filter((n) => S.byName.has(n));
    list.forEach((n) => placed.add(n));
    if (list.length > 0) groups.push([title, list]);
  }
  const rest = scenarios.map((s) => s.name).filter((n) => !placed.has(n));
  if (rest.length > 0) groups.push(['Other', rest]);
  return groups;
}

function buildScenarioPicker() {
  const list = $('scen-list');
  const select = $('scen-select');
  list.replaceChildren();
  select.replaceChildren();
  list.removeAttribute('tabindex');
  $('scen-n').textContent = `(${S.scenarios.length}, from the repo's scenarios.ts)`;
  for (const [title, names] of groupsFor(S.scenarios)) {
    const h = document.createElement('h3');
    h.textContent = title;
    list.appendChild(h);
    const og = document.createElement('optgroup');
    og.label = title;
    for (const n of names) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'scen-opt';
      b.setAttribute('role', 'option');
      b.dataset.name = n;
      b.id = `opt-${n}`;
      b.tabIndex = -1;
      b.innerHTML = `<span class="nm"></span><span class="ran"></span>`;
      b.querySelector('.nm').textContent = n;
      b.addEventListener('click', () => selectScenario(n, true));
      list.appendChild(b);
      const o = document.createElement('option');
      o.value = n;
      o.textContent = n;
      og.appendChild(o);
    }
    select.appendChild(og);
  }
  select.addEventListener('change', () => selectScenario(select.value, false));
  list.addEventListener('keydown', (e) => {
    const opts = [...list.querySelectorAll('.scen-opt')];
    const i = opts.findIndex((o) => o.dataset.name === S.current);
    let j = null;
    if (e.key === 'ArrowDown') j = Math.min(opts.length - 1, i + 1);
    else if (e.key === 'ArrowUp') j = Math.max(0, i - 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = opts.length - 1;
    else if (e.key === 'Enter' && !e.repeat) {
      e.preventDefault();
      runCycles(1);
      return;
    }
    if (j === null) return;
    e.preventDefault();
    selectScenario(opts[j].dataset.name, true);
  });
}

/** Keeps an option visible inside the list without scrolling anything outside the iframe. */
function keepVisible(el, box) {
  const top = el.offsetTop - box.offsetTop;
  if (top < box.scrollTop) box.scrollTop = top - 28;
  else if (top + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + el.offsetHeight - box.clientHeight + 6;
}

function selectScenario(name, focus) {
  S.current = name;
  const sc = S.byName.get(name);
  for (const o of document.querySelectorAll('.scen-opt')) {
    const on = o.dataset.name === name;
    o.setAttribute('aria-selected', String(on));
    o.tabIndex = on ? 0 : -1;
    if (on) {
      keepVisible(o, $('scen-list'));
      if (focus) o.focus({ preventScroll: true });
    }
  }
  $('scen-select').value = name;
  $('scen-name').textContent = name;
  $('scen-desc').textContent = sc.description;
  const e = sc.expect;
  $('scen-expect').textContent =
    `expected on a fresh database: ${e.decision} -> ${e.actionType} -> ${e.status}` +
    (sc.hasPlanner ? ' · mock planner fixture' : '') +
    (sc.injects ? ' · injects a client fault' : '');
  // Show this scenario's latest cycle, if any; else its world as it stands.
  const last = S.history.find((h) => h.kind === 'cycle' && h.view.scenario === name);
  if (last) showView(last.view, false);
  else {
    S.shown = null;
    renderStages(null);
    $('summary').innerHTML = '<span class="muted">Not run yet on this database. Press Run one cycle.</span>';
    drawMap(currentWorld(name), null, null);
    renderHistory();
  }
  updateHuman();
}

function currentWorld(name) {
  if (S.mode === 'kept') {
    const w = S.session.hasKeptWorld(name);
    if (w) return w;
  }
  return S.byName.get(name).world;
}

// ---------------------------------------------------------------- running cycles

function setBusy(b) {
  S.busy = b;
  for (const id of ['run', 'run5', 'reset', 'selftest']) $(id).disabled = b;
  for (const btn of $('human').querySelectorAll('button')) btn.disabled = b;
}

async function runCycles(count) {
  if (S.busy) return;
  setBusy(true);
  try {
    for (let i = 0; i < count; i++) {
      const v = await S.session.runCycle(S.current, S.mode);
      S.n++;
      S.ranCount.set(S.current, (S.ranCount.get(S.current) ?? 0) + 1);
      S.history.unshift({ kind: 'cycle', n: S.n, view: v });
      showView(v, i === count - 1);
      updateDb();
      if (count > 1 && i < count - 1) await new Promise((r) => setTimeout(r, reduced ? 0 : 120));
    }
  } catch (e) {
    $('summary').innerHTML = '';
    const p = document.createElement('span');
    p.className = 'error';
    p.textContent = `The cycle threw: ${e.message}`;
    $('summary').appendChild(p);
    console.error(e);
  } finally {
    setBusy(false);
    updateHuman();
    markRan();
  }
}

function markRan() {
  for (const o of document.querySelectorAll('.scen-opt')) {
    const n = S.ranCount.get(o.dataset.name);
    o.querySelector('.ran').textContent = n ? `×${n}` : '';
  }
  $('cycle-count').textContent = `${S.n} cycle${S.n === 1 ? '' : 's'} on this database`;
}

function showView(v, animate) {
  S.shown = v;
  const r = v.result;
  const sum = $('summary');
  sum.replaceChildren();
  const add = (cls, text) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    sum.appendChild(s);
    return s;
  };
  const entry = S.history.find((h) => h.view === v);
  add('muted', `#${entry ? entry.n : '?'} ${r.cycleId}`);
  add(`st s-${r.status}`, r.status);
  add('line', r.summary);
  add('muted', `${v.ms.toFixed(1)} ms in this browser · world ${v.mode === 'kept' ? 'kept' : 'rebuilt'}`);
  if (r.needsUserAttention) add('st s-paused', 'needs a human');
  renderStages(v, animate);
  drawMap(S.view === 'after' ? v.after : v.before, S.view === 'after' ? v.before : null, v);
  renderHistory();
}

// ---------------------------------------------------------------- stages

const pos = (p) => (p ? `(${p.x}, ${p.y}, ${p.z})` : '?');
const known = (k) => (k && k.known ? k.value : null);
const short = (o, n = 160) => {
  const s = JSON.stringify(o);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

function stagesOf(v) {
  const r = v.result;
  const evs = v.events;
  const first = (k) => evs.find((e) => e.kind === k)?.payload ?? null;
  const all = (k) => evs.filter((e) => e.kind === k);
  const out = [];

  // 1. Observe
  const states = all('STATE');
  const snap = v.snapshot;
  if (snap) {
    const p = known(snap.player.position);
    const hp = known(snap.player.health);
    const food = known(snap.player.hunger);
    const task = snap.currentTask;
    out.push({
      name: 'Observe',
      s: 'ok',
      chip: `snapshot #${r.stateSnapshotId}`,
      lines: [
        `at ${pos(p)} · health ${hp ?? 'unknown'} · food ${food ?? 'unknown'}`,
        task ? `task ${task.taskId}: ${task.subgoal ?? task.goal}` : 'no active task',
        `observed ${snap.timestamp.slice(11, 19)} · schema-validated GameState${states.length > 1 ? ` · re-observed ${states.length - 1}×` : ''}`,
      ],
      raw: { events: states.map((e) => e.payload), gameState: snap },
    });
  } else {
    out.push({ name: 'Observe', s: 'bad', chip: 'no state', lines: [r.summary], raw: evs });
  }

  // 2. Trust the state (hard safety, pure code)
  const sv = r.stateViolations ?? [];
  out.push(
    sv.length === 0
      ? { name: 'Trust the state', s: 'ok', chip: 'reliable', lines: ['fresh, observable, inside the boundary'], raw: sv }
      : {
          name: 'Trust the state',
          s: 'bad',
          chip: sv.map((x) => x.code).join(', '),
          lines: [...sv.map((x) => x.message), 'the decision is forced to a pause'],
          raw: sv,
        },
  );

  // 3. Decide (System 1)
  const d = first('DECISION');
  if (d) {
    out.push({
      name: 'Decide · System 1',
      s: d.provider === 'hard-safety' ? 'warn' : 'ok',
      chip: d.decision,
      lines: [
        `by ${d.provider} · ${d.reasonCodes.join(', ')} · confidence ${d.confidence}`,
        d.requiresHumanConfirmation ? 'asks for a human' : '',
      ].filter(Boolean),
      raw: d,
    });
  } else out.push({ name: 'Decide · System 1', s: 'skip', chip: 'not reached', lines: [r.summary], raw: null });

  // 4. Plan (System 2, the mock planner)
  const plan = r.planner;
  const planEv = first('PLAN');
  if (plan || planEv) {
    const k = plan?.kind;
    const p = {
      name: 'Plan · System 2',
      s: 'ok',
      chip: k ?? 'asked',
      lines: [],
      raw: { outcome: plan, event: planEv },
    };
    if (planEv) p.lines.push(`asked ${planEv.provider}: replied ${planEv.response?.kind ?? '?'}`);
    if (k === 'plan-accepted') p.lines.push(`plan #${plan.planId} stored: "${plan.goal}", ${plan.steps} step${plan.steps === 1 ? '' : 's'}`);
    else if (k === 'plan-step') p.lines.push(`plan #${plan.planId}, step ${plan.step} of ${plan.steps} (not asked again)`);
    else if (k === 'approval-required' || k === 'approval-pending') {
      p.s = 'warn';
      p.lines.push(`plan #${plan.planId} "${plan.goal}" waits for a human: Approve or Reject`);
    } else if (k === 'plan-rejected') {
      p.s = 'bad';
      p.lines.push(...plan.issues.slice(0, 4));
    } else if (k === 'escalation') {
      p.s = 'warn';
      p.lines.push(`${plan.reason}: ${plan.message}`);
    } else if (k === 'known-step') p.lines.push(`code's own blueprint, step ${plan.step} of ${plan.steps}`);
    else if (k === 'held') p.lines.push(`everything needed is held; waited ${plan.waits}×`);
    else if (k === 'unavailable') {
      p.s = 'warn';
      p.lines.push('no planner configured');
    }
    out.push(p);
  } else {
    out.push({ name: 'Plan · System 2', s: 'skip', chip: 'not asked', lines: ['the router chose without the planner'], raw: null });
  }

  // 5. Propose exactly one action
  const prop = first('PROPOSAL');
  if (r.action) {
    out.push({
      name: 'Propose one action',
      s: 'ok',
      chip: r.action.type,
      lines: [short(r.action.args, 140), `origin ${r.action.origin} · ${r.action.reason}`],
      raw: { event: prop, action: r.action },
    });
  } else {
    out.push({ name: 'Propose one action', s: 'skip', chip: 'none', lines: [r.stoppedBefore ? `stopped: ${r.stoppedBefore}` : r.summary], raw: prop });
  }

  // 6. Validate (schema, safety policy, preconditions)
  const val = first('VALIDATION');
  if (val) {
    const bad = !val.ok;
    out.push({
      name: 'Validate',
      s: bad ? 'bad' : 'ok',
      chip: bad ? `refused: ${[...val.violations.map((x) => x.code), ...(val.preconditionFailures.length ? ['PRECONDITION'] : [])].join(', ')}` : 'allowed',
      lines: bad
        ? [...val.violations.map((x) => x.message), ...val.preconditionFailures.map((x) => `precondition: ${x}`)]
        : ['schema, hard safety policy and preconditions pass'],
      raw: val,
    });
  } else out.push({ name: 'Validate', s: 'skip', chip: 'not reached', lines: [], raw: null });

  // 7. Execute
  const ex = first('EXECUTION');
  if (ex) {
    out.push({
      name: 'Execute',
      s: ex.ok ? 'ok' : 'bad',
      chip: ex.ok ? 'OK' : ex.code,
      lines: [ex.message, ex.data && Object.keys(ex.data).length ? short(ex.data, 120) : ''].filter(Boolean),
      raw: ex,
    });
  } else out.push({ name: 'Execute', s: 'skip', chip: 'not run', lines: [val && !val.ok ? 'refused before anything ran' : 'nothing to run'], raw: null });

  // 8. Verify the postcondition against a fresh observation
  const ver = first('VERIFICATION');
  if (ver) {
    const checks = ver.verification?.checks ?? [];
    const ok = ver.status === 'succeeded';
    out.push({
      name: 'Verify',
      s: ok ? 'ok' : 'bad',
      chip: ver.status,
      lines: checks.map((c) => ({ html: `<span class="${c.passed ? 'pass' : 'fail'}">${c.passed ? '✓' : '✗'}</span> ${esc(c.name)}: ${esc(c.detail)}` })),
      raw: ver,
    });
  } else out.push({ name: 'Verify', s: 'skip', chip: 'not run', lines: [], raw: null });

  // 9. Log (SQLite)
  const end = first('CYCLE_END');
  out.push({
    name: 'Log · SQLite',
    s: r.status === 'succeeded' ? 'ok' : r.status === 'paused' ? 'warn' : 'bad',
    chip: r.status,
    lines: [`${evs.length} events: ${evs.map((e) => e.kind).join(' ')}`, v.task ? `task ${v.task.id} is now ${v.task.status}` : ''].filter(Boolean),
    raw: { cycleEnd: end, events: evs },
  });
  return out;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function renderStages(v, animate = false) {
  const ol = $('stages');
  ol.replaceChildren();
  if (!v) return;
  const stages = stagesOf(v);
  stages.forEach((st, i) => {
    const li = document.createElement('li');
    li.className = 'stage';
    li.dataset.s = st.s;
    const top = document.createElement('div');
    top.className = 'st-top';
    const nm = document.createElement('span');
    nm.className = 'st-name';
    nm.innerHTML = `<b>${i + 1}</b>`;
    nm.append(st.name);
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = st.chip;
    const right = document.createElement('span');
    right.className = 'st-right';
    right.appendChild(chip);
    top.append(nm, right);
    li.appendChild(top);
    if (st.lines.length) {
      const body = document.createElement('div');
      body.className = 'st-body';
      for (const l of st.lines) {
        const d = document.createElement('div');
        if (typeof l === 'string') d.textContent = l;
        else d.innerHTML = l.html;
        body.appendChild(d);
      }
      li.appendChild(body);
    }
    if (st.raw !== null && st.raw !== undefined) {
      const pre = document.createElement('pre');
      pre.hidden = true;
      pre.id = `raw-${i}`;
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'json-t';
      t.textContent = 'JSON';
      t.setAttribute('aria-expanded', 'false');
      t.setAttribute('aria-controls', pre.id);
      t.title = `${st.name}: the raw record`;
      t.addEventListener('click', () => {
        const open = pre.hidden;
        if (open && !pre.textContent) pre.textContent = JSON.stringify(st.raw, null, 2);
        pre.hidden = !open;
        t.setAttribute('aria-expanded', String(open));
      });
      right.appendChild(t);
      li.appendChild(pre);
    }
    if (animate && !reduced) {
      li.classList.add('pending');
      setTimeout(() => li.classList.remove('pending'), 60 + i * 85);
    }
    ol.appendChild(li);
  });
}

// ---------------------------------------------------------------- human in the loop

function updateHuman() {
  const box = $('human');
  box.replaceChildren();
  const sc = S.byName.get(S.current);
  const taskId = sc?.world.task?.taskId;
  if (!taskId) return;
  const task = S.session.task(taskId);
  const plan = S.session.plan(taskId);
  const tag = (t) => {
    const s = document.createElement('span');
    s.className = 'tag';
    s.textContent = t;
    box.appendChild(s);
  };
  const button = (label, title, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn warn';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', fn);
    box.appendChild(b);
  };
  if (plan && plan.status === 'pending_approval') {
    tag(`plan #${plan.planId} waits for approval`);
    button(`Approve plan #${plan.planId}`, "The CLI's plan-approve", () => human('plan-approve', S.session.approve(taskId)));
    button('Reject', "The CLI's plan-reject", () => human('plan-reject', S.session.reject(taskId)));
  }
  if (task && (task.status === 'paused' || task.status === 'blocked')) {
    tag(`task ${task.status}`);
    button('Resume task', "The CLI's task-resume: task active again, failure count starts afresh", () =>
      human('task-resume', S.session.resume(taskId)),
    );
  }
}

function human(cmd, res) {
  S.history.unshift({
    kind: 'human',
    text: res.ok ? `you: ${cmd} → ${short(res.value, 150)}` : `you: ${cmd} → ${res.error}`,
  });
  renderHistory();
  updateHuman();
  updateDb();
  const first = $('human').querySelector('button') ?? $('run');
  first.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- history and database

function renderHistory() {
  const ol = $('history');
  ol.replaceChildren();
  if (S.history.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No cycles yet. Each one is logged to the in-memory SQLite database.';
    ol.appendChild(li);
    return;
  }
  for (const h of S.history.slice(0, 60)) {
    const li = document.createElement('li');
    if (h.kind === 'human') {
      li.className = 'human-entry';
      const b = document.createElement('button');
      b.type = 'button';
      b.disabled = true;
      b.innerHTML = '<span class="n">·</span><span class="msg"></span>';
      b.querySelector('.msg').textContent = h.text;
      li.appendChild(b);
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="n"></span><span class="msg"><span class="who"></span> <span class="t"></span></span>';
      b.querySelector('.n').textContent = `#${h.n}`;
      b.querySelector('.who').textContent = h.view.scenario;
      b.querySelector('.t').textContent = h.view.result.summary;
      if (S.shown === h.view) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => {
        if (h.view.scenario !== S.current) {
          S.current = h.view.scenario;
          selectScenario(h.view.scenario, false);
        }
        showView(h.view, false);
      });
      li.appendChild(b);
    }
    ol.appendChild(li);
  }
}

function updateDb() {
  const c = S.session.tableCounts();
  $('db').textContent = `SQLite (sql.js) rows: ${Object.entries(c)
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ')}`;
}

// ---------------------------------------------------------------- map

function el(name, attrs, parent, title) {
  const e = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (title) {
    const t = document.createElementNS(SVGNS, 'title');
    t.textContent = title;
    e.appendChild(t);
  }
  parent.appendChild(e);
  return e;
}

/** Where the cycle's action points, if anywhere: a position, a machine, a container, home... */
function targetOf(view, w) {
  const a = view?.result.action;
  if (!a) return null;
  const args = a.args ?? {};
  const find = (list, id) => list?.find((x) => x.id === id)?.position;
  if (args.position) return { p: args.position, what: `${a.type} at ${pos(args.position)}` };
  if (args.target) return { p: args.target, what: `${a.type} to ${pos(args.target)}` };
  if (args.machineId) return { p: find(w.machines, args.machineId), what: `${a.type} ${args.machineId}` };
  if (args.containerId) return { p: find(w.containers, args.containerId), what: `${a.type} ${args.containerId}` };
  if (args.generatorId) return { p: find(w.generators, args.generatorId), what: `${a.type} ${args.generatorId}` };
  if (args.entityId !== undefined) {
    const m = (w.mobs ?? []).find((x) => x.id === args.entityId) ?? (view.before.mobs ?? []).find((x) => x.id === args.entityId);
    return { p: m?.position, what: `${a.type} ${m?.type ?? `entity ${args.entityId}`}` };
  }
  if (args.locationName === 'home') return { p: S.home, what: `${a.type} home` };
  return { p: null, what: a.type };
}

function drawMap(w, prev, view) {
  const svg = $('map');
  svg.replaceChildren();
  const W = 320;
  const H = 220;
  const pad = 12;
  const safety = S.safety;
  const tgt = targetOf(view, w);
  const pts = [];
  const add = (p, r = 0) => p && pts.push({ x: p.x, z: p.z, r });
  add(S.home);
  add(w.player.position);
  if (prev) add(prev.player.position);
  w.resourceBlocks.forEach((b) => add(b.position));
  w.placedBlocks.forEach((b) => add(b.position));
  w.hazards.forEach((h) => add(h.position, safety.hazardAvoidanceRadius));
  w.hostiles.forEach((h) => add(h, safety.hostileThreatRadius));
  (w.mobs ?? []).forEach((m) => add(m.position));
  [...w.containers, ...w.generators, ...w.machines, ...w.craftingTables].forEach((x) => add(x.position));
  if (tgt?.p) add(tgt.p);
  let minX = Math.min(...pts.map((p) => p.x - p.r)) - 2;
  let maxX = Math.max(...pts.map((p) => p.x + p.r)) + 2;
  let minZ = Math.min(...pts.map((p) => p.z - p.r)) - 2;
  let maxZ = Math.max(...pts.map((p) => p.z + p.r)) + 2;
  const minSpan = 14;
  if (maxX - minX < minSpan) {
    const c = (minX + maxX) / 2;
    minX = c - minSpan / 2;
    maxX = c + minSpan / 2;
  }
  if (maxZ - minZ < minSpan * (H / W)) {
    const c = (minZ + maxZ) / 2;
    minZ = c - (minSpan * H) / W / 2;
    maxZ = c + (minSpan * H) / W / 2;
  }
  const scale = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxZ - minZ));
  const ox = (W - (maxX - minX) * scale) / 2;
  const oz = (H - (maxZ - minZ) * scale) / 2;
  const X = (x) => ox + (x - minX) * scale;
  const Z = (z) => oz + (z - minZ) * scale;

  // Grid: a step that leaves at least ~12 px between lines.
  const step = [1, 2, 4, 8, 16, 32, 64, 128, 256].find((s) => s * scale >= 12) ?? 512;
  const g = el('g', {}, svg);
  for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) el('line', { x1: X(x), y1: 0, x2: X(x), y2: H, class: x === 0 ? 'axis' : 'grid-l' }, g);
  for (let z = Math.ceil(minZ / step) * step; z <= maxZ; z += step) el('line', { x1: 0, y1: Z(z), x2: W, y2: Z(z), class: z === 0 ? 'axis' : 'grid-l' }, g);
  el('text', { x: 6, y: H - 6 }, svg).textContent = `x →  z ↓ · grid ${step} block${step === 1 ? '' : 's'}`;

  // The play-area boundary, where it is in view.
  const b = safety.boundary;
  const bLines = [
    [b.min.x, 'x'],
    [b.max.x, 'x'],
    [b.min.z, 'z'],
    [b.max.z, 'z'],
  ];
  for (const [v, axis] of bLines) {
    if (axis === 'x' && v > minX && v < maxX) el('line', { x1: X(v), y1: 0, x2: X(v), y2: H, stroke: 'var(--danger)', 'stroke-dasharray': '5 4', 'stroke-width': 1.2 }, svg, `boundary x = ${v}`);
    if (axis === 'z' && v > minZ && v < maxZ) el('line', { x1: 0, y1: Z(v), x2: W, y2: Z(v), stroke: 'var(--danger)', 'stroke-dasharray': '5 4', 'stroke-width': 1.2 }, svg, `boundary z = ${v}`);
  }

  const cell = Math.max(4, Math.min(scale * 0.9, 11));
  // Danger radii first (underneath).
  for (const h of w.hazards) el('circle', { cx: X(h.position.x), cy: Z(h.position.z), r: safety.hazardAvoidanceRadius * scale, fill: 'rgba(244,63,94,0.06)', stroke: 'var(--danger)', 'stroke-opacity': 0.5, 'stroke-dasharray': '3 3' }, svg, `stay ${safety.hazardAvoidanceRadius} blocks from ${h.kind}`);
  for (const h of w.hostiles) el('circle', { cx: X(h.x), cy: Z(h.z), r: safety.hostileThreatRadius * scale, fill: 'rgba(244,63,94,0.05)', stroke: 'var(--danger)', 'stroke-opacity': 0.45, 'stroke-dasharray': '3 3' }, svg, `hostile threat radius ${safety.hostileThreatRadius}`);

  for (const r of w.resourceBlocks) el('rect', { x: X(r.position.x) - cell / 2, y: Z(r.position.z) - cell / 2, width: cell, height: cell, rx: 1.5, fill: '#4a4360' }, svg, `${r.block} ${pos(r.position)}`);
  for (const r of w.removedBlocks) {
    const cx = X(r.x);
    const cz = Z(r.z);
    const k = cell / 2.6;
    el('path', { d: `M${cx - k},${cz - k}L${cx + k},${cz + k}M${cx + k},${cz - k}L${cx - k},${cz + k}`, stroke: 'var(--muted)', 'stroke-width': 1.4 }, svg, `dug ${pos(r)}`);
  }
  for (const p of w.placedBlocks) el('rect', { x: X(p.position.x) - cell / 2, y: Z(p.position.z) - cell / 2, width: cell, height: cell, rx: 1.5, fill: '#4a4360', stroke: 'var(--accent)', 'stroke-width': 1.5 }, svg, `placed ${p.block ?? p.item ?? ''} ${pos(p.position)}`);

  const bs = Math.max(6, Math.min(scale * 0.95, 11));
  const box = (p, letter, title) => {
    const g2 = el('g', {}, svg, title);
    el('rect', { x: X(p.x) - bs / 2, y: Z(p.z) - bs / 2, width: bs, height: bs, rx: 2, fill: 'var(--bg)', stroke: 'var(--accent-hi)', 'stroke-width': 1.2 }, g2);
    if (bs >= 9) {
      const t = el('text', { x: X(p.x), y: Z(p.z) + 3, 'text-anchor': 'middle', style: 'fill: var(--accent-hi); font-size: 8px' }, g2);
      t.textContent = letter;
    }
  };
  w.containers.forEach((c) => box(c.position, 'C', `${c.name} (${c.id}) ${pos(c.position)}`));
  w.generators.forEach((c) => box(c.position, 'G', `${c.name} (${c.id}) ${pos(c.position)}`));
  w.machines.forEach((c) => box(c.position, 'M', `${c.name} (${c.id}), ${c.status} ${pos(c.position)}`));
  w.craftingTables.forEach((c) => box(c.position, 'T', `${c.name} (${c.id}) ${pos(c.position)}`));

  for (const h of w.hazards) el('rect', { x: X(h.position.x) - cell / 2, y: Z(h.position.z) - cell / 2, width: cell, height: cell, rx: 1.5, fill: 'var(--danger)' }, svg, `${h.kind} ${pos(h.position)}`);
  const tri = (p, color, title) => {
    const cx = X(p.x);
    const cz = Z(p.z);
    el('path', { d: `M${cx},${cz - 6}L${cx + 5.5},${cz + 4.5}L${cx - 5.5},${cz + 4.5}Z`, fill: color }, svg, title);
  };
  w.hostiles.forEach((h) => tri(h, 'var(--danger)', `hostile ${pos(h)}`));
  for (const m of w.mobs ?? []) {
    if (m.category === 'hostile') tri(m.position, 'var(--danger)', `${m.type} ${pos(m.position)}`);
    else {
      const cx = X(m.position.x);
      const cz = Z(m.position.z);
      el('path', { d: `M${cx},${cz - 5.5}L${cx + 5.5},${cz}L${cx},${cz + 5.5}L${cx - 5.5},${cz}Z`, fill: 'var(--accent-hi)' }, svg, `${m.type}, health ${m.health} ${pos(m.position)}`);
    }
  }

  // Home.
  const hs = Math.max(9, Math.min(scale * 1.3, 14));
  el('rect', { x: X(S.home.x) - hs / 2, y: Z(S.home.z) - hs / 2, width: hs, height: hs, fill: 'none', stroke: 'var(--text-2)', 'stroke-width': 1.4 }, svg, `home ${pos(S.home)}`);
  const homeLabelBelow = Z(S.home.z) < 22;
  el('text', { x: X(S.home.x), y: homeLabelBelow ? Z(S.home.z) + hs / 2 + 9 : Z(S.home.z) - hs / 2 - 3, 'text-anchor': 'middle' }, svg).textContent = 'home';

  // Movement this cycle, then the player on top.
  const pp = w.player.position;
  if (prev) {
    const q = prev.player.position;
    if (q.x !== pp.x || q.z !== pp.z) {
      el('line', { x1: X(q.x), y1: Z(q.z), x2: X(pp.x), y2: Z(pp.z), stroke: 'var(--accent)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, svg);
      el('circle', { cx: X(q.x), cy: Z(q.z), r: 4.5, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1.3 }, svg, `before ${pos(q)}`);
    }
  }
  if (tgt?.p) el('circle', { cx: X(tgt.p.x), cy: Z(tgt.p.z), r: 9, fill: 'none', stroke: 'var(--warn)', 'stroke-width': 1.4, 'stroke-dasharray': '3 2' }, svg, `action target: ${tgt.what}`);
  el('circle', { cx: X(pp.x), cy: Z(pp.z), r: 5.5, fill: 'var(--accent)', stroke: 'var(--bg)', 'stroke-width': 1.5 }, svg, `player ${pos(pp)}`);

  // Caption: the facts the picture cannot show.
  const out =
    pp.x < b.min.x || pp.x > b.max.x || pp.z < b.min.z || pp.z > b.max.z
      ? ` · outside the boundary x/z ${b.min.x}..${b.max.x}`
      : '';
  const moved = prev && (prev.player.position.x !== pp.x || prev.player.position.z !== pp.z) ? ` (from ${pos(prev.player.position)})` : '';
  const label = view ? (S.view === 'after' ? 'after the cycle' : 'before the cycle') : 'as the next cycle will see it';
  $('map-cap').textContent =
    `${label}: player ${pos(pp)}${moved} · health ${w.player.health} · food ${w.player.hunger}${out}` +
    (tgt ? ` · target: ${tgt.what}` : '') +
    (w.unobservable.length ? ` · hidden from the agent: ${w.unobservable.join(', ')}` : '') +
    (w.observationLagMs ? ` · observations ${w.observationLagMs / 1000} s old` : '');
}

// ---------------------------------------------------------------- self-test

async function selfTest() {
  if (S.busy) return;
  setBusy(true);
  const panel = $('test-panel');
  panel.hidden = false;
  $('test-close').focus({ preventScroll: true });
  const rows = $('test-rows');
  rows.replaceChildren();
  $('test-sum').textContent = 'running…';
  $('test-esc').textContent = '';
  $('test-fs').textContent = '';
  const t0 = performance.now();
  try {
    const res = await S.agent.selfTest((r) => {
      const tr = document.createElement('tr');
      for (const [t, cls] of [
        [r.name, ''],
        [r.expected, ''],
        [r.got, ''],
        [r.pass ? 'pass' : 'FAIL', r.pass ? 'ok' : 'no'],
      ]) {
        const td = document.createElement('td');
        td.textContent = t;
        if (cls) td.className = cls;
        tr.appendChild(td);
      }
      rows.appendChild(tr);
    });
    const ms = performance.now() - t0;
    const pass = res.rows.filter((r) => r.pass).length;
    $('test-sum').textContent = `${pass} / ${res.rows.length} scenarios pass, escalation ${res.escalation.pass ? 'passes' : 'FAILS'} · ${(ms / 1000).toFixed(2)} s in this browser`;
    $('test-esc').textContent = `Escalation, action-fails ×4 on one database: ${res.escalation.got.join('  |  ')}`;
    const kbReads = res.fileAttempts.filter((f) => f.includes('gtnh-2.8.4.json.gz')).length;
    $('test-fs').textContent =
      `File reads attempted during the test: ${res.fileAttempts.length}` +
      (res.fileAttempts.length
        ? `, ${kbReads} of them the GTNH knowledge base (src/goals/knowledge/gtnh-2.8.4.json.gz), which is not shipped. ` +
          "The planner scenarios ask for it while building the planner request; the repo's gtnhChangesFor then returns no GTNH change notes, as it is written to, and the mock planner's fixed replies do not read them."
        : '.');
  } catch (e) {
    $('test-sum').textContent = `The test threw: ${e.message}`;
    console.error(e);
  } finally {
    setBusy(false);
  }
}

function closeTest() {
  $('test-panel').hidden = true;
  $('selftest').focus({ preventScroll: true });
}

// ---------------------------------------------------------------- wiring

$('start').addEventListener('click', start);
$('run').addEventListener('click', () => runCycles(1));
$('run5').addEventListener('click', () => runCycles(5));
$('selftest').addEventListener('click', selfTest);
$('test-close').addEventListener('click', closeTest);
$('test-panel').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeTest();
  if (e.key === 'Tab') {
    e.preventDefault();
    $('test-close').focus({ preventScroll: true });
  }
});
$('reset').addEventListener('click', () => {
  if (S.busy) return;
  S.session.close();
  S.session = new S.agent.Session();
  S.history = [];
  S.n = 0;
  S.ranCount.clear();
  markRan();
  updateDb();
  selectScenario(S.current, false);
});
for (const b of $('mode').querySelectorAll('button')) {
  b.addEventListener('click', () => {
    S.mode = b.dataset.mode;
    for (const x of $('mode').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    if (!S.shown) drawMap(currentWorld(S.current), null, null);
  });
}
for (const b of $('view').querySelectorAll('button')) {
  b.addEventListener('click', () => {
    S.view = b.dataset.view;
    for (const x of $('view').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    if (S.shown) drawMap(S.view === 'after' ? S.shown.after : S.shown.before, S.view === 'after' ? S.shown.before : null, S.shown);
  });
}
for (const b of document.querySelectorAll('[data-try]')) {
  b.addEventListener('click', () => selectScenario(b.dataset.try, true));
}
