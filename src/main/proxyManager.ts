/**
 * Proxy Manager
 * 根据 Provider 配置为 Electron session 设置全局代理
 * 替代 Main 侧 https-proxy-agent 的方案
 */

import type { Session } from 'electron'
import type { AppConfig, ProviderConfigV2 } from '../shared/types'

/**
 * 从所有 Provider 配置中提取第一个启用代理的配置，
 * 构建 Electron session 代理规则并应用
 */
export async function applyProxyConfig(ses: Session, config: AppConfig): Promise<void> {
  const providers = Object.values(config.providerConfigs ?? {})
  const proxyProvider = providers.find(
    (p): p is ProviderConfigV2 =>
      p != null && p.proxyEnabled === true && !!p.proxyHost?.trim() && !!p.proxyPort?.trim()
  )

  if (!proxyProvider) {
    await ses.setProxy({ mode: 'direct' })
    return
  }

  const host = proxyProvider.proxyHost!.trim()
  const port = proxyProvider.proxyPort!.trim()
  const user = proxyProvider.proxyUsername?.trim() ?? ''
  const pass = proxyProvider.proxyPassword?.trim() ?? ''

  const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : ''
  const proxyUrl = `http://${auth}${host}:${port}`

  await ses.setProxy({
    mode: 'fixed_servers',
    proxyRules: proxyUrl
  })
}
