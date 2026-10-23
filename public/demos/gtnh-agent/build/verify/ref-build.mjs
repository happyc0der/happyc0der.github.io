// Reference build for checking the browser bundle: the same ../entry.ts, bundled for Node with
// the REAL better-sqlite3 and node:* modules, written into <repo>/src/goals/ so that
// src/goals/knowledge.ts finds the GTNH knowledge base next to it. Use a throwaway copy of the
// repo (it writes __ref.mjs into it). See ../../BUILD.md.
//
//   node ref-build.mjs --repo <copy of gtnh-agent at the pinned commit>
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: { repo: { type: 'string' } } });
if (!values.repo) throw new Error('usage: node ref-build.mjs --repo <gtnh-agent copy>');
const repo = resolve(values.repo);
const nm = join(here, 'node_modules');
await esbuild.build({
  entryPoints: [join(here, '..', 'entry.ts')],
  outfile: join(repo, 'src', 'goals', '__ref.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  logLevel: 'warning',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  plugins: [
    {
      name: 'ref-resolve',
      setup(b) {
        b.onResolve({ filter: /^@gtnh\// }, (a) => ({ path: join(repo, 'src', a.path.slice('@gtnh/'.length)) }));
        b.onResolve({ filter: /^better-sqlite3$/ }, () => ({ path: join(nm, 'better-sqlite3', 'lib', 'index.js'), external: true }));
        b.onResolve({ filter: /^zod(\/.*)?$/ }, (a) => (a.resolveDir === here ? undefined : b.resolve(a.path, { resolveDir: here, kind: a.kind })));
      },
    },
  ],
});
console.log(`wrote ${join(repo, 'src', 'goals', '__ref.mjs')}`);
