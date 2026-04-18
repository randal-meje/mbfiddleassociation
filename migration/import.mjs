// Convert migration/output/news/*.json into an NDJSON file suitable for
// `npx sanity dataset import migration/output/news.ndjson production`.
//
// This is a one-off. Run once after redeploying Studio with the newsPost schema.
// Re-running is idempotent because each document's _id is derived from the slug.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Schema } from '@sanity/schema';
import { htmlToBlocks } from '@sanity/block-tools';
import { JSDOM } from 'jsdom';

const ROOT = dirname(fileURLToPath(import.meta.url));
const NEWS_DIR = join(ROOT, 'output', 'news');
const OUTPUT_PATH = join(ROOT, 'output', 'news.ndjson');

// Minimal block-content schema describing what `body` can hold. Must match the real
// newsPost schema in src/sanity/schemas/newsPost.ts, otherwise block-tools will drop
// anything that isn't an allowed member. Keep the two in sync if the schema grows.
const schema = Schema.compile({
  name: 'import',
  types: [
    {
      type: 'object',
      name: 'post',
      fields: [
        {
          name: 'body',
          type: 'array',
          of: [
            { type: 'block' },
            { type: 'image' },
          ],
        },
      ],
    },
  ],
});
const blockContentType = schema
  .get('post')
  .fields.find((f) => f.name === 'body').type;

function toBlocks(html) {
  if (!html || !html.trim()) return [];
  // Weebly wraps everything in <div class="paragraph"> ... which block-tools treats as
  // a single long paragraph. Unwrap it so top-level <ul>/<ol>/<br/> become real breaks.
  const unwrapped = html.replace(/^\s*<div class="paragraph"[^>]*>/, '').replace(/<\/div>\s*$/, '');
  return htmlToBlocks(unwrapped, blockContentType, {
    parseHtml: (h) => new JSDOM(h).window.document,
  });
}

// Deterministic _id so re-imports update the existing doc instead of creating duplicates.
// Sanity IDs must match a specific charset; slugs already do, but we prefix to keep the
// imported batch identifiable vs. docs the board creates by hand later.
function makeDocId(slug) {
  return `news-${slug}`.replace(/[^a-zA-Z0-9_.-]/g, '-');
}

async function main() {
  const files = (await readdir(NEWS_DIR))
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .sort();

  const lines = [];
  let withBody = 0;
  let empty = 0;

  for (const file of files) {
    const data = JSON.parse(await readFile(join(NEWS_DIR, file), 'utf8'));
    const slug = data.slug ?? basename(file, '.json');
    const body = toBlocks(data.bodyHtml);

    if (body.length) withBody++;
    else empty++;

    const doc = {
      _type: 'newsPost',
      _id: makeDocId(slug),
      title: data.title,
      slug: { _type: 'slug', current: slug },
      publishedAt: data.publishedAt ? `${data.publishedAt}T12:00:00Z` : null,
      excerpt: data.excerpt ?? null,
      body,
    };
    lines.push(JSON.stringify(doc));
  }

  await writeFile(OUTPUT_PATH, lines.join('\n') + '\n');

  console.log(`Wrote ${lines.length} documents to ${OUTPUT_PATH}`);
  console.log(`  with body content: ${withBody}`);
  console.log(`  empty body:        ${empty}`);
  console.log('');
  console.log('Next step — from the repo root:');
  console.log('  npx sanity dataset import migration/output/news.ndjson production --replace');
  console.log('');
  console.log('Notes:');
  console.log(' - Cover images, in-body images, and authors are NOT imported.');
  console.log('   The board can add cover images post-launch one post at a time.');
  console.log(' - `--replace` overwrites docs with the same _id. Safe to re-run.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
