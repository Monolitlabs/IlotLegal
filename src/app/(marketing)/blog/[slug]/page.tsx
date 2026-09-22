import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { getPostBySlug, getAllPostSlugs } from '@/lib/db/posts'
import { PostBody } from '@/components/blog/PostBody'
import { AuthorByline } from '@/components/blog/AuthorByline'
import { RelatedServices } from '@/components/blog/RelatedServices'
import { ShareButton } from '@/components/blog/ShareButton'
import { estimateReadingTime } from '@/lib/reading-time'

export const revalidate = 60

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const slugs = await getAllPostSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return {}

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ilotlegal.com'

  return {
    title: post.meta_title ?? post.title,
    description: post.meta_description ?? post.excerpt ?? undefined,
    openGraph: {
      title: post.meta_title ?? post.title,
      description: post.meta_description ?? post.excerpt ?? undefined,
      url: `${siteUrl}/blog/${post.slug}`,
      type: 'article',
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
      images: post.cover_image_url
        ? [{ url: post.cover_image_url, alt: post.cover_image_alt ?? post.title }]
        : [],
    },
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ilotlegal.com'
  const readingTime = estimateReadingTime(post.body_en as Parameters<typeof estimateReadingTime>[0])

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.cover_image_url ?? undefined,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: {
      '@type': post.author ? 'Person' : 'Organization',
      name: post.author?.name ?? 'Ilot',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Ilot',
      url: siteUrl,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${siteUrl}/blog/${post.slug}`,
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="min-h-screen bg-background">
        <div className="container-site section-padding">
          <div className="max-w-4xl mx-auto">

            {/* Category breadcrumb */}
            <div className="mb-6">
              <Link
                href={`/blog?category=${post.category_slug}`}
                className="inline-flex items-center gap-2"
              >
                <span
                  className="text-xs font-semibold px-3 py-1 rounded-full text-white"
                  style={{ backgroundColor: post.category_accent ?? '#0B0B1A' }}
                >
                  {post.category_name}
                </span>
              </Link>
            </div>

            {/* Title */}
            <h1 className="text-3xl md:text-5xl font-bold text-foreground leading-tight mb-6">
              {post.title}
            </h1>

            {/* Meta row */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-8 mb-8 border-b border-foreground/10">
              <AuthorByline author={post.author} size="md" />
              <div className="flex items-center gap-3 text-sm text-muted">
                <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
                <span>·</span>
                <span>{readingTime} min read</span>
                <span>·</span>
                <ShareButton
                  title={post.title}
                  url={`${siteUrl}/blog/${post.slug}`}
                />
              </div>
            </div>

            {/* Cover image — constrained, editorial */}
            {post.cover_image_url && (
              <div className="relative w-full aspect-[16/9] overflow-hidden rounded-2xl bg-foreground/5 mb-10">
                <Image
                  src={post.cover_image_url}
                  alt={post.cover_image_alt ?? post.title}
                  fill
                  priority
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 896px"
                />
              </div>
            )}

            {/* Two-column layout: body + sidebar */}
            <div className="grid lg:grid-cols-[1fr_320px] gap-12 items-start">

              {/* Body */}
              <article>
                {post.body_en && post.body_en.length > 0 ? (
                  <PostBody blocks={post.body_en} />
                ) : (
                  <p className="text-muted italic">No content yet.</p>
                )}
              </article>

              {/* Sidebar */}
              <aside className="lg:sticky lg:top-24 flex flex-col gap-6">
                <RelatedServices
                  services={post.related_services}
                  categoryName={post.category_name}
                  isCurated={post.has_curated_services}
                />
              </aside>
            </div>

            {/* Back link */}
            <div className="mt-16 pt-8 border-t border-foreground/10">
              <Link
                href="/blog"
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                ← Back to all articles
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
