import 'server-only'
import { unstable_cache } from 'next/cache'
import { runGaReport } from './gaClient'
import { articleReportRequest, parseArticleReport } from './articleReport'

// All-time view counts for the public article pages. One GA call covers every
// post and is cached for an hour, so page revalidation never hits GA directly.
// 2015-08-14 is the earliest date the GA4 Data API accepts.

const getAllPostViews = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const report = await runGaReport(articleReportRequest('2015-08-14'))
    return Object.fromEntries(parseArticleReport(report).map((a) => [a.slug, a.views]))
  },
  ['blog-post-views'],
  { revalidate: 3600 },
)

/** All-time views for one post; null when GA is unavailable or has no data for it. */
export async function getPostViews(slug: string): Promise<number | null> {
  try {
    const views = (await getAllPostViews())[slug]
    return views ? views : null
  } catch (err) {
    console.error('[analytics/postViews]', err instanceof Error ? err.message : err)
    return null
  }
}
