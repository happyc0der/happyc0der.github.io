// Builds the gtnh-agent browser demo: bundles the repo's own src/ (mock agent path) with
// esbuild, swaps Node-only modules for the shims in ./shims, copies sql.js, and asserts that
// nothing derived from the GTNH modpack (the knowledge base, the extracted quest book) ends up
// in the output. See ../BUILD.md for the exact commands.
//
//   node build.mjs --repo <gtnh-agent checkout> --out <public/demos/gtnh-agent>
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';

export const PINNED_COMMIT = 'e178a35c2d1c5dbac23b176483336dafd6caec29';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { values } = parseArgs({
  options: {
    repo: { type: 'string' },
    out: { type: 'string' },
    'allow-other-commit': { type: 'boolean', default: false },
  },
});
if (!values.repo || !values.out) {
  console.error('usage: node build.mjs --repo <gtnh-agent checkout> --out <demo dir>');
  process.exit(2);
}
const repo = resolve(values.repo);
const out = resolve(values.out);
const src = join(repo, 'src');

const commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['-C', repo, 'status', '--porcelain', '--', 'src'], { encoding: 'utf8' }).trim();
if ((commit !== PINNED_COMMIT || dirty !== '') && !values['allow-other-commit']) {
  console.error(`repo is at ${commit}${dirty ? ' with local changes in src/' : ''}; this demo pins ${PINNED_COMMIT}`);
  process.exit(1);
}

const shim = (f) => join(here, 'shims', f);
const SHIMS = {
  'better-sqlite3': shim('better-sqlite3.ts'),
  'node:fs': shim('node-fs.ts'),
  'node:zlib': shim('node-zlib.ts'),
  'node:net': shim('node-net.ts'),
  'node:dns/promises': shim('node-dns.ts'),
  'node:crypto': shim('node-crypto.ts'),
  'node:util': shim('node-util.ts'),
  'node:path': require.resolve('path-browserify'),
  mineflayer: shim('unavailable.ts'),
  dotenv: shim('unavailable.ts'),
};

