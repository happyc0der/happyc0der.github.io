#!/usr/bin/env node
// Daily job on the Mac: collects the stats only this machine can see, commits them, pushes.
//   - Claude Code token usage from this Mac and, if reachable, the MSI laptop (ssh msi)
//   - Garmin daily numbers and activities through ~/Projects/garmin-connect-api's saved session
//   - Strava totals, if ~/.config/portfolio-stats/strava.json exists (its refresh token rotates, so it lives here, not in GitHub)
//   - the public stats too, so the committed fallback stays fresh
// Works in its own clone so it never touches the working copy you edit.
// Run: node scripts/stats/update-local.mjs [--no-push]
//      node scripts/stats/update-local.mjs --here   (collect into the current checkout; no git commands at all)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const HOME = os.homedir();
const CLONE = path.join(HOME, 'Library', 'Caches', 'portfolio-stats', 'repo');
const REMOTE = 'https://github.com/happyc0der/happyc0der.github.io.git';
const GARMIN_PROJECT = path.join(HOME, 'Projects', 'garmin-connect-api');
const UV = path.join(HOME, '.local', 'bin', 'uv');
const STRAVA_CONF = path.join(HOME, '.config', 'portfolio-stats', 'strava.json');
const here = process.argv.includes('--here');
const push = !here && !process.argv.includes('--no-push');
const log = (...a) => console.log(new Date().toISOString(), ...a);

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
const readJson = (f, dflt) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : dflt);
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n'); };
const isoDay = (d) => d.toISOString().slice(0, 10);
// Garmin counts days in local time, so its dates must be local too.
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 1. Fresh clone of main (skipped with --here).
if (!here) {
  if (!fs.existsSync(path.join(CLONE, '.git'))) {
    fs.mkdirSync(path.dirname(CLONE), { recursive: true });
    run('git', ['clone', '-q', REMOTE, CLONE]);
  }
  process.chdir(CLONE);
  run('git', ['fetch', '-q', 'origin']);
  run('git', ['reset', '-q', '--hard', 'origin/main']);
  if (!fs.existsSync('node_modules/yaml')) run('npm', ['ci', '--silent', '--no-audit', '--no-fund']);
}

// 2. Claude Code usage. Keep the larger value per machine and day: past usage never shrinks,
//    but Claude Code deletes old transcripts, so a later count can only miss data, not add it.
const claudeFile = 'content/stats/claude.json';
const claude = readJson(claudeFile, { machines: {} });
const counters = [['mac', () => run('node', ['scripts/stats/claude-usage.mjs'])]];
counters.push(['msi', () => run('ssh', ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', 'msi', 'node --input-type=module -'], { input: fs.readFileSync('scripts/stats/claude-usage.mjs') })]);
for (const [machine, count] of counters) {
  try {
    const { days } = JSON.parse(count());
    const kept = (claude.machines[machine] ||= { days: {} }).days;
    for (const [d, v] of Object.entries(days)) {
      const old = kept[d];
      kept[d] = old && old.total >= v.total ? old : v;
    }
    claude.machines[machine].updated = new Date().toISOString();
    log('claude', machine, Object.keys(days).length, 'days');
  } catch (e) {
    log('claude', machine, 'skipped:', e.message.split('\n')[0]);
  }
}
claude.updated = new Date().toISOString();
writeJson(claudeFile, claude);

// 3. Garmin: today and yesterday every run, plus any of the last 14 days still missing; activities since 1 January.
const garminFile = 'content/stats/garmin.json';
const garmin = readJson(garminFile, { days: {}, activities: [] });
const want = [];
for (let i = 0; i < 14; i++) {
  const d = localDay(new Date(Date.now() - i * 864e5));
  if (i < 2 || !garmin.days[d]) want.push(d);
}
try {
  const res = JSON.parse(run(UV, ['run', '-q', '--project', GARMIN_PROJECT, 'python', 'scripts/stats/garmin.py', '--only', ...want]).trim().split('\n').pop());
  Object.assign(garmin.days, res.days);
  garmin.activities = res.activities;
  const cutoff = localDay(new Date(Date.now() - 60 * 864e5));
  for (const d of Object.keys(garmin.days)) if (d > localDay(new Date())) delete garmin.days[d];
  for (const d of Object.keys(garmin.days)) if (d < cutoff) delete garmin.days[d];
  garmin.updated = new Date().toISOString();
  writeJson(garminFile, garmin);
  log('garmin', Object.keys(res.days).length, 'days,', res.activities.length, 'activities');
} catch (e) {
  log('garmin skipped:', e.message.split('\n')[0]);
}

// 4. Strava (optional).
if (fs.existsSync(STRAVA_CONF)) {
  try {
    const conf = readJson(STRAVA_CONF);
    const tok = await (await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: conf.client_id, client_secret: conf.client_secret, grant_type: 'refresh_token', refresh_token: conf.refresh_token }) })).json();
    if (!tok.access_token) throw new Error('token refresh failed');
    if (tok.refresh_token && tok.refresh_token !== conf.refresh_token) { conf.refresh_token = tok.refresh_token; fs.writeFileSync(STRAVA_CONF, JSON.stringify(conf, null, 1), { mode: 0o600 }); }
    const h = { authorization: `Bearer ${tok.access_token}` };
    const me = await (await fetch('https://www.strava.com/api/v3/athlete', { headers: h })).json();
    const s = await (await fetch(`https://www.strava.com/api/v3/athletes/${me.id}/stats`, { headers: h })).json();
    const pick = (t) => t && { count: t.count, distance_km: Math.round(t.distance / 100) / 10, moving_h: Math.round(t.moving_time / 360) / 10, elevation_m: Math.round(t.elevation_gain) };
    writeJson('content/stats/strava.json', { updated: new Date().toISOString(), ytd_run: pick(s.ytd_run_totals), ytd_ride: pick(s.ytd_ride_totals), all_run: pick(s.all_run_totals), all_ride: pick(s.all_ride_totals) });
    log('strava ok');
  } catch (e) {
    log('strava skipped:', e.message);
  }
}

// 5. Public stats, so the committed fallback is fresh.
try { run('node', ['scripts/stats/fetch-public.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] }); } catch (e) { log('public stats failed:', e.message.split('\n')[0]); }

// 6. Commit and push if anything changed.
if (here) { log('collected into', process.cwd()); process.exit(0); }
run('git', ['add', 'content/stats']);
const changed = run('git', ['status', '--porcelain', 'content/stats']).trim();
if (!changed) { log('no changes'); process.exit(0); }
run('git', ['-c', 'user.name=happyc0der', '-c', 'user.email=KeshavRajput.4@gmail.com', 'commit', '-q', '-m', 'Update homepage stats']);
if (!push) { log('committed locally, not pushed (--no-push)'); process.exit(0); }
try {
  run('git', ['push', '-q', 'origin', 'HEAD:main']);
} catch {
  // Someone pushed meanwhile: replay this one commit on top and try once more.
  run('git', ['pull', '-q', '--rebase', 'origin', 'main']);
  run('git', ['push', '-q', 'origin', 'HEAD:main']);
}
log('pushed');
