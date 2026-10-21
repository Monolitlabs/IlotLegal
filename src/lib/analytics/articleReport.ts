import 'server-only'
import type { GaReport } from './gaClient'
import { BLOG_PREFIX, slugFromPath, type ArticleViews } from './articleStats'

// Per-article GA report: one runReport call for every /blog/* path in the
// range. Meant as the `upstream` of createAnalyticsHandler, which has already
// checked auth and validated `range` by the time this runs.

export function createArticleReportHandler(deps: {
  runReport: (body: object) => Promise<GaReport>
}) {
  return async function GET(request: Request): Promise<Response> {
    const range = new URL(request.url).searchParams.get('range') || '30'
    try {
      const report = await deps.runReport(articleReportRequest(`${range}daysAgo`))
      return Response.json({ articles: parseArticleReport(report) })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[analytics/articles]', msg)
      return Response.json({ error: msg }, { status: 500 })
    }
  }
}

/** runReport body for every /blog/* path from `startDate` (GA date syntax) to today. */
export function articleReportRequest(startDate: string) {
  return {
    dateRanges: [{ startDate, endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'activeUsers' },
      { name: 'userEngagementDuration' },
    ],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'BEGINS_WITH', value: BLOG_PREFIX },
      },
    },
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 1000,
  }
}

/**
 * Sums path variants of the same article (`/blog/x`, `/blog/x/`) into one
 * entry. Users are summed too, so a person who hit both variants counts twice;
 * trailing-slash variants are rare enough that this is acceptable.
 */
export function parseArticleReport(report: GaReport): ArticleViews[] {
  const bySlug = new Map<string, ArticleViews>()
  for (const row of report.rows ?? []) {
    const slug = slugFromPath(row.dimensionValues[0]?.value ?? '')
    if (!slug) continue
    const [views, users, engagement] = row.metricValues.map((m) => Number(m.value) || 0)
    const entry = bySlug.get(slug) ?? { slug, views: 0, users: 0, engagementSeconds: 0 }
    entry.views += views
    entry.users += users
    entry.engagementSeconds += engagement
    bySlug.set(slug, entry)
  }
  return [...bySlug.values()].sort((a, b) => b.views - a.views)
}
