// Shared between the /api/analytics/articles route (server) and the Studio's
// Articles tool (browser), so no server-only imports here.

export const BLOG_PREFIX = '/blog/'

/** GA numbers for one article slug, summed over every path variant of it. */
export type ArticleViews = {
  slug: string
  views: number
  users: number
  /** Total engaged seconds (GA `userEngagementDuration`). */
  engagementSeconds: number
}

export type PostRef = {
  _id: string
  slug: string | null
  title: string | null
  publishedAt: string | null
  isActive: boolean | null
}

export type ArticleRow = {
  key: string
  /** Null when GA has views for a slug no current post uses (renamed/deleted). */
  docId: string | null
  title: string
  path: string
  views: number
  users: number
  /** Average engagement time per user, in seconds. */
  avgEngagementSeconds: number
  publishedAt: string | null
  isActive: boolean
}

/** `/blog/my-post/` → `my-post`. Null for `/blog/`, nested paths, or non-blog paths. */
export function slugFromPath(path: string): string | null {
  if (!path.startsWith(BLOG_PREFIX)) return null
  let rest = path.slice(BLOG_PREFIX.length).replace(/\/+$/, '')
  try {
    rest = decodeURIComponent(rest)
  } catch {
    // keep the raw value if it isn't valid percent-encoding
  }
  return rest && !rest.includes('/') ? rest : null
}

/**
 * Every post appears (zero views if GA has none), plus any GA slug that no
 * longer matches a post. Sorted by views, then newest first.
 */
export function joinArticleStats(posts: PostRef[], views: ArticleViews[]): ArticleRow[] {
  const bySlug = new Map(views.map((v) => [v.slug, v]))
  const seen = new Set<string>()

  const rows: ArticleRow[] = posts.map((post) => {
    const v = post.slug ? bySlug.get(post.slug) : undefined
    if (post.slug) seen.add(post.slug)
    return {
      key: post._id,
      docId: post._id,
      title: post.title || post.slug || 'Untitled',
      path: post.slug ? `${BLOG_PREFIX}${post.slug}` : '',
      ...metrics(v),
      publishedAt: post.publishedAt,
      isActive: post.isActive !== false,
    }
  })

  for (const v of views) {
    if (seen.has(v.slug)) continue
    rows.push({
      key: `ga:${v.slug}`,
      docId: null,
      title: `${BLOG_PREFIX}${v.slug}`,
      path: `${BLOG_PREFIX}${v.slug}`,
      ...metrics(v),
      publishedAt: null,
      isActive: false,
    })
  }

  return rows.sort(
    (a, b) => b.views - a.views || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  )
}

function metrics(v: ArticleViews | undefined) {
  if (!v) return { views: 0, users: 0, avgEngagementSeconds: 0 }
  return {
    views: v.views,
    users: v.users,
    avgEngagementSeconds: v.users ? v.engagementSeconds / v.users : 0,
  }
}
