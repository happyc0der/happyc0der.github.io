// Builds one PDF per entry in content/resumes.yaml, then checks each one the way an ATS would read it.
// Usage: node scripts/build-resumes.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import YAML from 'yaml';
import matter from 'gray-matter';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => YAML.parse(fs.readFileSync(path.join(root, 'content', f), 'utf8'));
const profile = read('profile.yaml');
const competitions = read('competitions.yaml');
const resumes = read('resumes.yaml');
const css = fs.readFileSync(path.join(root, 'resume/resume.css'), 'utf8');
const outDir = path.join(root, 'resume/out');
const publicDir = path.join(root, 'public/resume');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';

// Plain ASCII in the PDFs: older resume parsers mangle or drop these.
const ascii = { '±': '+/-', '²': '2', '³': '3', '×': 'x', '→': 'to', '≥': '>=', '≤': '<=', 'µ': 'u', '–': '-', '—': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '·': ',', '≈': '~' };
const escRaw = (s) => String(s).replace(/[^\x00-\x7F]/g, (c) => ascii[c] ?? c).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const esc = escRaw;
const link = (url, text) => `<a href="${url}">${escRaw(text)}</a>`;
const short = (url) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

const skillLabels = { languages: 'Languages', ml: 'ML', ai: 'LLMs', data: 'Data', systems: 'Systems', security: 'Security', testing: 'Testing', quant: 'Quant', tools: 'Tools' };

function render(key, cfg, fontPt = 9.6) {
  const track = cfg.track;
  // Two short lines, so no URL gets split across a line break.
  const contact1 = [esc(profile.location), link(`mailto:${profile.email}`, profile.email), esc(profile.phone)].join(' | ');
  const contact2 = [link(profile.links.github, short(profile.links.github)), link(profile.links.linkedin, short(profile.links.linkedin)), link(`https://${profile.site}`, profile.site)].join(' | ');
  const headline = cfg.headline ? `<div class="headline">${esc(cfg.headline)}</div>` : '';

  const education =
    profile.education
      .map(
        (e) =>
          `<div class="entry"><div class="head"><strong>${esc(e.school)}</strong> <span class="right">${esc(e.when)}</span></div>` +
          `<div class="head"><span>${esc(e.degree)}</span> <span class="right">${esc(e.score)}</span></div></div>`,
      )
      .join('\n') + `\n<p><strong>Coursework:</strong> ${esc(profile.coursework[track].join(', '))}</p>`;

  const projects = cfg.projects
    .map((slug) => {
      const { data } = matter(fs.readFileSync(path.join(root, 'content/projects', `${slug}.md`), 'utf8'));
      const qualifier = [data.team && `team of ${data.team}`, data.status].filter(Boolean).join(', ');
      const title = qualifier ? `${data.title} (${qualifier})` : data.title;
      // The head must stay on one line, or parsers lose the title: trim the stack list to fit, and put a long link under it.
      const url = data.repo ? short(data.repo) : '';
      let longUrl = url.length > 48;
      const stack = data.stack.slice(0, 5);
      const headLen = () => title.length + 3 + stack.join(', ').length + (url && !longUrl ? 3 + url.length : 0);
      while (stack.length > 2 && headLen() > 90) stack.pop();
      if (url && !longUrl && headLen() > 90) longUrl = true;
      const left = `<strong>${escRaw(title)}</strong> <span class="stack">| ${escRaw(stack.join(', '))}${url && !longUrl ? ' | ' + link(data.repo, url) : ''}</span>`;
      return (
        `<div class="entry"><div class="head"><span>${left}</span> <span class="right">${data.year}</span></div>\n` +
        (longUrl ? `<div class="stack">${link(data.repo, url)}</div>` : '') +
        ((data.resume_credit ?? data.credit) ? `<div class="credit">${esc(data.resume_credit ?? data.credit)}</div>` : '') +
        `<ul>${(data.resume_bullets ?? data.bullets).map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>`
      );
    })
    .join('\n');

  const compItems = competitions.filter((c) => c.tags.includes(track) && !(c.project && cfg.projects.includes(c.project))).slice(0, 3);
  const comps = compItems.length
    ? `<h2>Competitions</h2>\n<ul>${compItems.map((c) => `<li><strong>${esc(c.name)}</strong>, ${c.year}. ${esc(c.result)}.</li>`).join('')}</ul>`
    : '';

  const skills = cfg.skills.map((g) => `<p><strong>${skillLabels[g]}:</strong> ${esc(profile.skills[g].join(', '))}</p>`).join('\n');

  const acts = profile.activities.filter((a) => a.tags.includes(track));
  const activities = acts.length ? `<h2>Leadership and activities</h2>\n<ul>${acts.map((a) => `<li>${esc(a.text)}</li>`).join('')}</ul>` : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(profile.name)} - Resume</title><style>${css}\nbody{font-size:${fontPt}pt}</style></head><body>
<h1>${esc(profile.name)}</h1>
<div class="contact">${contact1}</div>
${headline}
<div class="contact">${contact2}</div>
<h2>Education</h2>
${education}
<h2>Projects</h2>
${projects}
${comps}
<h2>Skills</h2>
${skills}
${activities}
</body></html>`;
}

// Headless Edge writes the PDF but does not always exit, so wait for the file and then stop it.
async function printPdf(html, pdf) {
  fs.rmSync(pdf, { force: true });
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-edge-'));
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profileDir}`, '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, `file://${html}`], { stdio: 'ignore' });
  let size = -1;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const now = fs.existsSync(pdf) ? fs.statSync(pdf).size : -1;
    if (now > 0 && now === size) break;
    size = now;
  }
  child.kill('SIGKILL');
  await new Promise((r) => child.once('exit', r));
  for (let i = 0; i < 10; i++) {
    try { fs.rmSync(profileDir, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 300)); }
  }
  if (!fs.existsSync(pdf)) throw new Error(`Edge did not produce ${pdf}`);
}

