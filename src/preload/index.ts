import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

import { IpcChannel } from '../shared/ipc'
import type { AppConfig } from '../shared/types'
import type { ChatStreamChunkEvent, ChatStreamErrorEvent, ChatStreamStartParams } from '../shared/chat'
import type { ModelsListResult } from '../shared/models'
import type { ProviderConfigV2 } from '../shared/types'
import type { BundleImportResult } from '../main/providerBundleIpc'

const api = {
  config: {
    get: () => ipcRenderer.invoke(IpcChannel.ConfigGet) as Promise<AppConfig>,
    save: (cfg: AppConfig) => ipcRenderer.invoke(IpcChannel.ConfigSave, cfg) as Promise<void>
  },
  chat: {
    startStream: (params: ChatStreamStartParams) => ipcRenderer.invoke(IpcChannel.ChatStreamStart, params) as Promise<string>,
    abort: (streamId: string) => ipcRenderer.invoke(IpcChannel.ChatStreamAbort, streamId) as Promise<void>,
    test: (providerId: string, modelId: string) =>
      ipcRenderer.invoke(IpcChannel.ChatTest, { providerId, modelId }) as Promise<void>,
    onChunk: (fn: (evt: ChatStreamChunkEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: ChatStreamChunkEvent) => fn(payload)
      ipcRenderer.on(IpcChannel.ChatStreamChunk, listener)
      return () => ipcRenderer.removeListener(IpcChannel.ChatStreamChunk, listener)
    },
    onError: (fn: (evt: ChatStreamErrorEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: ChatStreamErrorEvent) => fn(payload)
      ipcRenderer.on(IpcChannel.ChatStreamError, listener)
      return () => ipcRenderer.removeListener(IpcChannel.ChatStreamError, listener)
    }
  },
  models: {
    list: (providerId: string) =>
      ipcRenderer.invoke(IpcChannel.ModelsList, { providerId }) as Promise<ModelsListResult>
  },
  avatar: {
    save: (providerId: string, base64DataUrl: string) =>
      ipcRenderer.invoke(IpcChannel.AvatarSave, providerId, base64DataUrl) as Promise<string>,
    delete: (providerId: string) =>
      ipcRenderer.invoke(IpcChannel.AvatarDelete, providerId) as Promise<void>,
    resolve: (relativePath: string) =>
      ipcRenderer.invoke(IpcChannel.AvatarResolve, relativePath) as Promise<string>
  },
  providerBundle: {
    export: (providers: ProviderConfigV2[]) =>
      ipcRenderer.invoke(IpcChannel.ProviderBundleExport, providers) as Promise<Buffer>,
    import: (buffer: Buffer) =>
      ipcRenderer.invoke(IpcChannel.ProviderBundleImport, buffer) as Promise<BundleImportResult>
  },
  dialog: {
    saveFile: (options: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke(IpcChannel.DialogSaveFile, options) as Promise<{ canceled: boolean; filePath?: string }>,
    openFile: (options: { filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke(IpcChannel.DialogOpenFile, options) as Promise<{ canceled: boolean; buffer?: Buffer; filePath?: string }>,
    writeFile: (filePath: string, data: Buffer) =>
      ipcRenderer.invoke('dialog:write-file', filePath, data) as Promise<void>
  },
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized') as Promise<boolean>,
    onMaximizedChange: (fn: (isMaximized: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => fn(isMaximized)
      ipcRenderer.on('window-maximized-changed', listener)
      return () => ipcRenderer.removeListener('window-maximized-changed', listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err)
  }
} else {
  // @ts-expect-error（兼容少数情况下关闭了 contextIsolation 的场景）
  window.electron = electronAPI
  // @ts-expect-error（同上）
  window.api = api
}
