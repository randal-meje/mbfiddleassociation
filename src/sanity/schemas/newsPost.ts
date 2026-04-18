import { defineType, defineField, defineArrayMember } from 'sanity';

// News post schema. `publishedAt` doubles as the scheduling primitive — posts with
// a future date are excluded by the site's Sanity query, so the board can draft
// ahead without touching a publish button.
export const newsPostSchema = defineType({
  name: 'newsPost',
  title: 'News post',
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
      name: 'publishedAt',
      title: 'Published at',
      description: 'Posts with a future date are hidden until that date (rebuild required).',
      type: 'datetime',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'excerpt',
      type: 'text',
      rows: 3,
      description: 'Used on news cards and social meta tags. Keep under 280 characters.',
      validation: (r) => r.max(280),
    }),
    defineField({
      name: 'coverImage',
      type: 'image',
      description: 'Landscape photo, at least 1600 px on the long edge. Sanity resizes automatically — upload the biggest version you have.',
      options: { hotspot: true },
      fields: [
        { name: 'alt', type: 'string', title: 'Alt text (required for accessibility)' },
      ],
    }),
    defineField({
      name: 'author',
      type: 'string',
      description: 'Optional — leave blank to credit the MFA.',
    }),
    defineField({
      name: 'body',
      type: 'array',
      of: [
        defineArrayMember({ type: 'block' }),
        defineArrayMember({
          type: 'image',
          options: { hotspot: true },
          fields: [
            { name: 'alt', type: 'string', title: 'Alt text' },
            { name: 'caption', type: 'string' },
          ],
        }),
      ],
    }),
    defineField({
      name: 'attachments',
      title: 'Downloadable files (PDFs etc.)',
      description: 'Drop PDFs here (results, programs, press releases). They render as download buttons above the body. Multiple files are fine.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'file',
          fields: [
            { name: 'label', type: 'string', title: 'Label shown on the page' },
          ],
        }),
      ],
    }),
  ],
  orderings: [
    {
      title: 'Newest first',
      name: 'publishedAtDesc',
      by: [{ field: 'publishedAt', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'title', date: 'publishedAt', media: 'coverImage' },
    prepare: ({ title, date, media }) => ({
      title,
      subtitle: date ? new Date(date).toLocaleDateString('en-CA') : 'No date',
      media,
    }),
  },
});
