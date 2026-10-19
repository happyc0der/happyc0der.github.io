// Read-only summary of gtnh-agent's own SQLite log, run on the machine that plays (piped over SSH: `ssh msi node - < this`).
// A quest reward can only be claimed once the quest is complete, so claimed rewards count completed quests.
const path = require('path');
const root = path.join(require('os').homedir(), 'Projects', 'gtnh-agent');
const Database = require(path.join(root, 'node_modules', 'better-sqlite3'));
const db = new Database(path.join(root, 'data', 'agent.sqlite'), { readonly: true, fileMustExist: true });
const one = (sql) => db.prepare(sql).get();
const out = {
  quests: one(`SELECT COUNT(DISTINCT json_extract(action_json,'$.args.questId')) AS n FROM action_logs WHERE action_type='CLAIM_QUEST_REWARD' AND status='succeeded'`).n,
  actions_ok: one(`SELECT COUNT(*) AS n FROM action_logs WHERE status='succeeded'`).n,
  actions_rejected: one(`SELECT COUNT(*) AS n FROM action_logs WHERE status='rejected'`).n,
  cycles: one(`SELECT COUNT(*) AS n FROM agent_events WHERE kind='CYCLE_END'`).n,
  first: one(`SELECT MIN(created_at) AS t FROM action_logs`).t,
  last: one(`SELECT MAX(created_at) AS t FROM action_logs`).t,
};
console.log(JSON.stringify(out));
