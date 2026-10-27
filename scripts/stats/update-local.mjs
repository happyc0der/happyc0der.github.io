#!/usr/bin/env node
// Daily job on the Mac: collects the stats only this machine can see, commits them, pushes.
//   - Claude Code token usage from this Mac and, if reachable, the MSI laptop (ssh msi)
//   - Garmin daily numbers, activities, records and body composition (Hume Pod weigh-ins synced to Garmin)
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
// Minimal RFC 4180 reader: quoted fields may hold commas and doubled quotes.
const parseCsv = (text) => {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') q = false; else field += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some((f) => f !== '')) rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
};

// Maps a session's working directory to a portfolio project slug, or null when it is not one.
function labelProjects(dirs) {
  const projects = fs.readdirSync('content/projects').filter((f) => f.endsWith('.md')).map((f) => {
    const text = fs.readFileSync(`content/projects/${f}`, 'utf8');
    const repo = (text.match(/\nrepo: (\S+)/) || [])[1] || '';
    const listed = !/\nlisted: false/.test(text);
    return { slug: f.slice(0, -3), repo: repo.toLowerCase().replace(/\.git$/, ''), name: repo.split('/').pop()?.toLowerCase(), listed };
  }).filter((p) => p.listed);
  const aliases = { 'pq authentication protocol': 'mldsa-auth', doomce: 'doom-ports', 'happyc0der.github.io': 'portfolio', portfolio: 'portfolio' };
  const remote = (dir) => {
    try { return run('git', ['-C', dir, 'remote', 'get-url', 'origin'], { stdio: ['ignore', 'pipe', 'ignore'] }).trim().toLowerCase().replace(/\.git$/, ''); } catch { return null; }
  };
  const out = {};
  for (const dir of dirs) {
    const base = dir.split(/[\\/]/).filter(Boolean).pop()?.toLowerCase() || '';
    let slug = aliases[base] ?? null;
    if (!slug && fs.existsSync(dir)) {
      const r = remote(dir);
      if (r) slug = r.includes('happyc0der.github.io') ? 'portfolio' : projects.find((p) => p.repo && r.endsWith(p.repo.replace('https://github.com/', '')))?.slug ?? null;
    }
    if (!slug) slug = projects.find((p) => p.name === base || p.slug === base)?.slug ?? null;
    out[dir] = slug;
  }
  return out;
}
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
// Per-directory totals name private and personal folders, so they stay on this Mac (mode 600); the public file
// gets only portfolio project slugs and one "other" total. The first run seeds it from the old public layout.
const CLAUDE_DIRS = path.join(HOME, '.config', 'portfolio-stats', 'claude-dirs.json');
const claudeDirs = readJson(CLAUDE_DIRS, null) ?? Object.fromEntries(Object.entries(claude.machines).map(([k, m]) => [k, claude.labels ? { ...(m.projects || {}) } : {}]));
const counters = [['mac', () => run('node', ['scripts/stats/claude-usage.mjs'])]];
counters.push(['msi', () => run('ssh', ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', 'msi', 'node --input-type=module -'], { input: fs.readFileSync('scripts/stats/claude-usage.mjs') })]);
for (const [machine, count] of counters) {
  try {
    const { days, projects = {}, models = {} } = JSON.parse(count());
    const m = (claude.machines[machine] ||= { days: {} });
    for (const [d, v] of Object.entries(days)) {
      const old = m.days[d];
      m.days[d] = old && old.total >= v.total ? old : v;
    }
    // Same rule for the per-directory and per-model totals: never let a cleaned-up log shrink them.
    for (const [kept, totals] of [[(claudeDirs[machine] ||= {}), projects], [(m.models ||= {}), models]]) {
      for (const [k, v] of Object.entries(totals)) kept[k] = Math.max(kept[k] || 0, v);
    }
    claude.machines[machine].updated = new Date().toISOString();
    log('claude', machine, Object.keys(days).length, 'days');
  } catch (e) {
    log('claude', machine, 'skipped:', e.message.split('\n')[0]);
  }
}
// Name only the projects that are on the portfolio; everything else is one "other" total.
const slugOf = labelProjects(Object.values(claudeDirs).flatMap((d) => Object.keys(d)));
for (const [machine, dirs] of Object.entries(claudeDirs)) {
  const bySlug = {};
  for (const [dir, v] of Object.entries(dirs)) { const k = slugOf[dir] ?? 'other'; bySlug[k] = (bySlug[k] || 0) + v; }
  if (claude.machines[machine]) claude.machines[machine].projects = bySlug;
}
delete claude.labels;
claude.updated = new Date().toISOString();
writeJson(claudeFile, claude);
fs.mkdirSync(path.dirname(CLAUDE_DIRS), { recursive: true });
fs.writeFileSync(CLAUDE_DIRS, JSON.stringify(claudeDirs, null, 1), { mode: 0o600 });

// 3. Garmin: today and yesterday every run, plus any of the last 14 days still missing; activities since 1 January.
const garminFile = 'content/stats/garmin.json';
const garmin = readJson(garminFile, { days: {}, activities: [] });
const want = [];
for (let i = 0; i < 14; i++) {
  const d = localDay(new Date(Date.now() - i * 864e5));
  if (i < 2 || !garmin.days[d]) want.push(d);
}
try {
  const res = JSON.parse(run(UV, ['run', '-q', '--project', GARMIN_PROJECT, 'python', 'scripts/stats/garmin.py', '--only', ...want, '--records', '--body']).trim().split('\n').pop());
  Object.assign(garmin.days, res.days);
  garmin.activities = res.activities;
  if (res.records) garmin.records = res.records;
  if (res.body !== undefined) garmin.body = res.body;
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
    if (!me.id) throw new Error(`athlete: ${me.message || 'no id'}`);
    const s = await (await fetch(`https://www.strava.com/api/v3/athletes/${me.id}/stats`, { headers: h })).json();
    if (!s.all_run_totals) throw new Error(`stats: ${s.message || 'no totals'}`); // an error body, not totals: keep the previous file
    const pick = (t) => t && { count: t.count, distance_km: Math.round(t.distance / 100) / 10, moving_h: Math.round(t.moving_time / 360) / 10, elevation_m: Math.round(t.elevation_gain) };
    writeJson('content/stats/strava.json', { updated: new Date().toISOString(), ytd_run: pick(s.ytd_run_totals), ytd_ride: pick(s.ytd_ride_totals), all_run: pick(s.all_run_totals), all_ride: pick(s.all_ride_totals) });
    log('strava ok');
  } catch (e) {
    log('strava skipped:', e.message);
  }
}

// 5. Kaggle: finished competitions with their final rank; running ones only by name (ranks wait until they are final).
try {
  const csv = parseCsv(run('kaggle', ['competitions', 'list', '--group', 'entered', '--csv']));
  const head = csv.shift();
  const col = (n) => head.indexOf(n);
  const rows = csv.map((c) => ({
    ref: c[col('ref')], deadline: c[col('deadline')], teams: Number(c[col('teamCount')]), rank: Number(c[col('userRank')]) || null, category: c[col('category')],
  })).filter((r) => r.ref);
  const now = Date.now();
  const nameOf = (ref) => ref.split('/').pop();
  // The CLI prints deadlines in UTC without a zone; the site shows New York dates.
  const utc = (s) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
  const nyDate = (s) => utc(s).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  writeJson('content/stats/kaggle.json', {
    updated: new Date().toISOString(),
    finished: rows.filter((r) => utc(r.deadline).getTime() < now && r.rank).map((r) => ({ slug: nameOf(r.ref), rank: r.rank, teams: r.teams, ended: nyDate(r.deadline) })),
    // Submitted-to only (rank > 0); the rank itself is not stored until the competition ends.
    active: rows.filter((r) => utc(r.deadline).getTime() >= now && r.rank).map((r) => ({ slug: nameOf(r.ref), ends: nyDate(r.deadline), teams: r.teams })),
  });
  log('kaggle ok');
} catch (e) { log('kaggle skipped:', e.message.split('\n')[0]); }

// 6. When I commit: hour-of-day and weekday histogram (New York time) of my commits in the last year, across every repo I can see.
try {
  const since = new Date(Date.now() - 365 * 864e5).toISOString();
  const repos = run('gh', ['api', '--paginate', 'user/repos?per_page=100&affiliation=owner,collaborator,organization_member', '--jq', '.[] | select(.size > 0) | .full_name']).trim().split('\n').filter(Boolean);
  const hours = Array(24).fill(0), weekdays = Array(7).fill(0);
  let total = 0;
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23', weekday: 'short' });
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const seen = new Set();
  for (const repo of repos) {
    let lines = [];
    try { lines = run('gh', ['api', '--paginate', `repos/${repo}/commits?author=happyc0der&since=${since}&per_page=100`, '--jq', '.[] | [.sha, .commit.author.date] | @tsv'], { stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean); } catch { continue; }
    for (const line of lines) {
      const [sha, date] = line.split('\t');
      if (seen.has(sha)) continue; // forks share history
      seen.add(sha);
      const parts = Object.fromEntries(fmt.formatToParts(new Date(date)).map((p) => [p.type, p.value]));
      hours[Number(parts.hour)]++; weekdays[wd[parts.weekday]]++; total++;
    }
  }
  writeJson('content/stats/commits.json', { updated: new Date().toISOString(), since: since.slice(0, 10), total, hours, weekdays, repos: repos.length });
  log('commit hours ok:', total, 'commits');
} catch (e) { log('commit hours skipped:', e.message.split('\n')[0]); }

// 7. gtnh-agent progress, read from its database on the MSI.
try {
  const res = JSON.parse(run('ssh', ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', 'msi', 'node -'], { input: fs.readFileSync('scripts/stats/gtnh-progress.cjs') }).trim());
  writeJson('content/stats/gtnh.json', { updated: new Date().toISOString(), ...res });
  log('gtnh ok:', res.quests, 'quests');
} catch (e) { log('gtnh skipped:', e.message.split('\n')[0]); }

// 7b. Emulators on the MSI: names and game counts only, never titles.
try {
  const raw = run('ssh', ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', 'msi', 'powershell -NoProfile -Command -'], { input: fs.readFileSync('scripts/stats/emulators.ps1') });
  const res = JSON.parse(raw.trim().split('\n').filter((l) => l.trim().startsWith('{')).pop());
  writeJson('content/stats/emulators.json', { updated: new Date().toISOString(), ...res });
  log('emulators ok:', res.emulators.map((e) => `${e.name} ${e.games}`).join(', '));
} catch (e) { log('emulators skipped:', e.message.split('\n')[0]); }

// 8. Spotify (optional): ~/.config/portfolio-stats/spotify.json with client_id, client_secret, refresh_token.
const SPOTIFY_CONF = path.join(HOME, '.config', 'portfolio-stats', 'spotify.json');
if (fs.existsSync(SPOTIFY_CONF)) {
  try {
    const conf = readJson(SPOTIFY_CONF);
    const tok = await (await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + Buffer.from(`${conf.client_id}:${conf.client_secret}`).toString('base64') }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conf.refresh_token }) })).json();
    if (!tok.access_token) throw new Error('token refresh failed');
    if (tok.refresh_token && tok.refresh_token !== conf.refresh_token) { conf.refresh_token = tok.refresh_token; fs.writeFileSync(SPOTIFY_CONF, JSON.stringify(conf, null, 1), { mode: 0o600 }); }
    // An outage answers 503 with an error body; treat anything but a list as a failure so the previous lists stay.
    const get = async (u) => {
      const r = await fetch(`https://api.spotify.com/v1/${u}`, { headers: { authorization: `Bearer ${tok.access_token}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(j.items)) throw new Error(`${u.split('?')[0]}: HTTP ${r.status} ${j.error?.message || ''}`.trim());
      return j;
    };
    const [artists, tracks] = await Promise.all([get('me/top/artists?time_range=short_term&limit=5'), get('me/top/tracks?time_range=short_term&limit=5')]);
    if (!artists.items.length && !tracks.items.length) throw new Error('both top lists empty');
    writeJson('content/stats/spotify.json', {
      updated: new Date().toISOString(),
      artists: (artists.items || []).map((a) => ({ name: a.name, url: a.external_urls?.spotify })),
      tracks: (tracks.items || []).map((t) => ({ name: t.name, artist: t.artists?.[0]?.name, url: t.external_urls?.spotify })),
    });
    log('spotify ok');
  } catch (e) { log('spotify kept previous value:', e.message); }
}

// 9. Public stats, so the committed fallback is fresh.
try { run('node', ['scripts/stats/fetch-public.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] }); } catch (e) { log('public stats failed:', e.message.split('\n')[0]); }

// 10. Commit and push if anything changed.
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
