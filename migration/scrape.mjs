// Scrape the live mbfiddleassociation.org (Weebly) into structured JSON + local assets.
// One-off: not meant to be maintained past launch.

import * as cheerio from 'cheerio';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://www.mbfiddleassociation.org';
const SITEMAP_URL = `${BASE}/sitemap.xml`;
const OUT = join(ROOT, 'output');
const ASSETS_DIR = join(OUT, 'assets');
const USER_AGENT = 'MFA-Migration-Scraper/1.0';
const REQUEST_DELAY_MS = 250;

const log = (...a) => console.log('·', ...a);
const warn = (...a) => console.warn('!', ...a);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  await sleep(REQUEST_DELAY_MS);
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

async function fetchBuffer(url) {
  await sleep(REQUEST_DELAY_MS);
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const exists = async (p) => access(p).then(() => true).catch(() => false);

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function writeJson(path, data) {
  await ensureDir(dirname(path));
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
}

// Normalize a Weebly URL (absolute, scheme-relative, or root-relative) into an absolute URL
// relative to BASE. Returns null if the URL is empty, fragment-only, mailto/tel, or off-site.
function normalizeUrl(href, from = BASE) {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:') || trimmed.startsWith('javascript:')) {
    return null;
  }
  try {
    const abs = new URL(trimmed, from);
    if (abs.hostname !== new URL(BASE).hostname) return null;
    // Weebly occasionally emits a junk og:image that concatenates the site host with a
    // protocol-relative CDN URL ("//www.mbfiddleassociation.org//www.weebly.com/..."). Those
    // round-trip through the URL parser as an on-site URL whose pathname starts with "//".
    // Reject them so we don't chase a 404.
    if (abs.pathname.startsWith('//')) return null;
    return abs.toString();
  } catch {
    return null;
  }
}

// Parse Weebly's M/D/YYYY date strings (e.g. "7/8/2024") into an ISO date (yyyy-mm-dd).
function parseUsDate(raw) {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mo, da, yr] = m;
  return `${yr}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`;
}

// Slugify a URL path segment for local filenames. Weebly uses dashes already; we just trim
// leading/trailing dashes and collapse accidental double dashes.
function cleanSlug(s) {
  return s.replace(/^-+|-+$/g, '').replace(/-+/g, '-');
}

// --- Asset registry ---------------------------------------------------------
// Tracks every asset URL we've seen so we can download once and rewrite references
// consistently. Key: absolute URL. Value: { localPath, originalUrl, referencedBy: Set }.
const assets = new Map();

function registerAsset(absUrl, referencedBy) {
  if (!absUrl) return null;
  // Weebly often appends ?1706761289 cache-busters; keep the full URL in originalUrl,
  // but derive a stable local path from the pathname.
  const u = new URL(absUrl);
  const pathname = u.pathname; // e.g. /uploads/1/9/6/9/19690537/published/foo.jpg
  const local = `assets${pathname}`; // keep Weebly's folder structure verbatim
  if (!assets.has(absUrl)) {
    assets.set(absUrl, { originalUrl: absUrl, localPath: local, referencedBy: new Set() });
  }
  assets.get(absUrl).referencedBy.add(referencedBy);
  return local;
}

// Rewrite any on-site href/src URLs inside an element's innerHTML to registered local paths,
// and return the modified HTML plus the list of assets seen. Uses cheerio for safety.
function rewriteHtmlAssets($, $el, referencedBy) {
  const found = [];
  $el.find('img[src]').each((_, img) => {
    const $img = $(img);
    const abs = normalizeUrl($img.attr('src'), referencedBy);
    if (abs) {
      const local = registerAsset(abs, referencedBy);
      $img.attr('src', '/' + local);
      found.push({ kind: 'image', originalUrl: abs, localPath: local });
    }
  });
  $el.find('a[href]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href');
    const abs = normalizeUrl(href, referencedBy);
    if (!abs) return;
    // Only register the link as an asset if it points at /uploads/ — that's where Weebly
    // parks PDFs/media. Internal page links (e.g. /2024-inductees.html) stay as-is.
    const u = new URL(abs);
    if (u.pathname.startsWith('/uploads/')) {
      const local = registerAsset(abs, referencedBy);
      $a.attr('href', '/' + local);
      found.push({ kind: 'file', originalUrl: abs, localPath: local });
    }
  });
  return { html: $el.html(), assets: found };
}

