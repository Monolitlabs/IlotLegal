import 'server-only'
import { createSign } from 'node:crypto'

// Minimal GA4 Data API client for our own reports. sanity-plugin-analytics
// has the same logic but doesn't export it. Uses the same server-only env
// vars: GA_PROPERTY_ID, GA_SERVICE_ACCOUNT_EMAIL, GA_PRIVATE_KEY.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API_BASE = 'https://analyticsdata.googleapis.com/v1beta'
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

export type GaReport = {
  rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[]
}

let cachedToken: { value: string; expiresAt: number } | null = null

function base64url(json: object): string {
  return Buffer.from(JSON.stringify(json)).toString('base64url')
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value

  const clientEmail = process.env.GA_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GA_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!clientEmail || !privateKey) {
    throw new Error('Missing GA_SERVICE_ACCOUNT_EMAIL or GA_PRIVATE_KEY env vars')
  }

  const iat = Math.floor(Date.now() / 1000)
  const unsigned = `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url({
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat,
    exp: iat + 3600,
  })}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Failed to obtain access token: ${await res.text()}`)

  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { value: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 }
  return access_token
}

export async function runGaReport(body: object): Promise<GaReport> {
  const propertyId = process.env.GA_PROPERTY_ID
  if (!propertyId) throw new Error('GA_PROPERTY_ID not configured')

  const res = await fetch(`${API_BASE}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(err?.error?.message || `GA API error ${res.status}: ${res.statusText}`)
  }
  return (await res.json()) as GaReport
}
