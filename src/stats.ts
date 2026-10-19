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
  const acts: any[] = g.activities || [];
  const year = new Date(g.updated).getUTCFullYear();
  const swims = acts.filter((a) => /swim/.test(a.type || ''));
  const label = (t: string) => ({ lap_swimming: 'Pool swims', open_water_swimming: 'Open water', road_biking: 'Rides', indoor_cycling: 'Indoor rides', walking: 'Walks', indoor_rowing: 'Rows', running: 'Runs', strength_training: 'Strength' } as Record<string, string>)[t] || t.replace(/_/g, ' ');
  const byType = Object.entries(acts.reduce((m: Record<string, number>, a) => ((m[a.type] = (m[a.type] || 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ type: label(t), n }));
  return {
    sleep: latest('sleep_s'), sleepScore: latest('sleep_score'), rhr: latest('resting_hr'), hrv: latest('hrv'), hrvStatus: latest('hrv_status'),
    readiness: latest('readiness'), avgSleepH: avg('sleep_s') != null ? avg('sleep_s')! / 3600 : null, avgSteps: avg('steps'), steps,
    year, activities: acts.length, hours: acts.reduce((s, a) => s + (a.duration_s || 0), 0) / 3600,
    swimKm: swims.reduce((s, a) => s + (a.distance_m || 0), 0) / 1000, byType, lastActivity: acts.map((a) => a.date).filter(Boolean).sort().pop(),
    updated: g.updated as string,
  };
}

export const publicStats = () => read('public.json') || {};
export const stravaStats = () => read('strava.json');
