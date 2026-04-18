import type { APIRoute } from 'astro';
import { getAllEvents, getEvent } from '../../../../sanity/queries';
import { buildCalendar } from '../../../../lib/ics';

// One .ics file per event — useful for "Add to Calendar" buttons. Statically generated
// at build time; no runtime cost, and the file is CDN-cacheable like any other asset.
export async function getStaticPaths() {
  const events = await getAllEvents();
  return events.map((e) => ({ params: { slug: e.slug.current } }));
}

export const GET: APIRoute = async ({ params, site }) => {
  const event = await getEvent(params.slug as string);
  if (!event) return new Response('Not found', { status: 404 });

  const origin = site?.origin ?? 'https://www.mbfiddleassociation.org';
  const ics = buildCalendar([event], origin);

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${event.slug.current}.ics"`,
    },
  });
};
