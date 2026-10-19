#!/usr/bin/env node
// Sums Claude Code token usage per day (New York time) from the local transcripts in ~/.claude/projects.
// Prints JSON: { "machine": ..., "days": { "YYYY-MM-DD": { "total": n, "output": n } } }.
// Self-contained (no imports outside Node) so it can be piped over SSH: `ssh msi node - < claude-usage.mjs`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const root = process.argv[2] || path.join(os.homedir(), '.claude', 'projects');
const seen = new Set();
// Days follow New York time on every machine, so the Mac and the MSI agree on where a day ends.
const dayOf = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const days = {};

function* walk(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.jsonl')) yield p;
  }
}

for (const file of walk(root)) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('"usage"')) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const m = d.message;
    if (d.type !== 'assistant' || !m || !m.usage || !d.timestamp) continue;
    // A response is written once per content block; count it once.
    const key = `${m.id}|${d.requestId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const u = m.usage;
    const out = u.output_tokens || 0;
    const total = (u.input_tokens || 0) + out + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    const day = dayOf(d.timestamp);
    const slot = (days[day] ||= { total: 0, output: 0 });
    slot.total += total;
    slot.output += out;
  }
}

process.stdout.write(JSON.stringify({ machine: os.hostname(), days }));
