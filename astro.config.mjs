import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://www.mbfiddleassociation.org',
  // Pure static output. Sanity Studio is a separate app deployed to mfa.sanity.studio; the
  // public Astro site only reads content via the Sanity client at build time.
  output: 'static',
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
  // @astrojs/sitemap walks the generated routes after build and emits sitemap-index.xml
  // plus one sitemap-0.xml. Excludes below hide routes that shouldn't be indexed — the
  // 404 page is naturally excluded; .ics feeds are static assets we explicitly drop.
  integrations: [
    sitemap({
      filter: (page) => !page.endsWith('.ics') && !page.endsWith('/404/'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
