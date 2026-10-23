// Reads content/stats/*.json (written by scripts/stats/) and shapes it for the homepage.
// Every source is optional: a missing file or field hides its tile instead of breaking the build.
import fs from 'node:fs';

const read = (f: string) => {
  try { return JSON.parse(fs.readFileSync(`./content/stats/${f}`, 'utf8')); } catch { return null; }
};

export const compact = (n: number | null | undefined, digits = 1) => {
  if (n == null) return '—';
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  const trim = (x: string) => (x.includes('.') ? x.replace(/0+$/, '').replace(/\.$/, '') : x);
  for (const [v, u] of units) if (Math.abs(n) >= v) return `${trim((n / v).toFixed(n / v >= 100 ? 0 : digits))}${u}`;
  return n.toLocaleString('en-US');
};
export const nyDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
export const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });

const lastDays = (n: number, end = new Date()) =>
  Array.from({ length: n }, (_, i) => new Date(end.getTime() - (n - 1 - i) * 864e5).toISOString().slice(0, 10));

export function claudeStats() {
  const c = read('claude.json');
  if (!c?.machines) return null;
  const byDay: Record<string, { total: number; output: number }> = {};
  for (const m of Object.values<any>(c.machines))
    for (const [d, v] of Object.entries<any>(m.days)) {
      const s = (byDay[d] ||= { total: 0, output: 0 });
      s.total += v.total; s.output += v.output;
    }
  const days = Object.keys(byDay).sort();
  if (!days.length) return null;
  const week = lastDays(7, new Date(`${nyDay(c.updated)}T12:00:00Z`)).map((d) => ({ day: d, total: byDay[d]?.total ?? 0 }));
  return {
    week,
    weekTotal: week.reduce((s, x) => s + x.total, 0),
    allTotal: days.reduce((s, d) => s + byDay[d].total, 0),
    allOutput: days.reduce((s, d) => s + byDay[d].output, 0),
    since: days[0],
    machines: Object.keys(c.machines).length,
    updated: c.updated as string,
  };
}