// --- Sitemap ---------------------------------------------------------------
async function loadSitemap() {
  const xml = await fetchText(SITEMAP_URL);
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls = [];
  $('urlset > url').each((_, el) => {
    const loc = $(el).find('loc').text().trim();
    const lastmod = $(el).find('lastmod').text().trim() || null;
    if (loc) urls.push({ loc, lastmod });
  });
  return urls;
}

// --- URL classifier ---------------------------------------------------------
function classify(url) {
  const u = new URL(url);
  const p = u.pathname.replace(/\/$/, '') || '/';
  if (p === '/' || p === '/index.html') return { kind: 'home' };
  if (p === '/news.html') return { kind: 'news-index' };
  if (p === '/events.html') return { kind: 'events', skip: true };
  if (p === '/wall.html') return { kind: 'wall' };
  if (p === '/inductee-history.html') return { kind: 'inductee-history' };
  if (p === '/about.html') return { kind: 'about' };
  if (p === '/join.html') return { kind: 'join' };
  if (p === '/contact.html') return { kind: 'contact' };
  let m = p.match(/^\/(\d{4})-inductees\.html$/);
  if (m) return { kind: 'inductee-year', year: Number(m[1]) };
  m = p.match(/^\/news\/([a-z0-9-]+)$/i);
  if (m) return { kind: 'news-post', slug: cleanSlug(m[1]) };
  if (p.startsWith('/news/archives/')) return { kind: 'news-archive', skip: true };
  return { kind: 'other' };
}

// --- Per-page parsers -------------------------------------------------------
// Weebly wraps editable content in `#wsite-content .wsite-elements.wsite-not-footer`. News
// posts are rendered inside `.blog-post` blocks instead. Helpers below pull those out and
// strip the trailing cookie-opt-out widget that's injected on every page.
function $content($) {
  return $('#wsite-content').first();
}

function stripCookieWidget($, $el) {
  $el.find('.wsite-cookie-opt-out--wrapper').remove();
  return $el;
}

function parseStaticPage($, url) {
  const $el = stripCookieWidget($, $content($).clone());
  const title = $('meta[property="og:title"]').attr('content')?.trim()
    || $('title').text().trim();
  const heading = $el.find('h2.wsite-content-title').first().text().trim() || null;
  const { html, assets: found } = rewriteHtmlAssets($, $el, url);
  return { title, heading, bodyHtml: html, sourceUrl: url, assets: found };
}

function parseNewsIndex($, url) {
  // We scrape individual posts from the sitemap; this captures only the page's own title
  // and any static intro copy.
  return parseStaticPage($, url);
}

function parseNewsPost($, url, slug) {
  const $post = $('.blog-post').first();
  if (!$post.length) throw new Error(`No .blog-post found at ${url}`);
  const title = $post.find('.blog-title').text().trim();
  const dateRaw = $post.find('.blog-date .date-text').text().trim();
  const publishedAt = parseUsDate(dateRaw);
  const $content = $post.find('.blog-content').first().clone();
  // Weebly sometimes wraps the body in a single .paragraph div; keep whatever is inside.
  const { html, assets: found } = rewriteHtmlAssets($, $content, url);

  // Weebly has no real per-post cover image: the page-level background-image is a site-wide
  // default, and og:image falls back to a junk icon URL. The best proxy is the first image
  // inside the post body; if the post has none, coverImage stays null (the layout will show
  // a title-only card).
  let coverImage = null;
  const $firstImg = $post.find('.blog-content img[src]').first();
  if ($firstImg.length) {
    const abs = normalizeUrl($firstImg.attr('src'), url);
    if (abs && new URL(abs).pathname.startsWith('/uploads/')) {
      coverImage = registerAsset(abs, url);
    }
  }

  const excerpt = $('meta[property="og:description"]').attr('content')?.trim() || null;

  return {
    slug,
    title,
    publishedAt,
    publishedAtRaw: dateRaw || null,
    excerpt,
    coverImage: coverImage ? '/' + coverImage : null,
    bodyHtml: html,
    sourceUrl: url,
    assets: found,
  };
}

