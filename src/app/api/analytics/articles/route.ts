import { createAnalyticsHandler, verifySanityToken } from '@/lib/analytics/analyticsHandler'
import { createArticleReportHandler } from '@/lib/analytics/articleReport'
import { runGaReport } from '@/lib/analytics/gaClient'
import { apiVersion, dataset, projectId } from '@/sanity/env'

// Feeds the Studio's Articles tool (sanity/plugins/articleAnalytics). Same
// auth, range rules and 10-minute cache as /api/analytics.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = createAnalyticsHandler({
  upstream: createArticleReportHandler({ runReport: runGaReport }),
  verifyToken: (token) => verifySanityToken(token, { projectId, dataset, apiVersion }),
})
