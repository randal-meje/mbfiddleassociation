import { defineType, defineField, defineArrayMember } from 'sanity';

// Wall of Fame inductee. Names don't localize (they're proper nouns) so the schema is
// flat rather than wrapped in document-internationalization. Each year the board adds
// new inductee docs via Studio; old ones can be backfilled with bio text or PDFs over
// time — every content field is optional except name, year, and category.
export const inducteeSchema = defineType({
  name: 'inductee',
  title: 'Wall of Fame inductee',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'year',
      type: 'number',
      description: 'Induction year.',
      validation: (r) => r.required().integer().min(1999).max(2100),
    }),
    defineField({
      name: 'category',
      type: 'string',
      options: {
        list: [
          { title: 'Fiddler', value: 'fiddler' },
          { title: 'Accompanist', value: 'accompanist' },
          { title: 'Builder / Promoter', value: 'builder' },
          { title: 'Other', value: 'other' },
        ],
        layout: 'radio',
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'posthumous',
      title: 'Inducted posthumously',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'photo',
      type: 'image',
      description: 'Portrait photo, ideally 1200 × 1500 px or larger. Sanity handles resizing — upload the biggest version you have.',
      options: { hotspot: true },
      fields: [
        { name: 'alt', type: 'string', title: 'Alt text (describe the photo)' },
      ],
    }),
    defineField({
      name: 'bioPdf',
      title: 'Bio PDF',
      type: 'file',
      description: 'Optional — a single-page bio PDF, if one has been produced.',
      options: { accept: 'application/pdf' },
    }),
    defineField({
      name: 'bioBody',
      title: 'Inline bio',
      type: 'array',
      description: 'Optional — write the inductee’s story directly here (preferred over PDF when available).',
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
      name: 'order',
      title: 'Sort order within year',
      description: 'Lower numbers first. Use 10, 20, 30… so you can easily slot new entries between.',
      type: 'number',
      initialValue: 100,
    }),
  ],
  orderings: [
    {
      title: 'Year desc, then order',
      name: 'yearDesc',
      by: [
        { field: 'year', direction: 'desc' },
        { field: 'order', direction: 'asc' },
      ],
    },
  ],
  preview: {
    select: { name: 'name', year: 'year', category: 'category', media: 'photo' },
    prepare: ({ name, year, category, media }) => ({
      title: name,
      subtitle: `${year} · ${category ?? '—'}`,
      media,
    }),
  },
});
