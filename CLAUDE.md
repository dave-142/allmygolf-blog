# allmygolf blog

Astro blog on Azure Static Web Apps. Deploys on push to main.

## Rules
- Posts live in src/content/blog/ as Markdown
- Frontmatter fields: title, description, pubDate, type (round, course, equipment), course, score, rating, lat, lng, tags
- Course posts must include lat and lng
- Run `npm run build` before saying a change is done
- Never push to GIT repo without asking