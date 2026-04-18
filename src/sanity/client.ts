import { createClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';
import type { SanityImageSource } from '@sanity/image-url/lib/types/types';

// Astro exposes env vars prefixed with PUBLIC_ at build time via import.meta.env.
// useCdn:false because we build statically — every build fetches fresh content, so
// hitting the CDN would just add staleness without any latency win.
const projectId = import.meta.env.PUBLIC_SANITY_PROJECT_ID;
const dataset = import.meta.env.PUBLIC_SANITY_DATASET ?? 'production';

if (!projectId) {
  throw new Error(
    'PUBLIC_SANITY_PROJECT_ID is not set. Copy .env.example to .env and fill in the project ID.',
  );
}

export const sanityClient = createClient({
  projectId,
  dataset,
  apiVersion: '2024-10-01',
  useCdn: false,
});

// Use this instead of concatenating query strings to `asset->url`. It inspects the
// image object's `crop` and `hotspot` fields (set by editors in Studio) and bakes them
// into the CDN URL as `rect=…` and `fp-x/fp-y=…`, so editor-chosen cropping is actually
// respected at render time.
const urlBuilder = imageUrlBuilder(sanityClient);
export const urlFor = (source: SanityImageSource) => urlBuilder.image(source);
