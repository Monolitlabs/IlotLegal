import 'server-only'
import { createSign } from 'node:crypto'

// Our copy of sanity-plugin-analytics' GA4 handler (same 16 reports, same
// response shape, so the plugin's dashboard renders it unchanged), plus an
// optional scope. The plugin's own handler can't filter, and we need a
// "Blog only" view in the Studio.
//
// scope 'blog' restricts every report to page views under /blog. Sessions,
// users, sources etc. then mean "sessions that viewed a blog page". The
// realtime API has no page-path dimension, so the live "active users" count
// is left empty in blog scope rather than showing a site-wide number.

export type GaScope = 'site' | 'blog'

const GA_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta'
const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

const SCOPE_FILTERS: Record<GaScope, object | undefined> = {
  site: undefined,
  // GA's FULL_REGEXP must match the whole path: /blog and /blog/<slug>.
  blog: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'FULL_REGEXP', value: '/blog(/.*)?' } } },
}

type ReportBody = Record<string, unknown>

// Order matters: the response keys below index into this list.
export function buildReports(range: string, scope: GaScope): ReportBody[] {
  const dateRanges = [{ startDate: `${range}daysAgo`, endDate: 'today' }]
  const dimensionFilter = SCOPE_FILTERS[scope]
  const r = (body: ReportBody): ReportBody => ({
    dateRanges,
    ...body,
    ...(dimensionFilter && { dimensionFilter }),
  })
  const byMetric = (metricName: string) => [{ metric: { metricName }, desc: true }]

  return [
    // 0. Overview
    r({
      metrics: [
        { name: 'totalUsers' }, { name: 'newUsers' }, { name: 'sessions' },
        { name: 'screenPageViews' }, { name: 'averageSessionDuration' }, { name: 'bounceRate' },
        { name: 'engagedSessions' }, { name: 'engagementRate' },
        { name: 'screenPageViewsPerSession' }, { name: 'eventsPerSession' },
      ],
    }),
    // 1. Time series
    r({
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'totalUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
      orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
    }),
    // 2. Hourly, today only
    r({
      dateRanges: [{ startDate: 'today', endDate: 'today' }],
      dimensions: [{ name: 'hour' }],
      metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
      orderBys: [{ dimension: { dimensionName: 'hour' }, desc: false }],
    }),
    // 3. Top pages
    r({
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }, { name: 'averageSessionDuration' }],
      orderBys: byMetric('screenPageViews'),
      limit: 15,
    }),
    // 4. Landing pages
    r({
      dimensions: [{ name: 'landingPage' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'bounceRate' }],
      orderBys: byMetric('sessions'),
      limit: 10,
    }),
    // 5. Devices
    r({ dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'sessions' }, { name: 'totalUsers' }] }),
    // 6. Browsers
    r({ dimensions: [{ name: 'browser' }], metrics: [{ name: 'sessions' }], orderBys: byMetric('sessions'), limit: 8 }),
    // 7. Operating systems
    r({ dimensions: [{ name: 'operatingSystem' }], metrics: [{ name: 'sessions' }], orderBys: byMetric('sessions'), limit: 8 }),
    // 8. Countries
    r({
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
      orderBys: byMetric('totalUsers'),
      limit: 10,
    }),
    // 9. Cities
    r({
      dimensions: [{ name: 'city' }, { name: 'country' }],
      metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
      orderBys: byMetric('totalUsers'),
      limit: 10,
    }),
    // 10. Sources
    r({
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
      orderBys: byMetric('sessions'),
      limit: 10,
    }),
    // 11. Channels
    r({
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'engagementRate' }],
      orderBys: byMetric('sessions'),
    }),
    // 12. New vs returning
    r({ dimensions: [{ name: 'newVsReturning' }], metrics: [{ name: 'totalUsers' }] }),
    // 13. Events
    r({
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      orderBys: byMetric('eventCount'),
      limit: 15,
    }),
    // 14. Referrers
    r({
      dimensions: [{ name: 'pageReferrer' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
      orderBys: byMetric('sessions'),
      limit: 10,
    }),
  ]
}

const RESPONSE_KEYS = [
  'overview', 'timeSeries', 'hourlyToday', 'topPages', 'landingPages', 'devices', 'browsers',
  'operatingSystems', 'countries', 'cities', 'trafficSources', 'channels', 'newVsReturning',
  'topEvents', 'referrers',
] as const

let cachedToken: { value: string; expiresAt: number } | null = null

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

async function getAccessToken(fetchImpl: typeof fetch): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value

  const clientEmail = process.env.GA_SERVICE_ACCOUNT_EMAIL
  const privateKeyRaw = process.env.GA_PRIVATE_KEY
  if (!clientEmail || !privateKeyRaw) {
    throw new Error('Missing GA_SERVICE_ACCOUNT_EMAIL or GA_PRIVATE_KEY env vars')
  }

  const iat = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({ iss: clientEmail, scope: GA_SCOPE, aud: GA_TOKEN_URL, iat, exp: iat + 3600 }),
  )
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(privateKeyRaw.replace(/\\n/g, '\n'))

  const res = await fetchImpl(GA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${base64url(signature)}`,
    }),
  })
  if (!res.ok) throw new Error(`Failed to obtain access token: ${await res.text()}`)

  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { value: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 }
  return access_token
}

async function runReport(
  fetchImpl: typeof fetch,
  method: 'runReport' | 'runRealtimeReport',
  propertyId: string,
  token: string,
  body: ReportBody,
): Promise<unknown> {
  const res = await fetchImpl(`${GA_API_BASE}/properties/${propertyId}:${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(err?.error?.message || `GA API error ${res.status}: ${res.statusText}`)
  }
  return res.json()
}

// Reads `range` from the request URL; scope is fixed per route.
export async function gaReport(
  request: Request,
  scope: GaScope,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  try {
    const propertyId = process.env.GA_PROPERTY_ID
    if (!propertyId) return Response.json({ error: 'GA_PROPERTY_ID not configured' }, { status: 500 })

    const range = new URL(request.url).searchParams.get('range') || '30'

    let token: string
    try {
      token = await getAccessToken(fetchImpl)
    } catch (authErr) {
      const msg = authErr instanceof Error ? authErr.message : String(authErr)
      console.error('[analytics] Auth error:', msg)
      return Response.json({ error: `Auth failed: ${msg}` }, { status: 500 })
    }

    const reports = buildReports(range, scope).map((body) =>
      runReport(fetchImpl, 'runReport', propertyId, token, body),
    )
    const realtime =
      scope === 'site'
        ? runReport(fetchImpl, 'runRealtimeReport', propertyId, token, { metrics: [{ name: 'activeUsers' }] })
        : Promise.resolve({})

    const settled = await Promise.allSettled(reports)
    settled.forEach((s, i) => {
      if (s.status === 'rejected') console.error(`[analytics] report[${i}] failed:`, s.reason)
    })

    const body: Record<string, unknown> = {
      // Realtime failures are non-fatal, as in the plugin.
      activeUsers: await realtime.catch(() => ({})),
    }
    RESPONSE_KEYS.forEach((key, i) => {
      const s = settled[i]
      body[key] = s.status === 'fulfilled' ? s.value : {}
    })
    return Response.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[analytics] Unhandled error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
