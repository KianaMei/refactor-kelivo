import type { ElectronAPI } from '@electron-toolkit/preload'

import type { AppConfig, ProviderConfigV2 } from '../../../shared/types'
import type { ChatStreamChunkEvent, ChatStreamErrorEvent, ChatStreamStartParams } from '../../../shared/chat'
import type { ModelsListResult } from '../../../shared/models'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      config: {
        get: () => Promise<AppConfig>
        save: (cfg: AppConfig) => Promise<void>
      }
      chat: {
        startStream: (params: ChatStreamStartParams) => Promise<string>
        abort: (streamId: string) => Promise<void>
        test: (providerId: string, modelId: string) => Promise<void>
        onChunk: (fn: (evt: ChatStreamChunkEvent) => void) => () => void
        onError: (fn: (evt: ChatStreamErrorEvent) => void) => () => void
      }
      models: {
        list: (providerId: string) => Promise<ModelsListResult>
      }
      avatar: {
        save: (providerId: string, base64DataUrl: string) => Promise<string>
        delete: (providerId: string) => Promise<void>
        resolve: (relativePath: string) => Promise<string | null>
      }
      providerBundle: {
        export: (providers: ProviderConfigV2[]) => Promise<Buffer>
        import: (buffer: Buffer) => Promise<{ providers: ProviderConfigV2[] }>
      }
      dialog: {
        saveFile: (options: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; filePath?: string }>
        openFile: (options: { filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; buffer?: Buffer; filePath?: string }>
        writeFile: (filePath: string, data: Buffer) => Promise<void>
      }
      window: {
        minimize: () => void
        maximize: () => void
        close: () => void
        isMaximized: () => Promise<boolean>
        onMaximizedChange: (fn: (isMaximized: boolean) => void) => () => void
      }
    }
  }
}

export {}
