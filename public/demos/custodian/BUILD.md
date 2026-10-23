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
- From npm, at the repo's lockfile versions: `@modelcontextprotocol/server`, `client` and `ext-apps` (all 2.0.0), `zod` 4.6.2 and `minisearch`.

The demo glue is written for this page and lives in `build-src/`:

- `engine.ts` boots the server in the page. It runs the real `McpServer` and a real MCP `Client` over the SDK's `InMemoryTransport` instead of Streamable HTTP. Both directions pass through `JSON.stringify`/`JSON.parse`, as they would on the wire. Each request carries the `AuthInfo` that the repo's `AUTH_MODE=dev` verifier returns. Express, the OAuth 2.1 server and the Bedrock enricher are not included; matching is deterministic only.
- `fixtures.ts` is the `FetchLike` that the four source clients are constructed with. It answers their real request URLs from the recorded responses in `packages/server/test/fixtures/`, which the page fetches from its own origin:
  - CPSC `RecallDateStart` requests get `cpsc-recent.json`.
  - CPSC `ProductName` searches run on CPSC's server, so here a stand-in search runs over the recorded CPSC records: every query word must appear in a record's title or product names.
  - NHTSA vehicle requests are answered only for make=Honda, model=Odyssey, modelYear=2019.
  - The NHTSA child-seat catalogue is answered only at offset 1200, the recorded page.
  - openFDA requests get the food, drug or device recording when the search names romaine, acetaminophen/tylenol, or thermometer/thermoscan.
  - Any other request gets a 404 that says it has no recording. The Feeds tab lists every request and what answered it.
- `host.ts` is the page around the app, playing the MCP host with a screen. Each screen button calls a tool through the client. The page then reads the tool's ui:// resource with `resources/read`, renders the HTML in a `sandbox="allow-scripts"` srcdoc iframe, and answers the app through the ext-apps `AppBridge` over `postMessage`. The view gets a CSP of `default-src 'none'` with only inline script and style allowed. The app's declared image domains (cpsc.gov, nhtsa.gov) are not granted.
- `shims/` holds small browser stand-ins for the Node built-ins that the bundled files import: `node:async_hooks`, `node:module`, `node:crypto` `randomBytes`, `node:fs/promises` and `node:path` (unused in `':memory:'` mode), `dotenv/config` (empty), and a `Buffer.from(...).toString('base64')` for the tool icons. Each file says why it is safe.

Other differences from the server as deployed:

- The server clock starts at 2026-09-11T12:00Z, the date the repo's tests use and the day after the newest recorded CPSC record, and then ticks normally.
- The sweeper is built with `childSeatPagesPerSweep: 1`. Its child-seat cursor is set to 1200 after `warm()`, because only that catalogue page was recorded.
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

`build.mjs` uses the esbuild in the repo's `node_modules` (0.28.2 from the lockfile). It writes
`host.js`, `app.html` and `fixtures/*.json` into the given folder. `index.html`, `BUILD.md` and
`build-src/` are kept in this folder as source and are not generated.

The build is deterministic. The files committed here have these SHA-256 prefixes:

| file       | sha256 (first 16) |
| ---------- | ----------------- |
| `host.js`  | `9ca38bfa3afced8d` |
| `app.html` | `d4fab2cbae03bdec` |

## Files

| path | what it is |
| ---- | ---------- |
| `index.html` | the poster, the Start button and the page styles; loads `host.js` only after Start |
| `host.js` | the esbuild bundle of `build-src/host.ts` and everything it imports (about 820 KB, about 215 KB gzipped) |
| `app.html` | the repo's MCP App (`packages/ui/dist/app.html`), served to the app iframe through `resources/read` |
| `fixtures/*.json` | the repo's recorded CPSC, NHTSA and openFDA responses, image URLs removed |
| `build-src/` | the demo glue and build script described above |

The page also loads `../_shared/demo.css`, the portfolio's shared demo palette.
