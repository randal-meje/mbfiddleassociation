# Manitoba Fiddle Association — Website

Source for [mbfiddleassociation.org](https://www.mbfiddleassociation.org), the
site of a volunteer-run nonprofit encouraging, developing, promoting, and
preserving fiddle music in Manitoba.

## Stack

- **[Astro](https://astro.build)** — static site generator, fully prerendered output
- **[Sanity](https://www.sanity.io)** — headless CMS; board edits content at
  [mbfiddleassociation.sanity.studio](https://mbfiddleassociation.sanity.studio)
- **[Tailwind CSS](https://tailwindcss.com)** — styling
- **[FullCalendar](https://fullcalendar.io)** — events calendar view
- **[Netlify](https://www.netlify.com)** — hosting, forms, and edge redirects

## Repository layout

```
src/
  pages/en/       Public URLs (all under /en/ so French can be added later)
  sanity/         Sanity schema + GROQ queries
  components/     Site header, footer, etc.
  layouts/        Page wrappers
public/
  _redirects      Netlify edge redirects (legacy Weebly URLs → new paths)
  assets/         Static assets preserved from the previous site
migration/        One-off import scripts and scraped JSON (historical)
sanity.config.ts  Studio configuration
astro.config.mjs  Astro + sitemap configuration
```

## Local development

Prerequisites: Node 20+, npm.

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template and fill in the Sanity project ID
cp .env.example .env

# 3. Run the Astro site (port 4321)
npm run dev

# 4. In a separate terminal, run the Sanity Studio (port 3333)
npm run studio
```

The public site (Astro) and the Studio (Sanity) are two separate apps in this
repo; they share only the `.env` file for the project ID.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Astro dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run check` | TypeScript + Astro type checks |
| `npm run studio` | Run Sanity Studio locally |
| `npm run studio:build` | Build the Studio bundle |
| `npm run studio:deploy` | Deploy the Studio to `mbfiddleassociation.sanity.studio` |

## Editing content

All content lives in Sanity. Board members log in at
[mbfiddleassociation.sanity.studio](https://mbfiddleassociation.sanity.studio),
edit documents, and publish. Changes appear on the live site on the next
deploy — Netlify rebuilds on every push to `main`, and a manual "Trigger
deploy" in the Netlify dashboard pulls fresh content without needing a git
push.

Content types:

- **News posts** — title, body, optional cover image, optional PDF attachments
- **Events** — title, date/time, location, categories (multi-select), cover image
- **Inductees** — year, name, category, optional photo, optional bio PDF, optional rich-text bio
- **Pages** — About / Join / Contact body content

## Deployment

Hosted on Netlify. Auto-deploy on every push to `main`.

Required environment variables in Netlify → Site configuration →
Environment variables:

- `PUBLIC_SANITY_PROJECT_ID` — Sanity project ID
- `PUBLIC_SANITY_DATASET` — dataset name (`production`)
- `PUBLIC_CF_ANALYTICS_TOKEN` — optional, Cloudflare Web Analytics token

Build command: `npm run build`. Publish directory: `dist/`.

## Accessibility

Target: WCAG 2.1 AA.

## Contact

General inquiries: info@mbfiddleassociation.org
