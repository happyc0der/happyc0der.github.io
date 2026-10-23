// Link-preview cards (1200x630) for every listed project: public/img/og/<project>.jpg.
// Used as og:image on the project pages, so a link on LinkedIn or anywhere else shows the
// project, its numbers and its screenshot. Re-run after adding a project or an image:  npm run og
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import matter from 'gray-matter';
import sharp from 'sharp';

const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'public/img/og');
fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'og-'));
const font = (pkg, file) => `file://${path.join(root, 'node_modules/@fontsource-variable', pkg, 'files', file)}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const card = (d, img) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Inter; src: url('${font('inter', 'inter-latin-wght-normal.woff2')}') format('woff2'); font-weight: 100 900; }
@font-face { font-family: Mono; src: url('${font('jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2')}') format('woff2'); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body { background: #0b0a10; color: #e7e5ee; font-family: Inter, system-ui, sans-serif; position: relative;
  display: grid; grid-template-columns: 430px 1fr; gap: 44px; padding: 56px 60px; }
body::before { content: ''; position: absolute; left: -160px; top: -200px; width: 760px; height: 560px; z-index: -1;
  background: radial-gradient(closest-side, rgba(139, 92, 246, 0.30), transparent); }
.left { display: flex; flex-direction: column; min-width: 0; }
.site { font-family: Mono; font-size: 22px; color: #8f8aa3; }
.site b { color: #a78bfa; font-weight: 400; }
h1 { font-size: 46px; line-height: 1.08; letter-spacing: -0.02em; font-weight: 700; margin-top: 34px; }
p { font-size: 22px; line-height: 1.4; color: #b4afc6; margin-top: 18px; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.stats { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
.stats span { font-family: Mono; font-size: 21px; color: #c4b5fd; padding-left: 14px; border-left: 3px solid #a78bfa; }
.shot { align-self: center; border-radius: 14px; overflow: hidden; border: 1px solid #262233; background: #1b1826;
  box-shadow: 0 30px 60px -30px rgba(139, 92, 246, 0.55); max-height: 518px; display: flex; }
.shot img { width: 100%; height: 100%; max-height: 518px; object-fit: contain; display: block; }
/* no screenshot: the site's text thumbnail, the headline number on a purple grid */
.hero { align-self: stretch; border-radius: 14px; border: 1px solid #262233; display: grid; place-items: center; padding: 30px; text-align: center;
  background: radial-gradient(closest-side at 35% 40%, rgba(139, 92, 246, 0.32), transparent), linear-gradient(#262233 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(90deg, #262233 1px, #1b1826 1px) 0 0 / 32px 32px; }
.hero span { font-family: Mono; font-size: 52px; line-height: 1.2; color: #c4b5fd; }
</style></head><body>
<div class="left">
  <div class="site"><b>~/</b>keshav · happyc0der.github.io</div>
  <h1>${esc(d.title)}</h1>
  <p>${esc(d.blurb)}</p>
  <div class="stats">${(d.stats || []).slice(0, 3).map((s) => `<span>${esc(s)}</span>`).join('')}</div>
</div>
${img ? `<div class="shot"><img src="file://${path.join(root, 'public', img)}"></div>` : `<div class="hero"><span>${esc((d.stats || [])[0] || d.title)}</span></div>`}
</body></html>`;

// A fresh Edge profile otherwise signs itself into the Mac's Microsoft account through the Keychain and syncs
// extensions; these flags keep each headless run signed out, with no extensions.
let made = 0;
for (const f of fs.readdirSync(path.join(root, 'content/projects')).filter((f) => f.endsWith('.md')).sort()) {
  const id = f.replace(/\.md$/, '');
  const { data: d } = matter(fs.readFileSync(path.join(root, 'content/projects', f), 'utf8'));
  if (d.listed === false) continue;
  const html = path.join(tmp, `${id}.html`), png = path.join(tmp, `${id}.png`);
  fs.writeFileSync(html, card(d, d.image || null));
  const r = spawnSync(EDGE, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${path.join(tmp, 'edge')}`,
    '--use-mock-keychain', '--password-store=basic', '--disable-sync', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--no-service-autorun',
    '--window-size=1200,630', '--virtual-time-budget=3000', `--screenshot=${png}`, `file://${html}`], { timeout: 60000 });
  if (!fs.existsSync(png)) { console.error(`${id}: no screenshot (${r.status ?? r.error})`); process.exitCode = 1; continue; }
  await sharp(png).resize(1200, 630).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(outDir, `${id}.jpg`));
  made++;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${made} cards in public/img/og/`);
