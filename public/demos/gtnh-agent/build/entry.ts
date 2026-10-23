// Browser entry for the gtnh-agent demo. Everything imported from '@gtnh/...' is the repo's
// own src/ at the pinned commit (see ../BUILD.md); this file only wires it to one in-memory
// SQLite database, a manual clock and the page. Written for this demo; not part of the repo.
//
// A cycle is the repo's runMockScenario (src/app/mock/mock-agent.ts), the same call as
// `pnpm agent:once --scenario <name>`: a MockMinecraftClient built from the scenario, the
// configured providers (here always the deterministic router and the scenario's fixture
// planner: no model), and ONE runSingleCycle. The database is kept between cycles, so the
// action log, plans and the repeated-failure rule carry over, as with `--db <file>`.

import { runMockScenario } from '@gtnh/app/mock/mock-agent.ts';
import { MOCK_CONFIG, SCENARIOS, type Scenario } from '@gtnh/app/mock/scenarios.ts';
import { approvePlan, describePlan, rejectPlan } from '@gtnh/app/commands/plan-commands.ts';
import { runSingleCycle, type CycleResult } from '@gtnh/app/loop/agent-loop.ts';
import { syncConfigToDatabase } from '@gtnh/app/loop/agent-memory.ts';
import { createProviders } from '@gtnh/app/providers.ts';
import { MockMinecraftClient, type MockWorld } from '@gtnh/bot/mock-minecraft-client.ts';
import { AgentConfigSchema, type AgentConfig } from '@gtnh/config/env.ts';
import { IN_MEMORY, openDatabase, type Db } from '@gtnh/persistence/database.ts';
import { createRepositories, type Repositories } from '@gtnh/persistence/repositories.ts';
import { manualClock, type ManualClock } from '@gtnh/util/clock.ts';
import { sequentialIds, type IdGenerator } from '@gtnh/util/ids.ts';
import { useSqlJs } from './shims/better-sqlite3.ts';
import { fsAttempts } from './shims/node-fs.ts';

/** The tests' start time (tests/fixtures T0); each cycle advances the clock by 1 s, as they do. */
const T0 = '2026-01-01T12:00:00.000Z';

/** No model is ever asked; if anything tried to reach one, it would fail here, not on the network. */
const noModel = {
  fetch: (): Promise<never> => Promise.reject(new Error('no model in the browser demo')),
  resolveHost: (): Promise<never> => Promise.reject(new Error('no DNS in the browser demo')),
};

/** Starts sql.js: `wasm` is the URL of sql-wasm-browser.wasm, or its bytes already fetched. */
export async function init(
  initSqlJs: (o: object) => Promise<unknown>,
  wasm: string | ArrayBuffer,
): Promise<void> {
  useSqlJs(
    await initSqlJs(typeof wasm === 'string' ? { locateFile: () => wasm } : { wasmBinary: wasm }),
  );
}

export interface ScenarioInfo {
  name: string;
  description: string;
  expect: Scenario['expect'];
  hasPlanner: boolean;
  injects: boolean;
  world: MockWorld;
}

export function scenarios(): ScenarioInfo[] {
  return SCENARIOS.map((s) => ({
    name: s.name,
    description: s.description,
    expect: s.expect,
    hasPlanner: s.plannerFixtures !== undefined,
    injects: s.setup !== undefined,
    world: s.world(),
  }));
}

export const homeLocation = MOCK_CONFIG.locations?.home?.position ?? { x: 0, y: 64, z: 0 };

/** The safety limits the mock config resolves to (boundary, hazard and threat radii, ...). */
export function safetyConfig(): unknown {
  return plain(AgentConfigSchema.parse({ ...MOCK_CONFIG, database: { path: IN_MEMORY } }).safety);
}

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export interface CycleView {
  scenario: string;
  mode: 'fresh' | 'kept';
  result: CycleResult;
  events: Array<{ id: number; kind: string; payload: unknown; createdAt: string }>;
  before: MockWorld;
  after: MockWorld;
  performed: unknown[];
  taskId: string | null;
  task: unknown;
  plan: Record<string, unknown> | null;
  /** The validated GameState the cycle observed (state_snapshots row). */
  snapshot: unknown;
  ms: number;
}

