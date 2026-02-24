import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

import { IpcChannel } from '../shared/ipc'
import type { AppConfig } from '../shared/types'
import type { ModelsListResult } from '../shared/models'
import type { ProviderConfigV2 } from '../shared/types'
import type {
  WebDavConfig,
  BackupFileItem,
  RestoreMode,
  BackupWebdavProgress,
  StorageReport,
  BundleImportResult,
  McpListToolsResponse,
  McpCallToolRequest,
  McpCallToolResponse,
  StorageItemDetail
} from '../shared/types'
import { OCR_CHANNELS, type OcrRunRequest, type OcrRunResult } from '../shared/ocr'
import { SEARCH_CHANNELS, type SearchRequest, type SearchResponse, type SearchServiceConfigUnion } from '../shared/search'
import type {
  ImageStudioCancelResult,
  ImageStudioDeleteRequest,
  ImageStudioEvent,
  ImageStudioHistoryDeleteResult,
  ImageStudioHistoryGetResult,
  ImageStudioHistoryListResult,
  ImageStudioListRequest,
  ImageStudioOutputDeleteRequest,
  ImageStudioOutputDeleteResult,
  ImageStudioRetryRequest,
  ImageStudioSubmitRequest,
  ImageStudioSubmitResult
} from '../shared/imageStudio'
import type {
  AgentEventPayload,
  AgentPermissionRespondParams,
  AgentRunAbortParams,
  AgentRunStartParams,
  AgentRunStartResult
} from '../shared/agentRuntime'
import type { DepsInstallParams, DepsProgressEvent, DepsStatusResult, DepsUninstallParams } from '../shared/deps'
import type { PreprocessImageParams, PreprocessImageResult } from '../main/chatPreprocessIpc'
// import type { SearchServiceConfigUnion } from '../main/services/search'
import type {
  DbConversation,
  ConversationCreateInput,
  ConversationUpdateInput,
  ConversationListParams,
  ConversationListResult,
  DbMessage,
  MessageCreateInput,
  MessageUpdateInput,
  MessageSearchResult,
  DbWorkspace,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
  DbMemory,
  MemoryCreateInput,
  DbAgentSession,
  AgentSessionCreateInput,
  AgentSessionUpdateInput,
  DbAgentMessage,
  AgentMessageCreateInput,
  AgentMessageUpdateInput
} from '../shared/db-types'