export function githubStats() {
  const g = read('public.json')?.github;
  if (!g?.days?.length) return null;
  const days: [string, number][] = g.days;
  // Columns of 7 (Sun..Sat), oldest first, like GitHub's own calendar.
  const first = new Date(`${days[0][0]}T00:00:00Z`).getUTCDay();
  const cells = [...Array(first).fill(null), ...days];
  const weeks: ([string, number] | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const max = Math.max(...days.map((d) => d[1]));
  // Quartile-ish steps so one huge day doesn't wash out the rest.
  const nonzero = days.map((d) => d[1]).filter((n) => n > 0).sort((a, b) => a - b);
  const q = (p: number) => nonzero[Math.min(nonzero.length - 1, Math.floor(p * nonzero.length))] ?? 1;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (n: number) => (n === 0 ? 0 : n <= cuts[0] ? 1 : n <= cuts[1] ? 2 : n <= cuts[2] ? 3 : 4);
  return { login: g.login, totalYear: g.total_year, last7: g.last_7, streak: g.streak, weeks, level, max, updated: g.updated };
}

export function garminStats() {
  const g = read('garmin.json');
  if (!g?.days) return null;
  const days = Object.keys(g.days).sort();
  const latest = (k: string) => { for (const d of [...days].reverse()) if (g.days[d]?.[k] != null) return { day: d, value: g.days[d][k] }; return null; };
  const avg = (k: string, n = 7) => {
    const v = days.slice(-n).map((d) => g.days[d]?.[k]).filter((x: any) => x != null);
    return v.length ? v.reduce((a: number, b: number) => a + b, 0) / v.length : null;
  };
  // Garmin days are local dates; end the chart on the newest day it has, not on today's UTC date.
  const steps = lastDays(7, new Date(`${days[days.length - 1]}T12:00:00Z`)).map((d) => ({ day: d, total: g.days[d]?.steps ?? 0 }));
  // Average over the chart's full days: the newest is usually today, still in progress when the job runs.
  const today = new Date(g.updated).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const full = steps.filter((d) => d.day !== today && g.days[d.day]?.steps != null);
  const avgSteps = full.length ? full.reduce((a, d) => a + d.total, 0) / full.length : null;
  const acts: any[] = g.activities || [];
  const year = new Date(g.updated).getUTCFullYear();
  const swims = acts.filter((a) => /swim/.test(a.type || ''));
  const label = (t: string) => ({ lap_swimming: 'Pool swims', open_water_swimming: 'Open water', road_biking: 'Rides', indoor_cycling: 'Indoor rides', walking: 'Walks', indoor_rowing: 'Rows', running: 'Runs', strength_training: 'Strength' } as Record<string, string>)[t] || t.replace(/_/g, ' ');
  const byType = Object.entries(acts.reduce((m: Record<string, number>, a) => ((m[a.type] = (m[a.type] || 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ type: label(t), n }));
  return {
    sleep: latest('sleep_s'), sleepScore: latest('sleep_score'), rhr: latest('resting_hr'), hrv: latest('hrv'), hrvStatus: latest('hrv_status'),
    readiness: latest('readiness'), avgSleepH: avg('sleep_s') != null ? avg('sleep_s')! / 3600 : null, avgSteps, steps,
    year, activities: acts.length, hours: acts.reduce((s, a) => s + (a.duration_s || 0), 0) / 3600,
    swimKm: swims.reduce((s, a) => s + (a.distance_m || 0), 0) / 1000, byType, lastActivity: acts.map((a) => a.date).filter(Boolean).sort().pop(),
    updated: g.updated as string,
  };
}

export const publicStats = () => read('public.json') || {};
// The same test Stats.astro uses to render at all, so the home page can number its sections without a gap.
export const hasStats = () => Boolean(githubStats() || claudeStats() || garminStats() || publicStats().overwatch);
export const stravaStats = () => read('strava.json');

// ---- More tiles -------------------------------------------------------------------------------

const projectTitles = (() => {
  const titles: Record<string, string> = { portfolio: 'This site' };
  for (const f of fs.readdirSync('./content/projects')) {
    if (!f.endsWith('.md')) continue;
    const m = fs.readFileSync(`./content/projects/${f}`, 'utf8').match(/\ntitle: (.*)/);
    if (m) titles[f.slice(0, -3)] = m[1].replace(/^"|"$/g, '');
  }
  return titles;
})();

const shares = (entries: [string, number][], top = 5, otherLabel = 'Other') => {
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, top), rest = sorted.slice(top).reduce((s, [, v]) => s + v, 0);
  const rows = head.map(([label, v]) => ({ label, value: v, share: v / total }));
  if (rest > 0) rows.push({ label: otherLabel, value: rest, share: rest / total });
  return rows;
};

export function claudeBreakdown() {
  const c = read('claude.json');
  if (!c?.machines) return null;
  const byProject: Record<string, number> = {}, byModel: Record<string, number> = {};
  for (const m of Object.values<any>(c.machines)) {
    for (const [dir, v] of Object.entries<number>(m.projects || {})) {
      const slug = c.labels?.[dir];
      const label = slug ? projectTitles[slug] ?? slug : 'Other work';
      byProject[label] = (byProject[label] || 0) + v;
    }
    for (const [model, v] of Object.entries<number>(m.models || {})) {
      const name = model.replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/-(\d+)$/, ' $1').replace(/^\w/, (x) => x.toUpperCase());
      byModel[name] = (byModel[name] || 0) + v;
    }
  }
  if (!Object.keys(byProject).length) return null;
  const projects = shares(Object.entries(byProject).filter(([k]) => k !== 'Other work'), 5, 'Other work');
  const other = byProject['Other work'] || 0;
  if (other) { const o = projects.find((p) => p.label === 'Other work'); if (o) o.value += other; else projects.push({ label: 'Other work', value: other, share: 0 }); }
  const total = projects.reduce((s, p) => s + p.value, 0) || 1;
  projects.forEach((p) => (p.share = p.value / total));
  return { projects, models: shares(Object.entries(byModel), 4) };
}

export function languageStats() {
  const g = read('public.json')?.github;
  if (!g?.languages) return null;
  // Notebooks and markup inflate byte counts without being much code; keep them out of the headline split.
  const skip = new Set(['Jupyter Notebook', 'HTML', 'CSS', 'TeX', 'Makefile', 'CMake', 'Dockerfile', 'Batchfile', 'PowerShell']);
  const rows = shares(Object.entries<number>(g.languages).filter(([l]) => !skip.has(l)), 6);
  return { rows, repos: g.public_repos, stars: g.stars, prs: g.merged_prs };
}

export function commitStats() {
  const c = read('commits.json');
  if (!c?.total) return null;
  const peak = c.hours.indexOf(Math.max(...c.hours));
  const night = [22, 23, 0, 1, 2, 3, 4].reduce((s: number, h: number) => s + c.hours[h], 0);
  const hourLabel = (h: number) => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`);
  const wdNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const busiestDay = wdNames[c.weekdays.indexOf(Math.max(...c.weekdays))];
  return { ...c, peak, peakLabel: hourLabel(peak), nightShare: night / c.total, busiestDay, hourLabel };
}

const kaggleNames: Record<string, string> = {
  'biohub-cell-tracking-during-development': 'Biohub Cell Tracking',
  'playground-series-s6e9': 'Playground S6E9',
  'gemma-4-developer-agent': 'Gemma 4 Developer Agent',
  '2026-ieee-big-data-traffic-flow-bench': 'TrafficFlowBench',
};
export function kaggleStats() {
  const k = read('kaggle.json');
  if (!k) return null;
  const name = (s: string) => kaggleNames[s] ?? s.replace(/-/g, ' ').replace(/^\w/, (x) => x.toUpperCase());
  return {
    finished: (k.finished || []).map((f: any) => ({ ...f, name: name(f.slug), pct: Math.ceil((f.rank / f.teams) * 100) })).sort((a: any, b: any) => a.pct - b.pct),
    active: (k.active || []).map((a: any) => ({ ...a, name: name(a.slug) })),
  };
}

export const gtnhStats = () => read('gtnh.json');
export const spotifyStats = () => read('spotify.json');
export const garminRaw = () => read('garmin.json') || {};

export function emulatorStats(extra: any[] = []) {
  const e = read('emulators.json');
  const rows: any[] = (e?.emulators || []).map((x: any) => ({ ...x, device: 'PC' }));
  for (const x of extra || []) {
    const twin = x.synced && rows.find((r) => r.name === x.name);
    if (twin) twin.device = `${twin.device} + ${x.device}`; // same library on another device: count once
    else if (!x.synced) rows.push(x);
  }
  for (let i = rows.length - 1; i >= 0; i--) if (!(rows[i].games > 0)) rows.splice(i, 1);
  if (!rows.length) return null;
  rows.sort((a, b) => b.games - a.games);
  return { rows, total: rows.reduce((s, x) => s + x.games, 0), count: rows.length };
}