/** One database (and clock and ids) for a run of cycles; Reset makes a new one. */
export class Session {
  db: Db;
  repos: Repositories;
  clock: ManualClock;
  newId: IdGenerator;
  /** World kept between cycles ("kept" mode): one client per scenario, as the repo's session tests use. */
  #kept = new Map<string, { client: MockMinecraftClient; config: AgentConfig }>();
  cycles = 0;

  constructor() {
    this.clock = manualClock(T0);
    this.newId = sequentialIds();
    this.db = openDatabase(IN_MEMORY);
    this.repos = createRepositories(this.db, this.clock);
  }

  close(): void {
    this.db.close();
  }

  async runCycle(name: string, mode: 'fresh' | 'kept'): Promise<CycleView> {
    const s = SCENARIOS.find((x) => x.name === name);
    if (s === undefined) throw new Error(`no scenario ${name}`);
    this.clock.advance(1000);
    const t0 = performance.now();
    let result: CycleResult;
    let client: MockMinecraftClient;
    let before: MockWorld;
    if (mode === 'fresh') {
      // Exactly `agent:once`: a fresh mock world from the scenario, the kept database.
      before = s.world();
      const run = await runMockScenario(s, {
        db: this.db,
        clock: this.clock,
        newId: this.newId,
        llm: noModel,
      });
      result = run.result;
      client = run.client;
    } else {
      // One world for this scenario across cycles, as in tests/app/loop/plan-approval.test.ts.
      // The scenario's injected fault (failNext / silentNoop) is armed again before each cycle.
      let kept = this.#kept.get(name);
      if (kept === undefined) {
        const config = AgentConfigSchema.parse({
          ...MOCK_CONFIG,
          database: { path: IN_MEMORY },
        });
        kept = { client: new MockMinecraftClient(s.world(), this.clock), config };
        this.#kept.set(name, kept);
      }
      client = kept.client;
      s.setup?.(client);
      syncConfigToDatabase(kept.config, this.repos);
      before = structuredClone(client.world);
      await client.connect();
      try {
        result = await runSingleCycle({
          config: kept.config,
          client,
          repos: this.repos,
          ...createProviders(kept.config, {
            plannerFixtures: s.plannerFixtures ?? [],
            llm: noModel,
          }),
          clock: this.clock,
          newId: this.newId,
        });
      } finally {
        await client.disconnect();
      }
    }
    const ms = performance.now() - t0;
    this.cycles++;
    const taskId = before.task?.taskId ?? null;
    const latest = taskId === null ? null : this.repos.plans.latestForTask(taskId);
    return plain({
      scenario: name,
      mode,
      result,
      events: this.repos.events
        .forCycle(result.cycleId)
        .map((e) => ({ id: e.id, kind: e.kind, payload: e.payload, createdAt: e.createdAt })),
      before,
      after: client.world,
      performed: [...client.performed],
      taskId,
      task: taskId === null ? null : this.repos.tasks.get(taskId),
      plan: latest === null ? null : describePlan(latest),
      snapshot: result.stateSnapshotId === null ? null : this.repos.snapshots.get(result.stateSnapshotId),
      ms,
    });
  }

  /** Forget the kept world of one scenario (the database stays). */
  dropWorld(name: string): void {
    this.#kept.delete(name);
  }

  hasKeptWorld(name: string): MockWorld | null {
    const k = this.#kept.get(name);
    return k === undefined ? null : plain(k.client.world);
  }

  /** The CLI's plan-approve / plan-reject (src/app/commands/plan-commands.ts). */
  approve(taskId: string): unknown {
    return plain(approvePlan(this.repos, taskId, undefined));
  }
  reject(taskId: string): unknown {
    return plain(rejectPlan(this.repos, taskId, undefined, 'from the demo page'));
  }

