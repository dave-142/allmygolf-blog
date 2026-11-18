// Points the image links in the built site at Blob Storage. Run after `npm run build`, on GitHub only.
//
// Usage: IMAGE_HOST=https://<account>.blob.core.windows.net/images node scripts/use-image-host.js
//
// Every HTML page in dist is updated so "/_astro/<photo>.webp" (and .jpg, .jpeg, .png) becomes
// "<IMAGE_HOST>/_astro/<photo>.webp". Links that include the site address, like social previews, are updated too.
// CSS, JS and fonts are not touched, so they are still served by the Static Web App.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://www.allmy.golf';
const host = (process.env.IMAGE_HOST ?? '').replace(/\/+$/, '');

if (!host) {
	console.error('IMAGE_HOST is not set, nothing changed.');
	process.exit(1);
}

const escapedSite = SITE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const imageLink = new RegExp(`(?:${escapedSite})?/_astro/([^"'\\s,)<>]+\\.(?:webp|jpe?g|png))`, 'gi');

const htmlFiles = (dir) =>
	fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return htmlFiles(full);
		return entry.name.endsWith('.html') ? [full] : [];
	});

let pages = 0, links = 0;
for (const file of htmlFiles(DIST)) {
	const html = fs.readFileSync(file, 'utf8');
	let count = 0;
	const updated = html.replace(imageLink, (_, name) => {
		count++;
		return `${host}/_astro/${name}`;
	});
	if (count > 0) {
		fs.writeFileSync(file, updated);
		pages++;
		links += count;
	}
}

console.log(`Pointed ${links} image links in ${pages} pages at ${host}`);
