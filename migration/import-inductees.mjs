// Generate NDJSON for the scraped Wall of Fame inductees (2013–2019 and 2024).
// Only name/year/category/order are emitted — photos, PDF bios, and inline bios are
// added later in Studio. Importing binary assets requires either a write token or a
// tarball bundle; leaving them out keeps this script dependency-light and lets the
// board attach the right image/PDF per inductee themselves.
//
// Pair with `sanity dataset import … --missing` to add only new docs without
// clobbering any Studio edits on previously imported inductees.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const WOF_DIR = join(ROOT, 'output', 'wall-of-fame');
const OUTPUT_PATH = join(ROOT, 'output', 'inductees.ndjson');

// Map scrape's category labels ("Fiddler", "Accompanist", "Builder/Promoter", "Other")
// to the schema's enum values (lowercase single tokens).
function mapCategory(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('accompanist')) return 'accompanist';
  if (s.includes('builder') || s.includes('promoter')) return 'builder';
  if (s.includes('fiddler')) return 'fiddler';
  return 'other';
}

// Deterministic ID so re-imports update rather than duplicate. Names can include
// punctuation; strip to a Sanity-safe charset.
function makeDocId(year, name) {
  const slug = name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `inductee-${year}-${slug}`;
}

async function main() {
  const files = (await readdir(WOF_DIR))
    .filter((f) => /^\d{4}\.json$/.test(f))
    .sort();

  const lines = [];
  let total = 0;

  for (const file of files) {
    const data = JSON.parse(await readFile(join(WOF_DIR, file), 'utf8'));
    const year = data.year;
    data.inductees.forEach((ind, idx) => {
      const doc = {
        _type: 'inductee',
        _id: makeDocId(year, ind.name),
        name: ind.name,
        year,
        category: mapCategory(ind.category),
        posthumous: Boolean(ind.posthumous),
        order: (idx + 1) * 10, // 10, 20, 30… so the board can slot new entries between
      };
      lines.push(JSON.stringify(doc));
      total++;
    });
  }

  await writeFile(OUTPUT_PATH, lines.join('\n') + '\n');

  console.log(`Wrote ${total} inductee docs to ${OUTPUT_PATH}`);
  console.log('');
  console.log('Next step — from the repo root:');
  console.log('  npx sanity dataset import migration/output/inductees.ndjson production --missing');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
