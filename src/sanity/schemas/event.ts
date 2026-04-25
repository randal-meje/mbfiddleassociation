import { defineType, defineField, defineArrayMember } from 'sanity';

// One-off event. No recurrence engine — every event is its own document. Categories
// mirror the real MFA calendar buckets (jams, workshops, concerts, competitions, the
// summer camp, the AGM, and an Other escape hatch).
export const eventSchema = defineType({
  name: 'event',
  title: 'Event',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'startDate',
      title: 'Start date / time',
      type: 'datetime',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'endDate',
      title: 'End date / time',
      type: 'datetime',
      description: 'Optional. For all-day events, the last day the event runs — an event "June 4 to 6" should end on June 6, not June 7.',
      validation: (r) =>
        r.custom((endDate, ctx) => {
          const start = (ctx.document as { startDate?: string } | undefined)?.startDate;
          if (!endDate || !start) return true;
          return new Date(endDate) >= new Date(start) || 'End date must be on or after start date.';
        }),
    }),
    defineField({
      name: 'allDay',
      title: 'All-day event',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'location',
      title: 'Venue / address',
      type: 'string',
      description: 'The address line visitors see on the event page, e.g. "Carman Community Hall, Carman MB".',
    }),
    defineField({
      name: 'locationUrl',
      title: 'Location link (optional)',
      type: 'url',
      description: 'Optional. If you add a Google Maps URL or the venue website here, the Venue text above becomes a clickable link.',
    }),
    defineField({
      name: 'categories',
      title: 'Categories',
      description: 'Pick one or more that fit — e.g. a contest can be both Competition and Concert.',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        list: [
          { title: 'Jam', value: 'jam' },
          { title: 'Workshop', value: 'workshop' },
          { title: 'Concert', value: 'concert' },
          { title: 'Competition', value: 'competition' },
          { title: 'Camp', value: 'camp' },
          { title: 'AGM', value: 'agm' },
          { title: 'Festival', value: 'festival' },
          { title: 'Other', value: 'other' },
        ],
        // Checkbox list — clearer affordance for multi-select than the dropdown default.
        layout: 'grid',
      },
      initialValue: ['other'],
      validation: (r) => r.required().min(1),
    }),
    defineField({
      name: 'coverImage',
      type: 'image',
      description: 'Landscape photo, at least 1600 px on the long edge. Sanity resizes automatically for each surface — upload the biggest version you have.',
      options: { hotspot: true },
      fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
    }),
    defineField({
      name: 'body',
      title: 'Details',
      type: 'array',
      of: [
        defineArrayMember({ type: 'block' }),
        defineArrayMember({
          type: 'image',
          options: { hotspot: true },
          fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
        }),
      ],
    }),
    defineField({
      name: 'externalLink',
      title: 'External link URL',
      type: 'url',
      description: 'Optional. Registration page, the event website, a ticket vendor — whatever fits.',
    }),
    defineField({
      name: 'externalLinkLabel',
      title: 'External link button label',
      type: 'string',
      description: 'Shown on the button next to the URL above. Defaults to "More info" if blank.',
    }),
  ],
  orderings: [
    {
      title: 'Start date ascending',
      name: 'startDateAsc',
      by: [{ field: 'startDate', direction: 'asc' }],
    },
    {
      title: 'Start date descending',
      name: 'startDateDesc',
      by: [{ field: 'startDate', direction: 'desc' }],
    },
  ],
  preview: {
    select: {
      title: 'title',
      date: 'startDate',
      categories: 'categories',
      location: 'location',
      media: 'coverImage',
    },
    prepare: ({ title, date, categories, location, media }) => ({
      title,
      subtitle: [
        date
          ? new Date(date).toLocaleDateString('en-CA', { timeZone: 'America/Winnipeg' })
          : 'No date',
        Array.isArray(categories) ? categories.join(', ') : '',
        location,
      ].filter(Boolean).join(' · '),
      media,
    }),
  },
});
