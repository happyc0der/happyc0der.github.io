import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Every section of the site is a folder under content/. To add a section, add a collection here and a page under src/pages.
const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/projects' }),
  schema: z.object({
    title: z.string(),
    blurb: z.string(),
    repo: z.string().url().optional(),
    demo: z.string().url().optional(),
    image: z.string().optional(),
    year: z.number(),
    order: z.number().default(99),
    featured: z.boolean().default(false),
    team: z.number().optional(),
    status: z.string().optional(),   // e.g. "in progress", "private", "not yet public"
    credit: z.string().optional(),   // who else owns part of it
    stack: z.array(z.string()),
    tags: z.array(z.enum(['swe', 'ml', 'data', 'sec', 'quant'])),
    stats: z.array(z.string()).default([]),
    bullets: z.array(z.string()).max(3),
  }),
});

const notes = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/notes' }),
  schema: z.object({ title: z.string(), date: z.date(), summary: z.string().optional() }),
});

export const collections = { projects, notes };
