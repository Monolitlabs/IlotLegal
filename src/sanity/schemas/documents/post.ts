import { defineType, defineField } from 'sanity'

export const post = defineType({
  name: 'post',
  title: 'Blog Post',
  type: 'document',
  fields: [
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: (doc: any) => doc?.title?.en ?? '', maxLength: 96 },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'localizedString',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'excerpt',
      title: 'Excerpt',
      type: 'localizedText',
      description: 'Short summary shown on cards and used as meta description fallback.',
    }),
    defineField({
      name: 'coverImage',
      title: 'Cover Image',
      type: 'image',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          title: 'Alt text',
          type: 'localizedString',
        }),
      ],
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'localizedRichText',
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'reference',
      to: [{ type: 'category' }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'relatedServices',
      title: 'Related Services',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{ type: 'service' }],
          options: {
            // Use a GROQ filter so the picker queries directly instead of
            // relying on the full-text search index (which lags after bulk import).
            filter: ({ searchQuery }: { searchQuery: string }) => ({
              filter: searchQuery
                ? 'isActive == true && name.en match $q'
                : 'isActive == true',
              params: searchQuery ? { q: `*${searchQuery}*` } : {},
            }),
          },
        },
      ],
      validation: (r) => r.max(4).unique(),
      description:
        "Optional. Hand-pick up to 4 services to show in this article's sidebar, in this order. Services from any category are allowed. Leave empty to automatically show the top services from the post's own category.",
    }),
    defineField({
      name: 'author',
      title: 'Author',
      type: 'reference',
      to: [{ type: 'author' }],
      description: 'Leave empty to use "Ilot" as the firm byline.',
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'featured',
      title: 'Featured',
      type: 'boolean',
      initialValue: false,
      description: 'Pin this post to the hero slot on /blog. Only one post should be featured at a time.',
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seoFields',
    }),
    defineField({
      name: 'isActive',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
    }),
  ],
  orderings: [
    { title: 'Newest first', name: 'publishedAtDesc', by: [{ field: 'publishedAt', direction: 'desc' }] },
  ],
  preview: {
    select: {
      title: 'title.en',
      media: 'coverImage',
    },
  },
})
