import { ipcMain, session } from 'electron'

import { IpcChannel } from '../shared/ipc'
import type { AppConfig } from '../shared/types'
import { loadConfig, saveConfigAndReturn } from './configStore'
import { applyProxyConfig } from './proxyManager'

export function registerConfigIpc(): void {
  ipcMain.handle(IpcChannel.ConfigGet, async () => {
    return await loadConfig()
  })

  ipcMain.handle(IpcChannel.ConfigSave, async (_event, cfg: AppConfig) => {
    const saved = await saveConfigAndReturn(cfg)
    // 配置变更后动态更新全局代理
    applyProxyConfig(session.defaultSession, saved).catch((err) =>
      console.warn('[ProxyManager] Failed to update proxy:', err)
    )
    return saved
  })
}
