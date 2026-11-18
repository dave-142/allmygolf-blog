import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Decap can save a blank optional field as "" or null, so treat those as missing
const blank = (value: unknown) => (value === '' || value === null ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());

// Courses are reference data, all kept in one file that Decap edits as a list
const courses = defineCollection({
	loader: file('src/data/courses.json', {
		parser: (text) => JSON.parse(text).courses,
	}),
	schema: z.object({
		name: z.string(),
		area: optional(z.string()),
		country: optional(z.string()),
		lat: optional(z.number()),
		lng: optional(z.number()),
		par: optional(z.number()),
		holes: optional(z.number()),
		yardage: optional(z.number()),
		type: optional(z.enum(['links', 'parkland', 'heathland', 'moorland'])),
		architect: optional(z.string()),
		website: optional(z.string()),
	}),
});

const blog = defineCollection({
	// Load Markdown files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z
			.object({
				title: z.string(),
				description: z.string(),
				// Transform string to Date object
				pubDate: z.coerce.date(),
				featured: z.boolean().default(false),
				updatedDate: z.coerce.date().optional(),
				heroImage: z.optional(image()),
				gallery: z
					.array(
						z.object({
							image: image(),
							caption: z.string().optional(),
						}),
					)
					.default([]),
				type: z.enum(['round', 'equipment']).default('round'),
				course: optional(reference('courses')),
				score: z.number().optional(),
				rating: z.number().min(1).max(5).optional(),
				verdict: z.string().optional(),
				tags: z.array(z.string()).default([]),
			})
			.refine((post) => post.type !== 'round' || post.course, {
				message: 'Rounds must have a course',
				path: ['course'],
			}),
});

export const collections = { blog, courses };
