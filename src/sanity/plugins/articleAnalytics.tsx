import { useEffect, useMemo, useState } from 'react'
import { definePlugin, useClient } from 'sanity'
import { IntentLink } from 'sanity/router'
import { Badge, Box, Card, Container, Flex, Heading, Inline, Select, Spinner, Stack, Text } from '@sanity/ui'
import { Newspaper } from 'lucide-react'
import { apiVersion } from '../env'
import {
  joinArticleStats,
  type ArticleRow,
  type ArticleViews,
  type PostRef,
} from '../../lib/analytics/articleStats'

// Studio tool: GA views per blog article, joined with the post documents so
// rows show titles and link to the editor. Data comes from
// /api/analytics/articles, which needs the logged-in user's Sanity token
// (requires `auth.loginMethod: 'token'`, same as analyticsAuth).

const API_PATH = '/api/analytics/articles'
const RANGES = ['7', '14', '30', '90'] as const

const POSTS_QUERY = `*[_type == "post" && !(_id in path("drafts.**"))]{
  _id, "slug": slug.current, "title": title.en, publishedAt, isActive
}`

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: ArticleRow[] }

function ArticleAnalyticsTool() {
  const client = useClient({ apiVersion })
  const token = client.config().token
  const [range, setRange] = useState<(typeof RANGES)[number]>('30')
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: 'No Studio login token — log out and back in.' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })

    Promise.all([
      client.fetch<PostRef[]>(POSTS_QUERY),
      fetch(`${API_PATH}?range=${range}`, { headers: { Authorization: `Bearer ${token}` } }).then(
        async (res) => {
          const body = (await res.json().catch(() => ({}))) as { articles?: ArticleViews[]; error?: string }
          if (!res.ok) throw new Error(body.error || `Analytics request failed (${res.status})`)
          return body.articles ?? []
        },
      ),
    ])
      .then(([posts, views]) => {
        if (!cancelled) setState({ status: 'ready', rows: joinArticleStats(posts, views) })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })

    return () => {
      cancelled = true
    }
  }, [client, token, range])

  return (
    <Container width={4} padding={4}>
      <Stack space={4}>
        <Flex align="center" justify="space-between" gap={3} wrap="wrap">
          <Stack space={2}>
            <Heading as="h1" size={2}>Article views</Heading>
            <Text size={1} muted>Google Analytics page views for /blog articles. Data can lag up to 10 minutes.</Text>
          </Stack>
          <Box style={{ minWidth: 160 }}>
            <Select value={range} onChange={(e) => setRange(e.currentTarget.value as typeof range)}>
              {RANGES.map((r) => (
                <option key={r} value={r}>Last {r} days</option>
              ))}
            </Select>
          </Box>
        </Flex>

        {state.status === 'loading' && (
          <Flex justify="center" padding={5}><Spinner muted /></Flex>
        )}
        {state.status === 'error' && (
          <Card tone="critical" padding={4} radius={2} border>
            <Text size={1}>{state.message}</Text>
          </Card>
        )}
        {state.status === 'ready' && <ArticleTable rows={state.rows} />}
      </Stack>
    </Container>
  )
}

function ArticleTable({ rows }: { rows: ArticleRow[] }) {
  const totals = useMemo(
    () => ({
      views: rows.reduce((n, r) => n + r.views, 0),
      withViews: rows.filter((r) => r.views > 0).length,
    }),
    [rows],
  )

  if (rows.length === 0) {
    return <Card padding={4} radius={2} border><Text size={1} muted>No articles yet.</Text></Card>
  }

  return (
    <Stack space={3}>
      <Inline space={3}>
        <Summary label="Article views" value={totals.views.toLocaleString()} />
        <Summary label="Articles viewed" value={`${totals.withViews} / ${rows.length}`} />
      </Inline>
      <Card radius={2} border overflow="auto">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th>Article</Th>
              <Th align="right">Views</Th>
              <Th align="right">Users</Th>
              <Th align="right">Avg. time</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <Td>
                  <Stack space={2}>
                    <Text size={1} weight="medium">
                      {row.docId ? (
                        <IntentLink intent="edit" params={{ id: row.docId, type: 'post' }}>{row.title}</IntentLink>
                      ) : (
                        row.title
                      )}
                    </Text>
                    <Inline space={2}>
                      <Text size={0} muted>{row.path}</Text>
                      {!row.docId && <Badge tone="caution" fontSize={0}>Not in Studio</Badge>}
                      {row.docId && !row.isActive && <Badge fontSize={0}>Inactive</Badge>}
                    </Inline>
                  </Stack>
                </Td>
                <Td align="right"><Text size={1}>{row.views.toLocaleString()}</Text></Td>
                <Td align="right"><Text size={1}>{row.users.toLocaleString()}</Text></Td>
                <Td align="right"><Text size={1}>{formatDuration(row.avgEngagementSeconds)}</Text></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Stack>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <Card padding={3} radius={2} border>
      <Stack space={2}>
        <Text size={0} muted>{label}</Text>
        <Text size={3} weight="semibold">{value}</Text>
      </Stack>
    </Card>
  )
}

const cellStyle = { padding: '12px 16px', borderBottom: '1px solid var(--card-border-color)' }

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{ ...cellStyle, textAlign: align }}>
      <Text size={0} weight="semibold" muted>{children}</Text>
    </th>
  )
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td style={{ ...cellStyle, textAlign: align, verticalAlign: 'top' }}>{children}</td>
}

function formatDuration(seconds: number): string {
  if (!seconds) return '—'
  const s = Math.round(seconds)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

export const articleAnalytics = definePlugin({
  name: 'ilot-article-analytics',
  tools: (prev) => [
    ...prev,
    { name: 'article-analytics', title: 'Articles', icon: Newspaper, component: ArticleAnalyticsTool },
  ],
})
