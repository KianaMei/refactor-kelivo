import crypto from 'crypto'
import http from 'http'
import { net } from 'electron'

/** Generate a PKCE code verifier (43-128 chars, base64url) */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(96).toString('base64url')
}

/** Generate a PKCE code challenge from verifier (S256) */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

/** Generate a random state parameter */
export function generateState(): string {
  return crypto.randomBytes(16).toString('hex')
}

export interface OAuthCallbackResult {
  code: string
  state: string
}

/**
 * Start a local HTTP server to listen for OAuth callback.
 * Resolves with the authorization code once received.
 */
export function waitForOAuthCallback(
  port: number,
  path: string,
  expectedState: string,
  timeout = 120_000
): { promise: Promise<OAuthCallbackResult>; cancel: () => void } {
  let server: http.Server | null = null
  let timer: NodeJS.Timeout | null = null
  let settled = false

  const promise = new Promise<OAuthCallbackResult>((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`)
      if (url.pathname !== path) {
        res.writeHead(404)
        res.end('Not Found')
        return
      }

      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      if (!code) {
        const errorDesc = url.searchParams.get('error_description') || url.searchParams.get('error') || 'No code'
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<html><body><h2>Authorization Failed</h2><p>${errorDesc}</p></body></html>`)
        settled = true
        if (timer) clearTimeout(timer)
        server?.close()
        reject(new Error(`OAuth error: ${errorDesc}`))
        return
      }

      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body><h2>State Mismatch</h2></body></html>')
        settled = true
        if (timer) clearTimeout(timer)
        server?.close()
        reject(new Error('OAuth state mismatch'))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<html><body><h2>Authorization Successful</h2><p>You can close this tab.</p><script>window.close()</script></body></html>')
      settled = true
      if (timer) clearTimeout(timer)
      server?.close()
      resolve({ code, state })
    })

    server.listen(port, '127.0.0.1')

    timer = setTimeout(() => {
      if (!settled) {
        settled = true
        server?.close()
        reject(new Error('OAuth callback timeout'))
      }
    }, timeout)
  })

  const cancel = () => {
    if (!settled) {
      settled = true
      if (timer) clearTimeout(timer)
      server?.close()
    }
  }

  return { promise, cancel }
}

export interface TokenExchangeParams {
  tokenUrl: string
  code: string
  redirectUri: string
  clientId: string
  clientSecret?: string
  codeVerifier?: string
  bodyFormat: 'json' | 'form'
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  id_token?: string
  // Claude-specific (token exchange/refresh response)
  organization?: { uuid: string; name: string }
  account?: { uuid: string; email_address: string }
  // Qwen-specific
  resource_url?: string
}

/** Exchange authorization code for tokens */
export async function exchangeCodeForToken(params: TokenExchangeParams): Promise<TokenResponse> {
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId
  }
  if (params.clientSecret) body.client_secret = params.clientSecret
  if (params.codeVerifier) body.code_verifier = params.codeVerifier

  const headers: Record<string, string> = {}
  let bodyStr: string

  if (params.bodyFormat === 'json') {
    headers['Content-Type'] = 'application/json'
    bodyStr = JSON.stringify(body)
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    bodyStr = new URLSearchParams(body).toString()
  }

  const resp = await net.fetch(params.tokenUrl, {
    method: 'POST',
    headers,
    body: bodyStr
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Token exchange failed (${resp.status}): ${text}`)
  }

  return resp.json() as Promise<TokenResponse>
}

export interface RefreshTokenParams {
  tokenUrl: string
  refreshToken: string
  clientId: string
  clientSecret?: string
  bodyFormat: 'json' | 'form'
}

/** Refresh an access token using a refresh token */
export async function refreshAccessToken(params: RefreshTokenParams): Promise<TokenResponse> {
  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.clientId
  }
  if (params.clientSecret) body.client_secret = params.clientSecret

  const headers: Record<string, string> = {}
  let bodyStr: string

  if (params.bodyFormat === 'json') {
    headers['Content-Type'] = 'application/json'
    bodyStr = JSON.stringify(body)
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    bodyStr = new URLSearchParams(body).toString()
  }

  const resp = await net.fetch(params.tokenUrl, {
    method: 'POST',
    headers,
    body: bodyStr
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Token refresh failed (${resp.status}): ${text}`)
  }

  return resp.json() as Promise<TokenResponse>
}

// ========== Device Code Flow ==========

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  expires_in: number
  interval?: number
}

export interface DeviceCodeRequestParams {
  deviceCodeUrl: string
  clientId: string
  scopes: string[]
  codeChallenge?: string
  extraHeaders?: Record<string, string>
}

/** Request a device code from the provider */
export async function requestDeviceCode(params: DeviceCodeRequestParams): Promise<DeviceCodeResponse> {
  const body: Record<string, string> = {
    client_id: params.clientId
  }
  if (params.scopes.length) body.scope = params.scopes.join(' ')
  if (params.codeChallenge) {
    body.code_challenge = params.codeChallenge
    body.code_challenge_method = 'S256'
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...params.extraHeaders
  }

  const resp = await net.fetch(params.deviceCodeUrl, {
    method: 'POST',
    headers,
    body: new URLSearchParams(body).toString()
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Device code request failed (${resp.status}): ${text}`)
  }

  return resp.json() as Promise<DeviceCodeResponse>
}

export interface DeviceCodePollParams {
  tokenUrl: string
  deviceCode: string
  clientId: string
  codeVerifier?: string
  intervalMs: number
  maxDurationMs: number
}

/**
 * Poll for device code token.
 * Returns a cancel function alongside the promise.
 */
export function pollDeviceCodeToken(params: DeviceCodePollParams): {
  promise: Promise<TokenResponse>
  cancel: () => void
} {
  let cancelled = false

  const cancel = () => { cancelled = true }

  const promise = (async () => {
    const deadline = Date.now() + params.maxDurationMs
    let interval = params.intervalMs

    while (Date.now() < deadline) {
      if (cancelled) throw new Error('Device code flow cancelled')

      await new Promise(r => setTimeout(r, interval))
      if (cancelled) throw new Error('Device code flow cancelled')

      const body: Record<string, string> = {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: params.deviceCode,
        client_id: params.clientId
      }
      if (params.codeVerifier) body.code_verifier = params.codeVerifier

      const resp = await net.fetch(params.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString()
      })

      if (resp.ok) {
        return resp.json() as Promise<TokenResponse>
      }

      const errBody = (await resp.json().catch(() => ({}))) as { error?: string }
      const error = errBody.error ?? ''

      if (error === 'authorization_pending') continue
      if (error === 'slow_down') { interval += 5000; continue }
      if (error === 'expired_token') throw new Error('Device code expired — please try again')
      if (error === 'access_denied') throw new Error('Authorization denied by user')

      throw new Error(`Device code poll error: ${error || resp.status}`)
    }

    throw new Error('Device code flow timed out')
  })()

  return { promise, cancel }
}
