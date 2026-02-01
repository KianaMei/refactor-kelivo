export const IpcChannel = {
  ConfigGet: 'config:get',
  ConfigSave: 'config:save',

  ModelsList: 'models:list',

  ChatStreamStart: 'chat:streamStart',
  ChatStreamAbort: 'chat:streamAbort',
  ChatStreamChunk: 'chat:streamChunk',
  ChatStreamError: 'chat:streamError',

  ChatTest: 'chat:test',

  AvatarSave: 'avatar:save',
  AvatarDelete: 'avatar:delete',
  AvatarResolve: 'avatar:resolve',

  ProviderBundleExport: 'provider-bundle:export',
  ProviderBundleImport: 'provider-bundle:import',

  DialogSaveFile: 'dialog:save-file',
  DialogOpenFile: 'dialog:open-file'
} as const
