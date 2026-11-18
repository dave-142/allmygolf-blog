// Imports round photos from folders on disk and creates a blog post for each round.
//
// Usage (from the project folder):
//   npm run import-photos -- "C:\path\to\Sorted"            create posts and copy photos
//   npm run import-photos -- "C:\path\to\Sorted" --dry-run  show what would happen, change nothing
//
// Expected layout: <source>/<course id>/<YYYY-MM-DD>/<photos>
// - Only folders named exactly like a course id in src/data/courses.json are imported. Others are ignored.
// - Each date folder becomes one round post. If a post for that course and date already exists, it is skipped,
//   so running this again is safe.
// - Photos are resized to a 1600px long edge, turned the right way up, and stripped of metadata (including GPS),
//   then saved in src/assets/uploads/ with lowercase names, the same way Decap saves uploads.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COURSES_FILE = path.join(ROOT, 'src/data/courses.json');
const POSTS_DIR = path.join(ROOT, 'src/content/blog');
const UPLOADS_DIR = path.join(ROOT, 'src/assets/uploads');
const UPLOADS_PUBLIC = '../../assets/uploads'; // how posts reference uploads, matching public_folder in Decap
const MAX_EDGE = 1600;
const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg']);
const DATE_FOLDER = /^\d{4}-\d{2}-\d{2}$/;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const source = args.find((a) => !a.startsWith('--'));

if (!source) {
	console.error('Usage: npm run import-photos -- "C:\\path\\to\\Sorted" [--dry-run]');
	process.exit(1);
}
if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
	console.error(`Source folder not found: ${source}`);
	process.exit(1);
}

const courses = new Map(JSON.parse(fs.readFileSync(COURSES_FILE, 'utf8')).courses.map((c) => [c.id, c]));

// "course|YYYY-MM-DD" for every existing post, read from its frontmatter
function existingRounds() {
	const keys = new Set();
	if (!fs.existsSync(POSTS_DIR)) return keys;
	for (const file of fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))) {
		const text = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
		const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
		const course = frontmatter.match(/^course:\s*["']?([^"'\r\n]+?)["']?\s*$/m)?.[1];
		const date = frontmatter.match(/^pubDate:\s*["']?(\d{4}-\d{2}-\d{2})/m)?.[1];
		if (course && date) keys.add(`${course}|${date}`);
	}
	return keys;
}

const subfolders = (dir) =>
	fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

// JSON strings are valid YAML double-quoted strings, so names with commas or apostrophes are safe
const yaml = (value) => JSON.stringify(value);

const existing = existingRounds();
const summary = { created: [], skipped: [], photos: 0, reused: 0 };

if (!dryRun) {
	fs.mkdirSync(POSTS_DIR, { recursive: true });
	fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

for (const courseId of subfolders(source)) {
	const course = courses.get(courseId);
	if (!course) continue; // not a course id, ignored

	for (const date of subfolders(path.join(source, courseId))) {
		const label = `${courseId}/${date}`;
		if (!DATE_FOLDER.test(date)) {
			summary.skipped.push(`${label}: folder name is not a YYYY-MM-DD date`);
			continue;
		}
		if (existing.has(`${courseId}|${date}`)) {
			summary.skipped.push(`${label}: a post for this course and date already exists`);
			continue;
		}
		const postFile = path.join(POSTS_DIR, `${courseId}-${date}.md`);
		if (fs.existsSync(postFile)) {
			summary.skipped.push(`${label}: ${path.basename(postFile)} already exists`);
			continue;
		}

		const dateDir = path.join(source, courseId, date);
		const photos = fs
			.readdirSync(dateDir, { withFileTypes: true })
			.filter((f) => f.isFile() && PHOTO_EXTENSIONS.has(path.extname(f.name).toLowerCase()))
			.map((f) => f.name);
		if (photos.length === 0) {
			summary.skipped.push(`${label}: no JPG photos found`);
			continue;
		}

		const gallery = [];
		for (const photo of photos) {
			const name = photo.toLowerCase();
			const target = path.join(UPLOADS_DIR, name);
			if (fs.existsSync(target)) {
				summary.reused++; // already uploaded, use it as it is
			} else {
				summary.photos++;
				if (!dryRun) {
					await sharp(path.join(dateDir, photo))
						.rotate() // apply the camera orientation, then metadata is dropped on save
						.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
						.jpeg({ quality: 85, mozjpeg: true })
						.toFile(target);
				}
			}
			gallery.push(`${UPLOADS_PUBLIC}/${name}`);
		}

		const post = [
			'---',
			`title: ${yaml(course.name)}`,
			`description: ${yaml(courseId)}`,
			'gallery:',
			...gallery.map((image) => `  - image: ${image}`),
			`pubDate: ${date}T00:00:00.000Z`,
			'type: round',
			`course: ${courseId}`,
			'---',
			'',
		].join('\n');

		if (!dryRun) fs.writeFileSync(postFile, post);
		existing.add(`${courseId}|${date}`);
		summary.created.push(`${label}: ${path.basename(postFile)} (${photos.length} photos)`);
	}
}

const heading = dryRun ? 'Dry run, nothing was changed.' : 'Import finished.';
console.log(`\n${heading}\n`);
console.log(`Posts ${dryRun ? 'that would be created' : 'created'}: ${summary.created.length}`);
summary.created.forEach((line) => console.log(`  + ${line}`));
console.log(`\nSkipped: ${summary.skipped.length}`);
summary.skipped.forEach((line) => console.log(`  - ${line}`));
console.log(`\nPhotos ${dryRun ? 'to copy' : 'copied'}: ${summary.photos}`);
if (summary.reused) console.log(`Photos already in uploads (reused): ${summary.reused}`);
