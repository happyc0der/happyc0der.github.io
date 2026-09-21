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

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const link = (url, text) => `<a href="${url}">${esc(text)}</a>`;
const short = (url) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

const skillLabels = { languages: 'Languages', ml: 'ML', data: 'Data', systems: 'Systems', security: 'Security', tools: 'Tools' };

function render(key, cfg) {
  const track = cfg.track;
  // Two short lines, so no URL gets split across a line break.
  const contact =
    [esc(profile.location), link(`mailto:${profile.email}`, profile.email), esc(profile.phone)].join(' | ') +
    '<br>' +
    [link(profile.links.github, short(profile.links.github)), link(profile.links.linkedin, short(profile.links.linkedin)), link(`https://${profile.site}`, profile.site)].join(' | ');

  const education =
    profile.education
      .map(
        (e) =>
          // Dates sit inline: right-aligned dates get detached from the school by some parsers.
          `<div class="entry"><strong>${esc(e.school)}</strong><div>${esc(e.degree)}, ${esc(e.when)}. ${esc(e.score)}</div></div>`,
      )
      .join('\n') + `\n<p><strong>Coursework:</strong> ${esc(profile.coursework[track].join(', '))}</p>`;

  const projects = cfg.projects
    .map((slug) => {
      const { data } = matter(fs.readFileSync(path.join(root, 'content/projects', `${slug}.md`), 'utf8'));
      const title = data.team ? `${data.title} (team of ${data.team})` : data.title;
      const right = [data.repo ? link(data.repo, short(data.repo)) : '', data.year].filter(Boolean).join(', ');
      return (
        `<div class="entry"><div class="head"><span><strong>${esc(title)}</strong> <span class="stack">| ${esc(data.stack.slice(0, 6).join(', '))}</span></span> <span class="right">${right}</span></div>\n` +
        `<ul>${data.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>`
      );
    })
    .join('\n');

  const comps =
    '<ul>' +
    competitions
      .filter((c) => c.tags.includes(track))
      .map((c) => `<li><strong>${esc(c.name)}</strong>, ${c.year}. ${esc(c.result)}.</li>`)
      .join('') +
    '</ul>';

  const skills = cfg.skills.map((g) => `<p><strong>${skillLabels[g]}:</strong> ${esc(profile.skills[g].join(', '))}</p>`).join('\n');

  const acts = profile.activities.filter((a) => a.tags.includes(track));
  const activities = acts.length ? `<h2>Activities</h2>\n<ul>${acts.map((a) => `<li>${esc(a.text)}</li>`).join('')}</ul>` : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(profile.name)} - Resume</title><style>${css}</style></head><body>
<h1>${esc(profile.name)}</h1>
<div class="contact">${contact}</div>
<h2>Education</h2>
${education}
<h2>Projects</h2>
${projects}
<h2>Competitions</h2>
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
  fs.rmSync(profileDir, { recursive: true, force: true });
  if (!fs.existsSync(pdf)) throw new Error(`Edge did not produce ${pdf}`);
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
  let last = -1;
  for (const h of headings) {
    const i = flat.indexOf(h);
    if (i < 0) problems.push(`heading "${h}" not found in extracted text`);
    else if (i < last) problems.push(`heading "${h}" out of order`);
    last = Math.max(last, i);
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
  fs.writeFileSync(html, render(key, cfg));
  await printPdf(html, pdf);
  const r = check(pdf, cfg);
  fs.writeFileSync(path.join(outDir, `${cfg.file}.txt`), r.text);
  fs.copyFileSync(pdf, path.join(publicDir, `${cfg.file}.pdf`));
  console.log(`${key.padEnd(6)} ${r.pages} page, ${r.words} words ${r.problems.length ? 'PROBLEMS: ' + r.problems.join('; ') : 'ok'}`);
  if (r.problems.length) failed = true;
}
process.exit(failed ? 1 : 0);
