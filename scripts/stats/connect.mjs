// One-time connect for the optional stats sources: signs in once in the browser and writes
// ~/.config/portfolio-stats/<service>.json ({client_id, client_secret, refresh_token}, mode 600),
// which update-local.mjs reads every day. The secret is typed at a hidden prompt and never printed.
//
//   node scripts/stats/connect.mjs strava
//   node scripts/stats/connect.mjs spotify
//
// Register this exact redirect in the service's app settings first:  http://127.0.0.1:8765/callback
// (Strava asks only for the domain: 127.0.0.1)
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { Writable } from 'node:stream';
import { execFile } from 'node:child_process';

const PORT = 8765;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SERVICES = {
  strava: {
    apps: 'https://www.strava.com/settings/api',
    authorize: (id, state) => `https://www.strava.com/oauth/authorize?${new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: REDIRECT, approval_prompt: 'auto', scope: 'read,activity:read', state })}`,
    exchange: (id, secret, code) => fetch('https://www.strava.com/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: id, client_secret: secret, code, grant_type: 'authorization_code' }),
    }),
  },
  spotify: {
    apps: 'https://developer.spotify.com/dashboard',
    authorize: (id, state) => `https://accounts.spotify.com/authorize?${new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: REDIRECT, scope: 'user-top-read', state })}`,
    exchange: (id, secret, code) => fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64') },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
    }),
  },
};

const name = process.argv[2];
const svc = SERVICES[name];
if (!svc) {
  console.error('usage: node scripts/stats/connect.mjs strava|spotify');
  process.exit(2);
}

// A readline whose echo can be switched off, for the secret.
const out = new Writable({ write(chunk, enc, cb) { if (!out.muted) process.stdout.write(chunk, enc); cb(); } });
const rl = readline.createInterface({ input: process.stdin, output: out, terminal: process.stdin.isTTY });
const lines = rl[Symbol.asyncIterator]();   // buffers lines, so pasted or piped input is not lost between prompts
const ask = async (prompt, hidden = false) => {
  rl.setPrompt(prompt);            // readline redraws the line with its own prompt, which defaults to "> "
  process.stdout.write(prompt);
  out.muted = hidden;
  const { value } = await lines.next();
  out.muted = false;
  if (hidden) process.stdout.write('\n');
  return (value || '').trim();
};
console.log(`App settings (create the app there first): ${svc.apps}\nRedirect to register: ${REDIRECT}\n`);
const id = await ask('Client ID: ');
const secret = await ask('Client Secret (hidden): ', true);
rl.close();
if (!id || !secret) {
  console.error('Both the Client ID and the Client Secret are needed.');
  process.exit(2);
}

const state = crypto.randomBytes(16).toString('hex');
const url = svc.authorize(id, state);
const done = new Promise((resolve) => {
  const server = http.createServer(async (req, res) => {
    const q = new URL(req.url, REDIRECT).searchParams;
    if (!req.url.startsWith('/callback')) { res.writeHead(404).end(); return; }
    const finish = (status, msg, ok) => { res.writeHead(status, { 'content-type': 'text/plain' }).end(msg); server.close(); resolve(ok); };
    if (q.get('state') !== state) return finish(400, 'This sign-in did not come from the connect script. Run it again.', false);
    if (q.get('error') || !q.get('code')) return finish(400, `${name} said: ${q.get('error') || 'no code'}`, false);
    try {
      const tok = await (await svc.exchange(id, secret, q.get('code'))).json();
      if (!tok.refresh_token) return finish(400, `${name} refused the exchange: ${tok.message || tok.error_description || tok.error || 'no refresh token'}`, false);
      const dir = path.join(os.homedir(), '.config', 'portfolio-stats');
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ client_id: id, client_secret: secret, refresh_token: tok.refresh_token }, null, 1), { mode: 0o600 });
      finish(200, `Connected ${name}. You can close this tab.`, true);
    } catch (e) {
      finish(500, `Could not reach ${name}: ${e.message}`, false);
    }
  });
  server.listen(PORT, '127.0.0.1');
  setTimeout(() => { server.close(); resolve(false); }, 5 * 60 * 1000).unref();
});

if (process.argv.includes('--no-open')) console.log(`Open this to sign in:\n${url}`);
else execFile('open', [url]);
console.log(`Waiting for the ${name} sign-in in your browser (5 minutes)...`);
const ok = await done;
console.log(ok ? `Saved ~/.config/portfolio-stats/${name}.json. The daily stats job picks it up at 06:15.`
  : `Not connected. Nothing was saved.`);
process.exit(ok ? 0 : 1);
