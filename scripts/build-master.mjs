// Writes content/MASTER.md: every project, competition and fact in one file, generated from content/.
// Edit the sources, not MASTER.md. Usage: node scripts/build-master.mjs
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import matter from 'gray-matter';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => YAML.parse(fs.readFileSync(path.join(root, 'content', f), 'utf8'));
const profile = read('profile.yaml');
const competitions = read('competitions.yaml');
const resumes = read('resumes.yaml');
const dir = path.join(root, 'content/projects');
const projects = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ slug: f.replace(/\.md$/, ''), ...matter(fs.readFileSync(path.join(dir, f), 'utf8')) }))
  .sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99) || a.slug.localeCompare(b.slug));

const onResumes = (slug) => Object.entries(resumes).filter(([, r]) => r.projects.includes(slug)).map(([k]) => k);
const out = [];
out.push(`# ${profile.name}: master data`, '', `Generated from content/ on ${new Date().toISOString().slice(0, 10)}. Do not edit; edit the source files and run \`npm run master\`.`, '');
out.push('## Profile', '', `- ${profile.tagline}`, `- ${profile.location}, ${profile.email}, ${profile.phone}`, `- ${profile.links.github}`, `- ${profile.links.linkedin}`, `- https://${profile.site}`, '');
out.push('## Education', '');
for (const e of profile.education) out.push(`- ${e.school}: ${e.degree}, ${e.when}. ${e.score}`);
out.push('', '## Competitions', '');
for (const c of competitions) out.push(`- ${c.name} (${c.year}): ${c.result}`);
out.push('', `## Projects (${projects.length})`, '');
for (const p of projects) {
  const d = p.data;
  const meta = [d.year, d.status, d.team && `team of ${d.team}`, d.featured && 'featured', `tags: ${d.tags.join(' ')}`, onResumes(p.slug).length ? `resumes: ${onResumes(p.slug).join(' ')}` : 'on no resume'].filter(Boolean).join(' · ');
  out.push(`### ${d.title} (\`${p.slug}\`)`, '', d.blurb, '', `- ${meta}`);
  if (d.repo) out.push(`- ${d.repo}`);
  if (d.demo) out.push(`- live: ${d.demo}`);
  if (d.credit) out.push(`- credit: ${d.credit}`);
  out.push(`- stack: ${d.stack.join(', ')}`);
  if (d.stats?.length) out.push(`- stats: ${d.stats.join(' · ')}`);
  for (const b of d.bullets) out.push(`- ${b}`);
  out.push('', p.content.trim(), '');
}
out.push('## Skills', '');
for (const [k, v] of Object.entries(profile.skills)) out.push(`- ${k}: ${v.join(', ')}`);
out.push('', '## Activities', '');
for (const a of profile.activities) out.push(`- ${a.text}`);
fs.writeFileSync(path.join(root, 'content/MASTER.md'), out.join('\n') + '\n');
console.log(`content/MASTER.md: ${projects.length} projects, ${competitions.length} competitions`);