const api = {
  config: {
    get: () => ipcRenderer.invoke(IpcChannel.ConfigGet) as Promise<AppConfig>,
    // main 侧会做 normalize，并回传最终落盘的配置（避免 renderer 持有缺字段的旧对象导致白屏）
    save: (cfg: AppConfig) => ipcRenderer.invoke(IpcChannel.ConfigSave, cfg) as Promise<AppConfig>
  },
  chat: {
    test: (providerId: string, modelId: string) =>
      ipcRenderer.invoke(IpcChannel.ChatTest, { providerId, modelId }) as Promise<void>,
    preprocess: (params: PreprocessImageParams) =>
      ipcRenderer.invoke(IpcChannel.ChatPreprocess, params) as Promise<PreprocessImageResult>
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
  db: {
    conversations: {
      list: (params?: ConversationListParams) =>
        ipcRenderer.invoke(IpcChannel.DbConversationList, params ?? {}) as Promise<ConversationListResult>,
      get: (id: string) =>
        ipcRenderer.invoke(IpcChannel.DbConversationGet, id) as Promise<DbConversation | null>,
      create: (input: ConversationCreateInput) =>
        ipcRenderer.invoke(IpcChannel.DbConversationCreate, input) as Promise<DbConversation>,
      update: (id: string, input: ConversationUpdateInput) =>
        ipcRenderer.invoke(IpcChannel.DbConversationUpdate, id, input) as Promise<DbConversation | null>,
      delete: (id: string) =>
        ipcRenderer.invoke(IpcChannel.DbConversationDelete, id) as Promise<void>,
      regenerateTitle: (id: string) =>
        ipcRenderer.invoke(IpcChannel.DbConversationRegenerateTitle, id) as Promise<DbConversation | null>,
      search: (query: string, workspaceId?: string | null) =>
        ipcRenderer.invoke(IpcChannel.DbConversationSearch, query, workspaceId) as Promise<DbConversation[]>,
      messageCount: (conversationId: string) =>
        ipcRenderer.invoke(IpcChannel.DbConversationMessageCount, conversationId) as Promise<number>,
      assistantCount: (conversationId: string) =>
        ipcRenderer.invoke(IpcChannel.DbConversationAssistantCount, conversationId) as Promise<number>
    },
    messages: {
      list: (conversationId: string) =>
        ipcRenderer.invoke(IpcChannel.DbMessageList, conversationId) as Promise<DbMessage[]>,
      create: (input: MessageCreateInput) =>
        ipcRenderer.invoke(IpcChannel.DbMessageCreate, input) as Promise<DbMessage>,
      createBatch: (inputs: MessageCreateInput[]) =>
        ipcRenderer.invoke(IpcChannel.DbMessageCreateBatch, inputs) as Promise<void>,
      update: (id: string, input: MessageUpdateInput) =>
        ipcRenderer.invoke(IpcChannel.DbMessageUpdate, id, input) as Promise<DbMessage | null>,
      delete: (id: string) =>
        ipcRenderer.invoke(IpcChannel.DbMessageDelete, id) as Promise<void>,
      versions: (groupId: string) =>
        ipcRenderer.invoke(IpcChannel.DbMessageVersions, groupId) as Promise<DbMessage[]>,
      search: (query: string) =>
        ipcRenderer.invoke(IpcChannel.DbMessageSearch, query) as Promise<MessageSearchResult[]>,
      nextSortOrder: (conversationId: string) =>
        ipcRenderer.invoke(IpcChannel.DbMessageNextSortOrder, conversationId) as Promise<number>
    },
    workspaces: {
      list: () =>
        ipcRenderer.invoke(IpcChannel.DbWorkspaceList) as Promise<DbWorkspace[]>,
      get: (id: string) =>
        ipcRenderer.invoke(IpcChannel.DbWorkspaceGet, id) as Promise<DbWorkspace | null>,
      create: (input: WorkspaceCreateInput) =>
        ipcRenderer.invoke(IpcChannel.DbWorkspaceCreate, input) as Promise<DbWorkspace>,
      update: (id: string, input: WorkspaceUpdateInput) =>
        ipcRenderer.invoke(IpcChannel.DbWorkspaceUpdate, id, input) as Promise<DbWorkspace | null>,
      delete: (id: string) =>
        ipcRenderer.invoke(IpcChannel.DbWorkspaceDelete, id) as Promise<void>,
      children: (parentId: string | null) =>
        ipcRenderer.invoke(IpcChannel.DbWorkspaceChildren, parentId) as Promise<DbWorkspace[]>
    },
    memories: {
      list: (assistantId: string) =>
        ipcRenderer.invoke(IpcChannel.DbMemoryList, assistantId) as Promise<DbMemory[]>,
      create: (input: MemoryCreateInput) =>
        ipcRenderer.invoke(IpcChannel.DbMemoryCreate, input) as Promise<DbMemory>,
      update: (id: number, content: string) =>
        ipcRenderer.invoke(IpcChannel.DbMemoryUpdate, id, content) as Promise<DbMemory | null>,
      delete: (id: number) =>
        ipcRenderer.invoke(IpcChannel.DbMemoryDelete, id) as Promise<void>,
      deleteByAssistant: (assistantId: string) =>
        ipcRenderer.invoke(IpcChannel.DbMemoryDeleteByAssistant, assistantId) as Promise<void>
    },
    agentSessions: {
      list: (agentId?: string) =>
        ipcRenderer.invoke(IpcChannel.DbAgentSessionList, agentId) as Promise<DbAgentSession[]>,
      get: (id: string) =>
        ipcRenderer.invoke(IpcChannel.DbAgentSessionGet, id) as Promise<DbAgentSession | null>,
      create: (input: AgentSessionCreateInput) =>
        ipcRenderer.invoke(IpcChannel.DbAgentSessionCreate, input) as Promise<DbAgentSession>,
      update: (id: string, input: AgentSessionUpdateInput) =>
        ipcRenderer.invoke(IpcChannel.DbAgentSessionUpdate, id, input) as Promise<DbAgentSession | null>,
      delete: (id: string) =>
        ipcRenderer.invoke(IpcChannel.DbAgentSessionDelete, id) as Promise<void>
    },
    agentMessages: {
      list: (sessionId: string) =>
        ipcRenderer.invoke(IpcChannel.DbAgentMessageList, sessionId) as Promise<DbAgentMessage[]>,
      create: (input: AgentMessageCreateInput) =>
        ipcRenderer.invoke(IpcChannel.DbAgentMessageCreate, input) as Promise<DbAgentMessage>,
      update: (id: string, input: AgentMessageUpdateInput) =>
        ipcRenderer.invoke(IpcChannel.DbAgentMessageUpdate, id, input) as Promise<DbAgentMessage | null>,
      delete: (id: string) =>
        ipcRenderer.invoke(IpcChannel.DbAgentMessageDelete, id) as Promise<void>
    }
  },
  agent: {
    runStart: (params: AgentRunStartParams) =>
      ipcRenderer.invoke(IpcChannel.AgentRunStart, params) as Promise<AgentRunStartResult>,
    abort: (params: AgentRunAbortParams) =>
      ipcRenderer.invoke(IpcChannel.AgentRunAbort, params) as Promise<void>,
    respondPermission: (params: AgentPermissionRespondParams) =>
      ipcRenderer.invoke(IpcChannel.AgentPermissionRespond, params) as Promise<void>,
    onEvent: (fn: (evt: AgentEventPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: AgentEventPayload) => fn(payload)
      ipcRenderer.on(IpcChannel.AgentEvent, listener)
      return () => ipcRenderer.removeListener(IpcChannel.AgentEvent, listener)
    }
  },
  deps: {
    getStatus: () => ipcRenderer.invoke(IpcChannel.DepsGetStatus) as Promise<DepsStatusResult>,
    install: (params: DepsInstallParams) => ipcRenderer.invoke(IpcChannel.DepsInstall, params) as Promise<DepsStatusResult>,
    uninstall: (params: DepsUninstallParams) => ipcRenderer.invoke(IpcChannel.DepsUninstall, params) as Promise<DepsStatusResult>,
    onProgress: (fn: (evt: DepsProgressEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: DepsProgressEvent) => fn(payload)
      ipcRenderer.on(IpcChannel.DepsProgress, listener)
      return () => ipcRenderer.removeListener(IpcChannel.DepsProgress, listener)
    }
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
  },
  ocr: {
    run: (request: OcrRunRequest) =>
      ipcRenderer.invoke('ocr:run', request) as Promise<OcrRunResult>,
    getCached: (imagePath: string) =>
      ipcRenderer.invoke('ocr:getCached', imagePath) as Promise<string | null>,
    setCache: (imagePath: string, text: string) =>
      ipcRenderer.invoke('ocr:setCache', imagePath, text) as Promise<void>,
    clearCache: () =>
      ipcRenderer.invoke('ocr:clearCache') as Promise<void>,
    getCacheSize: () =>
      ipcRenderer.invoke('ocr:getCacheSize') as Promise<number>
  },
  search: {
    execute: (request: SearchRequest) =>
      ipcRenderer.invoke('search:execute', request) as Promise<SearchResponse>,
    listProviders: () =>
      ipcRenderer.invoke('search:listProviders') as Promise<Array<{ id: string; name: string; type: string }>>,
    register: (id: string, config: SearchServiceConfigUnion, isDefault?: boolean) =>
      ipcRenderer.invoke('search:register', id, config, isDefault) as Promise<boolean>,
    unregister: (id: string) =>
      ipcRenderer.invoke('search:unregister', id) as Promise<boolean>,
    setDefault: (id: string) =>
      ipcRenderer.invoke('search:setDefault', id) as Promise<boolean>
  },
  mcp: {
    listTools: (serverId: string) =>
      ipcRenderer.invoke('mcp:listTools', serverId) as Promise<McpListToolsResponse>,
    callTool: (request: McpCallToolRequest) =>
      ipcRenderer.invoke('mcp:callTool', request) as Promise<McpCallToolResponse>
  },
  backup: {
    exportLocal: (options: { includeChats: boolean; includeAttachments: boolean; includeGeneratedImages: boolean }) =>
      ipcRenderer.invoke(IpcChannel.BackupExportLocal, options) as Promise<{ success: boolean; data?: Buffer; error?: string }>,
    importLocal: (options: { buffer: Buffer; mode: RestoreMode; includeChats: boolean; includeAttachments: boolean; includeGeneratedImages: boolean }) =>
      ipcRenderer.invoke(IpcChannel.BackupImportLocal, options) as Promise<{ success: boolean; message?: string; error?: string }>,
    webdavTest: (cfg: WebDavConfig) =>
      ipcRenderer.invoke(IpcChannel.BackupWebdavTest, cfg) as Promise<{ success: boolean; error?: string }>,
    webdavBackup: (cfg: WebDavConfig) =>
      ipcRenderer.invoke(IpcChannel.BackupWebdavBackup, cfg) as Promise<{ success: boolean; error?: string }>,
    onWebdavProgress: (fn: (progress: BackupWebdavProgress) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: BackupWebdavProgress) => fn(payload)
      ipcRenderer.on(IpcChannel.BackupWebdavProgress, listener)
      return () => ipcRenderer.removeListener(IpcChannel.BackupWebdavProgress, listener)
    },
    webdavList: (cfg: WebDavConfig) =>
      ipcRenderer.invoke(IpcChannel.BackupWebdavList, cfg) as Promise<{ success: boolean; items: BackupFileItem[]; error?: string }>,
    webdavRestore: (cfg: WebDavConfig, item: BackupFileItem, mode: RestoreMode) =>
      ipcRenderer.invoke(IpcChannel.BackupWebdavRestore, cfg, item, mode) as Promise<{ success: boolean; message?: string; error?: string }>,
    webdavDelete: (cfg: WebDavConfig, item: BackupFileItem) =>
      ipcRenderer.invoke(IpcChannel.BackupWebdavDelete, cfg, item) as Promise<{ success: boolean; error?: string }>,
    clearData: () =>
      ipcRenderer.invoke(IpcChannel.BackupClearData) as Promise<{ success: boolean; error?: string }>,
    openDataDir: () =>
      ipcRenderer.invoke(IpcChannel.BackupOpenDataDir) as Promise<{ success: boolean; error?: string }>,
    getDataPath: () =>
      ipcRenderer.invoke(IpcChannel.BackupGetDataPath) as Promise<string>
  },
  imageStudio: {
    submit: (request: ImageStudioSubmitRequest) =>
      ipcRenderer.invoke(IpcChannel.ImageStudioSubmit, request) as Promise<ImageStudioSubmitResult>,
    cancel: (generationId: string) =>
      ipcRenderer.invoke(IpcChannel.ImageStudioCancel, generationId) as Promise<ImageStudioCancelResult>,
    historyList: (request: ImageStudioListRequest) =>
      ipcRenderer.invoke(IpcChannel.ImageStudioHistoryList, request) as Promise<ImageStudioHistoryListResult>,
    historyGet: (generationId: string) =>
      ipcRenderer.invoke(IpcChannel.ImageStudioHistoryGet, generationId) as Promise<ImageStudioHistoryGetResult>,
    historyDelete: (request: ImageStudioDeleteRequest) =>
      ipcRenderer.invoke(IpcChannel.ImageStudioHistoryDelete, request) as Promise<ImageStudioHistoryDeleteResult>,
    outputDelete: (request: ImageStudioOutputDeleteRequest) =>
      ipcRenderer.invoke(IpcChannel.ImageStudioOutputDelete, request) as Promise<ImageStudioOutputDeleteResult>,
    historyRetry: (request: ImageStudioRetryRequest) =>
      ipcRenderer.invoke(IpcChannel.ImageStudioHistoryRetry, request) as Promise<ImageStudioSubmitResult>,
    onEvent: (fn: (event: ImageStudioEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: ImageStudioEvent) => fn(payload)
      ipcRenderer.on(IpcChannel.ImageStudioEvent, listener)
      return () => ipcRenderer.removeListener(IpcChannel.ImageStudioEvent, listener)
    }
  },
  storage: {
    getReport: () => ipcRenderer.invoke('storage:getReport') as Promise<StorageReport>,
    clear: (categoryKey: string, itemId: string | null) =>
      ipcRenderer.invoke('storage:clear', categoryKey, itemId) as Promise<StorageReport>,
    openDataFolder: () => ipcRenderer.invoke('storage:openDataFolder') as Promise<void>,
    getCategoryItems: (categoryKey: string) =>
      ipcRenderer.invoke('storage:getCategoryItems', categoryKey) as Promise<StorageItemDetail[]>,
    deleteItems: (paths: string[]) =>
      ipcRenderer.invoke('storage:deleteItems', paths) as Promise<void>
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
