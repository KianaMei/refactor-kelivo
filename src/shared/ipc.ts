export const IpcChannel = {
  ConfigGet: 'config:get',
  ConfigSave: 'config:save',

  ModelsList: 'models:list',
  ModelsTestFetch: 'models:testFetch',

  ChatTest: 'chat:test',
  ChatPreprocess: 'chat:preprocess',

  AvatarSave: 'avatar:save',
  AvatarDelete: 'avatar:delete',
  AvatarResolve: 'avatar:resolve',

  ProviderBundleExport: 'provider-bundle:export',
  ProviderBundleImport: 'provider-bundle:import',

  DialogSaveFile: 'dialog:save-file',
  DialogOpenFile: 'dialog:open-file',
  DialogWriteFile: 'dialog:write-file',

  // Window
  WindowMinimize: 'window-minimize',
  WindowMaximize: 'window-maximize',
  WindowClose: 'window-close',
  WindowIsMaximized: 'window-is-maximized',
  WindowMaximizedChanged: 'window-maximized-changed',

  // OCR
  OcrRun: 'ocr:run',
  OcrGetCached: 'ocr:getCached',
  OcrSetCache: 'ocr:setCache',
  OcrClearCache: 'ocr:clearCache',
  OcrGetCacheSize: 'ocr:getCacheSize',

  // Search
  SearchExecute: 'search:execute',
  SearchListProviders: 'search:listProviders',
  SearchRegister: 'search:register',
  SearchUnregister: 'search:unregister',
  SearchSetDefault: 'search:setDefault',

  // MCP
  McpListTools: 'mcp:listTools',
  McpCallTool: 'mcp:callTool',

  // Storage
  StorageGetReport: 'storage:getReport',
  StorageClear: 'storage:clear',
  StorageOpenDataFolder: 'storage:openDataFolder',
  StorageGetCategoryItems: 'storage:getCategoryItems',
  StorageDeleteItems: 'storage:deleteItems',

  // Database — Conversations
  DbConversationList: 'db:conversation:list',
  DbConversationGet: 'db:conversation:get',
  DbConversationCreate: 'db:conversation:create',
  DbConversationUpdate: 'db:conversation:update',
  DbConversationDelete: 'db:conversation:delete',
  DbConversationRegenerateTitle: 'db:conversation:regenerateTitle',
  DbConversationSearch: 'db:conversation:search',
  DbConversationMessageCount: 'db:conversation:messageCount',
  DbConversationAssistantCount: 'db:conversation:assistantCount',

  // Database — Messages
  DbMessageList: 'db:message:list',
  DbMessageCreate: 'db:message:create',
  DbMessageCreateBatch: 'db:message:createBatch',
  DbMessageUpdate: 'db:message:update',
  DbMessageDelete: 'db:message:delete',
  DbMessageVersions: 'db:message:versions',
  DbMessageSearch: 'db:message:search',
  DbMessageNextSortOrder: 'db:message:nextSortOrder',

  // Database — Workspaces
  DbWorkspaceList: 'db:workspace:list',
  DbWorkspaceGet: 'db:workspace:get',
  DbWorkspaceCreate: 'db:workspace:create',
  DbWorkspaceUpdate: 'db:workspace:update',
  DbWorkspaceDelete: 'db:workspace:delete',
  DbWorkspaceChildren: 'db:workspace:children',

  // Database — Memories
  DbMemoryList: 'db:memory:list',
  DbMemoryCreate: 'db:memory:create',
  DbMemoryUpdate: 'db:memory:update',
  DbMemoryDelete: 'db:memory:delete',
  DbMemoryDeleteByAssistant: 'db:memory:deleteByAssistant',

  // Database — Agent Sessions
  DbAgentSessionList: 'db:agentSession:list',
  DbAgentSessionGet: 'db:agentSession:get',
  DbAgentSessionCreate: 'db:agentSession:create',
  DbAgentSessionUpdate: 'db:agentSession:update',
  DbAgentSessionDelete: 'db:agentSession:delete',

  // Database — Agent Messages
  DbAgentMessageList: 'db:agentMessage:list',
  DbAgentMessageCreate: 'db:agentMessage:create',
  DbAgentMessageUpdate: 'db:agentMessage:update',
  DbAgentMessageDelete: 'db:agentMessage:delete',

  // Backup
  BackupExportLocal: 'backup:exportLocal',
  BackupImportLocal: 'backup:importLocal',
  BackupWebdavTest: 'backup:webdav:test',
  BackupWebdavBackup: 'backup:webdav:backup',
  BackupWebdavProgress: 'backup:webdav:progress',
  BackupWebdavList: 'backup:webdav:list',
  BackupWebdavRestore: 'backup:webdav:restore',
  BackupWebdavDelete: 'backup:webdav:delete',
  BackupClearData: 'backup:clearData',
  BackupOpenDataDir: 'backup:openDataDir',
  BackupGetDataPath: 'backup:getDataPath',

  // Agent Runtime
  AgentRunStart: 'agent:runStart',
  AgentRunAbort: 'agent:runAbort',
  AgentPermissionRespond: 'agent:permissionRespond',
  AgentEvent: 'agent:event',

  // Dependencies / SDKs
  DepsGetStatus: 'deps:getStatus',
  DepsInstall: 'deps:install',
  DepsUninstall: 'deps:uninstall',
  DepsProgress: 'deps:progress',

  // Image Studio
  ImageStudioSubmit: 'imageStudio:submit',
  ImageStudioCancel: 'imageStudio:cancel',
  ImageStudioHistoryList: 'imageStudio:history:list',
  ImageStudioHistoryGet: 'imageStudio:history:get',
  ImageStudioHistoryDelete: 'imageStudio:history:delete',
  ImageStudioOutputDelete: 'imageStudio:output:delete',
  ImageStudioHistoryRetry: 'imageStudio:history:retry',
  ImageStudioEvent: 'imageStudio:event',

  // Prompt Library
  PromptLibraryList: 'promptLibrary:list',
  PromptLibraryCreate: 'promptLibrary:create',
  PromptLibraryUpdate: 'promptLibrary:update',
  PromptLibraryGet: 'promptLibrary:get',
  PromptLibraryDelete: 'promptLibrary:delete',
  PromptLibraryClear: 'promptLibrary:clear'
} as const
