// Module worker for the Snakes and Ladders demo. Python runs here, off the page's thread, so a
// long call (a d1 game that never ends, 20,000 rolled games, the test suite) never freezes the
// page or the portfolio page that embeds it. The Pyodide version and URL come from the shared
// kit, so every Python demo on the site shares one cached runtime.
import { PYODIDE_URL, PYODIDE_VERSION } from '../_shared/pyodide.js';

const send = (msg) => self.postMessage(msg);
const local = (path) => new URL(path, import.meta.url).href;

// The repo files placed in Pyodide's home directory, which is on sys.path.
const REPO_FILES = ['model.py', 'simulation.py', 'test_model.py'];

// Count bytes as responses stream in, for the progress bar. The page reads a clone; Pyodide
// gets the original response untouched.
let bytesIn = 0;
const realFetch = self.fetch.bind(self);
self.fetch = async (...args) => {
  const res = await realFetch(...args);
  if (res.ok && res.body) {
    const reader = res.clone().body.getReader();
    (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        bytesIn += value.byteLength;
      }
    })().catch(() => {});
  }
  return res;
};

// Decoded sizes of what the first start fetches from the CDN for Pyodide 0.29.5:
// pyodide-lock.json, pyodide.asm.wasm, python_stdlib.zip and the NumPy 2.2.5 wheel.
const EXPECTED_BYTES = 122027 + 8647684 + 2424003 + 2823762;
let stage = '';
let base = 0;
let expected = EXPECTED_BYTES;
const progress = () => send({ type: 'status', text: stage, frac: Math.min(0.99, (bytesIn - base) / expected) });
const setStage = (text) => { stage = text; progress(); };

let py = null;
let glue = null;

async function boot() {
  const t0 = performance.now();
  const timer = setInterval(progress, 200);
  try {
    setStage(`Downloading Python (Pyodide ${PYODIDE_VERSION})`);
    const { loadPyodide } = await import(`${PYODIDE_URL}pyodide.mjs`);
    py = await loadPyodide({ indexURL: PYODIDE_URL });
    // Raw writes rather than Pyodide's line batching, which splits pytest's
    // "name ... PASSED" lines in two because pytest flushes between the halves.
    const decoder = new TextDecoder();
    const write = (buf) => { send({ type: 'out', text: decoder.decode(buf, { stream: true }) }); return buf.length; };
    py.setStdout({ write });
    py.setStderr({ write });
    setStage('Loading NumPy');
    await py.loadPackage('numpy', { messageCallback: () => {} });

    setStage('Placing the repo’s files');
    const put = async (url, dest) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`could not fetch ${url} (${res.status})`);
      py.FS.writeFile(`/home/pyodide/${dest}`, new Uint8Array(await res.arrayBuffer()));
    };
    await Promise.all([
      ...REPO_FILES.map((f) => put(local(`repo/${f}`), f)),
      put(local('glue.py'), 'slm_demo_glue.py'),
    ]);

    setStage('Importing model.py and simulation.py');
    py.runPython('import sys\nif "/home/pyodide" not in sys.path: sys.path.insert(0, "/home/pyodide")\nimport slm_demo_glue');
    glue = py.pyimport('slm_demo_glue');
    const info = plain(glue.info());
    clearInterval(timer);
    send({ type: 'ready', info, pyodide: PYODIDE_VERSION, loadMs: Math.round(performance.now() - t0) });
  } catch (err) {
    clearInterval(timer);
    send({ type: 'fatal', error: String(err && err.message ? err.message : err) });
  }
}

const plain = (proxy) => {
  if (!proxy || typeof proxy.toJs !== 'function') return proxy;
  const out = proxy.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false });
  proxy.destroy();
  return out;
};

let pytestLoaded = false;
const calls = {
  sweep: (rolls) => plain(glue.sweep(py.toPy(rolls))),
  analyse: (roll) => plain(glue.analyse(roll)),
  distribution: (roll, n) => plain(glue.distribution(roll, n)),
  row: (roll, square) => plain(glue.row(roll, square)),
  pointWalk: (roll, turns) => plain(glue.point_walk(roll, turns)),
  settles: (roll, eps) => plain(glue.settles(roll, eps)),
  play: (roll, seed) => plain(glue.play(roll, seed)),
  empirical: (games, seed) => plain(glue.empirical(games, seed)),
  async tests() {
    if (!pytestLoaded) {
      base = bytesIn;
      // pytest 8.3.5 and its dependencies from the same Pyodide release, about 1.6 MB.
      expected = 1700000;
      stage = 'Loading pytest';
      const timer = setInterval(progress, 200);
      try {
        await py.loadPackage('pytest', { messageCallback: () => {} });
      } finally {
        clearInterval(timer);
      }
      pytestLoaded = true;
    }
    send({ type: 'status', text: 'Running test_model.py', frac: 1 });
    return plain(glue.run_tests('/home/pyodide/test_model.py'));
  },
};

self.onmessage = async ({ data }) => {
  if (data.type === 'boot') return boot();
  const { id, fn, args = [] } = data;
  try {
    const result = await calls[fn](...args);
    send({ type: 'result', id, result });
  } catch (err) {
    send({ type: 'result', id, error: String(err && err.message ? err.message : err) });
  }
};
