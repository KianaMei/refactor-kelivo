import type { OAuthProvider } from '../../../shared/types'

/** Authorization Code flow config (browser redirect) */
export interface OAuthAuthCodeConfig {
  flow: 'authorization_code'
  authUrl: string
  tokenUrl: string
  clientId: string
  clientSecret?: string
  redirectUri: string
  port: number
  path: string
  scopes: string[]
  extraParams?: Record<string, string>
  bodyFormat: 'json' | 'form'
  usePKCE: boolean
}

/** Device Code flow config (polling, no local server) */
export interface OAuthDeviceCodeConfig {
  flow: 'device_code'
  deviceCodeUrl: string
  tokenUrl: string
  clientId: string
  scopes: string[]
  bodyFormat: 'form'
  usePKCE: boolean
  pollIntervalMs: number
  maxPollDurationMs: number
  extraHeaders?: Record<string, string>
}

export type OAuthProviderConfig = OAuthAuthCodeConfig | OAuthDeviceCodeConfig

export const OAUTH_PROVIDERS: Record<OAuthProvider, OAuthProviderConfig> = {
  claude: {
    flow: 'authorization_code',
    authUrl: 'https://claude.ai/oauth/authorize',
    tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
    clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    redirectUri: 'http://localhost:54545/callback',
    port: 54545,
    path: '/callback',
    scopes: ['org:create_api_key', 'user:profile', 'user:inference'],
    extraParams: { response_type: 'code', code: 'true' },
    bodyFormat: 'json',
    usePKCE: true
  },

  codex: {
    flow: 'authorization_code',
    authUrl: 'https://auth.openai.com/oauth/authorize',
    tokenUrl: 'https://auth.openai.com/oauth/token',
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    redirectUri: 'http://localhost:1455/auth/callback',
    port: 1455,
    path: '/auth/callback',
    scopes: ['openid', 'email', 'profile', 'offline_access'],
    extraParams: {
      response_type: 'code',
      prompt: 'login',
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true'
    },
    bodyFormat: 'form',
    usePKCE: true
  },

  gemini_cli: {
    flow: 'authorization_code',
    authUrl: 'https://accounts.google.com/o/oauth2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com',
    clientSecret: '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',
    redirectUri: 'http://localhost:8085/oauth2callback',
    port: 8085,
    path: '/oauth2callback',
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ],
    extraParams: {
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent'
    },
    bodyFormat: 'form',
    usePKCE: false
  },

  antigravity: {
    flow: 'authorization_code',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
    clientSecret: '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',
    redirectUri: 'http://localhost:51121/oauth-callback',
    port: 51121,
    path: '/oauth-callback',
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/cclog',
      'https://www.googleapis.com/auth/experimentsandconfigs'
    ],
    extraParams: {
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent'
    },
    bodyFormat: 'form',
    usePKCE: false
  },

  kimi: {
    flow: 'device_code',
    deviceCodeUrl: 'https://auth.kimi.com/api/oauth/device_authorization',
    tokenUrl: 'https://auth.kimi.com/api/oauth/token',
    clientId: '17e5f671-d194-4dfb-9706-5516cb48c098',
    scopes: [],
    bodyFormat: 'form',
    usePKCE: false,
    pollIntervalMs: 5000,
    maxPollDurationMs: 15 * 60 * 1000
  },

  qwen: {
    flow: 'device_code',
    deviceCodeUrl: 'https://chat.qwen.ai/api/v1/oauth2/device/code',
    tokenUrl: 'https://chat.qwen.ai/api/v1/oauth2/token',
    clientId: 'f0304373b74a44d2b584a3fb70ca9e56',
    scopes: ['openid', 'profile', 'email', 'model.completion'],
    bodyFormat: 'form',
    usePKCE: true,
    pollIntervalMs: 5000,
    maxPollDurationMs: 5 * 60 * 1000
  }
}
