import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAnalyticsHandler, verifySanityToken } from '@/lib/analytics/analyticsHandler'
import { installBearerFetch } from '@/sanity/plugins/bearerFetch'

const URL_BASE = 'https://ilotlegal.com/api/analytics'

function req(query = '', token?: string) {
  return new Request(`${URL_BASE}${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

function setup() {
  let clock = 1_000_000
  const upstream = vi.fn(async (_r: Request) => Response.json({ overview: { rows: [] } }))
  const verifyToken = vi.fn(async (token: string) => token === 'good')
  const GET = createAnalyticsHandler({ upstream, verifyToken, now: () => clock })
  return { GET, upstream, verifyToken, advance: (ms: number) => (clock += ms) }
}

describe('analytics route — auth', () => {
  it('rejects a request with no token', async () => {
    const { GET, upstream } = setup()
    const res = await GET(req('?range=30'))
    expect(res.status).toBe(401)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('rejects a token Sanity does not accept', async () => {
    const { GET, upstream } = setup()
    const res = await GET(req('?range=30', 'bad'))
    expect(res.status).toBe(401)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('remembers a verified token for 5 minutes, then re-checks it', async () => {
    const { GET, verifyToken, advance } = setup()
    await GET(req('?range=7', 'good'))
    await GET(req('?range=14', 'good'))
    expect(verifyToken).toHaveBeenCalledTimes(1)
    advance(5 * 60_000 + 1)
    await GET(req('?range=30', 'good'))
    expect(verifyToken).toHaveBeenCalledTimes(2)
  })
})

describe('analytics route — hardening', () => {
  it('drops a caller-supplied propertyId before calling GA', async () => {
    const { GET, upstream } = setup()
    const res = await GET(req('?range=30&propertyId=999999', 'good'))
    expect(res.status).toBe(200)
    const forwarded = new URL(upstream.mock.calls[0][0].url)
    expect(forwarded.searchParams.get('propertyId')).toBeNull()
    expect(forwarded.searchParams.get('range')).toBe('30')
  })

  it('defaults a missing range to 30 days', async () => {
    const { GET, upstream } = setup()
    await GET(req('', 'good'))
    expect(new URL(upstream.mock.calls[0][0].url).searchParams.get('range')).toBe('30')
  })

  it('rejects a range outside 7/14/30/90', async () => {
    const { GET, upstream } = setup()
    const res = await GET(req('?range=3650', 'good'))
    expect(res.status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('serves a repeat request from cache for 10 minutes', async () => {
    const { GET, upstream, advance } = setup()
    await GET(req('?range=30', 'good'))
    advance(9 * 60_000)
    const cached = await GET(req('?range=30', 'good'))
    expect(await cached.json()).toEqual({ overview: { rows: [] } })
    expect(upstream).toHaveBeenCalledTimes(1)
    advance(2 * 60_000)
    await GET(req('?range=30', 'good'))
    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it('does not cache a GA error', async () => {
    const { GET, upstream } = setup()
    upstream.mockResolvedValueOnce(Response.json({ error: 'Auth failed' }, { status: 500 }))
    const first = await GET(req('?range=30', 'good'))
    expect(first.status).toBe(500)
    await GET(req('?range=30', 'good'))
    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it('marks responses as private and uncacheable by browsers/proxies', async () => {
    const { GET } = setup()
    const res = await GET(req('?range=30', 'good'))
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('verifySanityToken', () => {
  const cfg = { projectId: 'abc123', dataset: 'production', apiVersion: '2024-10-01' }

  beforeEach(() => vi.unstubAllGlobals())

  it('accepts a token that can read the private dataset', async () => {
    const fetchMock = vi.fn(async () => Response.json({ result: true }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await verifySanityToken('tok', cfg)).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/^https:\/\/abc123\.api\.sanity\.io\/v2024-10-01\/data\/query\/production\?/)
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok')
  })

  it('rejects a valid token from outside the project (dataset hidden → false)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ result: false })))
    expect(await verifySanityToken('tok', cfg)).toBe(false)
  })

  it('rejects when Sanity answers 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unauthorized', { status: 401 })))
    expect(await verifySanityToken('tok', cfg)).toBe(false)
  })

  it('rejects when Sanity is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    expect(await verifySanityToken('tok', cfg)).toBe(false)
  })
})

describe('installBearerFetch (Studio shim)', () => {
  const ORIGIN = 'https://ilotlegal.com'

  function target() {
    const original = vi.fn(async (_i: RequestInfo | URL, _init?: RequestInit) => new Response('ok'))
    return { win: { fetch: original as typeof fetch }, original }
  }

  it('adds the bearer token to same-origin /api/analytics calls', async () => {
    const { win, original } = target()
    installBearerFetch(win, { origin: ORIGIN, path: '/api/analytics', token: 'tok' })
    await win.fetch('/api/analytics?range=30')
    const init = original.mock.calls[0][1]!
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok')
  })

  it('leaves every other request untouched', async () => {
    const { win, original } = target()
    installBearerFetch(win, { origin: ORIGIN, path: '/api/analytics', token: 'tok' })
    await win.fetch('https://abc123.api.sanity.io/v1/data/query/production')
    await win.fetch('/api/analytics-other')
    await win.fetch('https://evil.example/api/analytics')
    for (const [, init] of original.mock.calls) {
      expect(new Headers(init?.headers).get('authorization')).toBeNull()
    }
  })

  it('restores the original fetch on cleanup', () => {
    const { win, original } = target()
    const restore = installBearerFetch(win, { origin: ORIGIN, path: '/api/analytics', token: 'tok' })
    expect(win.fetch).not.toBe(original)
    restore()
    expect(win.fetch).toBe(original)
  })
})
