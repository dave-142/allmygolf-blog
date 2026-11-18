import { type CollectionEntry, getCollection } from 'astro:content';

export type Round = CollectionEntry<'blog'>;
export type Course = CollectionEntry<'courses'>;

export const courseHref = (id: string) => `/courses/${id}/`;

// First gallery photo, then the hero image, otherwise none
export const coverPhoto = (post: Round) => post.data.gallery[0]?.image ?? post.data.heroImage;

// "St Andrews, Scotland", or whichever parts exist
export const courseLocation = (course: Course) =>
	[course.data.area, course.data.country].filter(Boolean).join(', ');

export const bestScore = (rounds: Round[]) => {
	const scores = rounds.map((r) => r.data.score).filter((s): s is number => s != null);
	return scores.length > 0 ? Math.min(...scores) : undefined;
};

// All rounds that have a course, newest first
export async function getRounds() {
	return (await getCollection('blog', (post) => post.data.type === 'round' && post.data.course != null)).sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);
}

// Every course with its rounds (newest first). Played courses come first, most recent first
export async function getCourseSummaries() {
	const [courses, rounds] = await Promise.all([getCollection('courses'), getRounds()]);
	return courses
		.map((course) => {
			const played = rounds.filter((r) => r.data.course?.id === course.id);
			return { course, rounds: played, latest: played[0] };
		})
		.sort((a, b) => (b.latest?.data.pubDate.valueOf() ?? 0) - (a.latest?.data.pubDate.valueOf() ?? 0));
}
