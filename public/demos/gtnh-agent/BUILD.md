# gtnh-agent browser demo: how it is built

The demo runs the gtnh-agent repo's own TypeScript in the browser:
[happyc0der/gtnh-agent](https://github.com/happyc0der/gtnh-agent) at commit
`e178a35c2d1c5dbac23b176483336dafd6caec29` (2026-10-18, "License under GPL-3.0-or-later").

## What runs

`agent.js` is `src/` of that commit bundled with esbuild: 124 of the repo's modules, among
them the agent loop (`src/app/loop/agent-loop.ts`, `runSingleCycle`), the mock runner
(`src/app/mock/mock-agent.ts`, `runMockScenario`, the code behind `pnpm agent:once`), the 36
scenarios (`src/app/mock/scenarios.ts`), the safety policy (`src/safety/`), the deterministic
router (`src/system1/`), the mock planner (`src/planner/mock-planner-provider.ts`), the
executor and verifier (`src/executor/`), `MockMinecraftClient`, the repositories and the SQL
migrations (`src/persistence/`). The full list is in `build-info.json` (`repoModuleList`).

There is no model anywhere. The configuration is the scenarios' `MOCK_CONFIG`, whose defaults
pick the rule-based router (`decisions.provider: deterministic`) and the fixture planner
(`planner.provider: mock`). The Ollama client code is in the bundle because
`src/app/providers.ts` imports it, but it is never constructed; the demo also hands the
providers a `fetch` that refuses, so nothing could reach a network even if it were.

Nothing touches a Minecraft server: the world is the repo's `MockMinecraftClient`.

## What is swapped, and why

Only Node-only modules are replaced (`build/shims/`, written for this demo):

| import | in the browser |
| --- | --- |
| `better-sqlite3` | `shims/better-sqlite3.ts`: the API the repositories use (`prepare().run/get/all`, named and positional parameters, `exec`, `pragma`, nested `transaction` via savepoints) over sql.js 1.14.2, SQLite compiled to WebAssembly (`vendor/`) |
| `node:fs` | `shims/node-fs.ts`: no file system; every call is recorded so the page can show it |
| `node:zlib`, `node:net` (sockets), `node:dns/promises`, `node:util` (`parseArgs`), `mineflayer`, `dotenv` | throw if called; no mock cycle calls them |
| `node:net` `isIP` | a small re-implementation (the config's address checks) |
| `node:crypto` `randomUUID` | Web Crypto's `crypto.randomUUID` |
| `node:path` | path-browserify 1.0.1 |
| `process.emitWarning` | `console.warn` (esbuild `define`; only reached if the route book cannot load the knowledge base, which no mock cycle does) |

`build/entry.ts` is the glue the page calls. It runs `runMockScenario` exactly as `agent:once`
does, on one in-memory database kept between cycles, with the tests' clock start
(`2026-01-01T12:00:00Z`, +1 s per cycle) and sequential ids (`cyc_0001`, `act_0001`). Its other
mode keeps one `MockMinecraftClient` per scenario across cycles and calls `runSingleCycle`
directly, as `tests/app/loop/plan-approval.test.ts` does; in that mode the scenario's injected
fault (`failNext` / `silentNoop`) is armed again before each cycle. Approve and Reject call the
repo's `approvePlan` / `rejectPlan`; Resume makes the two repository calls of the CLI's
`task-resume`. The self-test button repeats `tests/app/loop/agent-loop.test.ts`'s scenario
test and its escalation test.

## What is not included

- `src/goals/knowledge/gtnh-2.8.4.json.gz` (the knowledge base generated from GTNH 2.8.4 data)
  and `src/goals/age0-quests.ts` (the quest book extracted from the server): their terms are
  those of the modpack, so they stay out. The build fails if either module is bundled, if any
  output file contains a `.gz`, any of four 64-byte windows of the knowledge base, or any of the
  106 quest descriptions (whole or their first 40 characters), or a quest name that no bundled
  hand-written module cites. Two names are cited by the repo's own code and so appear:
  "A Better Crafting Table" (`src/domain/interactions.ts`) and "Redstone".
- The mock scenarios do ask for the knowledge base: every cycle that consults the planner calls
  `gtnhChangesFor` (`src/goals/gtnh-changes.ts`) while building the planner request. In the
  browser the read fails and the function returns no GTNH change notes, its documented
  fallback. The mock planner matches fixtures by task and never reads them, so no output
  changes; the check below shows this. The self-test panel reports how many reads were tried.
- No recorded live-play logs are used, so no player names appear anywhere.
- Scenario item and machine names are the repo's placeholders, not verified GTNH identifiers
  (as `scenarios.ts` says); the page says so too.

## Files

| file | bytes | what |
| --- | --- | --- |
| `index.html`, `app.js`, `app.css` | about 54 KB | the page (written for this demo) |
| `agent.js` | 866,774 | the bundle (about 224 KB gzipped) |
| `vendor/sql-wasm-browser.js`, `.wasm` | 45,129 + 658,410 | sql.js 1.14.2 (about 338 KB gzipped) |
| `vendor/sql.js-LICENSE.txt` | | sql.js's MIT licence |
| `build-info.json` | | commit, tool versions, module list, assertion results, sha256 of the outputs |
| `build/` | | entry, shims, build script, lockfiles, and the check in `build/verify/` |

Nothing downloads before the visitor presses Start. After that the page fetches only these
files, from its own origin.

## Regenerate

From the portfolio repo root, with Node 22.18 or later (built with Node 24.21.0) and git:

```sh
git clone https://github.com/happyc0der/gtnh-agent.git /tmp/gtnh-agent
git -C /tmp/gtnh-agent checkout e178a35c2d1c5dbac23b176483336dafd6caec29
cp -R public/demos/gtnh-agent/build /tmp/gtnh-demo-build
(cd /tmp/gtnh-demo-build && npm ci && node build.mjs --repo /tmp/gtnh-agent --out "$OLDPWD/public/demos/gtnh-agent")
```

`build.mjs` refuses a checkout at another commit or with local changes in `src/`
(`--allow-other-commit` overrides that). It writes `agent.js`, `vendor/` and
`build-info.json`; `index.html`, `app.js`, `app.css` and `build/` are hand-written. A clean
rebuild on 2026-10-23 gave byte-identical files (sha256 of `agent.js`:
`5d89de4af10565af684ea85b117f801462966c6910d042d8d212f669d2f2eaf8`).

## Check the bundle against the repo in Node

`build/verify/` builds the same `entry.ts` for Node with the real better-sqlite3 13.0.3 and the
real `node:fs`, written into a copy of the repo so the knowledge base loads, then runs a fixed
trace (all 36 scenarios, six cycles each in both modes, approve, reject, resume, the action log,
row counts and the self-test) through both and compares the output:

```sh
mkdir -p /tmp/gtnh-ref && git -C /tmp/gtnh-agent archive HEAD src | tar -x -C /tmp/gtnh-ref
cd /tmp/gtnh-demo-build/verify && npm ci
node ref-build.mjs --repo /tmp/gtnh-ref
node trace.mjs ref /tmp/gtnh-ref/src/goals/__ref.mjs > /tmp/ref.json
node trace.mjs bundle "$OLDPWD/public/demos/gtnh-agent/agent.js" /tmp/gtnh-demo-build/node_modules > /tmp/bundle.json
cmp /tmp/ref.json /tmp/bundle.json && echo identical
```

Run both blocks in one shell from the portfolio root (`$OLDPWD` is the root after the `cd`).
On 2026-10-23 the two outputs were byte-identical (8,157,517 bytes each), so the sql.js shim,
the stubbed file system and the missing knowledge base change nothing the demo shows.

## Licences

gtnh-agent is Copyright (C) 2026 Keshav Rajput, GPL-3.0-or-later; `agent.js` is a build of it
and keeps that licence, and its source is the repository above plus `build/`. The bundle also
contains zod 4.6.5 (MIT) and path-browserify 1.0.1 (MIT). sql.js 1.14.2 is MIT
(`vendor/sql.js-LICENSE.txt`).
