import { ipcMain } from 'electron'

import { IpcChannel } from '../shared/ipc'
import type { AppConfig } from '../shared/types'
import { loadConfig, saveConfig } from './configStore'

export function registerConfigIpc(): void {
  ipcMain.handle(IpcChannel.ConfigGet, async () => {
    return await loadConfig()
  })

  ipcMain.handle(IpcChannel.ConfigSave, async (_event, cfg: AppConfig) => {
    await saveConfig(cfg)
  })
}

