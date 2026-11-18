// Fills in missing course coordinates in src/data/courses.json using OpenStreetMap.
//
// Usage (from the project folder):
//   npm run find-coords              look up and save coordinates
//   npm run find-coords -- --dry-run show what would be found, change nothing
//
// A course is looked up when its lat or lng is missing, empty or 0.
// Only places OpenStreetMap tags as golf courses, whose name shares a distinctive word with the course
// name, are accepted. If none are found, or the matches are far apart and it cannot tell which is right,
// the course is left alone and listed for you to check.
//
// If a course has a town, the search uses it and only accepts golf courses within 15 km of that town.
// Add a town to any course that is not found or comes back wrong (and set its lat and lng back to 0).
// If no name matches but every golf course found near the town is the same place, that one is used.
//
// OpenStreetMap's free search service allows one request per second, so lookups are paced.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COURSES_FILE = path.join(ROOT, 'src/data/courses.json');
const SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'allmygolf-blog-find-coords/1.0';
const SAME_PLACE_KM = 2; // matches closer together than this are treated as the same course
const TOWN_KM = 15; // with a town, only golf courses this close to it count

const dryRun = process.argv.includes('--dry-run');
const data = JSON.parse(fs.readFileSync(COURSES_FILE, 'utf8'));

const missing = (v) => v == null || v === '' || Number(v) === 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Distance between two points in km
function km(a, b) {
	const rad = (d) => (d * Math.PI) / 180;
	const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// Any kind of place
let lastRequest = 0;
async function searchAll(query) {
	const delay = 1100 - (Date.now() - lastRequest);
	if (delay > 0) await wait(delay);
	lastRequest = Date.now();
	const url = `${SEARCH_URL}?${new URLSearchParams({ q: query, format: 'jsonv2', limit: '10' })}`;
	const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
	if (!res.ok) throw new Error(`OpenStreetMap search failed (${res.status})`);
	return (await res.json()).map((r) => ({
		lat: Number(r.lat),
		lng: Number(r.lon),
		name: r.name ?? '',
		label: r.display_name,
		golf: r.category === 'leisure' && r.type === 'golf_course',
	}));
}

// Golf courses only
const search = async (query) => (await searchAll(query)).filter((r) => r.golf);

// Words that say nothing about which course it is, so they never count as a match on their own
const COMMON_WORDS = new Set([
	'golf', 'club', 'course', 'courses', 'links', 'the', 'and', 'royal', 'championship', 'saint',
	'north', 'south', 'east', 'west', 'park', 'old', 'new', 'kings', 'queens', 'country', 'resort',
]);
const distinctiveWords = (text) =>
	new Set(
		text
			.toLowerCase()
			.normalize('NFKD')
			.replace(/['’]/g, '')
			.replace(/[^a-z0-9]+/g, ' ')
			.split(' ')
			.filter((w) => w.length >= 4 && !COMMON_WORDS.has(w)),
	);

// A result only counts if its own name shares a distinctive word with the course name.
// This stops matches like a course on a street that happens to share the name.
const sameName = (course, result) => {
	const wanted = distinctiveWords(course.name);
	return [...distinctiveWords(result.name)].some((w) => wanted.has(w));
};

// One result if all the matches are the same place, otherwise a few to check
function pick(matches, query) {
	const first = matches[0];
	if (matches.every((m) => km(first, m) < SAME_PLACE_KM)) return { ...first, query };
	return { ambiguous: matches.slice(0, 3), query };
}

// With a town: find the town, then golf courses near it
async function lookUpNearTown(course, shortName) {
	const town = (await searchAll(course.town))[0];
	if (!town) return { error: `town "${course.town}" not found on OpenStreetMap` };

	const queries = [`${course.name}, ${course.town}`, `${shortName}, ${course.town}`, `golf course in ${course.town}`].filter(
		(q, i, all) => all.indexOf(q) === i,
	);
	const nearby = [];
	for (const query of queries) {
		const results = (await search(query)).filter((m) => km(town, m) < TOWN_KM);
		const named = results.filter((m) => sameName(course, m));
		if (named.length > 0) return pick(named, query);
		nearby.push(...results.map((m) => ({ ...m, query })));
	}
	return nearby.length > 0 ? pick(nearby, nearby[0].query) : null;
}

// Without a town: the full name, then the part before any comma, then "golf course in <that part>"
async function lookUp(course) {
	const shortName = course.name.split(',')[0].trim();
	if (course.town) return lookUpNearTown(course, shortName);

	const queries = [course.name, shortName, `golf course in ${shortName}`].filter(
		(q, i, all) => q && all.indexOf(q) === i,
	);
	for (const query of queries) {
		const matches = (await search(query)).filter((m) => sameName(course, m));
		if (matches.length > 0) return pick(matches, query);
	}
	return null;
}

const found = [], notFound = [];
const todo = data.courses.filter((c) => missing(c.lat) || missing(c.lng));

if (todo.length === 0) {
	console.log('Every course already has coordinates. Nothing to do.');
	process.exit(0);
}

for (const course of todo) {
	process.stdout.write(`Looking up ${course.name}${course.town ? ` (${course.town})` : ''}... `);
	const hint = course.town ? '' : ', try adding a town';
	try {
		const result = await lookUp(course);
		if (!result) {
			console.log('no golf course found');
			notFound.push(`${course.id}: no golf course found${course.town ? ` near ${course.town}` : ''}${hint}`);
		} else if (result.error) {
			console.log('failed');
			notFound.push(`${course.id}: ${result.error}`);
		} else if (result.ambiguous) {
			console.log('more than one possible match');
			notFound.push(
				`${course.id}: several golf courses match "${result.query}"${hint}. Check these:\n` +
					result.ambiguous.map((m) => `      ${m.label} (${m.lat}, ${m.lng})`).join('\n'),
			);
		} else {
			course.lat = Number(result.lat.toFixed(6));
			course.lng = Number(result.lng.toFixed(6));
			console.log(`${course.lat}, ${course.lng}`);
			found.push(
				`${course.id}: ${course.lat}, ${course.lng}\n      ${result.label}\n      https://www.openstreetmap.org/?mlat=${course.lat}&mlon=${course.lng}#map=16/${course.lat}/${course.lng}`,
			);
		}
	} catch (error) {
		console.log('failed');
		notFound.push(`${course.id}: ${error.message}`);
	}
}

if (!dryRun && found.length > 0) {
	fs.writeFileSync(COURSES_FILE, JSON.stringify(data, null, 2) + '\n');
}

console.log(`\n${dryRun ? 'Dry run, nothing was saved.' : found.length > 0 ? 'Saved to src/data/courses.json.' : 'Nothing was saved.'}\n`);
console.log(`Found: ${found.length}`);
found.forEach((line) => console.log(`  + ${line}`));
if (notFound.length) {
	console.log(`\nNot found, left unchanged: ${notFound.length}`);
	notFound.forEach((line) => console.log(`  - ${line}`));
}
