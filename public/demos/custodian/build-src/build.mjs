// Builds the Custodian browser demo from a checkout of github.com/happyc0der/custodian.
//
//   node demo/build.mjs <out-dir>
//
// Run it from the repo root after `npm ci` and `npm run build:ui`, with this folder copied to
// <repo>/demo. It writes <out-dir>/host.js (the bundle), <out-dir>/app.html (the repo's MCP App
// build, unchanged) and <out-dir>/fixtures/*.json (the repo's recorded feed responses with
// their remote image URLs removed). BUILD.md has the full steps.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const out = path.resolve(process.argv[2] ?? path.join(repo, 'demo-dist'));
const shim = (f) => path.join(here, 'shims', f);
const serverPkg = JSON.parse(readFileSync(path.join(repo, 'packages/server/package.json'), 'utf8'));

mkdirSync(path.join(out, 'fixtures'), { recursive: true });

const result = await build({
  entryPoints: [path.join(here, 'host.ts')],
  outfile: path.join(out, 'host.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  charset: 'utf8',
  metafile: true,
  alias: {
    'node:async_hooks': shim('async_hooks.js'),
    'node:module': shim('module.js'),
    'node:crypto': shim('crypto.js'),
    'node:fs/promises': shim('fs-promises.js'),
    'node:path': shim('path.js'),
    'dotenv/config': shim('empty.js'),
  },
  inject: [shim('buffer.js')],
  define: {
    __CUSTODIAN_SERVER_VERSION__: JSON.stringify(serverPkg.version),
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});

// The repo's MCP App, exactly as `npm run build:ui` produced it.
copyFileSync(path.join(repo, 'packages/ui/dist/app.html'), path.join(out, 'app.html'));

// The recorded responses, minus image URLs: CPSC Images[] point at cpsc.gov and child-seat
// rows carry a picture URL. Emptying them keeps the page from loading anything remote.
const fixtures = path.join(repo, 'packages/server/test/fixtures');
const names = [
  'cpsc-car-seat.json',
  'cpsc-joolz-pair.json',
  'cpsc-recent.json',
  'nhtsa-childseats-page.json',
  'nhtsa-odyssey-2019.json',
  'openfda-device-thermometer.json',
  'openfda-drug-acetaminophen.json',
  'openfda-food-romaine.json',
];
let removed = 0;
for (const name of names) {
  const data = JSON.parse(readFileSync(path.join(fixtures, name), 'utf8'));
  if (Array.isArray(data)) {
    for (const r of data) {
      removed += r.Images?.length ?? 0;
      if (r.Images) r.Images = [];
    }
  } else if (Array.isArray(data.results)) {
    for (const r of data.results) {
      if ('picture' in r && r.picture) {
        removed += 1;
        r.picture = null;
      }
    }
  }
  writeFileSync(path.join(out, 'fixtures', name), JSON.stringify(data));
}

const inputs = Object.keys(result.metafile.inputs);
const fromRepo = inputs.filter((f) => f.startsWith('packages/')).length;
const sha = (f) => createHash('sha256').update(readFileSync(path.join(out, f))).digest('hex').slice(0, 12);
console.log(
  `host.js ${sha('host.js')}  app.html ${sha('app.html')}  ${inputs.length} modules (${fromRepo} from packages/), ${removed} image URLs removed from fixtures`,
);
