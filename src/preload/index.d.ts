import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppConfig, ProviderConfigV2, BundleImportResult, McpListToolsResponse, McpCallToolRequest, McpCallToolResponse, StorageReport, StorageItemDetail, WebDavConfig, BackupFileItem, RestoreMode, BackupWebdavProgress } from '../shared/types'
import type { ModelsListResult } from '../shared/models'
import type { OcrRunRequest, OcrRunResult } from '../shared/ocr'
import type { SearchRequest, SearchResponse, SearchServiceConfigUnion } from '../shared/search'
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
import type {
    ImageStudioSubmitRequest,
    ImageStudioSubmitResult,
    ImageStudioCancelResult,
    ImageStudioListRequest,
    ImageStudioHistoryListResult,
    ImageStudioHistoryGetResult,
    ImageStudioDeleteRequest,
    ImageStudioHistoryDeleteResult,
    ImageStudioOutputDeleteRequest,
    ImageStudioOutputDeleteResult,
    ImageStudioRetryRequest,
    ImageStudioEvent
} from '../shared/imageStudio'
import type {
    PromptLibraryCreateInput,
    PromptLibraryUpdateInput,
    PromptLibraryListRequest,
    PromptLibraryListResult,
    PromptLibrarySingleResult,
    PromptLibraryDeleteResult
} from '../shared/promptLibrary'
import type {
    AgentEventPayload,
    AgentPermissionRespondParams,
    AgentRunAbortParams,
    AgentRunStartParams,
    AgentRunStartResult
} from '../shared/agentRuntime'
import type { DepsInstallParams, DepsProgressEvent, DepsStatusResult, DepsUninstallParams } from '../shared/deps'

interface PreprocessImageParams {
    imagePaths: string[]
}

interface PreprocessImageResult {
    images: Array<{ mime: string; base64: string }>
}