  /** The two repository calls the CLI's task-resume makes (src/app/commands/cli-records.ts). */
  resume(taskId: string): unknown {
    const task = this.repos.tasks.get(taskId);
    if (task === null) return { ok: false, error: `No task ${taskId}` };
    this.repos.tasks.setStatus(taskId, 'active');
    this.repos.tasks.resetFailures(taskId);
    return { ok: true, value: { task: taskId, previousStatus: task.status, status: 'active', failuresReset: true } };
  }

  task(taskId: string): unknown {
    return plain(this.repos.tasks.get(taskId));
  }

  plan(taskId: string): Record<string, unknown> | null {
    const p = this.repos.plans.latestForTask(taskId);
    return p === null ? null : plain(describePlan(p));
  }

  /** The action log, newest first (the action_logs table). */
  actions(limit = 30): unknown[] {
    return plain(this.repos.actions.recent(limit));
  }

  /** Row counts of the tables a cycle writes, read with SQL from the live database. */
  tableCounts(): Record<string, number> {
    const tables = ['agent_events', 'action_logs', 'state_snapshots', 'safety_violations', 'plans', 'tasks', 'task_checkpoints'];
    const out: Record<string, number> = {};
    for (const t of tables) {
      try {
        out[t] = Number((this.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);
      } catch {
        /* table name differs at this commit */
      }
    }
    return out;
  }

  /** Every table the repo's migrations created, from sqlite_master. */
  tables(): string[] {
    return (
      this.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);
  }
}

export interface SelfTestRow {
  name: string;
  expected: string;
  got: string;
  pass: boolean;
}

/**
 * The repo's scenario test (tests/app/loop/agent-loop.test.ts, "single agent cycle over every
 * mock scenario"): each scenario once on a fresh database, checking decision, action type and
 * status; then its escalation test (action-fails four times on one database).
 */
export async function selfTest(onRow?: (r: SelfTestRow) => void): Promise<{
  rows: SelfTestRow[];
  escalation: { expected: string[]; got: string[]; pass: boolean };
  fileAttempts: string[];
}> {
  const rows: SelfTestRow[] = [];
  const fsBefore = fsAttempts.length;
  for (const s of SCENARIOS) {
    const { result, db } = await runMockScenario(s, {
      clock: manualClock(T0),
      newId: sequentialIds(),
      llm: noModel,
    });
    db.close();
    const exp = `${s.expect.decision} -> ${s.expect.actionType} -> ${s.expect.status}`;
    const got = `${result.decision?.decision ?? '-'} -> ${result.action?.type ?? '-'} -> ${result.status}`;
    const row = { name: s.name, expected: exp, got, pass: exp === got };
    rows.push(row);
    onRow?.(row);
    // Let the page paint between scenarios.
    await new Promise((r) => setTimeout(r, 0));
  }
  const expected = [
    'EXECUTE_KNOWN_SAFE_STEP -> INSPECT_MACHINE -> failed',
    'EXECUTE_KNOWN_SAFE_STEP -> INSPECT_MACHINE -> failed',
    'EXECUTE_KNOWN_SAFE_STEP -> INSPECT_MACHINE -> rejected [REPEATED_FAILURE]',
    'PAUSE_AND_ASK_USER -> PAUSE_AND_ASK_USER -> paused',
  ];
  const s = SCENARIOS.find((x) => x.name === 'action-fails');
  const got: string[] = [];
  if (s !== undefined) {
    const db = openDatabase(IN_MEMORY);
    const clock = manualClock(T0);
    const newId = sequentialIds();
    for (let i = 0; i < 4; i++) {
      const { result } = await runMockScenario(s, { db, clock, newId, llm: noModel });
      got.push(result.summary);
      clock.advance(1000);
    }
    db.close();
  }
  return {
    rows,
    escalation: { expected, got, pass: JSON.stringify(expected) === JSON.stringify(got) },
    fileAttempts: fsAttempts.slice(fsBefore),
  };
}

/** Every file-system call any code made since the page loaded (none expected). */
export const fileAttempts = (): string[] => [...fsAttempts];
