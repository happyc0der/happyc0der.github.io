// Builds the Custodian browser demo from a checkout of github.com/happyc0der/custodian.
//
//   node demo/build.mjs <out-dir>
//
// Run it from the repo root after `npm ci` and `npm run build:ui`, with this folder copied to
// <repo>/demo. It writes <out-dir>/host.js (the bundle), <out-dir>/app.html (the repo's MCP App
// build, unchanged), <out-dir>/fixtures/*.json (the repo's recorded feed responses with
// their remote image URLs removed) and <out-dir>/THIRD_PARTY_NOTICES.txt (the licenses of the
// npm packages with code in host.js or app.html). BUILD.md has the full steps.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
  // The minifier drops license comments; every bundled package's license is reproduced in
  // THIRD_PARTY_NOTICES.txt instead (written below), and the banner points to it.
  legalComments: 'none',
  banner: {
    js: '/*! Custodian browser demo: a GPL-3.0-or-later build of github.com/happyc0der/custodian (see BUILD.md). Bundled third-party packages and their licenses: THIRD_PARTY_NOTICES.txt */',
  },
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

// Third-party notices. List every npm package with code in host.js (esbuild's metafile) or in
// app.html (a write-free rerun of the repo's packages/ui vite build, which `npm run build:ui`
// runs with the same plugins plus vite-plugin-singlefile), and copy each one's license file.
const pkgOf = (id) => id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1];
const used = new Map();
const use = (name, file) => {
  if (!used.has(name)) used.set(name, new Set());
  used.get(name).add(file);
};
const hostOut = Object.values(result.metafile.outputs)[0];
for (const [id, m] of Object.entries(hostOut.inputs)) if (m.bytesInOutput > 0 && pkgOf(id)) use(pkgOf(id), 'host.js');
const shaken = [
  ...new Set(Object.keys(result.metafile.inputs).map(pkgOf).filter((n) => n && !used.has(n))),
].sort();

const { build: viteBuild } = await import('vite');
const { default: preact } = await import('@preact/preset-vite');
const uiRoot = path.join(repo, 'packages/ui');
await viteBuild({
  configFile: false,
  root: uiRoot,
  logLevel: 'warn',
  plugins: [
    preact(),
    {
      name: 'list-bundled-packages',
      renderChunk(_code, chunk) {
        for (const [id, m] of Object.entries(chunk.modules)) {
          if (!(m.renderedLength > 0)) continue;
          const name = pkgOf(id) ?? (id.includes('vite/modulepreload-polyfill') ? 'vite' : undefined);
          if (name) use(name, 'app.html');
        }
        return null;
      },
    },
  ],
  build: { write: false, minify: true, rollupOptions: { input: path.join(uiRoot, 'app.html') } },
});

const rule = '-'.repeat(78);
const rows = [];
const texts = [];
for (const name of [...used.keys()].sort()) {
  const dir = path.join(repo, 'node_modules', name);
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const file = readdirSync(dir).find((f) => /^licen[cs]e(\.(md|txt))?$/i.test(f));
  if (!file) throw new Error(`${name} has no license file; add its notice by hand`);
  let text = readFileSync(path.join(dir, file), 'utf8').trim();
  // Vite's license file also lists the dependencies bundled into vite itself. Only vite's own
  // modulepreload polyfill reaches app.html, so only the "Vite core license" part applies.
  if (name === 'vite') text = text.split(/\n# Licenses of bundled dependencies/)[0].trim();
  const files = [...used.get(name)].sort().join(', ');
  // The MCP SDK packages say MIT in package.json, but their license file covers a move to
  // Apache-2.0, with both texts. Say what the file says, not only the package.json field.
  const license =
    /Apache License/.test(text) && /MIT License/.test(text) ? `${pkg.license} and Apache-2.0` : String(pkg.license);
  rows.push(`  ${`${name} ${pkg.version}`.padEnd(38)} ${license.padEnd(20)} in ${files}`);
  texts.push(`${rule}\n${name} ${pkg.version} (${license}), in ${files}\n${rule}\n\n${text}\n`);
}
const notices = `Third-party software in the Custodian browser demo

host.js and app.html are builds of github.com/happyc0der/custodian, which is GPL-3.0-or-later
(BUILD.md has the source and the build steps). They contain code from the npm packages below,
each under its own license, whose license file is reproduced in full after the list. build.mjs
writes this file from the bundlers' own module lists, so it names every package with code in
either file. The @modelcontextprotocol packages are moving from MIT to Apache-2.0; their license
file explains which contributions fall under which, and carries both texts.

${rows.join('\n')}
${shaken.length ? `\nImported by bundled code but removed by tree-shaking (no code in host.js): ${shaken.join(', ')}.\n` : ''}
${texts.join('\n')}`;
writeFileSync(path.join(out, 'THIRD_PARTY_NOTICES.txt'), notices);

const inputs = Object.keys(result.metafile.inputs);
const fromRepo = inputs.filter((f) => f.startsWith('packages/')).length;
const sha = (f) => createHash('sha256').update(readFileSync(path.join(out, f))).digest('hex').slice(0, 12);
console.log(
  `host.js ${sha('host.js')}  app.html ${sha('app.html')}  ${inputs.length} modules (${fromRepo} from packages/), ${removed} image URLs removed from fixtures, ${used.size} packages in THIRD_PARTY_NOTICES.txt`,
);
