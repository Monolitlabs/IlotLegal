import 'server-only'

// Guard around sanity-plugin-analytics' GA4 route handler. The plugin's own
// handler answers anyone, lets the caller pick any GA property via
// `?propertyId=`, and fires 16 GA Data API calls per request. This wrapper:
//   - requires a Sanity token that can read our private dataset (i.e. a
//     project member, logged into the Studio — see sanity/plugins/analyticsAuth)
//   - drops `propertyId`, so the property always comes from GA_PROPERTY_ID
//   - only allows the ranges the dashboard offers
//   - caches successful GA responses per range for 10 minutes

type Handler = (request: Request) => Promise<Response>

const ALLOWED_RANGES = new Set(['7', '14', '30', '90'])
const DEFAULT_RANGE = '30'
const TOKEN_TTL_MS = 5 * 60_000
const REPORT_TTL_MS = 10 * 60_000
const HEADERS = { 'Cache-Control': 'private, no-store' }

export function createAnalyticsHandler(deps: {
  upstream: Handler
  verifyToken: (token: string) => Promise<boolean>
  now?: () => number
}): Handler {
  const now = deps.now ?? Date.now
  const verifiedTokens = new Map<string, number>()
  const reports = new Map<string, { body: string; expiresAt: number }>()

  async function isAuthorized(request: Request): Promise<boolean> {
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) return false

    const expiresAt = verifiedTokens.get(token)
    if (expiresAt && expiresAt > now()) return true

    if (!(await deps.verifyToken(token))) return false
    for (const [t, exp] of verifiedTokens) if (exp <= now()) verifiedTokens.delete(t)
    verifiedTokens.set(token, now() + TOKEN_TTL_MS)
    return true
  }

  return async function GET(request) {
    if (!(await isAuthorized(request))) {
      return Response.json(
        { error: 'Unauthorized — open this from a logged-in Sanity Studio.' },
        { status: 401, headers: HEADERS },
      )
    }

    const range = new URL(request.url).searchParams.get('range') || DEFAULT_RANGE
    if (!ALLOWED_RANGES.has(range)) {
      return Response.json({ error: `Unsupported range: ${range}` }, { status: 400, headers: HEADERS })
    }

    const cached = reports.get(range)
    if (cached && cached.expiresAt > now()) {
      return new Response(cached.body, {
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Rebuild the URL from scratch so nothing but `range` reaches the plugin.
    const upstreamUrl = new URL(request.url)
    upstreamUrl.search = new URLSearchParams({ range }).toString()
    const res = await deps.upstream(new Request(upstreamUrl))
    const body = await res.text()
    if (res.ok) reports.set(range, { body, expiresAt: now() + REPORT_TTL_MS })

    return new Response(body, {
      status: res.status,
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
    })
  }
}

// The dataset is private, so only project members can see its documents.
// Anyone else — an invalid token, or a valid token from another Sanity
// project — gets a 401 or an ACL-filtered empty result, so `defined(...)` is
// false either way.
export async function verifySanityToken(
  token: string,
  cfg: { projectId: string; dataset: string; apiVersion: string },
): Promise<boolean> {
  const query = encodeURIComponent('defined(*[_type == "category"][0]._id)')
  const url = `https://${cfg.projectId}.api.sanity.io/v${cfg.apiVersion}/data/query/${cfg.dataset}?query=${query}`
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) return false
    const { result } = (await res.json()) as { result?: unknown }
    return result === true
  } catch {
    return false
  }
}