// Inductee year pages come in TWO distinct Weebly formats:
//
//   1. "List format" (2024): a single .paragraph with alternating <strong>Category:</strong>
//      headings and <ol>/<ul> lists of <li><a href="*.pdf">Name</a></li>.
//   2. "Slideshow format" (2013-2019): a Weebly slideshow widget whose images array (in a
//      wSlideshow.render({...}) script) carries inductee data inside each photo's caption,
//      e.g. "Henri Hince (Fiddler category)" or "Darren Lavallee - Fiddler".
//
// Older pages have no PDF bios; younger pages have no slideshow. We try the list parser,
// fall back to the slideshow parser, and emit both photos and inductees either way.
function normalizeCategory(raw) {
  if (!raw) return 'Other';
  const s = raw.toLowerCase();
  if (s.includes('accompanist')) return 'Accompanist';
  if (s.includes('builder') || s.includes('promoter')) return 'Builder/Promoter';
  if (s.includes('fiddler')) return 'Fiddler';
  return raw.replace(/[:()]/g, '').trim() || 'Other';
}

// Match captions that introduce an inductee. Returns { name, category } or null.
// These patterns cover the variants we saw in 2013-2019 without being so loose that they
// match supplementary captions like "Henri Hince performing" or "X family and friends".
const INDUCTEE_CAPTION_PATTERNS = [
  // "Henri Hince (Fiddler category)" / "Larry Martineau (Builder) and wife Susan"
  /^([^()\-,]+?)\s*\(\s*([A-Za-z/]+?)(?:\s+category)?\s*(?:-\s*posthumously)?\s*\)/i,
  // "Darren Lavallee - Fiddler"  /  "Denis Encontre - fiddler"
  /^([^\-\u2013\u2014(]+?)\s+[\-\u2013\u2014]\s+(fiddler|accompanist|builder(?:\/promoter)?|promoter)\b/i,
  // "Alvin Harold Clark, fiddler"
  /^([^,]+?),\s+(fiddler|accompanist|builder(?:\/promoter)?|promoter)\b/i,
  // "Lorne Zayshley in the fiddler category"
  /^(.+?)\s+in\s+the\s+(fiddler|accompanist|builder(?:\/promoter)?|promoter)\s+category/i,
];

const RECOGNIZED_CATEGORY_WORDS = /^(fiddler|accompanist|builder|promoter|builder\/promoter)$/i;

// Strip wrapper phrases from a detected name so "Tribute to John MacKay" becomes "John MacKay"
// and "Daughters Shirley Brown and Jeanie McKay of John Stovin" becomes "John Stovin". Each
// rule matches patterns observed in the live captions; we prefer conservative rewrites over
// clever ones.
function cleanName(raw) {
  let n = raw.replace(/&quot;/g, '"').trim();
  // "X tribute to Y" / "Musical tribute to Y" — the inductee is Y (whatever follows "tribute to").
  const tributeMatch = n.match(/^.*?\btribute\s+to\s+(.+)$/i);
  if (tributeMatch) n = tributeMatch[1].trim();
  // "Daughters? X and Y of NAME" / "Sons? X and Y of NAME" — the inductee follows "of".
  const ofMatch = n.match(/^(?:daughter|daughters|son|sons|family|children)\s+.+?\s+of\s+(.+)$/i);
  if (ofMatch) n = ofMatch[1].trim();
  // Trailing "(posthumously)" / "(posthumous)".
  n = n.replace(/\s*\(\s*posthumous(?:ly)?\s*\)\s*$/i, '').trim();
  return n;
}

function tryExtractInducteeFromCaption(caption) {
  if (!caption) return null;
  const clean = caption.replace(/\s+/g, ' ').trim();
  const posthumous = /posthumous/i.test(clean);
  for (const pattern of INDUCTEE_CAPTION_PATTERNS) {
    const m = clean.match(pattern);
    if (!m) continue;
    const rawCategory = m[2].trim();
    // Parenthetical pattern #1 can pick up "posthumously" instead of a real category when the
    // caption reads "Name (posthumously) in the X category". Require a real category word.
    if (!RECOGNIZED_CATEGORY_WORDS.test(rawCategory)) continue;
    const name = cleanName(m[1]);
    if (name.length < 3 || name.length > 80) continue;
    if (/^(the|a|an)\s/i.test(name)) continue;
    return { name, category: normalizeCategory(rawCategory), posthumous, raw: clean };
  }
  return null;
}

function parseInducteeListFormat($, $el, url) {
  const $body = $el.find('.paragraph').first();
  if (!$body.length) return null;
  const inductees = [];
  let currentCategory = null;

  const walk = ($parent) => {
    $parent.contents().each((_, node) => {
      if (node.type !== 'tag') return;
      const tag = node.name.toLowerCase();
      if (tag === 'strong' || tag === 'b' || tag === 'h2' || tag === 'h3') {
        const text = $(node).text().trim();
        if (text && /category|fiddler|accompanist|builder|promoter/i.test(text)) {
          currentCategory = normalizeCategory(text);
        }
      } else if (tag === 'ol' || tag === 'ul') {
        $(node).find('> li').each((__, li) => {
          const $a = $(li).find('a[href]').first();
          const name = $(li).text().trim();
          const href = $a.attr('href');
          const abs = normalizeUrl(href, url);
          let localPdf = null;
          if (abs && new URL(abs).pathname.startsWith('/uploads/')) {
            localPdf = registerAsset(abs, url);
          }
          if (name) {
            inductees.push({
              name,
              category: currentCategory || 'Other',
              bioPdfUrl: abs,
              bioPdfLocal: localPdf ? '/' + localPdf : null,
              photoLocal: null,
              source: 'list',
            });
          }
        });
      } else {
        walk($(node));
      }
    });
  };
  walk($body);

  if (!inductees.length) return null;

  const intro = $body.clone().find('ol, ul, strong, b').remove().end().text().trim() || null;
  return { inductees, intro, photos: [] };
}

function parseInducteeSlideshowFormat($, url) {
  // Find a wSlideshow.render({...}) call on the page and extract its images array. Weebly
  // emits this on a single line, so a non-greedy bracket match is safe.
  const html = $.html();
  const m = html.match(/wSlideshow\.render\(\{[^}]*?images:\s*(\[[^\]]*\])/s);
  if (!m) return null;
  let images;
  try {
    images = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const photos = [];
  const inductees = [];
  const seenNames = new Set();
  for (const img of images) {
    if (!img.url) continue;
    const absPath = `/uploads/${img.url.replace(/^\/+/, '')}`;
    const abs = normalizeUrl(absPath, url);
    const localPath = abs ? registerAsset(abs, url) : null;
    const caption = img.caption || null;
    const record = {
      caption,
      width: img.width ? Number(img.width) : null,
      height: img.height ? Number(img.height) : null,
      photoUrl: abs,
      photoLocal: localPath ? '/' + localPath : null,
    };
    photos.push(record);
    const detected = tryExtractInducteeFromCaption(caption);
    if (detected && !seenNames.has(detected.name.toLowerCase())) {
      seenNames.add(detected.name.toLowerCase());
      inductees.push({
        name: detected.name,
        category: detected.category,
        posthumous: detected.posthumous,
        bioPdfUrl: null,
        bioPdfLocal: null,
        photoLocal: record.photoLocal,
        captionRaw: detected.raw,
        source: 'slideshow',
      });
    }
  }
  return { inductees, intro: null, photos };
}

function parseInducteeYear($, url, year) {
  const $el = $content($);
  const title = $el.find('h2.wsite-content-title').first().text().trim()
    || `${year} Inductees`;
  const list = parseInducteeListFormat($, $el, url);
  const slideshow = parseInducteeSlideshowFormat($, url);
  const picked = list || slideshow || { inductees: [], intro: null, photos: [] };
  return {
    year,
    title,
    intro: picked.intro,
    inductees: picked.inductees,
    photos: picked.photos,
    format: list ? 'list' : (slideshow ? 'slideshow' : 'unknown'),
    sourceUrl: url,
  };
}

// --- Asset download --------------------------------------------------------
async function downloadAssets() {
  const entries = [...assets.values()];
  log(`${entries.length} unique assets to download`);
  let ok = 0, fail = 0, skipped = 0;
  for (const a of entries) {
    const dest = join(OUT, a.localPath);
    if (await exists(dest)) {
      skipped++;
      continue;
    }
    try {
      await ensureDir(dirname(dest));
      const buf = await fetchBuffer(a.originalUrl);
      await writeFile(dest, buf);
      ok++;
    } catch (err) {
      warn(`download failed: ${a.originalUrl} — ${err.message}`);
      fail++;
    }
  }
  return { ok, fail, skipped, total: entries.length };
}

// --- Main ------------------------------------------------------------------
async function main() {
  await ensureDir(OUT);
  await ensureDir(ASSETS_DIR);

  log(`Loading sitemap: ${SITEMAP_URL}`);
  const urls = await loadSitemap();
  log(`${urls.length} URLs in sitemap`);

  // Probe inductee years that aren't in the sitemap (COVID-era gap suspected).
  const sitemapPaths = new Set(urls.map((u) => new URL(u.loc).pathname));
  const probedYears = [];
  const currentWinnipegYear = Number(
    new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'America/Winnipeg' })
      .format(new Date()),
  );
  for (let y = 2013; y <= currentWinnipegYear + 1; y++) {
    const p = `/${y}-inductees.html`;
    if (!sitemapPaths.has(p)) {
      const full = `${BASE}${p}`;
      try {
        await sleep(REQUEST_DELAY_MS);
        const res = await fetch(full, { method: 'HEAD', headers: { 'user-agent': USER_AGENT } });
        if (res.ok) {
          probedYears.push({ year: y, loc: full });
          log(`  probe +found: ${p}`);
        }
      } catch {
        /* ignore */
      }
    }
  }
  if (probedYears.length) {
    urls.push(...probedYears.map((p) => ({ loc: p.loc, lastmod: null })));
  }

  const results = {
    home: null,
    about: null,
    join: null,
    contact: null,
    wall: null,
    inducteeHistory: null,
    newsIndex: null,
    newsPosts: [],
    inducteeYears: [],
    skipped: [],
    errors: [],
  };

  for (const { loc, lastmod } of urls) {
    const cls = classify(loc);
    if (cls.skip) {
      results.skipped.push({ url: loc, reason: cls.kind });
      continue;
    }
    try {
      const html = await fetchText(loc);
      const $ = cheerio.load(html);
      switch (cls.kind) {
        case 'home':
          results.home = { ...parseStaticPage($, loc), lastmod };
          break;
        case 'about':
          results.about = { ...parseStaticPage($, loc), lastmod };
          break;
        case 'join':
          results.join = { ...parseStaticPage($, loc), lastmod };
          break;
        case 'contact':
          results.contact = { ...parseStaticPage($, loc), lastmod };
          break;
        case 'wall':
          results.wall = { ...parseStaticPage($, loc), lastmod };
          break;
        case 'inductee-history':
          results.inducteeHistory = { ...parseStaticPage($, loc), lastmod };
          break;
        case 'news-index':
          results.newsIndex = { ...parseNewsIndex($, loc), lastmod };
          break;
        case 'news-post':
          results.newsPosts.push({ ...parseNewsPost($, loc, cls.slug), lastmod });
          break;
        case 'inductee-year':
          results.inducteeYears.push({ ...parseInducteeYear($, loc, cls.year), lastmod });
          break;
        default:
          results.skipped.push({ url: loc, reason: cls.kind });
      }
      log(`  ${cls.kind.padEnd(18)} ${loc}`);
    } catch (err) {
      warn(`${cls.kind} ${loc}: ${err.message}`);
      results.errors.push({ url: loc, kind: cls.kind, error: err.message });
    }
  }

  // Stabilize orderings for diffs.
  results.newsPosts.sort((a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || ''));
  results.inducteeYears.sort((a, b) => a.year - b.year);

  // Per-entity JSON files
  await writeJson(join(OUT, 'pages', 'home.json'), results.home);
  await writeJson(join(OUT, 'pages', 'about.json'), results.about);
  await writeJson(join(OUT, 'pages', 'join.json'), results.join);
  await writeJson(join(OUT, 'pages', 'contact.json'), results.contact);
  await writeJson(join(OUT, 'pages', 'wall.json'), results.wall);
  await writeJson(join(OUT, 'pages', 'inductee-history.json'), results.inducteeHistory);
  await writeJson(join(OUT, 'pages', 'news-index.json'), results.newsIndex);

  await writeJson(
    join(OUT, 'news', 'index.json'),
    results.newsPosts.map((p) => ({
      slug: p.slug,
      title: p.title,
      publishedAt: p.publishedAt,
      excerpt: p.excerpt,
      coverImage: p.coverImage,
      sourceUrl: p.sourceUrl,
      lastmod: p.lastmod,
    })),
  );
  for (const post of results.newsPosts) {
    await writeJson(join(OUT, 'news', `${post.slug}.json`), post);
  }

  await writeJson(
    join(OUT, 'wall-of-fame', 'index.json'),
    results.inducteeYears.map((y) => ({
      year: y.year,
      title: y.title,
      inducteeCount: y.inductees.length,
      sourceUrl: y.sourceUrl,
    })),
  );
  for (const year of results.inducteeYears) {
    await writeJson(join(OUT, 'wall-of-fame', `${year.year}.json`), year);
  }

  // Asset index (sorted for deterministic output)
  const assetIndex = [...assets.values()]
    .map((a) => ({
      originalUrl: a.originalUrl,
      localPath: a.localPath,
      referencedBy: [...a.referencedBy].sort(),
    }))
    .sort((a, b) => a.localPath.localeCompare(b.localPath));
  await writeJson(join(ASSETS_DIR, 'index.json'), assetIndex);

  // Download everything
  const dl = await downloadAssets();

  // Summary for the report step
  const summary = {
    scrapedAt: new Date().toISOString(),
    sitemapUrlCount: urls.length,
    probedYearsFound: probedYears,
    counts: {
      newsPosts: results.newsPosts.length,
      inducteeYears: results.inducteeYears.length,
      inductees: results.inducteeYears.reduce((n, y) => n + y.inductees.length, 0),
      staticPages: ['home', 'about', 'join', 'contact', 'wall', 'inducteeHistory']
        .filter((k) => results[k]).length,
      assets: assetIndex.length,
      assetsDownloaded: dl.ok,
      assetsSkipped: dl.skipped,
      assetsFailed: dl.fail,
      skipped: results.skipped.length,
      errors: results.errors.length,
    },
    skipped: results.skipped,
    errors: results.errors,
  };
  await writeJson(join(OUT, 'summary.json'), summary);

  console.log('\n=== DONE ===');
  console.log(JSON.stringify(summary.counts, null, 2));
  if (results.errors.length) {
    console.log(`\n${results.errors.length} errors — see output/summary.json`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
