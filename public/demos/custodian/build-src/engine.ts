/**
 * Demo glue, not repo code. Boots the repo's Custodian MCP server inside the browser tab:
 * the real McpServer from createMcpServer(), the real Sweeper and source clients, the
 * FileStore in ':memory:' mode, and a real MCP Client connected over the SDK's
 * InMemoryTransport instead of Streamable HTTP. What it leaves out: Express, the OAuth server
 * (the caller identity comes from the repo's AUTH_MODE=dev verifier), the Bedrock enricher,
 * and every network call (the sources get the fixture FetchLike from fixtures.ts).
 */
import { InMemoryTransport, type CallToolResult, type Tool } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import type { Item, RecallRecord } from '@custodian/shared';
import { createMcpServer } from '../packages/server/src/mcp/server.js';
import type { ServerDeps, UiBundle } from '../packages/server/src/mcp/deps.js';
import type { Config } from '../packages/server/src/config.js';
import { devVerifier } from '../packages/server/src/auth/bearer.js';
import { FileStore } from '../packages/server/src/store/file.js';
import { Sweeper, type SweepSources } from '../packages/server/src/jobs/sweep.js';
import { CpscSource, normalizeCpsc, type CpscRecall } from '../packages/server/src/sources/cpsc.js';
import {
  NhtsaVehicleSource,
  normalizeNhtsaVehicle,
  type NhtsaVehicleRecall,
} from '../packages/server/src/sources/nhtsaVehicle.js';
import {
  NhtsaChildSeatSource,
  normalizeChildSeatRecalls,
  type ChildSeatPage,
} from '../packages/server/src/sources/nhtsaChildSeat.js';
import { OpenFdaSource, normalizeFda, type FdaEnforcement } from '../packages/server/src/sources/openfda.js';
import { applyDefaultRules } from '../packages/server/src/maintenance/service.js';
import {
  LIKELY_THRESHOLD,
  MATCH_THRESHOLD,
  itemQuery,
  scoreMatch,
} from '../packages/server/src/match/score.js';
import { RecallIndex } from '../packages/server/src/match/index.js';
import { defaultAliases, inferBrand, inferCategory } from '../packages/server/src/enrich/categorize.js';
import { latencySnapshot } from '../packages/server/src/telemetry.js';
import {
  RECORDED_CHILDSEAT_OFFSET,
  createFixtureFetch,
  preloadFixtures,
  type RequestLogEntry,
} from './fixtures.js';

export { LIKELY_THRESHOLD, MATCH_THRESHOLD, latencySnapshot };

/** The fixtures were recorded in September 2026; the tests run on this date. */
export const PINNED_START = '2026-09-11T12:00:00.000Z';

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  ms: number;
  result: CallToolResult;
  from: 'host' | 'app';
}

export interface EngineEvents {
  onSweepLog(line: string): void;
  onRequest(e: RequestLogEntry): void;
  onToolCall(c: ToolCallRecord): void;
}

/** Sample household from scripts/seed.ts, limited to what the recorded fixtures cover. */
export const SEED_ITEMS: Array<Record<string, unknown>> = [
  { name: 'Joolz Aer2 car seat adapter', purchased_on: '2026-03-01' },
  { name: 'Britax Advocate ClickTight car seat', manufactured_on: '2021-06-10' },
  {
    name: '2019 Honda Odyssey',
    vehicle: { make: 'Honda', model: 'Odyssey', year: 2019 },
    purchased_on: '2024-05-20',
  },
  { name: 'Kidde smoke detector', quantity: 3, purchased_on: '2025-12-01' },
  { name: 'Braun ThermoScan ear thermometer', brand: 'Braun', purchased_on: '2025-01-15' },
  { name: 'Romaine lettuce', category: 'food' },
  { name: 'Brita water filter pitcher', purchased_on: '2026-06-15' },
];

