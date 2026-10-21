import { createAnalyticsHandler, verifySanityToken } from '@/lib/analytics/analyticsHandler'
import { gaReport } from '@/lib/analytics/gaReport'
import { apiVersion, dataset, projectId } from '@/sanity/env'

// Same as ../route.ts, but every GA report is limited to /blog page views.
// Used by the Studio Analytics tool's "Blog only" switch.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = createAnalyticsHandler({
  upstream: (request) => gaReport(request, 'blog'),
  verifyToken: (token) => verifySanityToken(token, { projectId, dataset, apiVersion }),
})