declare global {
    interface Window {
        electron: ElectronAPI
        api: {
            config: {
                get: () => Promise<AppConfig>
                save: (cfg: AppConfig) => Promise<AppConfig>
            }
            storage: {
                getReport: () => Promise<StorageReport>
                clear: (categoryKey: string, itemId: string | null) => Promise<StorageReport>
                openDataFolder: () => Promise<void>
                getCategoryItems: (categoryKey: string) => Promise<StorageItemDetail[]>
                deleteItems: (paths: string[]) => Promise<void>
            }
            chat: {
                test: (providerId: string, modelId: string) => Promise<void>
                preprocess: (params: PreprocessImageParams) => Promise<PreprocessImageResult>
            }
            models: {
                list: (providerId: string) => Promise<ModelsListResult>
                testFetch: (params: { providerType: string; baseUrl: string; apiKey: string }) => Promise<ModelsListResult>
            }
            avatar: {
                save: (providerId: string, base64DataUrl: string) => Promise<string>
                delete: (providerId: string) => Promise<void>
                resolve: (relativePath: string) => Promise<string>
            }
            providerBundle: {
                export: (providers: ProviderConfigV2[]) => Promise<Buffer>
                import: (buffer: Buffer) => Promise<BundleImportResult>
            }
            dialog: {
                saveFile: (options: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; filePath?: string }>
                openFile: (options: { filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; buffer?: Buffer; filePath?: string }>
                writeFile: (filePath: string, data: Buffer) => Promise<void>
            }
            db: {
                conversations: {
                    list: (params?: ConversationListParams) => Promise<ConversationListResult>
                    get: (id: string) => Promise<DbConversation | null>
                    create: (input: ConversationCreateInput) => Promise<DbConversation>
                    update: (id: string, input: ConversationUpdateInput) => Promise<DbConversation | null>
                    delete: (id: string) => Promise<void>
                    regenerateTitle: (id: string) => Promise<DbConversation | null>
                    search: (query: string, workspaceId?: string | null) => Promise<DbConversation[]>
                    messageCount: (conversationId: string) => Promise<number>
                    assistantCount: (conversationId: string) => Promise<number>
                }
                messages: {
                    list: (conversationId: string) => Promise<DbMessage[]>
                    create: (input: MessageCreateInput) => Promise<DbMessage>
                    createBatch: (inputs: MessageCreateInput[]) => Promise<void>
                    update: (id: string, input: MessageUpdateInput) => Promise<DbMessage | null>
                    delete: (id: string) => Promise<void>
                    versions: (groupId: string) => Promise<DbMessage[]>
                    search: (query: string) => Promise<MessageSearchResult[]>
                    nextSortOrder: (conversationId: string) => Promise<number>
                }
                workspaces: {
                    list: () => Promise<DbWorkspace[]>
                    get: (id: string) => Promise<DbWorkspace | null>
                    create: (input: WorkspaceCreateInput) => Promise<DbWorkspace>
                    update: (id: string, input: WorkspaceUpdateInput) => Promise<DbWorkspace | null>
                    delete: (id: string) => Promise<void>
                    children: (parentId: string | null) => Promise<DbWorkspace[]>
                }
                memories: {
                    list: (assistantId: string) => Promise<DbMemory[]>
                    create: (input: MemoryCreateInput) => Promise<DbMemory>
                    update: (id: number, content: string) => Promise<DbMemory | null>
                    delete: (id: number) => Promise<void>
                    deleteByAssistant: (assistantId: string) => Promise<void>
                }
                agentSessions: {
                    list: (agentId?: string) => Promise<DbAgentSession[]>
                    get: (id: string) => Promise<DbAgentSession | null>
                    create: (input: AgentSessionCreateInput) => Promise<DbAgentSession>
                    update: (id: string, input: AgentSessionUpdateInput) => Promise<DbAgentSession | null>
                    delete: (id: string) => Promise<void>
                }
                agentMessages: {
                    list: (sessionId: string) => Promise<DbAgentMessage[]>
                    create: (input: AgentMessageCreateInput) => Promise<DbAgentMessage>
                    update: (id: string, input: AgentMessageUpdateInput) => Promise<DbAgentMessage | null>
                    delete: (id: string) => Promise<void>
                }
            }
            window: {
                minimize: () => void
                maximize: () => void
                close: () => void
                isMaximized: () => Promise<boolean>
                onMaximizedChange: (fn: (isMaximized: boolean) => void) => () => void
            }
            ocr: {
                run: (request: OcrRunRequest) => Promise<OcrRunResult>
                getCached: (imagePath: string) => Promise<string | null>
                setCache: (imagePath: string, text: string) => Promise<void>
                clearCache: () => Promise<void>
                getCacheSize: () => Promise<number>
            }
            search: {
                execute: (request: SearchRequest) => Promise<SearchResponse>
                listProviders: () => Promise<Array<{ id: string; name: string; type: string }>>
                register: (id: string, config: SearchServiceConfigUnion, isDefault?: boolean) => Promise<boolean>
                unregister: (id: string) => Promise<boolean>
                setDefault: (id: string) => Promise<boolean>
            }
            mcp: {
                listTools: (serverId: string) => Promise<McpListToolsResponse>
                callTool: (request: McpCallToolRequest) => Promise<McpCallToolResponse>
            }
            backup: {
                exportLocal: (options: { includeChats: boolean; includeAttachments: boolean; includeGeneratedImages: boolean }) => Promise<{ success: boolean; data?: Buffer; error?: string }>
                importLocal: (options: { buffer: Buffer; mode: RestoreMode; includeChats: boolean; includeAttachments: boolean; includeGeneratedImages: boolean }) => Promise<{ success: boolean; message?: string; error?: string }>
                webdavTest: (cfg: WebDavConfig) => Promise<{ success: boolean; error?: string }>
                webdavBackup: (cfg: WebDavConfig) => Promise<{ success: boolean; error?: string }>
                onWebdavProgress: (fn: (progress: BackupWebdavProgress) => void) => () => void
                webdavList: (cfg: WebDavConfig) => Promise<{ success: boolean; items: BackupFileItem[]; error?: string }>
                webdavRestore: (cfg: WebDavConfig, item: BackupFileItem, mode: RestoreMode) => Promise<{ success: boolean; message?: string; error?: string }>
                webdavDelete: (cfg: WebDavConfig, item: BackupFileItem) => Promise<{ success: boolean; error?: string }>
                clearData: () => Promise<{ success: boolean; error?: string }>
                openDataDir: () => Promise<{ success: boolean; error?: string }>
                getDataPath: () => Promise<string>
            }
            imageStudio: {
                submit: (request: ImageStudioSubmitRequest) => Promise<ImageStudioSubmitResult>
                cancel: (generationId: string) => Promise<ImageStudioCancelResult>
                historyList: (request: ImageStudioListRequest) => Promise<ImageStudioHistoryListResult>
                historyGet: (generationId: string) => Promise<ImageStudioHistoryGetResult>
                historyDelete: (request: ImageStudioDeleteRequest) => Promise<ImageStudioHistoryDeleteResult>
                outputDelete: (request: ImageStudioOutputDeleteRequest) => Promise<ImageStudioOutputDeleteResult>
                historyRetry: (request: ImageStudioRetryRequest) => Promise<ImageStudioSubmitResult>
                onEvent: (fn: (event: ImageStudioEvent) => void) => () => void
            }
            promptLibrary: {
                list: (request: PromptLibraryListRequest) => Promise<PromptLibraryListResult>
                create: (input: PromptLibraryCreateInput) => Promise<PromptLibrarySingleResult>
                update: (id: string, input: PromptLibraryUpdateInput) => Promise<PromptLibrarySingleResult>
                get: (id: string) => Promise<PromptLibrarySingleResult>
                delete: (id: string) => Promise<PromptLibraryDeleteResult>
                clear: () => Promise<PromptLibraryDeleteResult>
            }
            agent: {
                runStart: (params: AgentRunStartParams) => Promise<AgentRunStartResult>
                abort: (params: AgentRunAbortParams) => Promise<void>
                respondPermission: (params: AgentPermissionRespondParams) => Promise<void>
                onEvent: (fn: (evt: AgentEventPayload) => void) => () => void
            }
            deps: {
                getStatus: () => Promise<DepsStatusResult>
                install: (params: DepsInstallParams) => Promise<DepsStatusResult>
                uninstall: (params: DepsUninstallParams) => Promise<DepsStatusResult>
                onProgress: (fn: (evt: DepsProgressEvent) => void) => () => void
            }
        }
    }
}
