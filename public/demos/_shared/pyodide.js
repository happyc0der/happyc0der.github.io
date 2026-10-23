// Shared Pyodide loader for the Python demos. One pinned version for every demo, so a visitor
// who opens two demos downloads the runtime once (the browser caches it by URL).
//
//   import { startPython } from '../_shared/pyodide.js';
//   const py = await startPython({
//     packages: ['numpy'],                       // from the Pyodide distribution
//     files: { 'bandits/agents.py': './py/bandits/agents.py' },  // repo files to place in the virtual FS
//     onStatus: (text, fraction) => { ... },     // progress for the poster's bar
//   });
//   py.runPython('import bandits.agents');
//
// Files are written under /home/pyodide/<path>, which is on sys.path, so packages import as in the repo.
export const PYODIDE_VERSION = '0.29.5';
export const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let runtime = null;

const loadScript = (src) => new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = src;
  s.onload = resolve;
  s.onerror = () => reject(new Error(`could not load ${src}`));
  document.head.appendChild(s);
});

export async function startPython({ packages = [], files = {}, onStatus = () => {} } = {}) {
  const steps = 2 + packages.length + Object.keys(files).length;
  let done = 0;
  const tick = (text) => onStatus(text, Math.min(1, ++done / steps));

  if (!runtime) {
    onStatus(`Downloading Python ${PYODIDE_VERSION} runtime`, 0);
    await loadScript(`${PYODIDE_URL}pyodide.js`);
    runtime = await globalThis.loadPyodide({ indexURL: PYODIDE_URL });
  }
  tick('Python runtime ready');

  for (const p of packages) {
    onStatus(`Loading ${p}`, done / steps);
    await runtime.loadPackage(p, { messageCallback: () => {} });
    tick(`Loaded ${p}`);
  }

  for (const [dest, url] of Object.entries(files)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`could not fetch ${url} (${res.status})`);
    const path = `/home/pyodide/${dest}`;
    runtime.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
    runtime.FS.writeFile(path, new Uint8Array(await res.arrayBuffer()));
    tick(`Placed ${dest}`);
  }
  tick('Ready');
  return runtime;
}