async function loadUiBundle(url: string): Promise<UiBundle> {
  // Browser version of packages/server/src/ui.ts loadUiBundle(): one view ("app") from the
  // repo's packages/ui build, content-hashed into its ui:// URI the same way.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load the MCP App bundle (${res.status})`);
  const html = await res.text();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html)));
  const hash = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
  const uri = `ui://custodian/app-${hash}.html`;
  return {
    uriFor: (view) => (view === 'app' ? uri : undefined),
    has: (u) => u === uri,
    read: async (u) => {
      if (u !== uri) throw new Error(`unknown ui resource ${u}`);
      return html;
    },
    entries: () => [{ view: 'app', uri }],
  };
}

export interface MatchRow {
  recall: RecallRecord;
  score: number;
  reason: string;
  status?: string;
}

export interface Engine {
  client: Client;
  tools: Map<string, Tool>;
  store: FileStore;
  sweeper: Sweeper;
  now: () => Date;
  householdId: string;
  call(name: string, args?: Record<string, unknown>, from?: 'host' | 'app'): Promise<ToolCallRecord>;
  settle(): Promise<void>;
  runFullSweep(): Promise<number>;
  items(): Promise<Item[]>;
  matchRows(item: Item): Promise<MatchRow[]>;
  selfCheck(): Promise<Array<{ name: string; ok: boolean; detail: string }>>;
}

