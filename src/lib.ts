import fs from 'node:fs';
import YAML from 'yaml';

const read = (file: string) => YAML.parse(fs.readFileSync(`./content/${file}`, 'utf8'));

export const profile = read('profile.yaml');
export const competitions = read('competitions.yaml');
export const resumes = read('resumes.yaml');

export const tagNames: Record<string, string> = { swe: 'software', ml: 'ml', data: 'data', sec: 'security', quant: 'quant' };

// True once content/notes/ has a post. Checked on disk so an empty section builds quietly.
export const hasNotes = fs.readdirSync('./content/notes').some((f) => f.endsWith('.md'));

// What a card shows in its corner: an ongoing status as a pill, otherwise just the year.
export const badge = (d: { status?: string; year: number }) =>
  d.status && /in progress|not public|hackathon|maintained/i.test(d.status) ? { text: d.status, live: /in progress/i.test(d.status) } : { text: String(d.year), live: false };

// "Keshav Rajput" -> "KR" for the monogram; first and last name for the hero's two lines.
export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').toUpperCase();
export const nameParts = (name: string) => {
  const i = name.lastIndexOf(' ');
  return i < 0 ? [name, ''] : [name.slice(0, i), name.slice(i + 1)];
};

// Project washes rotate through six purple-family hues in project order (tokens --hue-1 to --hue-6).
export const hue = (i: number) => `var(--hue-${(i % 6) + 1})`;

// Two-digit position labels: 1 -> "01".
export const pad = (n: number) => String(n).padStart(2, '0');

// The first paragraph of a project's markdown, for the scrub-reveal "Overview". Only a plain paragraph
// qualifies (not a heading, list, quote, table or code); its inline code becomes <code>. The project page
// hides the same paragraph in the rendered body, so nothing is shown twice and nothing is lost.
export const firstParagraph = (body = '') => {
  const block = body.trim().split(/\n\s*\n/)[0]?.trim() ?? '';
  if (!block || /^(#|[-*+]\s|\d+\.\s|>|```|\||<|!\[)/.test(block)) return null;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc(block.replace(/\s*\n\s*/g, ' ')).replace(/`([^`]+)`/g, '<code>$1</code>');
};

// A paragraph's sentences: split after . ! or ? where the next sentence starts with a capital, a digit,
// a backtick or a bracket. Good enough for the content here (no "e.g. X" or "Dr. Y" mid-sentence).
export const sentences = (text = '') => text.replace(/\s*\n\s*/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9`("<])/).filter(Boolean);

// A project's first paragraph, cut after its first `n` sentences: [the head, the rest], both as HTML in the
// same form as firstParagraph. The head is the project page's scrub Overview; the rest opens the story.
export const splitParagraph = (body = '', n = 2) => {
  const html = firstParagraph(body);
  if (!html) return null;
  const parts = sentences(html);
  return { head: parts.slice(0, n).join(' '), rest: parts.slice(n).join(' ') };
};

// "0.45 ms handshake" -> ["0.45 ms", "handshake"]: the leading figure (with a unit word) and the words after
// it, for a big number over a mono label. The text is unchanged, only cut in two; no figure gives [s, ''].
export const splitStat = (s = '') => {
  const m = s.match(/^(\S*\d\S*(?:\s(?:ms|us|s|min|h|KB|MB|GB|fps|pts|%))?)\s+(.+)$/);
  return m ? [m[1], m[2]] : [s, ''];
};

// Short result for a competition row, in the content's own words: a final rank, or the stated status.
export const resultShort = (result: string) => {
  const final = result.match(/Final rank ([\d,]+) of ([\d,]+) teams \(top (\d+)%\)/);
  if (final) return `Top ${final[3]}%`;
  if (/result pending/i.test(result)) return 'Result pending';
  if (/in progress/i.test(result)) return 'In progress';
  return null;
};

// profile.yaml writes skills as flow lists, so "statistics (hypothesis testing, regression)" arrives as two
// items split at the comma (the resumes join them back with ", "). Re-join pieces until brackets balance.
export const skillList = (list: string[]) => {
  const out: string[] = [];
  let open = 0;
  for (const item of list) {
    if (open > 0) out[out.length - 1] += `, ${item}`;
    else out.push(item);
    open += (item.match(/\(/g) ?? []).length - (item.match(/\)/g) ?? []).length;
  }
  return out;
};

// Skills as chips for the home page: the bracketed detail moves to a tooltip ("statistics" with
// "hypothesis testing, regression"), a name already shown in an earlier group is dropped (its detail joins
// the first one's), and each group keeps its first `max` chips; the rest come back as `more`.
export type Chip = { name: string; detail: string };
export const skillChips = (skills: Record<string, string[]>, order: string[], max = 8) => {
  const seen = new Map<string, Chip>();
  return order.filter((k) => skills[k]).map((key) => {
    const chips: Chip[] = [];
    for (const raw of skillList(skills[key])) {
      const m = raw.match(/^(.*?)\s*\((.*)\)\s*$/);
      const chip = { name: (m ? m[1] : raw).trim(), detail: m ? m[2].trim() : '' };
      const id = chip.name.toLowerCase();
      const first = seen.get(id);
      if (first) {
        if (chip.detail.includes(first.detail)) first.detail = chip.detail;
        else if (chip.detail && !first.detail.includes(chip.detail)) first.detail = `${first.detail}; ${chip.detail}`;
        continue;
      }
      seen.set(id, chip);
      chips.push(chip);
    }
    return { key, shown: chips.slice(0, max), more: chips.slice(max) };
  });
};

// The marquee: the first few short skills of each group in profile.yaml, parentheticals dropped, no repeats.
export const marqueeSkills = (skills: Record<string, string[]>, perGroup = 3) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of Object.values(skills).map(skillList)) {
    let n = 0;
    for (const raw of list) {
      const s = raw.replace(/\s*\(.*?\)\s*/g, ' ').trim();
      if (n >= perGroup || s.length > 22 || seen.has(s.toLowerCase())) continue;
      seen.add(s.toLowerCase());
      out.push(s);
      n++;
    }
  }
  return out;
};
