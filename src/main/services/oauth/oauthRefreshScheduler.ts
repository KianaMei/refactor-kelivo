import { loadConfig, saveConfigAndReturn } from '../../configStore'
import { isTokenExpiringSoon, refreshOAuthToken } from './oauthService'

let _intervalId: NodeJS.Timeout | null = null

const SCAN_INTERVAL = 60_000 // 60 seconds

/**
 * Start the background scheduler that scans provider configs
 * and auto-refreshes OAuth tokens that are expiring soon.
 */
export function startOAuthRefreshScheduler(): void {
  if (_intervalId) return

  _intervalId = setInterval(async () => {
    try {
      const cfg = await loadConfig()
      const providers = cfg.providerConfigs ?? {}
      let changed = false

      for (const [key, provider] of Object.entries(providers)) {
        if (!provider.oauthEnabled || !provider.oauthData) continue
        if (!provider.oauthData.refreshToken) continue
        if (!isTokenExpiringSoon(provider.oauthData)) continue

        try {
          console.log(`[OAuth] Refreshing token for provider "${key}" (${provider.oauthData.provider})`)
          const newToken = await refreshOAuthToken(provider.oauthData)
          provider.oauthData = newToken
          provider.updatedAt = new Date().toISOString()
          changed = true
          console.log(`[OAuth] Token refreshed for provider "${key}"`)
        } catch (err) {
          console.error(`[OAuth] Failed to refresh token for provider "${key}":`, err)
        }
      }

      if (changed) {
        await saveConfigAndReturn(cfg)
      }
    } catch (err) {
      console.error('[OAuth] Refresh scheduler error:', err)
    }
  }, SCAN_INTERVAL)
}

/** Stop the background refresh scheduler */
export function stopOAuthRefreshScheduler(): void {
  if (_intervalId) {
    clearInterval(_intervalId)
    _intervalId = null
  }
}