const resolvePlugin = {
  name: 'gtnh-demo-resolve',
  setup(build) {
    build.onResolve({ filter: /^@gtnh\// }, (a) => ({ path: join(src, a.path.slice('@gtnh/'.length)) }));
    build.onResolve({ filter: /^(better-sqlite3|mineflayer|dotenv|node:.*)$/ }, (a) => {
      const p = SHIMS[a.path];
      if (p === undefined) return { errors: [{ text: `no browser shim for ${a.path}` }] };
      return { path: p };
    });
    // zod always from this build's node_modules (the version in the repo's pnpm-lock.yaml).
    build.onResolve({ filter: /^zod(\/.*)?$/ }, (a) =>
      a.resolveDir === here ? undefined : build.resolve(a.path, { resolveDir: here, kind: a.kind }),
    );
  },
};

mkdirSync(join(out, 'vendor'), { recursive: true });
const banner =
  '/* gtnh-agent (https://github.com/happyc0der/gtnh-agent), commit ' +
  commit +
  ', bundled for the browser demo with shims for Node-only modules.\n' +
  ' * Copyright (C) 2026 Keshav Rajput. GPL-3.0-or-later: you may redistribute and modify it under\n' +
  ' * the GNU General Public License v3 or later; source: the repository above plus ./build/ here.\n' +
  ' * Includes zod (MIT, Colin McDonnell) and path-browserify (MIT). */';

const result = await esbuild.build({
  entryPoints: [join(here, 'entry.ts')],
  outfile: join(out, 'agent.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  banner: { js: banner },
  metafile: true,
  logLevel: 'warning',
  // route-book.ts warns through Node's process.emitWarning when the knowledge base is missing;
  // no mock cycle reaches it, but if one did, the browser has no `process`.
  define: { 'process.emitWarning': 'console.warn' },
  plugins: [resolvePlugin],
});

// sql.js: the browser build and its WebAssembly binary, with its licence.
const pkgDir = (name) => join(here, 'node_modules', name);
const pkgVersion = (name) => JSON.parse(readFileSync(join(pkgDir(name), 'package.json'), 'utf8')).version;
const sqljsDir = pkgDir('sql.js');
const sqljsVersion = pkgVersion('sql.js');
copyFileSync(join(sqljsDir, 'dist', 'sql-wasm-browser.js'), join(out, 'vendor', 'sql-wasm-browser.js'));
copyFileSync(join(sqljsDir, 'dist', 'sql-wasm-browser.wasm'), join(out, 'vendor', 'sql-wasm-browser.wasm'));
copyFileSync(join(sqljsDir, 'LICENSE'), join(out, 'vendor', 'sql.js-LICENSE.txt'));

// ---- Assertions: nothing GTNH-derived in the output. ----
const failures = [];
const inputs = Object.keys(result.metafile.inputs);
const repoInputs = inputs.filter((p) => resolve(p).startsWith(src));
const forbiddenInputs = inputs.filter((p) => /goals[\\/]knowledge[\\/]|age0-quests\.ts$|\.json\.gz$/.test(p));
if (forbiddenInputs.length > 0) failures.push(`bundle includes ${forbiddenInputs.join(', ')}`);

const walk = (d) =>
  readdirSync(d).flatMap((f) => (f === 'node_modules' ? [] : statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const outFiles = walk(out);
const gz = outFiles.filter((f) => /\.gz$/i.test(f));
if (gz.length > 0) failures.push(`output contains gzip files: ${gz.join(', ')}`);

// The knowledge base's bytes: four 64-byte windows of the .gz must not occur in any file.
const knowledgeGz = readFileSync(join(src, 'goals', 'knowledge', 'gtnh-2.8.4.json.gz'));
const kbWindows = [0, 0.25, 0.5, 0.75].map((f) => {
  const at = Math.floor(knowledgeGz.length * f);
  return knowledgeGz.subarray(at, at + 64);
});

// The extracted quest book (src/goals/age0-quests.ts): its 106 descriptions must not occur
// anywhere, whole or as their first 40 characters. A quest NAME may occur only where the repo's
// own hand-written code cites it (e.g. src/domain/interactions.ts names the quest that asks for
// a crafting station); those are listed in build-info.json.
const questSource = readFileSync(join(src, 'goals', 'age0-quests.ts'), 'utf8');
const field = (name) =>
  [...questSource.matchAll(new RegExp(`^\\s*${name}:\\s*\\n?\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`, 'gm'))].map((m) =>
    m[2].replace(/\\(.)/g, '$1'),
  );
const questNames = field('name');
const questDescriptions = field('description');
if (questNames.length < 100 || questDescriptions.length < 100) {
  failures.push(`expected 100+ quest names and descriptions, found ${questNames.length} and ${questDescriptions.length}`);
}
const descriptionProbes = questDescriptions.flatMap((d) => (d.length > 40 ? [d, d.slice(0, 40)] : [d])).filter((d) => d.length >= 12);
const handWritten = repoInputs
  .filter((p) => !/age0-quests\.ts$/.test(p))
  .map((p) => readFileSync(resolve(p), 'utf8'))
  .join('\n');
const citedNames = new Set();
for (const f of outFiles) {
  const buf = readFileSync(f);
  if (kbWindows.some((w) => buf.includes(w))) failures.push(`${relative(out, f)} contains bytes of the knowledge base`);
  if (!/\.(js|mjs|ts|html|css|json|md|txt)$/.test(f)) continue;
  const text = buf.toString('utf8');
  const d = descriptionProbes.find((q) => text.includes(q));
  if (d !== undefined) failures.push(`${relative(out, f)} contains quest text: ${JSON.stringify(d.slice(0, 60))}`);
  for (const n of questNames) {
    if (n.length < 6 || !text.includes(n)) continue;
    if (handWritten.includes(n)) citedNames.add(n);
    else failures.push(`${relative(out, f)} contains the quest name ${JSON.stringify(n)}, which no bundled hand-written module cites`);
  }
}

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const info = {
  repo: 'https://github.com/happyc0der/gtnh-agent',
  commit,
  builtWith: {
    node: process.version,
    esbuild: esbuild.version,
    'sql.js': sqljsVersion,
    zod: pkgVersion('zod'),
    'path-browserify': pkgVersion('path-browserify'),
  },
  repoModules: repoInputs.length,
  allModules: inputs.length,
  repoModuleList: repoInputs.map((p) => relative(repo, resolve(p))).sort(),
  assertions: {
    noKnowledgeBaseOrQuestModules: forbiddenInputs.length === 0,
    noGzipFiles: gz.length === 0,
    questDescriptionsChecked: questDescriptions.length,
    questNamesChecked: questNames.length,
    noQuestText: !failures.some((f) => f.includes('quest text')),
    questNamesCitedByRepoCode: [...citedNames].sort(),
    noKnowledgeBytes: !failures.some((f) => f.includes('knowledge base')),
  },
  files: Object.fromEntries(
    ['agent.js', 'vendor/sql-wasm-browser.js', 'vendor/sql-wasm-browser.wasm'].map((f) => [
      f,
      { bytes: statSync(join(out, f)).size, sha256: sha(join(out, f)) },
    ]),
  ),
};
writeFileSync(join(out, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);

if (failures.length > 0) {
  console.error(`BUILD ASSERTION FAILED:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `agent.js ${info.files['agent.js'].bytes} bytes from ${info.repoModules} repo modules (${info.allModules} in all); ` +
    `no quest descriptions (${questDescriptions.length} checked), quest names only where repo code cites them ` +
    `(${[...citedNames].join(', ') || 'none'}); no knowledge base bytes, no .gz`,
);
