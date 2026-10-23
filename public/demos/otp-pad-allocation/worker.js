// Module worker that owns the Python runtime, so the long CI jobs never freeze the page.
// It takes the pinned Pyodide URL from the shared kit (../_shared/pyodide.js) instead of
// calling startPython(), because startPython() adds a <script> tag and a worker has no document.
import { PYODIDE_URL, PYODIDE_VERSION } from '../_shared/pyodide.js';

// The repo's files, copied unmodified from commit 662f578, plus this demo's glue.py.
const FILES = ['protocol.py', 'simulation.py', 'eval_protocol.py', 'main.py', 'test_protocol.py', 'summary.csv', 'glue.py'];

let py = null;
let glue = null;
let testsReady = false;
const post = (msg) => self.postMessage(msg);
const status = (text, frac) => post({ type: 'status', text, frac });

// Called from glue.py through Pyodide's `js` module.
self.progress = (k, total, label) => post({ type: 'progress', k, total, label });
self.stream = (text) => post({ type: 'stream', text });

// Real progress for the runtime download: each big file reports when it lands.
const WEIGHTS = { 'pyodide.asm.js': 0.05, 'pyodide-lock.json': 0.01, 'python_stdlib.zip': 0.42, 'pyodide.asm.wasm': 0.47 };
function watchDownloads() {
  let got = 0.04;
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const file = e.name.split('/').pop();
        if (WEIGHTS[file] && e.name.startsWith(PYODIDE_URL)) {
          got += WEIGHTS[file];
          status(`Downloaded ${file}`, Math.min(0.92, got));
        }
      }
    });
    obs.observe({ type: 'resource', buffered: true });
    return () => obs.disconnect();
  } catch {
    return () => {};
  }
}

async function init() {
  status(`Downloading Python ${PYODIDE_VERSION} (about 5.3 MB compressed)`, 0.02);
  const stop = watchDownloads();
  const { loadPyodide } = await import(`${PYODIDE_URL}pyodide.mjs`);
  py = await loadPyodide({ indexURL: PYODIDE_URL });
  stop();
  status('Python runtime ready; placing the repo files', 0.93);
  for (const name of FILES) {
    const res = await fetch(`./py/${name}`);
    if (!res.ok) throw new Error(`could not fetch py/${name} (${res.status})`);
    py.FS.writeFile(`/home/pyodide/${name}`, new Uint8Array(await res.arrayBuffer()));
  }
  status('Importing protocol, simulation and eval_protocol', 0.97);
  py.runPython('import os, sys; os.chdir("/home/pyodide"); sys.path.insert(0, "/home/pyodide")');
  glue = py.pyimport('glue');
  const info = JSON.parse(glue.dispatch('info', '{}'));
  status('Ready', 1);
  return { ...info, pyodide: PYODIDE_VERSION };
}

async function handle({ id, op, args }) {
  try {
    let result;
    if (op === 'init') {
      result = await init();
    } else {
      if (!glue) throw new Error('Python is not loaded yet');
      if (op === 'ci.tests' && !testsReady) {
        status('Downloading pytest from the Pyodide distribution', 0.1);
        await py.loadPackage('pytest', { messageCallback: (m) => status(m, 0.5) });
        testsReady = true;
        status('pytest ready', 1);
      }
      result = JSON.parse(glue.dispatch(op, JSON.stringify(args || {})));
    }
    post({ id, ok: true, result });
  } catch (err) {
    post({ id, ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// One request at a time, in order.
let queue = Promise.resolve();
self.onmessage = (e) => { queue = queue.then(() => handle(e.data)); };
