import { net, shell } from 'electron'
import { randomUUID } from 'crypto'
import type { OAuthProvider, OAuthTokenData } from '../../../shared/types'
import { OAUTH_PROVIDERS, type OAuthDeviceCodeConfig } from './oauthProviders'
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  waitForOAuthCallback,
  exchangeCodeForToken,
  refreshAccessToken,
  requestDeviceCode,
  pollDeviceCodeToken,
  type TokenResponse
} from './oauthUtils'

let _activeFlow: { cancel: () => void } | null = null

/** Check if a token is expiring within threshold (default 5 min) */
export function isTokenExpiringSoon(tokenData: OAuthTokenData, thresholdMs = 5 * 60 * 1000): boolean {
  return Date.now() + thresholdMs >= tokenData.expiresAt
}

/** Cancel any active OAuth flow */
export function cancelActiveFlow(): void {
  if (_activeFlow) {
    _activeFlow.cancel()
    _activeFlow = null
  }
}

/** Fetch user email from Google userinfo API */
async function fetchGoogleUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const resp = await net.fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!resp.ok) return undefined
    const data = (await resp.json()) as { email?: string }
    return data.email
  } catch {
    return undefined
  }
}

// Antigravity API constants (对齐 CPA internal/auth/antigravity/constants.go)
const ANTIGRAVITY_API_ENDPOINT = 'https://cloudcode-pa.googleapis.com'
const ANTIGRAVITY_API_VERSION = 'v1internal'
const ANTIGRAVITY_COMMON_HEADERS: Record<string, string> = {
  'User-Agent': 'google-api-nodejs-client/9.15.1',
  'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'Client-Metadata': '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}'
}
const ANTIGRAVITY_METADATA = { ideType: 'ANTIGRAVITY', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' }

/** Extract projectId from Antigravity loadCodeAssist / onboardUser response */
function extractAntigravityProjectId(data: Record<string, unknown>): string | undefined {
  const project = data.cloudaicompanionProject
  if (typeof project === 'string' && project.trim()) return project.trim()
  if (project && typeof project === 'object') {
    const id = (project as Record<string, unknown>).id
    if (typeof id === 'string' && id.trim()) return id.trim()
  }
  return undefined
}

/** Onboard a new Antigravity user (对齐 CPA OnboardUser polling) */
async function onboardAntigravityUser(accessToken: string, tierId: string): Promise<string | undefined> {
  const maxAttempts = 5
  const onboardUrl = `${ANTIGRAVITY_API_ENDPOINT}/${ANTIGRAVITY_API_VERSION}:onboardUser`
  const reqBody = JSON.stringify({ tierId, metadata: ANTIGRAVITY_METADATA })

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const resp = await net.fetch(onboardUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...ANTIGRAVITY_COMMON_HEADERS
      },
      body: reqBody
    })

    if (!resp.ok) return undefined

    const data = (await resp.json()) as Record<string, unknown>
    if (data.done === true) {
      const response = data.response as Record<string, unknown> | undefined
      return response ? extractAntigravityProjectId(response) : undefined
    }

    // Not done yet, wait and retry
    await new Promise(r => setTimeout(r, 2000))
  }

  return undefined
}

/** Fetch Antigravity project ID (对齐 CPA FetchProjectID with full headers + onboarding) */
async function fetchAntigravityProjectId(accessToken: string): Promise<string | undefined> {
  try {
    const loadUrl = `${ANTIGRAVITY_API_ENDPOINT}/${ANTIGRAVITY_API_VERSION}:loadCodeAssist`
    const resp = await net.fetch(loadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...ANTIGRAVITY_COMMON_HEADERS
      },
      body: JSON.stringify({ metadata: ANTIGRAVITY_METADATA })
    })
    if (!resp.ok) return undefined
    const data = (await resp.json()) as Record<string, unknown>

    // Try direct project extraction
    const projectId = extractAntigravityProjectId(data)
    if (projectId) return projectId

    // Fallback: find default tier and onboard user
    let tierId = 'legacy-tier'
    const tiers = data.allowedTiers
    if (Array.isArray(tiers)) {
      for (const tier of tiers) {
        if (tier && typeof tier === 'object') {
          const t = tier as Record<string, unknown>
          if (t.isDefault === true && typeof t.id === 'string' && (t.id as string).trim()) {
            tierId = (t.id as string).trim()
            break
          }
        }
      }
    }

    return await onboardAntigravityUser(accessToken, tierId)
  } catch {
    return undefined
  }
}

