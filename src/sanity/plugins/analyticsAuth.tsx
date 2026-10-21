import { useEffect, useState, type ComponentType } from 'react'
import { definePlugin, useClient, type Tool } from 'sanity'
import { apiVersion } from '../env'
import { installBearerFetch } from './bearerFetch'

// sanity-plugin-analytics fetches /api/analytics with a bare `fetch()`, so the
// route can't tell a Studio user from anyone else. This wraps the plugin's
// `google-analytics` tool: while it is open, requests to that one path carry
// the logged-in user's Sanity token, which the route verifies. Requires
// `auth.loginMethod: 'token'` so the token is available client-side.
// Must be listed after googleAnalyticsPlugin() in the Studio config.

const ANALYTICS_PATH = '/api/analytics'

type ToolComponent = ComponentType<{ tool: Tool }>

function withSanityToken(Inner: ToolComponent): ToolComponent {
  return function AuthenticatedAnalyticsTool(props) {
    const token = useClient({ apiVersion }).config().token
    const [ready, setReady] = useState(false)

    useEffect(() => {
      if (!token) return
      const restore = installBearerFetch(window, {
        origin: window.location.origin,
        path: ANALYTICS_PATH,
        token,
      })
      setReady(true)
      return () => {
        setReady(false)
        restore()
      }
    }, [token])

    // No token means the route will 401 anyway; let the dashboard render so
    // its own error state shows instead of a blank tab.
    if (token && !ready) return null
    return <Inner {...props} />
  }
}

export const analyticsAuth = definePlugin({
  name: 'ilot-analytics-auth',
  tools: (prev) =>
    prev.map((tool) =>
      tool.name === 'google-analytics'
        ? { ...tool, component: withSanityToken(tool.component as ToolComponent) }
        : tool,
    ),
})
