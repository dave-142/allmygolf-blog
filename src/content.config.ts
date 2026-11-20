import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Decap can save a blank optional field as "" or null, so treat those as missing
const blank = (value: unknown) => (value === '' || value === null ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());

// Strips blank answers from a group of fields, and drops the group when nothing is left.
// Decap saves every field in a group as "" or null once it has been opened, even if nothing was typed
const compact = (value: unknown): unknown => {
	if (typeof value === 'string') return value.trim() === '' ? undefined : value;
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return blank(value);
	const entries = Object.entries(value)
		.map(([key, v]) => [key, compact(v)])
		.filter(([, v]) => v !== undefined);
	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

// The standard questions answered after a round. All optional
const roundNotes = z.preprocess(
	compact,
	z
		.object({
			// Shown as "The plan"
			purpose: z.string().optional(),
			didItWork: z.string().optional(),
			wentWell: z.string().optional(),
			// Shown as "What didn't"
			wentBadly: z.string().optional(),
			nextTime: z.string().optional(),
			holeWorthKnowing: z
				.object({
					hole: z.number().int().min(1).max(36).optional(),
					note: z.string().optional(),
				})
				.optional(),
			conditions: z.string().optional(),
		})
		.optional(),
);

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
				roundNotes,
				tags: z.array(z.string()).default([]),
			})
			.refine((post) => post.type !== 'round' || post.course, {
				message: 'Rounds must have a course',
				path: ['course'],
			}),
});

export const collections = { blog, courses };
