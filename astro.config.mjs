// @ts-check

import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	site: 'https://www.allmy.golf',
	integrations: [sitemap()],
	image: { layout: 'constrained' },
	// On GitHub, IMAGE_HOST is set to the Blob Storage container, so built pages load images from there.
	// Locally it is not set, so images are served from the site as usual.
	build: process.env.IMAGE_HOST
		? {
				assetsPrefix: {
					webp: process.env.IMAGE_HOST,
					jpg: process.env.IMAGE_HOST,
					jpeg: process.env.IMAGE_HOST,
					png: process.env.IMAGE_HOST,
					fallback: '',
				},
			}
		: {},
	vite: {
		plugins: [tailwindcss()],
	},
	fonts: [
		{
			provider: fontProviders.google(),
			name: 'Outfit',
			cssVariable: '--font-outfit',
			weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
			fallbacks: ['sans-serif'],
		},
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
