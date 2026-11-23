import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

// The CMS saves a blank optional field as "" or null, so treat those as missing
const blank = (value: unknown) => (value === '' || value === null ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());

// Courses are reference data, all kept in one file that Decap edits as a list
const courses = defineCollection({
	loader: file('src/data/courses.json', {
		parser: (text) => JSON.parse(text).courses,
	}),
	schema: z.object({
		name: z.string(),
		// Only used by the find-coords script, never shown on the site
		town: optional(z.string()),
		lat: optional(z.number()),
		lng: optional(z.number()),
		par: optional(z.number()),
		holes: optional(z.number()),
		yardage: optional(z.number()),
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
				updatedDate: z.coerce.date().optional(),
				heroImage: optional(image()),
				gallery: z
					.array(
						z.object({
							image: image(),
							caption: optional(z.string()),
						}),
					)
					.default([]),
				type: z.enum(['round', 'equipment']).default('round'),
				course: optional(reference('courses')),
				score: optional(z.number()),
				rating: optional(z.number().min(1).max(5)),
				verdict: optional(z.string()),
				// Free text in the CMS, so tidied here: lowercase, trimmed, no blanks or repeats
				tags: z
					.preprocess(blank, z.array(z.string()).default([]))
					.transform((tags) => [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]),
			})
			.refine((post) => post.type !== 'round' || post.course, {
				message: 'Rounds must have a course',
				path: ['course'],
			}),
});

export const collections = { blog, courses };
