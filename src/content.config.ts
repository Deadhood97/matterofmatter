import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    published: z.coerce.date(),
    updated: z.coerce.date().optional(),
    author: z.string().default('ddHd'),
    status: z.enum(['LIVE', 'DRAFT']).default('LIVE'),
    source: z.enum(['blogger', 'google-docs', 'manual']).optional(),
    googleDocId: z.string().optional(),
    labels: z.array(z.string()).default([]),
    description: z.string().optional(),
  }),
});

export const collections = { blog };
