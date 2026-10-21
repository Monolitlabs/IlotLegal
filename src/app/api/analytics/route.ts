import { GET as gaReport } from 'sanity-plugin-analytics/api/analytics'
import { createAnalyticsHandler, verifySanityToken } from '@/lib/analytics/analyticsHandler'
import { apiVersion, dataset, projectId } from '@/sanity/env'

// Feeds the Studio's Analytics tool. Needs GA_PROPERTY_ID,
// GA_SERVICE_ACCOUNT_EMAIL and GA_PRIVATE_KEY (server-only).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = createAnalyticsHandler({
  upstream: gaReport,
  verifyToken: (token) => verifySanityToken(token, { projectId, dataset, apiVersion }),
})
