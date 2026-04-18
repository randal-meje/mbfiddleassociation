import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { table } from '@sanity/table';
import { schemaTypes } from './src/sanity/schemas';

// `sanity dev` / `sanity build` load this file directly and honour env vars prefixed with
// `SANITY_STUDIO_` (loaded automatically from .env* at the repo root).
const projectId = process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.SANITY_STUDIO_DATASET ?? 'production';

if (!projectId) {
  throw new Error(
    'SANITY_STUDIO_PROJECT_ID is not set. Copy .env.example to .env and fill in the project ID from https://www.sanity.io/manage.',
  );
}

export default defineConfig({
  name: 'mfa',
  title: 'Manitoba Fiddle Association',
  projectId,
  dataset,
  plugins: [structureTool(), visionTool(), table()],
  schema: { types: schemaTypes },
});