/** Fetch Claude user email */
async function fetchClaudeUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const resp = await net.fetch('https://api.anthropic.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!resp.ok) return undefined
    const data = (await resp.json()) as { email?: string }
    return data.email
  } catch {
    return undefined
  }
}

/** Parse JWT payload claims (对齐 CPA ParseJWTToken — extracts sub, email, etc.) */
function parseJwtPayload(token: string): { sub?: string; email?: string; [key: string]: unknown } | undefined {
  try {
    return JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString()
    ) as { sub?: string; email?: string; [key: string]: unknown }
  } catch {
    return undefined
  }
}

// ────────── Authorization Code Flow ──────────

async function startAuthCodeLogin(provider: OAuthProvider): Promise<OAuthTokenData> {
  const cfg = OAUTH_PROVIDERS[provider]
  if (cfg.flow !== 'authorization_code') throw new Error('Not an auth code provider')

  const state = generateState()
  let codeVerifier: string | undefined

  const authUrl = new URL(cfg.authUrl)
  authUrl.searchParams.set('client_id', cfg.clientId)
  authUrl.searchParams.set('redirect_uri', cfg.redirectUri)
  if (cfg.scopes.length) authUrl.searchParams.set('scope', cfg.scopes.join(' '))
  authUrl.searchParams.set('state', state)

  if (cfg.usePKCE) {
    codeVerifier = generateCodeVerifier()
    authUrl.searchParams.set('code_challenge', generateCodeChallenge(codeVerifier))
    authUrl.searchParams.set('code_challenge_method', 'S256')
  }

  if (cfg.extraParams) {
    for (const [k, v] of Object.entries(cfg.extraParams)) {
      authUrl.searchParams.set(k, v)
    }
  }

  const { promise, cancel } = waitForOAuthCallback(cfg.port, cfg.path, state)
  _activeFlow = { cancel }

  await shell.openExternal(authUrl.toString())

  const { code } = await promise

  const tokenResp = await exchangeCodeForToken({
    tokenUrl: cfg.tokenUrl,
    code,
    redirectUri: cfg.redirectUri,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    codeVerifier,
    bodyFormat: cfg.bodyFormat
  })

  return buildTokenData(provider, tokenResp)
}

// ────────── Device Code Flow ──────────

export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
}

async function startDeviceCodeLogin(provider: OAuthProvider): Promise<OAuthTokenData> {
  const cfg = OAUTH_PROVIDERS[provider] as OAuthDeviceCodeConfig

  let codeVerifier: string | undefined
  let codeChallenge: string | undefined
  if (cfg.usePKCE) {
    codeVerifier = generateCodeVerifier()
    codeChallenge = generateCodeChallenge(codeVerifier)
  }

  const deviceResp = await requestDeviceCode({
    deviceCodeUrl: cfg.deviceCodeUrl,
    clientId: cfg.clientId,
    scopes: cfg.scopes,
    codeChallenge,
    extraHeaders: cfg.extraHeaders
  })

  // Open browser to verification URL
  const openUrl = deviceResp.verification_uri_complete || deviceResp.verification_uri
  await shell.openExternal(openUrl)

  console.log(`[OAuth] Device code: ${deviceResp.user_code} — waiting for authorization...`)

  const { promise, cancel } = pollDeviceCodeToken({
    tokenUrl: cfg.tokenUrl,
    deviceCode: deviceResp.device_code,
    clientId: cfg.clientId,
    codeVerifier,
    intervalMs: deviceResp.interval ? deviceResp.interval * 1000 : cfg.pollIntervalMs,
    maxDurationMs: cfg.maxPollDurationMs
  })
  _activeFlow = { cancel }

  const tokenResp = await promise
  return buildTokenData(provider, tokenResp)
}

// ────────── Shared helpers ──────────

