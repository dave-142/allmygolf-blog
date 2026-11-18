import type { ImageMetadata } from 'astro';
import { type CollectionEntry, getCollection } from 'astro:content';

export type Post = CollectionEntry<'blog'>;
export type Round = Post;
export type Course = CollectionEntry<'courses'>;

// One card in PostGrid
export interface Tile {
	href: string;
	title: string;
	description?: string;
	// Small line above the title: a date, plus optional extra text
	date?: Date;
	eyebrow?: string;
	photo?: ImageMetadata;
	featured?: boolean;
	// Big number in the corner, e.g. a score, with a tiny label under it
	badge?: string | number;
	badgeLabel?: string;
	// Used by the year filter on the rounds page
	year?: number;
}

export const courseHref = (id: string) => `/courses/${id}/`;
export const postHref = (id: string) => `/blog/${id}/`;

// The hero image is the cover photo. Without one, fall back to the first gallery photo
export const coverPhoto = (post: Post): ImageMetadata | undefined =>
	post.data.heroImage ?? post.data.gallery?.[0]?.image;

export const bestScore = (rounds: Post[]) => {
	const scores = rounds.map((r) => r.data.score).filter((s): s is number => s != null);
	return scores.length > 0 ? Math.min(...scores) : undefined;
};

export const newestFirst = (a: Post, b: Post) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf();

export async function getPosts() {
	return (await getCollection('blog')).sort(newestFirst);
}

// All rounds that have a course, newest first
export async function getRounds() {
	return (await getCollection('blog', (post) => post.data.type === 'round' && post.data.course != null)).sort(
		newestFirst,
	);
}

export async function getCourseMap() {
	return new Map((await getCollection('courses')).map((course) => [course.id, course]));
}

// A post as a PostGrid card
export function postTile(post: Post, courses: Map<string, Course>): Tile {
	const course = post.data.course && courses.get(post.data.course.id);
	return {
		href: postHref(post.id),
		title: post.data.title,
		description: post.data.description,
		date: post.data.pubDate,
		eyebrow: course ? course.data.name : post.data.type === 'equipment' ? 'Equipment' : undefined,
		photo: coverPhoto(post),
		featured: post.data.featured,
		badge: post.data.score,
		badgeLabel: post.data.score != null ? 'Score' : undefined,
		year: post.data.pubDate.getFullYear(),
	};
}

// Every course with its rounds (newest first). Played courses come first, most recent first
export async function getCourseSummaries() {
	const [courses, rounds] = await Promise.all([getCollection('courses'), getRounds()]);
	return courses
		.map((course) => {
			const played = rounds.filter((r) => r.data.course?.id === course.id);
			return { course, rounds: played, latest: played[0], best: bestScore(played) };
		})
		.sort((a, b) => (b.latest?.data.pubDate.valueOf() ?? 0) - (a.latest?.data.pubDate.valueOf() ?? 0));
}

// Headline numbers for the stats band
export async function getStats() {
	const summaries = await getCourseSummaries();
	const rounds = summaries.flatMap((s) => s.rounds);
	const played = summaries.filter((s) => s.rounds.length > 0);
	return {
		rounds: rounds.length,
		courses: played.length,
		best: bestScore(rounds),
	};
}