export async function startEngine(
  ev: EngineEvents,
  onStatus: (text: string, fraction: number) => void,
): Promise<Engine> {
  onStatus('Loading the recorded feed responses', 0.15);
  await preloadFixtures();
  onStatus('Loading the MCP App bundle', 0.3);
  const ui = await loadUiBundle('./app.html');

  const startedAt = Date.now();
  const now = () => new Date(Date.parse(PINNED_START) + (Date.now() - startedAt));
  const fetchFixture = createFixtureFetch(ev.onRequest);
  const sources: SweepSources = {
    cpsc: new CpscSource({ fetch: fetchFixture }),
    nhtsaVehicle: new NhtsaVehicleSource({ fetch: fetchFixture }),
    nhtsaChildSeat: new NhtsaChildSeatSource({ fetch: fetchFixture }),
    openFda: new OpenFdaSource({ fetch: fetchFixture, now }),
  };

  onStatus('Starting the store and the sweeper', 0.4);
  const store = new FileStore(':memory:');
  const sweeper = new Sweeper({
    store,
    sources,
    now,
    // No enricher: Bedrock stays off, matching is deterministic only.
    childSeatPagesPerSweep: 1,
    log: (m) => ev.onSweepLog(m),
  });
  await sweeper.warm();
  // Only one catalogue page was recorded (offset 1200 of the 7,653-seat crawl), so the crawl
  // cursor starts there instead of at 0.
  await store.setMeta('sweep:childseat_offset', String(RECORDED_CHILDSEAT_OFFSET));

  const config = {
    port: 0,
    publicUrl: location.origin,
    store: 'file',
    fileStorePath: ':memory:',
    dynamoTable: '',
    awsRegion: '',
    authMode: 'dev',
    devBearerToken: 'browser-demo',
    oauthClientId: '',
    oauthClientSecret: '',
    oauthRedirectUris: [],
    jwtPrivateKey: undefined,
    sweepCron: '0 * * * *',
    sweepOnBoot: false,
    bedrockEnabled: false,
    bedrockRegion: '',
    bedrockModel: '',
    uiDist: './app.html',
  } satisfies Config;

  // Same hook as packages/server/src/index.ts: runs after add_item has answered.
  const pending = new Set<Promise<void>>();
  const deps: ServerDeps = {
    config,
    store,
    ui,
    now,
    hooks: {
      onItemAdded: (item) => {
        const p = (async () => {
          await applyDefaultRules(store, item, now());
          const matches = await sweeper.sweepItem(item);
          ev.onSweepLog(`${item.name}: ${matches.length} recall match(es)`);
        })();
        pending.add(p);
        void p.finally(() => pending.delete(p));
        return p;
      },
    },
  };

  onStatus('Connecting an MCP client to the server', 0.5);
  const server = createMcpServer(deps);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  // Stand-in for the HTTP bearer middleware: every request carries the AuthInfo that the repo's
  // AUTH_MODE=dev verifier returns, which define.ts turns into the caller's household.
  const authInfo = await devVerifier(config).verify(config.devBearerToken);
  // InMemoryTransport hands objects across as they are. Over HTTP every message is JSON, which
  // drops undefined fields before the client validates structuredContent against outputSchema,
  // so both directions go through a JSON round trip here too.
  const wire = <T>(m: T): T => JSON.parse(JSON.stringify(m)) as T;
  const clientSend = clientSide.send.bind(clientSide);
  clientSide.send = (message, options) => clientSend(wire(message), { ...options, authInfo });
  const serverSend = serverSide.send.bind(serverSide);
  serverSide.send = (message, options) => serverSend(wire(message), options);
  await server.connect(serverSide);
  const client = new Client({ name: 'custodian-browser-demo', version: '1.0.0' });
  await client.connect(clientSide);
  const tools = new Map((await client.listTools()).tools.map((t) => [t.name, t]));
  const householdId = String(authInfo.extra?.householdId ?? 'dev');

  const call: Engine['call'] = async (name, args = {}, from = 'host') => {
    const t0 = performance.now();
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
    const rec = { name, args, ms: performance.now() - t0, result, from };
    ev.onToolCall(rec);
    return rec;
  };
  const settle = async () => {
    while (pending.size) await Promise.allSettled([...pending]);
  };

  onStatus('Adding the sample household through add_item', 0.6);
  for (const [i, item] of SEED_ITEMS.entries()) {
    await call('add_item', item);
    onStatus(`Adding the sample household through add_item (${i + 1}/${SEED_ITEMS.length})`, 0.6 + (0.3 * (i + 1)) / SEED_ITEMS.length);
  }
  await settle();

  return {
    client,
    tools,
    store,
    sweeper,
    now,
    householdId,
    call,
    settle,
    async runFullSweep() {
      const t0 = performance.now();
      await sweeper.runFull();
      return performance.now() - t0;
    },
    items: () => store.listItems(householdId),
    async matchRows(item) {
      const matches = new Map(
        (await store.listMatches(householdId)).filter((m) => m.item_id === item.id).map((m) => [m.recall_id, m]),
      );
      return sweeper.index
        .candidates(itemQuery(item))
        .map((recall) => {
          const s = scoreMatch(item, recall);
          return { recall, score: s.score, reason: s.reason, status: matches.get(recall.id)?.status };
        })
        .sort((a, b) => b.score - a.score);
    },
    selfCheck: () => selfCheck(),
  };
}

