// Runs a fixed sequence through the demo's API and prints canonical JSON (browser timings
// dropped): every scenario six cycles in both world modes, approve/reject/resume, the action
// log, row counts, and the scenario self-test. Run it on the browser bundle and on the
// reference build and compare the two outputs byte for byte. See ../../BUILD.md.
//
//   node trace.mjs bundle <demo dir>/agent.js <build dir>/node_modules > bundle.json
//   node trace.mjs ref <repo copy>/src/goals/__ref.mjs > ref.json
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const [, , which, modPath, nm] = process.argv;
const agent = await import(pathToFileURL(resolve(modPath)).href);
if (which === 'bundle') {
  const initSqlJs = require(resolve(nm, 'sql.js/dist/sql-wasm.js'));
  await agent.init(initSqlJs, resolve(nm, 'sql.js/dist/sql-wasm.wasm'));
}
const out = [];
const strip = (v) => {
  const c = structuredClone(v);
  delete c.ms;
  return c;
};
for (const mode of ['fresh', 'kept']) {
  for (const sc of agent.scenarios()) {
    const s = new agent.Session();
    for (let i = 0; i < 6; i++) out.push(strip(await s.runCycle(sc.name, mode)));
    if (sc.name === 'planner-needs-approval') {
      out.push(s.approve('task-planner-needs-approval'));
      for (let i = 0; i < 3; i++) out.push(strip(await s.runCycle(sc.name, mode)));
      out.push(s.reject('task-planner-needs-approval'));
    }
    out.push(s.resume(sc.world.task?.taskId ?? 'none'));
    out.push(strip(await s.runCycle(sc.name, mode)));
    out.push(s.actions(50), s.tableCounts(), s.tables());
    s.close();
  }
}
const st = await agent.selfTest();
out.push({ rows: st.rows, escalation: st.escalation });
process.stdout.write(JSON.stringify(out));
