import { describe, it, expect, vi } from 'vitest'
import { createArticleReportHandler, parseArticleReport } from '@/lib/analytics/articleReport'
import { joinArticleStats, slugFromPath, type PostRef } from '@/lib/analytics/articleStats'
import type { GaReport } from '@/lib/analytics/gaClient'

function gaRow(path: string, views: number, users: number, engagement: number) {
  return {
    dimensionValues: [{ value: path }],
    metricValues: [{ value: String(views) }, { value: String(users) }, { value: String(engagement) }],
  }
}

function post(slug: string, extra: Partial<PostRef> = {}): PostRef {
  return { _id: `post-${slug}`, slug, title: `Title ${slug}`, publishedAt: '2026-01-01', isActive: true, ...extra }
}

describe('slugFromPath', () => {
  it('extracts the slug, ignoring a trailing slash and decoding it', () => {
    expect(slugFromPath('/blog/visa-guide')).toBe('visa-guide')
    expect(slugFromPath('/blog/visa-guide/')).toBe('visa-guide')
    expect(slugFromPath('/blog/caf%C3%A9')).toBe('café')
  })

  it('rejects the index, nested paths and non-blog paths', () => {
    expect(slugFromPath('/blog/')).toBeNull()
    expect(slugFromPath('/blog')).toBeNull()
    expect(slugFromPath('/blog/a/b')).toBeNull()
    expect(slugFromPath('/services/x')).toBeNull()
  })
})

describe('parseArticleReport', () => {
  it('merges path variants of one article and sorts by views', () => {
    const result = parseArticleReport({
      rows: [
        gaRow('/blog/a', 10, 4, 120),
        gaRow('/blog/b', 30, 20, 600),
        gaRow('/blog/a/', 5, 1, 30),
        gaRow('/blog/', 99, 50, 0),
      ],
    })
    expect(result).toEqual([
      { slug: 'b', views: 30, users: 20, engagementSeconds: 600 },
      { slug: 'a', views: 15, users: 5, engagementSeconds: 150 },
    ])
  })

  it('handles a report with no rows', () => {
    expect(parseArticleReport({})).toEqual([])
  })
})

describe('joinArticleStats', () => {
  it('lists every post, zero-filled, plus GA slugs with no post', () => {
    const rows = joinArticleStats(
      [post('a'), post('quiet', { publishedAt: '2026-05-01' }), post('off', { isActive: false })],
      [
        { slug: 'a', views: 12, users: 4, engagementSeconds: 200 },
        { slug: 'old-slug', views: 3, users: 3, engagementSeconds: 0 },
      ],
    )
    expect(rows.map((r) => [r.key, r.views])).toEqual([
      ['post-a', 12],
      ['ga:old-slug', 3],
      ['post-quiet', 0],
      ['post-off', 0],
    ])
    expect(rows[0]).toMatchObject({ docId: 'post-a', title: 'Title a', path: '/blog/a', avgEngagementSeconds: 50 })
    expect(rows[1]).toMatchObject({ docId: null, title: '/blog/old-slug' })
    expect(rows[3].isActive).toBe(false)
  })
})

describe('article report handler', () => {
  it('asks GA for /blog/ paths over the requested range', async () => {
    const runReport = vi.fn<(body: object) => Promise<GaReport>>(async () => ({ rows: [gaRow('/blog/a', 2, 1, 10)] }))
    const GET = createArticleReportHandler({ runReport })
    const res = await GET(new Request('https://ilotlegal.com/api/analytics/articles?range=7'))
    expect(await res.json()).toEqual({ articles: [{ slug: 'a', views: 2, users: 1, engagementSeconds: 10 }] })
    expect(runReport.mock.calls[0][0]).toMatchObject({
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/blog/' } } },
    })
  })

  it('returns a 500 with the GA error message', async () => {
    const GET = createArticleReportHandler({
      runReport: async () => {
        throw new Error('GA_PROPERTY_ID not configured')
      },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(new Request('https://ilotlegal.com/api/analytics/articles?range=30'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'GA_PROPERTY_ID not configured' })
  })
})
