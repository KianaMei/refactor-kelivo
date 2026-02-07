import { BrowserWindow, ipcMain } from 'electron'

import { IpcChannel } from '../../shared/ipc'
import type { DepsInstallParams, DepsProgressEvent, DepsStatusResult, DepsUninstallParams } from '../../shared/deps'
import { loadConfig } from '../configStore'
import { getDepsStatus, installSdk, setLastError, uninstallSdk } from './depsManager'

function broadcastProgress(evt: DepsProgressEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents.isDestroyed()) continue
    win.webContents.send(IpcChannel.DepsProgress, evt)
  }
}

export function registerDepsIpc(): void {
  ipcMain.handle(IpcChannel.DepsGetStatus, async (): Promise<DepsStatusResult> => {
    const cfg = await loadConfig()
    return await getDepsStatus(cfg)
  })

  ipcMain.handle(IpcChannel.DepsInstall, async (_e, params: DepsInstallParams): Promise<DepsStatusResult> => {
    const cfg = await loadConfig()
    try {
      await installSdk(cfg, params, broadcastProgress)
    } catch (err) {
      setLastError(params.sdk, err)
      broadcastProgress({ sdk: params.sdk, phase: 'error', message: err instanceof Error ? err.message : String(err) })
      throw err
    }
    return await getDepsStatus(cfg)
  })

  ipcMain.handle(IpcChannel.DepsUninstall, async (_e, params: DepsUninstallParams): Promise<DepsStatusResult> => {
    const cfg = await loadConfig()
    try {
      await uninstallSdk(cfg, params.sdk, broadcastProgress)
    } catch (err) {
      setLastError(params.sdk, err)
      broadcastProgress({ sdk: params.sdk, phase: 'error', message: err instanceof Error ? err.message : String(err) })
      throw err
    }
    return await getDepsStatus(cfg)
  })
}