async function buildTokenData(
  provider: OAuthProvider,
  tokenResp: TokenResponse
): Promise<OAuthTokenData> {
  const expiresIn = tokenResp.expires_in ?? 3600
  const tokenData: OAuthTokenData = {
    provider,
    accessToken: tokenResp.access_token,
    refreshToken: tokenResp.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000,
    tokenType: tokenResp.token_type ?? 'Bearer',
    scope: tokenResp.scope,
    idToken: tokenResp.id_token
  }

  // Fetch additional info per provider
  // Claude: get email from token response first, fallback to API call (对齐 CPA)
  if (provider === 'claude') {
    tokenData.userEmail = tokenResp.account?.email_address
    if (!tokenData.userEmail) {
      tokenData.userEmail = await fetchClaudeUserEmail(tokenData.accessToken)
    }
  } else if (provider === 'codex') {
    // 对齐 CPA ParseJWTToken: extract accountId (sub) + email from JWT
    if (tokenResp.id_token) {
      const claims = parseJwtPayload(tokenResp.id_token)
      tokenData.userEmail = claims?.email
      tokenData.accountId = claims?.sub
    }
  } else if (provider === 'gemini_cli' || provider === 'antigravity') {
    tokenData.userEmail = await fetchGoogleUserEmail(tokenData.accessToken)
    if (provider === 'antigravity') {
      tokenData.projectId = await fetchAntigravityProjectId(tokenData.accessToken)
    }
  }
  // Kimi: generate device ID (对齐 CPA kimi DeviceID uuid.New())
  if (provider === 'kimi') {
    tokenData.deviceId = randomUUID()
  }
  // Qwen: no user email endpoint known

  return tokenData
}

// ────────── Public API ──────────

/** Start the OAuth login flow for a provider */
export async function startOAuthLogin(provider: OAuthProvider): Promise<OAuthTokenData> {
  if (_activeFlow) {
    throw new Error('Another OAuth flow is already in progress')
  }

  const cfg = OAUTH_PROVIDERS[provider]
  if (!cfg) throw new Error(`Unknown OAuth provider: ${provider}`)

  try {
    if (cfg.flow === 'device_code') {
      return await startDeviceCodeLogin(provider)
    } else {
      return await startAuthCodeLogin(provider)
    }
  } finally {
    _activeFlow = null
  }
}

/** Refresh an OAuth token (with exponential backoff retry, 对齐 CPA RefreshTokensWithRetry) */
export async function refreshOAuthToken(tokenData: OAuthTokenData, maxRetries = 3): Promise<OAuthTokenData> {
  if (!tokenData.refreshToken) {
    throw new Error('No refresh token available')
  }

  const cfg = OAUTH_PROVIDERS[tokenData.provider]
  if (!cfg) throw new Error(`Unknown OAuth provider: ${tokenData.provider}`)

  let lastErr: Error | undefined
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, attempt * 1000))
    }
    try {
      const tokenResp = await refreshAccessToken({
        tokenUrl: cfg.tokenUrl,
        refreshToken: tokenData.refreshToken,
        clientId: cfg.clientId,
        clientSecret: cfg.flow === 'authorization_code' ? cfg.clientSecret : undefined,
        bodyFormat: cfg.bodyFormat
      })

      const expiresIn = tokenResp.expires_in ?? 3600
      return {
        ...tokenData,
        accessToken: tokenResp.access_token,
        refreshToken: tokenResp.refresh_token ?? tokenData.refreshToken,
        expiresAt: Date.now() + expiresIn * 1000,
        tokenType: tokenResp.token_type ?? tokenData.tokenType,
        scope: tokenResp.scope ?? tokenData.scope,
        idToken: tokenResp.id_token ?? tokenData.idToken
      }
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      // Non-retryable: token reuse (对齐 CPA isNonRetryableRefreshErr)
      if (lastErr.message.toLowerCase().includes('refresh_token_reused')) throw lastErr
      console.warn(`[OAuth] Token refresh attempt ${attempt + 1}/${maxRetries} failed:`, lastErr.message)
    }
  }

  throw lastErr ?? new Error(`Token refresh failed after ${maxRetries} attempts`)
}