// Hyphenated tokens that straddled a line end in the extracted text ("ChaCha20-" / "Poly1305"): keyword matchers lose them.
function straddledTokens(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const m = lines[i].match(/(?:^|\s)([A-Za-z0-9+.]+(?:-[A-Za-z0-9+.]+)*-)$/);
    const n = lines[i + 1].match(/^([A-Za-z0-9+.]+(?:-[A-Za-z0-9+.]+)*)/);
    if (m && n) out.push(m[1] + n[1]);
  }
  return out;
}
// Put a line break before the first occurrence of each token in the page text (never inside a tag), so it moves down whole.
function breakBefore(html, tokens) {
  const parts = html.split(/(<[^>]+>)/);
  for (const token of tokens) {
    const re = new RegExp('(?<![\\w-])' + token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])');
    for (let i = 0; i < parts.length; i += 2) {
      if (re.test(parts[i]) && !/<br>$/.test(parts[i - 1] ?? '')) { parts[i] = parts[i].replace(re, '<br>' + token); break; }
    }
  }
  return parts.join('');
}

// What an ATS sees: plain text, in order. Fails the build if something is off.
function check(pdf, cfg) {
  const gs = (args) => execFileSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-dNOSAFER', ...args], { encoding: 'utf8' });
  const text = gs(['-sDEVICE=txtwrite', '-sOutputFile=-', pdf]);
  const pages = Number(gs(['-dNODISPLAY', `--permit-file-read=${pdf}`, '-c', `(${pdf}) (r) file runpdfbegin pdfpagecount = quit`]).trim());
  const problems = [];
  if (pages !== 1) problems.push(`${pages} pages, want 1`);
  const flat = text.replace(/\s+/g, ' ');
  const headings = ['EDUCATION', 'PROJECTS', 'COMPETITIONS', 'SKILLS'];
  const optional = new Set(['COMPETITIONS']);
  let last = -1;
  for (const h of headings) {
    const i = flat.indexOf(h);
    if (i < 0) { if (!optional.has(h)) problems.push(`heading "${h}" not found in extracted text`); continue; }
    if (i < last) problems.push(`heading "${h}" out of order`);
    last = Math.max(last, i);
  }
  // A project's link must extract after its title, never before (it would attach to the previous entry).
  for (const slug of cfg.projects) {
    const { data } = matter(fs.readFileSync(path.join(root, 'content/projects', `${slug}.md`), 'utf8'));
    if (!data.repo) continue;
    const t = flat.indexOf(data.title + ' ('), u = flat.indexOf(short(data.repo));
    if (t >= 0 && u >= 0 && u < t) problems.push(`link for ${slug} extracts before its title`);
  }
  for (const must of [profile.name, profile.email, 'New York University']) {
    if (!flat.includes(must)) problems.push(`"${must}" not extractable`);
  }
  if (/[\uFFFD\uFB00-\uFB04]/.test(text)) problems.push('ligatures or unknown glyphs in extracted text');
  const words = flat.split(' ').length;
  return { pages, words, problems, text };
}

let failed = false;
for (const [key, cfg] of Object.entries(resumes)) {
  const html = path.join(outDir, `${cfg.file}.html`);
  const pdf = path.join(outDir, `${cfg.file}.pdf`);
  // Fit to one page: shrink the type a little, then drop the last project, and say what happened.
  const projects = [...cfg.projects];
  let r, note = '';
  outer: while (projects.length) {
    for (const fontPt of [9.6, 9.3, 9.0, 8.8]) {
      let page = render(key, { ...cfg, projects }, fontPt);
      fs.writeFileSync(html, page);
      await printPdf(html, pdf);
      r = check(pdf, cfg);
      if (r.pages !== 1) continue;
      // Up to three passes moving straddled tokens down whole; keep the last version that still fits one page.
      for (let pass = 0; pass < 3; pass++) {
        const tokens = straddledTokens(r.text);
        if (!tokens.length) break;
        const candidate = breakBefore(page, tokens);
        if (candidate === page) break;
        fs.writeFileSync(html, candidate);
        await printPdf(html, pdf);
        const r2 = check(pdf, cfg);
        if (r2.pages !== 1) { fs.writeFileSync(html, page); await printPdf(html, pdf); r = check(pdf, cfg); note += ' (kept a hyphen break)'; break; }
        page = candidate; r = r2; note += ` (moved ${tokens.join(', ')})`;
      }
      note = (fontPt !== 9.6 ? ` (type ${fontPt}pt)` : '') + note;
      break outer;
    }
    note += ` (dropped ${projects.pop()})`;
  }
  fs.writeFileSync(path.join(outDir, `${cfg.file}.txt`), r.text);
  fs.copyFileSync(pdf, path.join(publicDir, `${cfg.file}.pdf`));
  console.log(`${key.padEnd(6)} ${r.pages} page, ${r.words} words${note} ${r.problems.length ? 'PROBLEMS: ' + r.problems.join('; ') : 'ok'}`);
  if (r.problems.length) failed = true;
}
process.exit(failed ? 1 : 0);
