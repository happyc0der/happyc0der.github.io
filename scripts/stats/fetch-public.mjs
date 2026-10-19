#!/usr/bin/env node
// Fetches the public stats for the homepage into content/stats/public.json.
// Each source is independent: if one fails or is not configured, its previous value is kept.
// Env: GITHUB_TOKEN (or `gh auth token` locally), TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET (optional).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';

const OUT = 'content/stats/public.json';
const cfg = YAML.parse(fs.readFileSync('content/profile.yaml', 'utf8')).stats || {};
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const out = { ...prev };
const log = (...a) => console.error('[stats]', ...a);

async function json(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'user-agent': 'happyc0der-portfolio-stats', ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function ghToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim(); } catch { return null; }
}

const sources = {
  async github(login) {
    const token = ghToken();
    if (!token) throw new Error('no GitHub token');
    const q = `query($l:String!){user(login:$l){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}`;
    const d = await json('https://api.github.com/graphql', { method: 'POST', headers: { authorization: `bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: q, variables: { l: login } }) });
    if (d.errors) throw new Error(JSON.stringify(d.errors));
    const cal = d.data.user.contributionsCollection.contributionCalendar;
    const days = cal.weeks.flatMap((w) => w.contributionDays.map((x) => [x.date, x.contributionCount]));
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i][1] > 0) streak++;
      else if (i === days.length - 1) continue; // today may not have a commit yet
      else break;
    }
    return { login, total_year: cal.totalContributions, last_7: days.slice(-7).reduce((s, x) => s + x[1], 0), streak, days };
  },
  async overwatch({ name, player_id }) {
    const id = encodeURIComponent(player_id);
    const [sum, st] = await Promise.all([
      json(`https://overfast-api.tekrop.fr/players/${id}/summary`),
      json(`https://overfast-api.tekrop.fr/players/${id}/stats/summary`),
    ]);
    const pc = sum.competitive?.pc || {};
    const ranks = ['open', 'tank', 'damage', 'support'].filter((r) => pc[r]).map((r) => ({ role: r, division: pc[r].division, tier: pc[r].tier }));
    const g = st.general || {};
    return { name, title: sum.title, season: pc.season, ranks, games: g.games_played, winrate: g.winrate, kda: g.kda, hours: g.time_played ? Math.round(g.time_played / 3600) : null };
  },
  async codeforces(handle) {
    const [info, rating] = await Promise.all([
      json(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`),
      json(`https://codeforces.com/api/user.rating?handle=${encodeURIComponent(handle)}`),
    ]);
    const u = info.result[0];
    return { handle, rating: u.rating ?? null, max_rating: u.maxRating ?? null, rank: u.rank ?? null, contests: rating.result.length };
  },
  async leetcode(username) {
    const query = `query($u:String!){matchedUser(username:$u){submitStatsGlobal{acSubmissionNum{difficulty count}}} userContestRanking(username:$u){rating attendedContestsCount topPercentage}}`;
    const d = await json('https://leetcode.com/graphql', { method: 'POST', headers: { 'content-type': 'application/json', referer: 'https://leetcode.com' }, body: JSON.stringify({ query, variables: { u: username } }) });
    const ac = Object.fromEntries((d.data.matchedUser?.submitStatsGlobal?.acSubmissionNum || []).map((x) => [x.difficulty.toLowerCase(), x.count]));
    const c = d.data.userContestRanking;
    return { username, solved: ac.all ?? null, easy: ac.easy ?? null, medium: ac.medium ?? null, hard: ac.hard ?? null, contest_rating: c ? Math.round(c.rating) : null, contests: c?.attendedContestsCount ?? null };
  },
  async twitch(login) {
    const { TWITCH_CLIENT_ID: id, TWITCH_CLIENT_SECRET: secret } = process.env;
    if (!id || !secret) throw new Error('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not set');
    const tok = await json(`https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`, { method: 'POST' });
    const h = { 'client-id': id, authorization: `Bearer ${tok.access_token}` };
    const user = (await json(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, { headers: h })).data[0];
    if (!user) throw new Error(`no Twitch user ${login}`);
    const [fol, live] = await Promise.all([
      json(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}`, { headers: h }),
      json(`https://api.twitch.tv/helix/streams?user_id=${user.id}`, { headers: h }),
    ]);
    return { login, display_name: user.display_name, followers: fol.total ?? null, live: live.data.length > 0, game: live.data[0]?.game_name ?? null };
  },
};

for (const [name, fn] of Object.entries(sources)) {
  const conf = cfg[name];
  if (!conf || (typeof conf === 'string' && !conf.trim())) { delete out[name]; continue; }
  try {
    out[name] = { ...(await fn(conf)), updated: new Date().toISOString() };
    log(name, 'ok');
  } catch (e) {
    log(name, 'kept previous value:', e.message);
  }
}

fs.mkdirSync('content/stats', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
