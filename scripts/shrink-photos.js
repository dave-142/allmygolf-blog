// One-off: shrinks the photos in src/assets/uploads so their long edge is at most 1600px.
//
// Usage (from the project folder):
//   npm run shrink-photos              shrink and overwrite the photos
//   npm run shrink-photos -- --dry-run show what would change, change nothing
//
// - Photos that are already 1600px or smaller are left alone, so it is safe to run more than once.
// - Each photo keeps its file name, so posts and Decap need no changes.
// - JPGs are saved with the same settings as import-photos. PNG and WebP keep their format.
// - Photos are turned the right way up and metadata (including GPS) is dropped, as import-photos does.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPLOADS = path.join(ROOT, 'src/assets/uploads');
const MAX_EDGE = 1600;
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const dryRun = process.argv.includes('--dry-run');
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

const files = fs.readdirSync(UPLOADS).filter((f) => EXTENSIONS.has(path.extname(f).toLowerCase()));
let before = 0, after = 0, shrunk = 0, skipped = 0;
const failed = [];

for (const [i, file] of files.entries()) {
	const fullPath = path.join(UPLOADS, file);
	process.stdout.write(`\r${i + 1} of ${files.length}`);
	try {
		const original = fs.readFileSync(fullPath);
		before += original.length;

		const { width = 0, height = 0 } = await sharp(original).metadata();
		const longEdge = Math.max(width, height);
		if (longEdge <= MAX_EDGE) {
			after += original.length;
			skipped++;
			continue;
		}

		const ext = path.extname(file).toLowerCase();
		let image = sharp(original)
			.rotate()
			.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
		if (ext === '.png') image = image.png({ compressionLevel: 9 });
		else if (ext === '.webp') image = image.webp({ quality: 85 });
		else image = image.jpeg({ quality: 85, mozjpeg: true });

		const output = await image.toBuffer();
		after += output.length;
		shrunk++;

		if (!dryRun) {
			// Write to a temporary file first, so a failure never leaves a half-written photo
			const temp = `${fullPath}.tmp`;
			fs.writeFileSync(temp, output);
			fs.renameSync(temp, fullPath);
		}
	} catch (error) {
		failed.push(`${file}: ${error.message}`);
	}
}

console.log(`\n\n${dryRun ? 'Dry run, nothing was changed.' : 'Done.'}\n`);
console.log(`Photos checked:      ${files.length}`);
console.log(`${dryRun ? 'Would shrink' : 'Shrunk'}:        ${shrunk}`);
console.log(`Already small enough: ${skipped}`);
console.log(`Total size:          ${mb(before)} -> ${mb(after)}`);
if (failed.length) {
	console.log(`\nCould not process ${failed.length}, left unchanged:`);
	failed.forEach((line) => console.log(`  - ${line}`));
}