/** A few expectations from packages/server/test/match.test.ts and sources.test.ts, rerun here. */
async function selfCheck(): Promise<Array<{ name: string; ok: boolean; detail: string }>> {
  const get = async <T>(f: string) => (await (await fetch(`./fixtures/${f}`)).json()) as T;
  const item = (name: string, extra: Partial<Item> = {}): Item => {
    const brand = inferBrand(name, extra.brand);
    return {
      id: `itm_${name.replace(/\W+/g, '_')}`,
      household_id: 'h',
      name,
      brand,
      category: inferCategory(name, extra.category),
      quantity: 1,
      aliases: defaultAliases(name, brand),
      enrichment_status: 'pending',
      created_at: '2026-09-11T00:00:00Z',
      updated_at: '2026-09-11T00:00:00Z',
      ...extra,
    };
  };
  const cpsc = (await get<CpscRecall[]>('cpsc-car-seat.json')).map(normalizeCpsc);
  const recent = (await get<CpscRecall[]>('cpsc-recent.json')).map(normalizeCpsc);
  const pair = (await get<CpscRecall[]>('cpsc-joolz-pair.json')).map(normalizeCpsc);
  const odyssey = (await get<{ results: NhtsaVehicleRecall[] }>('nhtsa-odyssey-2019.json')).results.map(
    normalizeNhtsaVehicle,
  );
  const seats = normalizeChildSeatRecalls((await get<ChildSeatPage>('nhtsa-childseats-page.json')).results);
  const romaine = (await get<{ results: FdaEnforcement[] }>('openfda-food-romaine.json')).results.map((r) =>
    normalizeFda(r, 'food'),
  );
  const joolz = cpsc.find((r) => r.id === 'cpsc:26568')!;
  const advocate = seats.find((r) => r.external_id === '15C003000')!;
  const lounger = pair.find((r) => r.external_id === '26569')!;
  const van = (year: number) =>
    item(`${year} Honda Odyssey`, { category: 'vehicle', vehicle: { make: 'Honda', model: 'Odyssey', year } });
  const idx = new RecallIndex();
  idx.add([...cpsc, ...recent, ...odyssey, ...seats, ...romaine]);

  const checks: Array<[string, () => [boolean, string]]> = [
    ['Joolz Aer2 adapter vs CPSC 26568 is likely (>= 0.8)', () => {
      const s = scoreMatch(item('Joolz Aer2 car seat adapter'), joolz);
      return [s.score >= LIKELY_THRESHOLD && /brand Joolz matches/.test(s.reason), `${s.score} (${s.reason})`];
    }],
    ['Graco 4Ever car seat vs 26568 stays below 0.5', () => {
      const s = scoreMatch(item('Graco 4Ever car seat'), joolz);
      return [s.score < MATCH_THRESHOLD, String(s.score)];
    }],
    ['Joolz Aer2 stroller vs 26568 is possible (0.5 to 0.8)', () => {
      const s = scoreMatch(item('Joolz Aer2 stroller'), joolz);
      return [s.score >= MATCH_THRESHOLD && s.score < LIKELY_THRESHOLD, String(s.score)];
    }],
    ['2019 Odyssey matches its campaign exactly; 2018 does not', () => {
      const a = scoreMatch(van(2019), odyssey[0]!).score;
      const b = scoreMatch(van(2018), odyssey[0]!).score;
      return [a === 1 && b === 0, `2019: ${a}, 2018: ${b}`];
    }],
    ['Britax Advocate ClickTight vs NHTSA 15C003000 is likely', () => {
      const s = scoreMatch(item('Britax Advocate ClickTight car seat'), advocate);
      return [s.score >= LIKELY_THRESHOLD, String(s.score)];
    }],
    ['Romaine lettuce matches the FDA record; peanut butter does not', () => {
      const a = scoreMatch(item('romaine lettuce', { category: 'food' }), romaine[0]!).score;
      const b = scoreMatch(item('peanut butter', { category: 'food' }), romaine[0]!).score;
      return [a >= MATCH_THRESHOLD && b < MATCH_THRESHOLD, `romaine: ${a}, peanut butter: ${b}`];
    }],
    ['CPSC 26569 (Joolz title, lounger body) has no "joolz" keyword', () => [
      !lounger.keywords.includes('joolz') && lounger.keywords.includes('lounger'),
      `keywords include lounger: ${lounger.keywords.includes('lounger')}`,
    ]],
    ['MiniSearch ranks 26568 first for the Joolz adapter over the whole corpus', () => {
      const hits = idx.candidates(itemQuery(item('Joolz Aer2 car seat adapter')));
      return [hits[0]?.id === 'cpsc:26568', `top hit ${hits[0]?.id} of ${idx.size} records`];
    }],
  ];
  return checks.map(([name, fn]) => {
    try {
      const [ok, detail] = fn();
      return { name, ok, detail };
    } catch (err) {
      return { name, ok: false, detail: (err as Error).message };
    }
  });
}
