import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			gallery: z.array(z.object({
				image: image(),
				caption: z.string().optional(),
			})).default([]),
			type: z.enum(['round', 'course', 'equipment']).default('round'),
			course: z.string().optional(),
			score: z.number().optional(),
			rating: z.number().min(1).max(5).optional(),
			lat: z.number().optional(),
			lng: z.number().optional(),
			tags: z.array(z.string()).default([]),
		}),
});

export const collections = { blog };
