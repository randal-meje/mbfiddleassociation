import type { APIRoute } from 'astro';
import { getAllEvents } from '../../../sanity/queries';
import { buildCalendar } from '../../../lib/ics';

// Full-feed ICS. Intended to be subscribed-to via Google/Apple Calendar's "subscribe by
// URL" feature — subscribers get new events as soon as the site rebuilds after a
// Sanity publish.
export const GET: APIRoute = async ({ site }) => {
  const events = await getAllEvents();
  const origin = site?.origin ?? 'https://www.mbfiddleassociation.org';
  const ics = buildCalendar(events, origin);

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mfa-calendar.ics"',
    },
  });
};
