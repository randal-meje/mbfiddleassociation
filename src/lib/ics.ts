import type { SanityEvent } from '../sanity/queries';

// Minimal RFC 5545 iCalendar generator. Enough for single-instance events with timezone,
// location, URL, and description — which is everything the MFA calendar needs.

const CRLF = '\r\n';

// Text values must escape commas, semicolons, backslashes, and newlines per RFC 5545.
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

// Fold lines longer than 75 octets by splitting and prefixing a space on continuation
// lines. Simple per-character split; good enough for ASCII and keeps the output legible.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  parts.push(line.slice(i, i + 75));
  i += 75;
  while (i < line.length) {
    parts.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join(CRLF);
}

function formatUtc(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function formatDateOnly(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate())
  );
}

// Derive a stable UID from the slug. RFC 5545 just requires uniqueness within the feed;
// pairing slug with the origin domain is conventional and stays stable across rebuilds.
function eventUid(slug: string, origin: string): string {
  return `${slug}@${origin.replace(/^https?:\/\//, '').replace(/\/.*/, '')}`;
}

function eventDescription(e: SanityEvent): string {
  // Flatten Portable Text blocks to plain text. Good enough for the ICS DESCRIPTION
  // field which most calendar apps render as a single paragraph anyway.
  if (!e.body || !Array.isArray(e.body)) return '';
  return e.body
    .map((block) => {
      const b = block as { _type?: string; children?: { text?: string }[] };
      if (b._type !== 'block' || !Array.isArray(b.children)) return '';
      return b.children.map((c) => c.text ?? '').join('');
    })
    .filter(Boolean)
    .join('\n\n');
}

export function buildEventBlock(e: SanityEvent, origin: string, stamp: string): string {
  const lines: string[] = ['BEGIN:VEVENT'];
  lines.push(`UID:${eventUid(e.slug.current, origin)}`);
  lines.push(`DTSTAMP:${stamp}`);

  if (e.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(e.startDate)}`);
    // RFC 5545 DTEND is EXCLUSIVE for all-day events: a June 4-6 inclusive event has
    // DTEND 20260607. Editors input the inclusive last day; shift here.
    if (e.endDate) {
      const d = new Date(e.endDate);
      d.setUTCDate(d.getUTCDate() + 1);
      lines.push(`DTEND;VALUE=DATE:${formatDateOnly(d.toISOString())}`);
    }
  } else {
    lines.push(`DTSTART:${formatUtc(e.startDate)}`);
    if (e.endDate) lines.push(`DTEND:${formatUtc(e.endDate)}`);
  }

  lines.push(`SUMMARY:${escapeText(e.title)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  const desc = eventDescription(e);
  if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
  lines.push(`URL:${origin}/en/events/${e.slug.current}`);
  if (e.categories?.length) {
    // RFC 5545 CATEGORIES is a comma-separated list on a single property line.
    lines.push(`CATEGORIES:${e.categories.map((c) => c.toUpperCase()).join(',')}`);
  }
  lines.push('END:VEVENT');
  return lines.map(foldLine).join(CRLF);
}

export function buildCalendar(events: SanityEvent[], origin: string): string {
  const stamp = formatUtc(new Date().toISOString());
  const blocks = events.map((e) => buildEventBlock(e, origin, stamp));
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Manitoba Fiddle Association//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Manitoba Fiddle Association',
    ...blocks,
    'END:VCALENDAR',
  ].join(CRLF) + CRLF;
}
