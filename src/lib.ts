import fs from 'node:fs';
import YAML from 'yaml';

const read = (file: string) => YAML.parse(fs.readFileSync(`./content/${file}`, 'utf8'));

export const profile = read('profile.yaml');
export const competitions = read('competitions.yaml');
export const resumes = read('resumes.yaml');

export const tagNames: Record<string, string> = { swe: 'software', ml: 'ml', data: 'data', sec: 'security', quant: 'quant' };

// True once content/notes/ has a post. Checked on disk so an empty section builds quietly.
export const hasNotes = fs.readdirSync('./content/notes').some((f) => f.endsWith('.md'));
