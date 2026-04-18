import { toHTML, type PortableTextHtmlComponents } from '@portabletext/to-html';
import { sanityClient, urlFor } from './client';

export interface SanityFile {
  label?: string;
  asset?: { _ref: string; url?: string; originalFilename?: string };
}

export interface SanityPage {
  _id: string;
  title: string;
  subtitle?: string;
  slug: { current: string };
  body?: unknown; // Portable Text blocks
  attachments?: SanityFile[];
}

// Fetch a single page by slug. Returns null if no document matches — callers then decide
// whether to render a fallback (static starter content) or a 404.
export async function getPage(slug: string): Promise<SanityPage | null> {
  return sanityClient.fetch<SanityPage | null>(
    `*[_type == "page" && slug.current == $slug][0]{
      _id, title, subtitle, slug,
      body,
      "attachments": attachments[]{
        label,
        "asset": asset->{ url, originalFilename }
      }
    }`,
    { slug },
  );
}

// Include the whole image object (asset ref + crop + hotspot) so @sanity/image-url can
// generate URLs that respect editor cropping and focal-point choices. `url` is also
// projected from the asset for the rare surface that wants the raw image.
export interface SanityImage {
  _type?: 'image';
  asset?: { _ref?: string; url?: string };
  crop?: { top?: number; bottom?: number; left?: number; right?: number };
  hotspot?: { x?: number; y?: number; height?: number; width?: number };
  alt?: string;
  caption?: string;
}

export interface SanityNewsPost {
  _id: string;
  title: string;
  slug: { current: string };
  publishedAt: string;
  excerpt?: string;
  author?: string;
  coverImage?: SanityImage;
  body?: unknown;
  attachments?: SanityFile[];
}

// Published-only filter: publishedAt must be set AND not in the future. Scheduled posts
// simply don't appear until the next build happens after their publish time (Sanity
// webhook → Netlify rebuild keeps this responsive without runtime filtering).
const publishedFilter = `defined(publishedAt) && publishedAt <= now()`;

// Index query: minimal fields needed for a card grid. Project the whole coverImage
// object so @sanity/image-url can read crop + hotspot and generate correctly-cropped
// URLs. asset is dereferenced just for `url` (needed as a fallback on some surfaces).
const coverImageProjection = `coverImage{
  ..., asset->{ _id, _ref, url, metadata }
}`;

export async function getNewsPosts(): Promise<SanityNewsPost[]> {
  return sanityClient.fetch<SanityNewsPost[]>(
    `*[_type == "newsPost" && ${publishedFilter}] | order(publishedAt desc) {
      _id,
      title,
      slug,
      publishedAt,
      excerpt,
      author,
      "coverImage": ${coverImageProjection}
    }`,
  );
}

// Detail query: full body + cover. `published` filter here too so a post scheduled for
// the future 404s on a direct URL hit rather than leaking.
export async function getNewsPost(slug: string): Promise<SanityNewsPost | null> {
  return sanityClient.fetch<SanityNewsPost | null>(
    `*[_type == "newsPost" && slug.current == $slug && ${publishedFilter}][0]{
      _id,
      title,
      slug,
      publishedAt,
      excerpt,
      author,
      body,
      "coverImage": ${coverImageProjection},
      "attachments": attachments[]{
        label,
        "asset": asset->{ url, originalFilename }
      }
    }`,
    { slug },
  );
}

// ---------------------------------------------------------------------------
// Wall of Fame

export type InducteeCategory = 'fiddler' | 'accompanist' | 'builder' | 'other';

export interface SanityInductee {
  _id: string;
  name: string;
  year: number;
  category: InducteeCategory;
  posthumous?: boolean;
  order?: number;
  photo?: SanityImage;
  bioPdf?: { asset?: { url?: string; originalFilename?: string } };
  bioBody?: unknown;
}

const inducteeProjection = `{
  _id, name, year, category, posthumous, order,
  "photo": photo{ ..., asset->{ _id, _ref, url, metadata } },
  "bioPdf": bioPdf{ "asset": asset->{ url, originalFilename } },
  bioBody
}`;

export async function getInducteeYears(): Promise<number[]> {
  const years = await sanityClient.fetch<number[]>(
    `array::unique(*[_type == "inductee" && defined(year)].year) | order(@ desc)`,
  );
  return years ?? [];
}

export async function getInducteesByYear(year: number): Promise<SanityInductee[]> {
  return sanityClient.fetch<SanityInductee[]>(
    `*[_type == "inductee" && year == $year] | order(order asc, name asc) ${inducteeProjection}`,
    { year },
  );
}

export async function getAllInductees(): Promise<SanityInductee[]> {
  return sanityClient.fetch<SanityInductee[]>(
    `*[_type == "inductee"] | order(year desc, order asc) ${inducteeProjection}`,
  );
}

// ---------------------------------------------------------------------------
// Events

export type EventCategory =
  | 'jam' | 'workshop' | 'concert' | 'competition' | 'camp' | 'agm' | 'festival' | 'other';

