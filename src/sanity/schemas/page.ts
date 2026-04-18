import { defineType, defineField, defineArrayMember } from 'sanity';

// Generic static page: About, Join, Contact, and any one-off pages the board wants to
// add later. Title + slug + rich body + optional attachment files (Join has a membership
// PDF today). Starts simple; we'll extend fields only when a real need appears.
export const pageSchema = defineType({
  name: 'page',
  title: 'Page',
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
      name: 'subtitle',
      type: 'string',
      description: 'Optional short line shown beneath the page title.',
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      of: [
        defineArrayMember({ type: 'block' }),
        defineArrayMember({
          type: 'image',
          options: { hotspot: true },
          fields: [
            { name: 'alt', type: 'string', title: 'Alt text (required for accessibility)' },
          ],
        }),
        // Tables come from @sanity/table — inserted as a block element alongside paragraphs
        // and images. Keep them for occasional data (contest results, roster grids) rather
        // than as a layout tool.
        defineArrayMember({ type: 'table' }),
      ],
    }),
    defineField({
      name: 'attachments',
      title: 'Downloadable files (PDFs etc.)',
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
  preview: {
    select: { title: 'title', subtitle: 'subtitle', slug: 'slug.current' },
    prepare: ({ title, subtitle, slug }) => ({
      title,
      subtitle: subtitle ? subtitle : slug ? `/${slug}` : '',
    }),
  },
});
