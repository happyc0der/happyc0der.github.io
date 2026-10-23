// Module worker: runs Pyodide and the repo's hawk_crypto package off the main thread, so a
// slow key generation (Hawk-1024) never freezes the page. The Pyodide version and CDN URL
// come from the shared kit, so every Python demo on the site uses the same cached runtime.
import { PYODIDE_URL, PYODIDE_VERSION } from '../_shared/pyodide.js';

const post = (msg) => self.postMessage(msg);
const here = (path) => new URL(path, import.meta.url).href;

// Count bytes as they arrive, for the progress bar. The body is tee'd with clone(), so
// Pyodide receives the untouched response; the copy is only read to count its length.
let received = 0;
const nativeFetch = self.fetch.bind(self);
self.fetch = async (...args) => {
  const res = await nativeFetch(...args);
  if (res.ok && res.body) {
    const reader = res.clone().body.getReader();
    (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
      }
    })().catch(() => {});
  }
  return res;
};

let py = null;
let glue = null; // the hawk_demo_glue module, kept as one proxy
let step = '';
let ticker = 0;
// Bytes the browser hands over once decompressed (measured against the CDN for 0.29.5):
// pyodide-lock.json, pyodide.asm.wasm, python_stdlib.zip, numpy, sympy, mpmath wheels, repo files.
const EXPECTED_BYTES = 122027 + 8647684 + 2424003 + 2823762 + 4119974 + 418000 + 160000;
const status = (text) => {
  step = text;
  post({ type: 'status', text, frac: Math.min(0.99, received / EXPECTED_BYTES) });
};

async function boot() {
  const t0 = performance.now();
  ticker = setInterval(() => post({ type: 'status', text: step, frac: Math.min(0.99, received / EXPECTED_BYTES) }), 200);
  try {
    status(`Downloading Python 3.13 (Pyodide ${PYODIDE_VERSION})`);
    const { loadPyodide } = await import(`${PYODIDE_URL}pyodide.mjs`);
    py = await loadPyodide({
      indexURL: PYODIDE_URL,
      stdout: (line) => post({ type: 'stdout', line }),
      stderr: (line) => post({ type: 'stdout', line }),
    });
    status('Loading NumPy');
    await py.loadPackage('numpy', { messageCallback: () => {} });
    status('Loading SymPy and mpmath');
    await py.loadPackage('sympy', { messageCallback: () => {} });

    status('Fetching the repo’s hawk_crypto files');
    const manifest = await (await fetch(here('manifest.json'))).json();
    const put = async (url, dest) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`could not fetch ${url} (${res.status})`);
      const path = `/home/pyodide/${dest}`;
      py.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
      py.FS.writeFile(path, new Uint8Array(await res.arrayBuffer()));
    };
    await Promise.all([
      ...manifest.files.map((f) => put(here(`repo/${f}`), f)),
      put(here('glue.py'), 'hawk_demo_glue.py'),
    ]);

    status('Importing hawk_crypto');
    const tImport = performance.now();
    py.runPython('import sys; sys.path.insert(0, "/home/pyodide"); import hawk_demo_glue as glue');
    const importMs = performance.now() - tImport;
    glue = py.globals.get('glue');

    const versions = py.runPython(
      'import numpy, sympy, sys; f"Python {sys.version.split()[0]}, NumPy {numpy.__version__}, SymPy {sympy.__version__}"'
    );
    // transferSize is visible cross-origin because the CDN sends Timing-Allow-Origin: *.
    const transferred = performance.getEntriesByType('resource').reduce((n, e) => n + (e.transferSize || 0), 0);
    clearInterval(ticker);
    post({
      type: 'ready',
      versions,
      pyodide: PYODIDE_VERSION,
      commit: manifest.commit,
      files: manifest.files.length,
      importMs,
      loadMs: performance.now() - t0,
      transferred,
    });
  } catch (err) {
    clearInterval(ticker);
    post({ type: 'fatal', error: String(err && err.message ? err.message : err) });
  }
}

const toJs = (proxy) => {
  const out = proxy.toJs({ dict_converter: Object.fromEntries });
  proxy.destroy();
  return out;
};

let testsLoaded = false;
const commands = {
  async sizes(logn) {
    return toJs(glue.spec_sizes(logn));
  },
  async keygen(logn) {
    return toJs(glue.keygen(logn));
  },
  async sign(logn, priv, message) {
    return toJs(glue.sign(logn, priv, message));
  },
  async verify(logn, pub, message, sig) {
    return toJs(glue.verify(logn, pub, message, sig));
  },
  async garbage(logn, pub, message, count) {
    return toJs(glue.garbage(logn, pub, message, count));
  },
  async tests() {
    if (!testsLoaded) {
      post({ type: 'stdout', line: '# loading pytest from the Pyodide distribution' });
      await py.loadPackage('pytest', { messageCallback: () => {} });
      testsLoaded = true;
    }
    return toJs(glue.run_tests());
  },
};

self.onmessage = async ({ data }) => {
  if (data.type === 'boot') return boot();
  const { id, cmd, args } = data;
  try {
    const result = await commands[cmd](...args);
    post({ type: 'result', id, result });
  } catch (err) {
    post({ type: 'result', id, error: String(err && err.message ? err.message : err) });
  }
};
