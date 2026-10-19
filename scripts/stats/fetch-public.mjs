#!/usr/bin/env node
// Fetches the public stats for the homepage into content/stats/public.json.
// Each source is independent: if one fails or is not configured, its previous value is kept.
// Env: GITHUB_TOKEN (or `gh auth token` locally); optional TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET, STEAM_API_KEY.
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
    // Languages (bytes of code) and stars across my own public, non-fork repos; merged pull requests anywhere.
    const h = { authorization: `bearer ${token}` };
    let repos = [];
    for (let page = 1; page < 10; page++) {
      const batch = await json(`https://api.github.com/users/${login}/repos?type=owner&per_page=100&page=${page}`, { headers: h });
      repos.push(...batch);
      if (batch.length < 100) break;
    }
    repos = repos.filter((r) => !r.fork && !r.archived && r.size > 0);
    const languages = {};
    for (const r of repos) {
      try { for (const [l, b] of Object.entries(await json(r.languages_url, { headers: h }))) languages[l] = (languages[l] || 0) + b; } catch {}
    }
    const prs = await json(`https://api.github.com/search/issues?q=${encodeURIComponent(`is:pr author:${login} is:merged`)}&per_page=1`, { headers: h });
    return {
      login, total_year: cal.totalContributions, last_7: days.slice(-7).reduce((s, x) => s + x[1], 0), streak, days,
      public_repos: repos.length, stars: repos.reduce((s, r) => s + r.stargazers_count, 0),
      merged_prs: prs.total_count, languages: Object.fromEntries(Object.entries(languages).sort((a, b) => b[1] - a[1])),
    };
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
  async pypi(packages) {
    const out = [];
    for (const name of packages) {
      const [recent, overall] = await Promise.all([
        json(`https://pypistats.org/api/packages/${name}/recent`),
        json(`https://pypistats.org/api/packages/${name}/overall?mirrors=false`),
      ]);
      out.push({ name, last_month: recent.data.last_month, last_week: recent.data.last_week, total: overall.data.reduce((s, x) => s + x.downloads, 0) });
    }
    return { packages: out };
  },
  async connectiq(apps) {
    const out = [];
    for (const { name, id } of apps) {
      const a = await json(`https://apps.garmin.com/api/appsLibraryExternalServices/api/asw/apps/${id}`);
      out.push({ name, id, downloads: a.downloadCount ?? null, rating: a.averageRating ?? null, reviews: a.reviewCount ?? null, released: a.releaseDate ? new Date(a.releaseDate).toISOString().slice(0, 10) : null, version: a.latestExternalVersion ?? null });
    }
    return { apps: out };
  },
  async uptime(sites) {
    // One probe per run; the last 60 results are kept, so the uptime figure grows with the daily runs.
    const out = [];
    for (const { name, url } of sites) {
      const t0 = Date.now();
      let status = 0;
      try { status = (await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'happyc0der-portfolio-stats' } })).status; } catch {}
      const check = { at: new Date().toISOString(), ok: status >= 200 && status < 400, status, ms: Date.now() - t0 };
      const old = (prev.uptime?.sites || []).find((x) => x.url === url);
      const history = [...(old?.history || []), check].slice(-60);
      out.push({ name, url, last: check, history, up: history.filter((c) => c.ok).length, checks: history.length });
    }
    return { sites: out };
  },
  async steam(steamid) {
    const key = process.env.STEAM_API_KEY;
    if (!key) throw new Error('STEAM_API_KEY not set');
    const owned = await json(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamid}&include_appinfo=1`);
    const recent = await json(`https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${key}&steamid=${steamid}&count=5`);
    const games = owned.response?.games || [];
    return {
      steamid, games: games.length, hours: Math.round(games.reduce((s, g) => s + (g.playtime_forever || 0), 0) / 60),
      top: games.sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 5).map((g) => ({ name: g.name, hours: Math.round(g.playtime_forever / 60) })),
      recent: (recent.response?.games || []).map((g) => ({ name: g.name, hours_2w: Math.round((g.playtime_2weeks || 0) / 6) / 10 })),
    };
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
    // How often he streams, from saved past broadcasts (Twitch keeps them 7 to 60 days). Never fails the source.
    let recent = null;
    try {
      const [vods, chan] = await Promise.all([
        json(`https://api.twitch.tv/helix/videos?user_id=${user.id}&type=archive&first=100`, { headers: h }),
        json(`https://api.twitch.tv/helix/channels?broadcaster_id=${user.id}`, { headers: h }),
      ]);
      const hours = (d) => { const m = String(d || '').match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/); return (+(m?.[1] || 0)) + (+(m?.[2] || 0)) / 60 + (+(m?.[3] || 0)) / 3600; };
      const week = (vods.data || []).filter((v) => Date.now() - new Date(v.created_at).getTime() < 7 * 86400e3);
      recent = { streams_7d: week.length, hours_7d: Math.round(week.reduce((a, v) => a + hours(v.duration), 0) * 10) / 10,
                 last_stream: vods.data?.[0]?.created_at ?? null, category: chan.data?.[0]?.game_name || null };
    } catch {}
    return { login, display_name: user.display_name, followers: fol.total ?? null, live: live.data.length > 0, game: live.data[0]?.game_name ?? null, ...(recent || {}) };
  },
};

for (const [name, fn] of Object.entries(sources)) {
  const conf = cfg[name];
  if (!conf || (typeof conf === 'string' && !conf.trim()) || (Array.isArray(conf) && !conf.length)) { delete out[name]; continue; }
  try {
    out[name] = { ...(await fn(conf)), updated: new Date().toISOString() };
    log(name, 'ok');
  } catch (e) {
    log(name, 'kept previous value:', e.message);
  }
}

fs.mkdirSync('content/stats', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
