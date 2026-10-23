// Runs Pyodide off the main thread so the page stays responsive while a GPFA fit takes seconds.
// Same pinned runtime and CDN as the shared loader (../_shared/pyodide.js), so the browser cache
// is shared with the other Python demos; that loader injects a <script>, which a worker can't.
import { PYODIDE_URL } from '../_shared/pyodide.js';

const GLUE = [
  'mcp/__init__.py',
  'mcp/server/__init__.py',
  'mcp/server/mcpserver/__init__.py',
  'mcp/server/mcpserver/exceptions.py',
  'httpx/__init__.py',
  'plots_capture.py',
  'bridge.py',
  'selfcheck.py',
];
const SOURCE_ZIP = 'ephys-mcp-v0.5.1.zip';

let py = null;
let bridge = null;

const post = (msg) => self.postMessage(msg);
const status = (text, frac) => post({ type: 'status', text, frac });

// Count bytes as they arrive so the progress bar moves during the big downloads. The clone is
// read alongside the original, which Pyodide consumes untouched.
let received = 0;
const realFetch = self.fetch.bind(self);
self.fetch = async (...args) => {
  const res = await realFetch(...args);
  if (res.body) {
    const reader = res.clone().body.getReader();
    (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        post({ type: 'bytes', received });
      }
    })().catch(() => {});
  }
  return res;
};

async function init() {
  const t0 = performance.now();
  status('Downloading the Python runtime', 0);
  const { loadPyodide } = await import(`${PYODIDE_URL}pyodide.mjs`);
  py = await loadPyodide({ indexURL: PYODIDE_URL });
  status('Loading NumPy');
  await py.loadPackage('numpy', { messageCallback: () => {} });
  status('Loading SciPy');
  await py.loadPackage('scipy', { messageCallback: () => {} });

  status('Unpacking ephys-mcp v0.5.1');
  const zip = await realFetch(new URL(SOURCE_ZIP, import.meta.url));
  if (!zip.ok) throw new Error(`could not fetch ${SOURCE_ZIP} (${zip.status})`);
  py.unpackArchive(await zip.arrayBuffer(), 'zip', { extractDir: '/home/pyodide' });
  for (const rel of GLUE) {
    const res = await realFetch(new URL(`py/${rel}`, import.meta.url));
    if (!res.ok) throw new Error(`could not fetch py/${rel} (${res.status})`);
    const dest = `/home/pyodide/glue/${rel}`;
    py.FS.mkdirTree(dest.slice(0, dest.lastIndexOf('/')));
    py.FS.writeFile(dest, new Uint8Array(await res.arrayBuffer()));
  }

  status('Importing ephys_mcp.server');
  const t1 = performance.now();
  py.runPython("import sys; sys.path[:0] = ['/home/pyodide/glue', '/home/pyodide/ephys-mcp/src']");
  bridge = py.pyimport('bridge');
  const meta = JSON.parse(bridge.describe());
  post({
    type: 'ready',
    meta,
    loadMs: Math.round(t1 - t0),
    importMs: Math.round(performance.now() - t1),
  });
}

async function runTests() {
  await py.loadPackage('pytest', { messageCallback: () => {} });
  py.setStdout({ batched: (line) => post({ type: 'test-log', line }) });
  py.setStderr({ batched: (line) => post({ type: 'test-log', line }) });
  const selfcheck = py.pyimport('selfcheck');
  const t0 = performance.now();
  const out = JSON.parse(selfcheck.run((row) => post({ type: 'test-row', row: JSON.parse(row) })));
  py.setStdout();
  py.setStderr();
  return { ...out, ms: Math.round(performance.now() - t0) };
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') await init();
    else if (data.type === 'call') {
      const out = JSON.parse(bridge.call(data.name, JSON.stringify(data.kwargs)));
      post({ type: 'result', id: data.id, ...out });
    } else if (data.type === 'tests') {
      post({ type: 'tests-done', id: data.id, ...(await runTests()) });
    }
  } catch (err) {
    post({ type: 'fatal', id: data.id, error: String(err && err.message ? err.message : err).slice(-2000) });
  }
};
