import { ipcMain } from 'electron'

import { IpcChannel } from '../shared/ipc'
import type { AppConfig } from '../shared/types'
import { loadConfig, saveConfigAndReturn } from './configStore'

export function registerConfigIpc(): void {
  ipcMain.handle(IpcChannel.ConfigGet, async () => {
    return await loadConfig()
  })

  ipcMain.handle(IpcChannel.ConfigSave, async (_event, cfg: AppConfig) => {
    // 返回标准化后的最终配置，避免 renderer setState 时持有缺字段对象导致页面白屏。
    return await saveConfigAndReturn(cfg)
  })
}
