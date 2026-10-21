// Wraps `win.fetch` so requests to one same-origin path carry the given
// bearer token. Every other request goes through unchanged. Returns a cleanup
// function that puts the original fetch back (unless something else has
// wrapped it since, in which case leaving it alone is the safer choice).
export function installBearerFetch(
  win: { fetch: typeof fetch },
  opts: { origin: string; path: string; token: string },
): () => void {
  const original = win.fetch

  const patched: typeof fetch = (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, opts.origin)
    if (url.origin !== opts.origin || url.pathname !== opts.path) return original(input, init)

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set('Authorization', `Bearer ${opts.token}`)
    return original(input, { ...init, headers })
  }

  win.fetch = patched
  return () => {
    if (win.fetch === patched) win.fetch = original
  }
}
