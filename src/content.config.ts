import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Every section of the site is a folder under content/. To add a section, add a collection here and a page under src/pages.
const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/projects' }),
  schema: z.object({
    title: z.string(),
    blurb: z.string(),
    repo: z.string().url().optional(),
    demo: z.string().url().optional(),     // an external live link (the app, a store page)
    // A live demo that runs on this site: public/demos/<slug>/index.html, loaded in an iframe on click.
    demo_embed: z.string().optional(),     // e.g. /demos/<slug>/
    demo_label: z.string().optional(),     // one sentence saying exactly what runs (shown under the demo)
    demo_height: z.number().optional(),    // iframe height in px, default 640
    demo_kind: z.string().optional(),      // six words or fewer from demo_label, for the home page's demo rows
    demo_also: z.string().optional(),      // a second, smaller demo of the same project, linked under the first
    demo_also_label: z.string().optional(),
    demo_poster: z.string().optional(),    // a screenshot of the running demo, /img/demo/<slug>.jpg (npm run images)
    image: z.string().optional(),
    image_url: z.string().optional(),      // the address the screenshot shows, when it is a live site; the frame bar prints it
    year: z.number(),
    order: z.number().default(99),
    featured: z.boolean().default(false),
    listed: z.boolean().default(true),     // false keeps it in the dataset and MASTER.md but off the site
    team: z.number().optional(),
    status: z.string().optional(),   // e.g. "in progress", "private", "not yet public"
    credit: z.string().optional(),   // who else owns part of it
    resume_credit: z.string().optional(), // one short line of the same for the PDFs
    stack: z.array(z.string()),
    tags: z.array(z.enum(['swe', 'ml', 'data', 'sec', 'quant'])),
    stats: z.array(z.string()).default([]),
    bullets: z.array(z.string()).max(3),
    resume_bullets: z.array(z.string()).max(3).optional(), // shorter versions for the one-page PDFs
  }),
});

const notes = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/notes' }),
  schema: z.object({ title: z.string(), date: z.date(), summary: z.string().optional() }),
});

export const collections = { projects, notes };
