// @ts-check

import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	site: 'https://www.allmy.golf',
	integrations: [sitemap()],
	image: { layout: 'constrained' },
	vite: {
		plugins: [tailwindcss()],
	},
	fonts: [
		{
			provider: fontProviders.google(),
			name: 'Outfit',
			cssVariable: '--font-outfit',
			// Only the weights the site uses
			weights: [200, 300, 400, 500, 600, 700],
			fallbacks: ['sans-serif'],
		},
	],
});