export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  jam: 'Jam',
  workshop: 'Workshop',
  concert: 'Concert',
  competition: 'Competition',
  camp: 'Camp',
  agm: 'AGM',
  festival: 'Festival',
  other: 'Other',
};

export interface SanityEvent {
  _id: string;
  title: string;
  slug: { current: string };
  startDate: string;
  endDate?: string;
  allDay?: boolean;
  location?: string;
  locationUrl?: string;
  categories: EventCategory[];
  coverImage?: SanityImage;
  body?: unknown;
  externalLink?: string;
  externalLinkLabel?: string;
}

const eventProjection = `{
  _id, title, slug, startDate, endDate, allDay, location, locationUrl, categories,
  body, externalLink, externalLinkLabel,
  "coverImage": ${coverImageProjection}
}`;

export async function getAllEvents(): Promise<SanityEvent[]> {
  return sanityClient.fetch<SanityEvent[]>(
    `*[_type == "event"] | order(startDate asc) ${eventProjection}`,
  );
}

export async function getEvent(slug: string): Promise<SanityEvent | null> {
  return sanityClient.fetch<SanityEvent | null>(
    `*[_type == "event" && slug.current == $slug][0] ${eventProjection}`,
    { slug },
  );
}

// Very small HTML escape for untrusted strings (cell values from the table plugin etc.).
const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Rewrite legacy Weebly URLs scraped into news bodies. Netlify `_redirects` already
// handles these at the edge in production, but the Astro dev server doesn't process
// that file, so the dev experience 404s without this. Keep the list in sync with
// `public/_redirects`.
function rewriteLegacyHref(href: string): string {
  // /:year-inductees.html → /en/wall-of-fame/:year
  const m = href.match(/^\/(\d{4})-inductees\.html$/);
  if (m) return `/en/wall-of-fame/${m[1]}`;
  return href;
}

// Render Portable Text to a safe HTML string. Astro's {@html ...} expression accepts it
// directly. Prose styling comes from Tailwind's `prose` utility applied on the wrapper.
const components: Partial<PortableTextHtmlComponents> = {
  marks: {
    link: ({ children, value }) => {
      const href = rewriteLegacyHref(value?.href ?? '#');
      return `<a href="${href}" class="underline text-brand-700 hover:text-brand-800">${children}</a>`;
    },
  },
  types: {
    // Inline images dropped into the body in Studio. The image member carries an alt and
    // optional caption; urlFor respects editor-chosen crop + hotspot when building the URL.
    image: ({ value }: { value: { alt?: string; caption?: string; asset?: unknown } }) => {
      if (!value?.asset) return '';
      const src = urlFor(value as any).width(1200).auto('format').url();
      const alt = escapeHtml(value.alt ?? '');
      const caption = value.caption ? escapeHtml(value.caption) : '';
      const img = `<img src="${src}" alt="${alt}" class="rounded-lg border border-neutral-200 bg-neutral-100" />`;
      return caption
        ? `<figure>${img}<figcaption>${caption}</figcaption></figure>`
        : img;
    },
    // @sanity/table serializes as { _type: 'table', rows: [{ cells: ['a', 'b', ...] }] }.
    // Heuristic: promote the first row to <thead> only if at least one of its cells has
    // content. Leaving the first row blank gives a plain all-body table.
    //
    // Cells get a tiny markdown-lite pass so editors can format inline without a plugin
    // swap: **bold**, *italic*, and [text](url). HTML is escaped first, so these patterns
    // operate on already-safe text — no injection risk.
    table: ({ value }: { value: { rows?: { cells?: string[] }[] } }) => {
      const rows = value?.rows ?? [];
      if (!rows.length) return '';

      const renderCell = (raw: string | undefined) => {
        let s = escapeHtml(raw ?? '');
        // **bold** — match before *italic* to avoid the single-star rule consuming doubles.
        s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
        // *italic* — guard with word boundaries so "2 * 3" isn't italicised.
        s = s.replace(/(^|\s|\()\*([^*\n]+?)\*(?=[\s),.!?:;]|$)/g, '$1<em>$2</em>');
        // [text](url) — only http(s) or relative URLs; refuse javascript: etc.
        s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
          '<a href="$2" class="underline text-brand-700 hover:text-brand-800">$1</a>');
        return s;
      };

      const rowHtml = (r: { cells?: string[] }, tag: 'th' | 'td') =>
        `<tr>${(r.cells ?? []).map((c) => `<${tag}>${renderCell(c)}</${tag}>`).join('')}</tr>`;

      const firstRowHasContent = (rows[0].cells ?? []).some(
        (c) => (c ?? '').trim().length > 0,
      );

      if (firstRowHasContent) {
        const [head, ...rest] = rows;
        return `<table><thead>${rowHtml(head, 'th')}</thead><tbody>${rest.map((r) => rowHtml(r, 'td')).join('')}</tbody></table>`;
      }
      return `<table><tbody>${rows.slice(1).map((r) => rowHtml(r, 'td')).join('')}</tbody></table>`;
    },
  },
};

export function renderPortableText(value: unknown): string {
  if (!value) return '';
  return toHTML(value as any, { components });
}
