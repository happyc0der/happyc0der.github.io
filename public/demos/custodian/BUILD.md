# Custodian browser demo: how it is built

This folder is a static page that runs Custodian's own TypeScript in the browser. It is built from
[happyc0der/custodian](https://github.com/happyc0der/custodian) at commit
`e53c104706e388e42b9a058a0a59d065cfe00074` ("License under GPL-3.0-or-later", 2026-10-18).

The repo is GPL-3.0-or-later, and so is the bundle. Its complete source is that commit plus the
`build-src/` folder next to this file.

## What runs, and what is demo glue

From the repo, unchanged and bundled:

- `packages/server/src/mcp/**`: `createMcpServer()`, the 10 tools, the ui:// resource, views, icons and the `define.ts` wrapper with its latency timing (`telemetry.ts`).
- `packages/server/src/jobs/sweep.ts`: the `Sweeper`. It runs the targeted sweep after `add_item` and the full sweep on "Run sweep".
- `packages/server/src/sources/*.ts`: the CPSC, NHTSA vehicle, NHTSA child-seat and openFDA clients and normalizers.
- `packages/server/src/match/*.ts`: the MiniSearch index and `scoreMatch`.
- `packages/server/src/store/file.ts`: `FileStore` in its `':memory:'` mode.
- `packages/server/src/maintenance/*.ts`, `enrich/categorize.ts`, the `devVerifier` from `auth/bearer.ts`, and `packages/shared`.
- `packages/ui`: the Preact MCP App, built by the repo's own `npm run build:ui` and copied as `app.html` byte for byte.
- From npm, at the repo's lockfile versions: `@modelcontextprotocol/server`, `client`, `core` and `ext-apps` (all 2.0.0), `zod` 4.6.2, `minisearch` 7.2.0 and `pkce-challenge` 5.0.1; `app.html` also carries `preact` 10.29.8 and vite's modulepreload polyfill. `THIRD_PARTY_NOTICES.txt` lists each package, which file it is in, and its full license file. `build.mjs` writes it from esbuild's metafile and from a write-free rerun of the `packages/ui` vite build, so the list matches what is bundled.

The demo glue is written for this page and lives in `build-src/`:

- `engine.ts` boots the server in the page. It runs the real `McpServer` and a real MCP `Client` over the SDK's `InMemoryTransport` instead of Streamable HTTP. Both directions pass through `JSON.stringify`/`JSON.parse`, as they would on the wire. Each request carries the `AuthInfo` that the repo's `AUTH_MODE=dev` verifier returns. Express, the OAuth 2.1 server and the Bedrock enricher are not included; matching is deterministic only.
- `fixtures.ts` is the `FetchLike` that the four source clients are constructed with. It answers their real request URLs from the recorded responses in `packages/server/test/fixtures/`, which the page fetches from its own origin. Some answers are stand-ins written for the demo, and the Feeds tab lists every request with what answered it (green: a recording; purple: a stand-in over the recordings; pink: no recording):
  - CPSC `RecallDateStart` requests get `cpsc-recent.json`.
  - CPSC `ProductName` searches run on CPSC's server, so here a stand-in search runs over the recorded CPSC records: every query word must appear in a record's title or product names.
  - NHTSA vehicle requests get `nhtsa-odyssey-2019.json` for make=Honda, model=Odyssey, modelYear=2019. Any other vehicle gets NHTSA's empty-result body (`{"Count":0,"Message":"Results returned successfully","results":[]}`) with status 200, so it shows no campaigns. That is a stand-in: the live API would list that vehicle's campaigns (it has 16 for a 2018 Odyssey). The Household list marks such a vehicle "no recording", and the add_item reply says the lookup had no recording.
  - The NHTSA child-seat catalogue is answered only at offset 1200, the recorded page. Other offsets get a 404; see the child-seat note below.
  - openFDA requests get the food, drug or device recording when the search names romaine, acetaminophen/tylenol, or thermometer/thermoscan. The recording is picked by that word, not by running openFDA's search. Other openFDA searches get a 404, which is what openFDA itself sends for no matches and what `OpenFdaSource` reads as no recalls.
  - Any other request gets a 404 that says it has no recording.
- Why vehicles get an empty answer and not a 404: `Sweeper.doRunFull()` in `jobs/sweep.ts` calls `refreshItemSources()` with no try/catch (the targeted `sweepItem()` has one), so a single thrown lookup ends the full sweep: the items after it are not re-matched and `sweep:last_completed_at` is not written. An earlier version of this demo answered unrecorded vehicles with a 404, and "Run sweep" failed for every visitor who added one. The same gap is in the repo as deployed: when this was checked on 2026-10-23, `api.nhtsa.gov/recalls/recallsByVehicle` answered an unknown make or model (or a future model year) with HTTP 400 and the empty-result body, which `fetchJson` throws on. So one mistyped vehicle would end every hourly sweep at that item: the items and households after it would not be re-matched and `sweep:last_completed_at` would stop moving (`index.ts` catches and logs the error, so the server keeps running). The demo leaves the repo code unchanged; this is a bug to fix in the repo.
- `host.ts` is the page around the app, playing the MCP host with a screen. Each screen button calls a tool through the client. The page then reads the tool's ui:// resource with `resources/read`, renders the HTML in a `sandbox="allow-scripts"` srcdoc iframe, and answers the app through the ext-apps `AppBridge` over `postMessage`. The view gets a CSP of `default-src 'none'` with only inline script and style allowed. The app's declared image domains (cpsc.gov, nhtsa.gov) are not granted.
- The app is laid out for Echo Show sized screens. When the device screen is narrower than 440 px (phones), `host.ts` draws the app iframe 440 px wide and scales it down to fit, and reports 440 px to the app as its container width. Below about 420 px the app's maintenance rows run out of room. The app's own toast (`position: fixed; left: 50%` with no width) is still a narrow, tall pill at that size; that is the repo's CSS, left as it is.
- `shims/` holds small browser stand-ins for the Node built-ins that the bundled files import: `node:async_hooks`, `node:module`, `node:crypto` `randomBytes`, `node:fs/promises` and `node:path` (unused in `':memory:'` mode), `dotenv/config` (empty), and a `Buffer.from(...).toString('base64')` for the tool icons. Each file says why it is safe.

Other differences from the server as deployed:

- The server clock starts at 2026-09-11T12:00Z, the date the repo's tests use and the day after the newest recorded CPSC record, and then ticks normally.
- The sweeper is built with `childSeatPagesPerSweep: 1`. Its child-seat cursor is set to 1200 after `warm()`, because only that catalogue page was recorded. The recorded page was trimmed to 6 seats (its `count`), so after the first full sweep the cursor moves to 1206, which was not recorded: later sweeps log `child seat crawl failed at offset 1206` in the sweeper log. The sweeper catches that and carries on, as it would for a live outage.
- `build.mjs` empties the fixtures' CPSC `Images` arrays and child-seat `picture` fields (68 image URLs), so no remote image is ever requested. Everything else in the fixture files is unchanged.
- The household is seeded through `add_item` calls, taken from `scripts/seed.ts` and limited to what the fixtures cover.

## Rebuild

Tested with Node 24.21.0 and npm 11.19.0 on macOS. `PORTFOLIO` is the root of this portfolio repo.

```sh
git clone https://github.com/happyc0der/custodian.git
cd custodian
git checkout e53c104706e388e42b9a058a0a59d065cfe00074
npm ci --ignore-scripts
npx vitest run                 # optional: 10 files, 79 tests pass
npm run build:ui               # writes packages/ui/dist/app.html
cp -R "$PORTFOLIO/public/demos/custodian/build-src" demo
node demo/build.mjs "$PORTFOLIO/public/demos/custodian"
```

`build.mjs` uses the esbuild and vite in the repo's `node_modules` (0.28.2 and 8.3.0 from the
lockfile). It writes `host.js`, `app.html`, `fixtures/*.json` and `THIRD_PARTY_NOTICES.txt` into
the given folder. `index.html`, `BUILD.md` and `build-src/` are kept in this folder as source and
are not generated. The `build-src/*.ts` files import the repo's packages, so they type-check only
inside the custodian checkout, not as part of this portfolio (whose deploy runs `astro build`
only).

The build is deterministic. The files committed here have these SHA-256 prefixes:

| file       | sha256 (first 16) |
| ---------- | ----------------- |
| `host.js`  | `b770c85ac315b494` |
| `app.html` | `d4fab2cbae03bdec` |

## Files

| path | what it is |
| ---- | ---------- |
| `index.html` | the poster, the Start button and the page styles; loads `host.js` only after Start |
| `host.js` | the esbuild bundle of `build-src/host.ts` and everything it imports (about 840 KB, about 215 KB gzipped) |
| `app.html` | the repo's MCP App (`packages/ui/dist/app.html`), served to the app iframe through `resources/read` |
| `fixtures/*.json` | the repo's recorded CPSC, NHTSA and openFDA responses, image URLs removed |
| `THIRD_PARTY_NOTICES.txt` | the npm packages bundled into `host.js` and `app.html`, with their license files |
| `build-src/` | the demo glue and build script described above |

The page also loads `../_shared/demo.css`, the portfolio's shared demo palette.
