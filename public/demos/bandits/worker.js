// Runs the repo's Python in Pyodide off the main thread, so a 10-second AdSwitch run
// never freezes this page or the project page that embeds it.
// The runtime pin is the shared one in ../_shared/pyodide.js (that file's startPython()
// needs `document`, which a worker does not have, so only its constants are used here).
import { PYODIDE_VERSION, PYODIDE_URL } from '../_shared/pyodide.js';

// The repo's files, unmodified, from happyc0der/multi_armed_bandit_algorithms@2be15ab.
const REPO_FILES = [
  'bandit_base.py', 'synthetic_env.py', 'ucb1.py', 'epsilon_greedy.py', 'mucb.py',
  'ts_ge.py', 'fast_adswitch.py',
  'bench/__init__.py', 'bench/cases.py', 'bench/metrics.py', 'bench/preflight.py', 'bench/runner.py',
];
const HOME = '/home/pyodide/bandits';

// Decoded sizes of what loadPyodide + loadPackage('numpy') fetch() for v0.29.5
// (pyodide.asm.wasm, python_stdlib.zip, the NumPy wheel, pyodide-lock.json), used only
// to move the progress bar. pyodide.asm.js arrives through import() and is not counted.
const EXPECTED_BYTES = 14_017_476;

const post = (msg) => self.postMessage(msg);
let py = null;
let api = null;

// Count bytes as Pyodide downloads its own files, for an honest progress bar.
let loaded = 0;
const realFetch = self.fetch.bind(self);
self.fetch = async (input, init) => {
  const res = await realFetch(input, init);
  // Pyodide passes URL objects, so normalise before matching.
  const url = input instanceof Request ? input.url : String(input);
  if (!res.ok || !res.body || !String(url).startsWith(PYODIDE_URL)) return res;
  try {
    const reader = res.body.getReader();
    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        loaded += value.byteLength;
        const share = Math.min(1, loaded / EXPECTED_BYTES);
        post({ type: 'status', text: `Downloading Python ${PYODIDE_VERSION} and NumPy · ${Math.round(100 * share)}%`, fraction: 0.9 * share });
        controller.enqueue(value);
      },
      cancel(reason) { reader.cancel(reason); },
    });
    return new Response(stream, { status: res.status, statusText: res.statusText, headers: res.headers });
  } catch {
    return res;
  }
};

async function boot() {
  post({ type: 'status', text: `Downloading Python ${PYODIDE_VERSION}`, fraction: 0.01 });
  const { loadPyodide } = await import(`${PYODIDE_URL}pyodide.mjs`);
  py = await loadPyodide({ indexURL: PYODIDE_URL });
  await py.loadPackage('numpy', { messageCallback: () => {} });

  post({ type: 'status', text: 'Placing the repo files', fraction: 0.93 });
  const files = [...REPO_FILES.map((f) => [`py/${f}`, f]), ['demo_entry.py', 'demo_entry.py']];
  await Promise.all(files.map(async ([src, dest]) => {
    const res = await realFetch(new URL(`./${src}`, import.meta.url));
    if (!res.ok) throw new Error(`could not fetch ${src} (${res.status})`);
    const path = `${HOME}/${dest}`;
    py.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
    py.FS.writeFile(path, new Uint8Array(await res.arrayBuffer()));
  }));

  post({ type: 'status', text: 'Importing the repo', fraction: 0.97 });
  py.runPython(`
import sys
sys.dont_write_bytecode = True
sys.path.insert(0, ${JSON.stringify(HOME)})
import demo_entry
`);
  api = py.globals.get('demo_entry');
  const versions = py.runPython('import sys, numpy; f"Python {sys.version.split()[0]} · NumPy {numpy.__version__}"');
  return `${PYODIDE_VERSION} (${versions})`;
}

const call = (fn, ...args) => JSON.parse(api[fn](...args));

async function handle(msg) {
  switch (msg.cmd) {
    case 'boot':
      post({ type: 'ready', id: msg.id, data: { versions: await boot() } });
      break;
    case 'describe':
      post({ type: 'case', id: msg.id, data: call('describe', msg.preset, msg.delta ?? undefined) });
      break;
    case 'run': {
      // One message per algorithm, so the page can draw each as it finishes.
      const runOne = api.run_one;
      try {
        for (const job of msg.jobs) {
          post({ type: 'progress', id: msg.id, job });
          const out = JSON.parse(runOne.callKwargs(msg.preset, job.algorithm, msg.seed, {
            paper_beta_typo: !!job.typo, ts_ge_delta: msg.delta ?? undefined,
          }));
          post({ type: 'result', id: msg.id, job, data: out });
        }
      } finally {
        runOne.destroy();
      }
      post({ type: 'done', id: msg.id });
      break;
    }
    case 'ts_phase_check':
      post({ type: 'ts_phase_check', id: msg.id, data: call('ts_phase_check', msg.preset, msg.seed, msg.corrected ?? undefined, msg.as_printed ?? undefined, msg.bp_share ?? undefined) });
      break;
    case 'regression': {
      api.regression_reset();
      const seedsProxy = api.REGRESSION_SEEDS;
      const seeds = seedsProxy.toJs();
      seedsProxy.destroy();
      for (const [i, seed] of seeds.entries()) {
        post({ type: 'regression_progress', id: msg.id, seed, index: i, total: seeds.length });
        api.regression_seed(seed);
      }
      post({ type: 'regression', id: msg.id, data: call('regression_summary') });
      break;
    }
    default:
      throw new Error(`unknown command ${msg.cmd}`);
  }
}

// Commands run strictly one after another.
let queue = Promise.resolve();
self.onmessage = (event) => {
  queue = queue.then(() => handle(event.data)).catch((error) => {
    post({ type: 'error', id: event.data.id, cmd: event.data.cmd, message: String(error && error.message || error) });
  });
};
