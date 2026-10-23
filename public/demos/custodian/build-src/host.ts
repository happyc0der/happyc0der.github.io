/**
 * Demo glue, not repo code: the page around the repo's MCP App. It plays the part of an MCP
 * host with a screen (as basic-host or an Echo Show would): it calls tools through the MCP
 * client, reads the app's ui:// resource from the server, renders it in a sandboxed iframe,
 * and answers the app through the ext-apps AppBridge over postMessage.
 */
import {
  AppBridge,
  PostMessageTransport,
  getToolUiResourceUri,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import type { Item } from '@custodian/shared';
import {
  LIKELY_THRESHOLD,
  MATCH_THRESHOLD,
  PINNED_START,
  latencySnapshot,
  startEngine,
  type Engine,
  type ToolCallRecord,
} from './engine.js';
import type { RequestLogEntry } from './fixtures.js';

type Status = (text: string, fraction: number) => void;

interface Screen {
  id: string;
  label: string;
  tool: string;
  args: Record<string, unknown>;
  readOnly: boolean;
}

const SCREENS: Screen[] = [
  { id: 'briefing', label: 'Briefing', tool: 'household_briefing', args: {}, readOnly: false },
  { id: 'recalls', label: 'Recalls', tool: 'check_recalls', args: {}, readOnly: true },
  { id: 'due', label: 'Due', tool: 'whats_due', args: { horizon_days: 365 }, readOnly: true },
  { id: 'inventory', label: 'Inventory', tool: 'list_inventory', args: {}, readOnly: true },
];

const PRESETS: Array<{ label: string; args: Record<string, unknown> }> = [
  { label: 'Joolz Aer2 stroller', args: { name: 'Joolz Aer2 stroller', purchased_on: '2026-03-01' } },
  { label: 'Thule Sleek car seat adapter', args: { name: 'Thule Sleek car seat adapter' } },
  { label: 'Britax Marathon ClickTight', args: { name: 'Britax Marathon ClickTight car seat' } },
  { label: "Children's Tylenol", args: { name: "Children's Tylenol acetaminophen", category: 'medication' } },
  { label: 'Graco 4Ever car seat', args: { name: 'Graco 4Ever car seat' } },
  {
    label: '2018 Honda Odyssey',
    args: { name: '2018 Honda Odyssey', vehicle: { make: 'Honda', model: 'Odyssey', year: 2018 } },
  },
];

const CATEGORIES = [
  'car_seat', 'stroller', 'crib', 'toy', 'appliance', 'electronics', 'furniture', 'vehicle', 'food',
  'medication', 'medical_device', 'tool', 'heater', 'smoke_detector', 'water_filter', 'hvac_filter', 'other',
];

const HOST_INFO = { name: 'Custodian browser demo host', version: '1.0.0' };
const HOST_CAPS = { openLinks: {}, serverTools: {}, logging: {}, updateModelContext: { text: {} } };

/** The site palette, passed to the app as MCP Apps host style variables. */
const HOST_STYLE_VARIABLES = {
  '--color-background-primary': '#0b0a10',
  '--color-background-secondary': '#14121c',
  '--color-background-tertiary': '#1b1826',
  '--color-text-primary': '#e7e5ee',
  '--color-text-secondary': '#cfcbdb',
  '--color-text-tertiary': '#8f8aa3',
  '--color-border-primary': '#262233',
  '--color-background-inverse': '#a78bfa',
  '--color-text-inverse': '#140f24',
  '--font-sans': "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
};

/**
 * The app declares cpsc.gov and nhtsa.gov as image domains. This host grants none of them,
 * so the sandboxed view can load nothing from the network (the fixtures carry no image URLs).
 */
const VIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:";

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmtMs = (ms: number) => (ms < 10 ? ms.toFixed(1) : Math.round(ms).toString());

function shortUrl(url: string): string {
  const u = new URL(url);
  const q = decodeURIComponent(u.search.replace(/\+/g, ' '));
  return `${u.hostname}${u.pathname}${q.length > 110 ? `${q.slice(0, 110)}…` : q}`;
}

const TEMPLATE = `
<div class="topbar">
  <div class="tb-left">
    <span class="live-dot" aria-hidden="true"></span>
    <span><b>MCP server running in this tab</b> <span class="muted mono" id="clock"></span></span>
  </div>
  <div class="tb-right">
    <span class="mono muted small" id="sweep-note" role="status"></span>
    <button type="button" class="btn primary" id="sweep">Run sweep</button>
  </div>
</div>
<div class="layout">
  <section class="stage" aria-label="Echo Show style screen">
    <div class="seg screens" role="group" aria-label="Screen (each calls a tool)" id="screens"></div>
    <div class="device" id="device">
      <div class="device-screen" id="device-screen"></div>
      <button type="button" class="btn exit-full" id="exit-full" hidden>Exit full screen</button>
    </div>
    <div class="reply" aria-live="polite">
      <span class="label">Spoken reply, content[0].text</span>
      <p id="speech" class="speech"></p>
    </div>
    <div class="callchip" id="callchip"></div>
  </section>
  <section class="side" aria-label="Inspect">
    <div class="seg tabs" role="group" aria-label="Panel" id="tabs">
      <button type="button" data-tab="household" aria-pressed="true">Household</button>
      <button type="button" data-tab="matcher" aria-pressed="false">Matcher</button>
      <button type="button" data-tab="calls" aria-pressed="false">Calls</button>
      <button type="button" data-tab="feeds" aria-pressed="false">Feeds</button>
    </div>
    <div class="panel-body" data-panel="household">
      <form id="add-form" class="add" autocomplete="off">
        <label for="add-name" class="label">Tell Custodian what you own (calls add_item)</label>
        <div class="add-row">
          <input id="add-name" name="name" required placeholder="e.g. Joolz Aer2 stroller" maxlength="120">
          <button type="submit" class="btn primary">Add</button>
        </div>
        <details class="more">
          <summary>More fields</summary>
          <div class="fields">
            <label>Brand <input name="brand" maxlength="60"></label>
            <label>Model <input name="model" maxlength="60"></label>
            <label>Category <select name="category"><option value="">infer from name</option>${CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select></label>
            <label>Quantity <input name="quantity" type="number" min="1" max="99" inputmode="numeric"></label>
            <label>Bought <input name="purchased_on" type="date"></label>
            <label>Made <input name="manufactured_on" type="date"></label>
            <label>Vehicle make <input name="make" maxlength="40"></label>
            <label>Vehicle model <input name="vmodel" maxlength="40"></label>
            <label>Model year <input name="year" type="number" min="1950" max="2100" inputmode="numeric"></label>
          </div>
        </details>
        <div class="presets" id="presets"><span class="label">Try</span></div>
      </form>
      <p class="add-reply" id="add-reply" role="status"></p>
      <ul class="items" id="items"></ul>
    </div>
    <div class="panel-body" data-panel="matcher" hidden>
      <p class="note">Each item's candidates from the MiniSearch index, scored by <code>scoreMatch</code> in match/score.ts. A score of ${MATCH_THRESHOLD} records a match; ${LIKELY_THRESHOLD} is spoken as definite.</p>
      <div id="matcher"></div>
    </div>
    <div class="panel-body" data-panel="calls" hidden>
      <h3 class="label">Tool calls (newest first)</h3>
      <ol class="calls" id="calls"></ol>
      <h3 class="label">Handler latency from telemetry.ts</h3>
      <div id="latency"></div>
      <h3 class="label">What the app told the model (ui/update-model-context)</h3>
      <ul class="notes" id="model-notes"><li class="muted">Nothing yet. Press Details, Done or I've handled it on the screen.</li></ul>
      <h3 class="label">Self-check: expectations from test/match.test.ts, rerun here</h3>
      <ul class="checks" id="checks"></ul>
    </div>
    <div class="panel-body" data-panel="feeds" hidden>
      <p class="note">Every request the repo's source clients made, and which recorded response answered it. Nothing leaves this page.</p>
      <h3 class="label">Feed requests</h3>
      <ol class="reqs" id="reqs"></ol>
      <h3 class="label">Sweeper log</h3>
      <ol class="sweeplog mono" id="sweeplog"></ol>
    </div>
  </section>
</div>`;

export async function mount(root: HTMLElement, onStatus: Status, reveal: () => void): Promise<void> {
  const sweepLines: string[] = [];
  const requests: RequestLogEntry[] = [];
  const calls: ToolCallRecord[] = [];
  const modelNotes: string[] = [];
  let renderQueued = false;
  let mounted = false;
  const queueRender = () => {
    if (renderQueued || !mounted) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderLogs();
    });
  };

  const engine: Engine = await startEngine(
    {
      onSweepLog: (l) => {
        sweepLines.push(l);
        queueRender();
      },
      onRequest: (e) => {
        requests.push(e);
        queueRender();
      },
      onToolCall: (c) => {
        calls.push(c);
        queueRender();
      },
    },
    onStatus,
  );
  onStatus('Rendering the first screen', 0.95);

  root.innerHTML = TEMPLATE;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  mounted = true;
  const deviceScreen = $('device-screen');
  const device = $('device');
  const exitFull = $<HTMLButtonElement>('exit-full');
  const pinned = new Date(PINNED_START).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  $('clock').textContent = `· clock starts ${pinned}, the fixtures' date`;
  root.dataset.tools = String(engine.tools.size);

  /* ---------- screens: each one is a tool call rendered by the repo's MCP App ---------- */
  let current: { screen: Screen; iframe: HTMLIFrameElement; bridge: AppBridge; ctx: McpUiHostContext } | undefined;
  let fullscreen = false;
  let busy = false;

  const screensEl = $('screens');
  screensEl.innerHTML = SCREENS.map(
    (s) => `<button type="button" data-screen="${s.id}" aria-pressed="false" title="calls ${s.tool}">${esc(s.label)}</button>`,
  ).join('');
  screensEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-screen]');
    const s = SCREENS.find((x) => x.id === b?.dataset.screen);
    if (s) void showScreen(s);
  });

  const dims = () => ({
    width: Math.round(deviceScreen.clientWidth),
    height: Math.round(deviceScreen.clientHeight),
  });

  function hostContext(screen: Screen): McpUiHostContext {
    return {
      toolInfo: { tool: engine.tools.get(screen.tool)! },
      theme: 'dark',
      styles: { variables: HOST_STYLE_VARIABLES as never },
      displayMode: fullscreen ? 'fullscreen' : 'inline',
      availableDisplayModes: ['inline', 'fullscreen'],
      containerDimensions: dims(),
      locale: 'en-US',
      timeZone: 'UTC',
      platform: 'web',
      deviceCapabilities: {
        touch: matchMedia('(pointer: coarse)').matches,
        hover: matchMedia('(hover: hover)').matches,
      },
    };
  }

  function setFullscreen(on: boolean) {
    fullscreen = on;
    device.classList.toggle('full', on);
    exitFull.hidden = !on;
    if (current) {
      current.ctx = { ...current.ctx, displayMode: on ? 'fullscreen' : 'inline', containerDimensions: dims() };
      current.bridge.setHostContext(current.ctx);
    }
  }
  exitFull.addEventListener('click', () => setFullscreen(false));

  async function mountApp(screen: Screen, rec: ToolCallRecord) {
    const tool = engine.tools.get(screen.tool);
    const uri = tool ? getToolUiResourceUri(tool) : undefined;
    if (!uri) throw new Error(`${screen.tool} declares no MCP App view`);
    const res = await engine.client.readResource({ uri });
    const first = res.contents[0] as { text?: string } | undefined;
    if (!first?.text) throw new Error(`resources/read ${uri} returned no HTML`);
    const html = first.text.replace(/<head([^>]*)>/i, `<head$1><meta http-equiv="Content-Security-Policy" content="${VIEW_CSP}">`);

    if (current) {
      const old = current;
      current = undefined;
      void old.bridge.close().catch(() => {});
      old.iframe.remove();
    }
    const iframe = document.createElement('iframe');
    iframe.title = `Custodian MCP App showing the ${screen.tool} result`;
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.srcdoc = html;
    deviceScreen.appendChild(iframe);

    const ctx = hostContext(screen);
    const bridge = new AppBridge(null, HOST_INFO, HOST_CAPS, { hostContext: ctx });
    bridge.oncalltool = async (params) => {
      const r = await engine.call(params.name, (params.arguments ?? {}) as Record<string, unknown>, 'app');
      showReply(r);
      // The app updates its own screen after its calls; only the side panels need a refresh.
      void refreshSide();
      return r.result;
    };
    bridge.onupdatemodelcontext = async (params) => {
      for (const c of params.content ?? []) if (c.type === 'text') modelNotes.push(c.text);
      queueRender();
      return {};
    };
    bridge.onmessage = async (params) => {
      const c = params.content?.find?.((x: { type: string }) => x.type === 'text') as { text?: string } | undefined;
      if (c?.text) modelNotes.push(`ui/message: ${c.text}`);
      queueRender();
      return {};
    };
    bridge.onopenlink = async ({ url }) => {
      // A visitor's click on "Open recall notice" opens the official page in a new tab.
      if (/^https:\/\//.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
      return {};
    };
    bridge.onrequestdisplaymode = async ({ mode }) => {
      setFullscreen(mode === 'fullscreen');
      return { mode: fullscreen ? 'fullscreen' : 'inline' };
    };
    bridge.onloggingmessage = (p) => {
      sweepLines.push(`[app] ${typeof p.data === 'string' ? p.data : JSON.stringify(p.data)}`);
      queueRender();
    };
    bridge.oninitialized = () => {
      void bridge.sendToolInput({ arguments: rec.args });
      void bridge.sendToolResult(rec.result as never);
    };
    await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
    current = { screen, iframe, bridge, ctx };
  }

  async function showScreen(screen: Screen, opts: { quiet?: boolean } = {}) {
    if (busy) return;
    busy = true;
    for (const b of screensEl.querySelectorAll<HTMLButtonElement>('button'))
      b.setAttribute('aria-pressed', String(b.dataset.screen === screen.id));
    try {
      const rec = await engine.call(screen.tool, screen.args, 'host');
      // A refresh after add/remove/sweep keeps that call's reply on show; the Calls tab lists both.
      if (!opts.quiet) showReply(rec);
      await mountApp(screen, rec);
      await refreshSide();
    } catch (err) {
      $('speech').innerHTML = `<span class="error">${esc((err as Error).message)}</span>`;
    } finally {
      busy = false;
    }
  }

  new ResizeObserver(() => {
    if (!current) return;
    current.ctx = { ...current.ctx, containerDimensions: dims() };
    current.bridge.setHostContext(current.ctx);
  }).observe(deviceScreen);

  function showReply(rec: ToolCallRecord) {
    const first = rec.result.content?.[0];
    const text = first && first.type === 'text' ? first.text : '';
    $('speech').textContent = text ? `“${text}”` : '(no spoken text)';
    $('speech').classList.toggle('error', rec.result.isError === true);
    const pct = Math.min(100, (rec.ms / 500) * 100);
    $('callchip').innerHTML =
      `<span class="mono"><b>${esc(rec.name)}</b> ${esc(JSON.stringify(rec.args))}</span>` +
      `<span class="budget" title="Alexa+ allows 500 ms per tool call"><i style="width:${Math.max(pct, 0.6)}%"></i></span>` +
      `<span class="mono">${fmtMs(rec.ms)} ms of the 500 ms budget</span>`;
  }

  /* ---------- side panels ---------- */
  const tabs = $('tabs');
  tabs.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tab]');
    if (!b) return;
    for (const t of tabs.querySelectorAll<HTMLButtonElement>('button')) t.setAttribute('aria-pressed', String(t === b));
    for (const p of root.querySelectorAll<HTMLElement>('[data-panel]')) p.hidden = p.dataset.panel !== b.dataset.tab;
  });

  const presetsEl = $('presets');
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = p.label;
    b.addEventListener('click', () => void addItem(p.args));
    presetsEl.appendChild(b);
  }

  const form = $<HTMLFormElement>('add-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const str = (k: string) => String(f.get(k) ?? '').trim();
    const args: Record<string, unknown> = { name: str('name') };
    for (const k of ['brand', 'model', 'category', 'purchased_on', 'manufactured_on']) if (str(k)) args[k] = str(k);
    if (str('quantity')) args.quantity = Number(str('quantity'));
    if (str('make') && str('vmodel') && str('year'))
      args.vehicle = { make: str('make'), model: str('vmodel'), year: Number(str('year')) };
    if (!args.name) return;
    void addItem(args).then((ok) => {
      if (ok) form.reset();
    });
  });

  async function addItem(args: Record<string, unknown>): Promise<boolean> {
    const replyEl = $('add-reply');
    try {
      const rec = await engine.call('add_item', args, 'host');
      showReply(rec);
      const first = rec.result.content?.[0];
      const text = first?.type === 'text' ? first.text : '';
      if (rec.result.isError) {
        replyEl.innerHTML = `<span class="error">${esc(text)}</span>`;
        return false;
      }
      replyEl.textContent = `add_item answered in ${fmtMs(rec.ms)} ms. Targeted sweep running…`;
      await engine.settle();
      const last = [...sweepLines].reverse().find((l) => l.startsWith(`${String(args.name)}:`));
      replyEl.textContent = `add_item answered in ${fmtMs(rec.ms)} ms; the targeted sweep ran after the answer${last ? ` (${last.split(': ').pop()})` : ''}.`;
      await afterChange();
      return true;
    } catch (err) {
      replyEl.innerHTML = `<span class="error">${esc((err as Error).message)}</span>`;
      return false;
    }
  }

  async function removeItem(item: Item) {
    const rec = await engine.call('remove_item', { item_id: item.id }, 'host');
    showReply(rec);
    $('add-reply').textContent = '';
    await afterChange();
  }

  /** After the household or a match changes: refresh panels, and re-call a read-only screen. */
  async function afterChange() {
    await refreshSide();
    if (current?.screen.readOnly && !busy) await showScreen(current.screen, { quiet: true });
  }

  $('sweep').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('sweep');
    btn.disabled = true;
    $('sweep-note').textContent = 'sweeping…';
    try {
      const ms = await engine.runFullSweep();
      $('sweep-note').textContent = `full sweep took ${fmtMs(ms)} ms`;
      await afterChange();
    } catch (err) {
      $('sweep-note').textContent = `sweep failed: ${(err as Error).message}`;
    } finally {
      btn.disabled = false;
    }
  });

  async function refreshSide() {
    const items = (await engine.items()).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const matches = await engine.store.listMatches(engine.householdId);
    const open = new Map<string, number>();
    for (const m of matches)
      if (m.status === 'new' || m.status === 'seen') open.set(m.item_id, (open.get(m.item_id) ?? 0) + 1);

    const list = $('items');
    list.innerHTML = items.length
      ? ''
      : '<li class="muted">Nothing on file. Add something above.</li>';
    for (const it of items) {
      const li = document.createElement('li');
      const n = open.get(it.id) ?? 0;
      const meta = [
        it.category,
        it.brand,
        it.model,
        it.vehicle ? `${it.vehicle.year} ${it.vehicle.make} ${it.vehicle.model}` : '',
        it.purchased_on ? `bought ${it.purchased_on}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      li.innerHTML = `<div class="it-main"><b>${esc(it.name)}${it.quantity > 1 ? ` ×${it.quantity}` : ''}</b><span class="mono muted small">${esc(meta)}</span></div>
        <span class="badge ${n ? 'bad' : 'ok'}">${n ? `${n} open` : 'clear'}</span>`;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'btn small';
      rm.textContent = 'Remove';
      rm.setAttribute('aria-label', `Remove ${it.name} (calls remove_item)`);
      rm.addEventListener('click', () => void removeItem(it));
      li.appendChild(rm);
      list.appendChild(li);
    }

    const blocks: string[] = [];
    for (const it of items) {
      const rows = await engine.matchRows(it);
      const shown = rows.slice(0, 4);
      const rest = rows.slice(4);
      const restRecorded = rest.filter((r) => r.score >= MATCH_THRESHOLD).length;
      blocks.push(`<section class="mitem"><h4>${esc(it.name)} <span class="mono muted small">${rows.length} candidate${rows.length === 1 ? '' : 's'}</span></h4>
        ${shown.length ? `<ol class="cands">${shown.map((r) => {
          const band = r.score >= LIKELY_THRESHOLD ? 'likely' : r.score >= MATCH_THRESHOLD ? 'possible' : 'below';
          const bandText = band === 'likely' ? 'spoken as definite' : band === 'possible' ? '“may affect yours”' : 'not recorded';
          return `<li class="cand ${band}">
            <div class="cand-top"><span class="score mono">${r.score.toFixed(2)}</span>
              <span class="bar" aria-hidden="true"><i style="width:${Math.max(1, r.score * 100)}%"></i><b style="left:${MATCH_THRESHOLD * 100}%"></b><b style="left:${LIKELY_THRESHOLD * 100}%"></b></span>
              <span class="band mono small">${bandText}${r.status ? ` · ${esc(r.status.replace('_', ' '))}` : ''}</span></div>
            <div class="cand-title">${esc(r.recall.id)} · ${esc(r.recall.title)}</div>
            <div class="reason mono small">${esc(r.reason)}</div></li>`;
        }).join('')}</ol>` : '<p class="muted small">No candidates in the index yet.</p>'}
        ${rest.length ? `<p class="muted small mono">+ ${rest.length} more: ${restRecorded} at or above ${MATCH_THRESHOLD}, ${rest.length - restRecorded} below</p>` : ''}
      </section>`);
    }
    $('matcher').innerHTML = blocks.join('') || '<p class="muted">No items.</p>';
    renderLogs();
  }

  function renderLogs() {
    $('calls').innerHTML = [...calls]
      .reverse()
      .slice(0, 40)
      .map((c) => {
        const first = c.result.content?.[0];
        const text = first?.type === 'text' ? first.text : '';
        return `<li><div class="mono small"><span class="from ${c.from}">${c.from}</span> <b>${esc(c.name)}</b> ${esc(JSON.stringify(c.args))} <span class="muted">${fmtMs(c.ms)} ms${c.result.isError ? ' · isError' : ''}</span></div><div class="small">${esc(text)}</div></li>`;
      })
      .join('');
    const snap = latencySnapshot();
    const rows = Object.entries(snap).sort((a, b) => a[0].localeCompare(b[0]));
    $('latency').innerHTML = rows.length
      ? `<table class="lat mono small"><thead><tr><th scope="col">tool</th><th scope="col">n</th><th scope="col">p50 ms</th><th scope="col">p95 ms</th><th scope="col">max</th></tr></thead><tbody>${rows
          .map(([t, s]) => `<tr><td>${esc(t)}</td><td>${s.count}</td><td>${s.p50}</td><td>${s.p95}</td><td>${s.max}</td></tr>`)
          .join('')}</tbody></table>`
      : '';
    if (modelNotes.length)
      $('model-notes').innerHTML = [...modelNotes].reverse().map((n) => `<li class="small">${esc(n)}</li>`).join('');
    $('reqs').innerHTML = [...requests]
      .reverse()
      .map(
        (r) => `<li class="small"><span class="mono st ${r.status === 200 ? 'ok' : 'miss'}">${r.status}</span> <span class="mono url">${esc(shortUrl(r.url))}</span><div class="muted small">→ ${esc(r.served)}</div></li>`,
      )
      .join('');
    $('sweeplog').innerHTML = sweepLines.map((l) => `<li>${esc(l)}</li>`).join('');
  }

  reveal();
  const checks = await engine.selfCheck();
  $('checks').innerHTML = checks
    .map((c) => `<li class="small"><span class="${c.ok ? 'pass' : 'fail'}">${c.ok ? 'pass' : 'FAIL'}</span> ${esc(c.name)} <span class="mono muted">${esc(c.detail)}</span></li>`)
    .join('');
  root.dataset.selfcheck = `${checks.filter((c) => c.ok).length}/${checks.length}`;
  await showScreen(SCREENS[0]!);
  root.dataset.ready = 'true';
  onStatus('Ready', 1);
}
