import type { ImageStudioConfig } from '../imageStudio'

export type ThemeMode = 'system' | 'light' | 'dark'

export type ThemePalette = 'default' | 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'teal' | 'red' | 'yellow'

export type AppLanguage = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP' | 'ko-KR' | 'ru-RU' | 'system'

export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  'system': '跟随系统',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'en-US': 'English',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'ru-RU': 'Русский',
}

export type TopicPosition = 'left' | 'right'

export type ChatMessageBackgroundStyle = 'default' | 'frosted' | 'solid'

// ============ 用户配置 ============
export type UserAvatarType = 'initial' | 'emoji' | 'url' | 'file'

export interface UserConfig {
  name: string
  avatarType: UserAvatarType
  avatarValue: string // emoji字符、URL或本地文件路径
}

export type ProviderKind = 'openai' | 'openai_response' | 'claude' | 'google'

export type LoadBalanceStrategy = 'roundRobin' | 'priority' | 'leastUsed' | 'random'

export interface ApiKeyConfig {
  id: string
  key: string
  name?: string
  isEnabled: boolean
  priority: number // 1-10，越小优先级越高
  sortIndex: number // 手动排序/轮询顺序
  maxRequestsPerMinute?: number
  createdAt: number
}

export interface KeyManagementConfig {
  strategy: LoadBalanceStrategy
  maxFailuresBeforeDisable: number
  failureRecoveryTimeMinutes: number
  enableAutoRecovery: boolean
  roundRobinIndex?: number
}

export interface ProviderConfigV2 {
  id: string
  enabled: boolean
  name: string
  apiKey: string
  baseUrl: string
  providerType?: ProviderKind
  chatPath?: string
  useResponseApi?: boolean
  // Google Vertex AI（可选）
  vertexAI?: boolean
  location?: string
  projectId?: string
  serviceAccountJson?: string
  // 模型列表（可由用户维护，或未来从 /models 拉取）
  models: string[]
  // 每个模型的覆盖配置（结构与旧版一致：类型/输入输出/能力等）
  modelOverrides: Record<string, any>
  // 供应商级代理
  proxyEnabled?: boolean
  proxyHost?: string
  proxyPort?: string
  proxyUsername?: string
  proxyPassword?: string
  // 多 Key
  multiKeyEnabled?: boolean
  apiKeys?: ApiKeyConfig[]
  keyManagement?: KeyManagementConfig
  // 高级设置
  requestTimeout?: number // 请求超时（秒）
  maxRetries?: number // 最大重试次数
  customHeaders?: Record<string, string> // 自定义请求头
  // SSL/TLS
  allowInsecureConnection?: boolean
  // 自定义头像（本地路径）
  customAvatarPath?: string
  createdAt: string
  updatedAt: string
}

export type SettingsMenuKey =
  | 'display'
  | 'assistant'
  | 'providers'
  | 'defaultModel'
  | 'search'
  | 'mcp'
  | 'quickPhrases'
  | 'tts'
  | 'networkProxy'
  | 'backup'
  | 'dependencies'
  | 'usageStats'
  | 'data'
  | 'about'

// ============ 助手配置 ============
export type AssistantRegexScope = 'user' | 'assistant'

export interface AssistantRegexRule {
  id: string
  name: string
  pattern: string
  replacement: string
  scopes: AssistantRegexScope[]
  visualOnly: boolean
  replaceOnly: boolean
  enabled: boolean
}

export type AssistantPresetRole = 'user' | 'assistant'

export interface AssistantPresetMessage {
  id: string
  role: AssistantPresetRole
  content: string
}

export interface AssistantCustomHeader {
  name: string
  value: string
}

export interface AssistantCustomBodyParam {
  key: string
  value: string
}

export interface AssistantConfig {
  id: string
  name: string
  avatar: string                // emoji 或图片路径
  avatarType: 'emoji' | 'image' // 头像类型
  useAssistantAvatar: boolean   // 是否在聊天中用助手头像替代模型图标
  systemPrompt: string          // 系统提示词
  messageTemplate: string       // 用户消息模板（例如：{{ message }}）
  isDefault: boolean            // 是否为默认助手
  deletable: boolean            // 是否允许删除（内置助手不可删除）
  // 模型绑定（可选，若不设置则使用全局默认）
  boundModelProvider: string | null
  boundModelId: string | null
  // 高级设置
  temperature?: number          // 温度
  topP?: number                 // Top P
  maxTokens?: number            // 最大输出 Token
  streamOutput: boolean         // 是否启用流式输出
  // 上下文控制
  contextMessageSize: number    // 仅保留最近 N 条消息
  limitContextMessages: boolean // 是否启用上文限制
  // 工具相关（为后续 Agent/MCP 预留）
  maxToolLoopIterations: number // 最大工具循环次数
  mcpServerIds: string[]        // 绑定的 MCP server id
  // 外观
  background?: string | null    // 对话背景（颜色/URL/本地相对路径）
  // 自定义请求覆盖（每个助手）
  customHeaders: AssistantCustomHeader[]
  customBody: AssistantCustomBodyParam[]
  // 记忆功能（预留）
  enableMemory: boolean
  enableRecentChatsReference: boolean
  // 预置对话消息
  presetMessages: AssistantPresetMessage[]
  // 正则规则（消息改写/视觉调整）
  regexRules: AssistantRegexRule[]
  // 元数据
  createdAt: string
  updatedAt: string
}

export interface QuickPhrase {
  id: string
  title: string
  content: string
  isGlobal: boolean            // true=全局，false=助手专属
  assistantId: string | null   // 全局短语为 null
}

export interface AssistantMemory {
  id: number
  assistantId: string
  content: string
}

// ============ Agent（Claude/Codex）运行时配置 ============
export type AgentSdkProvider = 'claude' | 'codex'

export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'dontAsk' | 'bypassPermissions' | 'plan' | 'delegate'

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

export type CodexApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never'

export interface AgentConfig {
  id: string
  name: string
  prompt: string
  createdAt: string
  updatedAt: string
}

export interface AgentRuntimeConfig {
  lastSdkProvider: AgentSdkProvider
  lastApiProviderIdBySdk: Record<AgentSdkProvider, string | null>
  lastModelIdBySdk: Record<AgentSdkProvider, string | null>
  claudePermissionMode: ClaudePermissionMode
  codexSandboxMode: CodexSandboxMode
  codexApprovalPolicy: CodexApprovalPolicy
  deps: {
    useExternal: boolean
    claudeVersionSpec: string
    codexVersionSpec: string
  }
  depsInstallDir?: string
}

export type McpToolCallMode = 'native' | 'prompt'

// MCP 传输方式（对齐 Flutter 版）
export type McpTransportType = 'sse' | 'http' | 'stdio' | 'inmemory'

export interface McpToolConfig {
  name: string
  description?: string
  enabled: boolean
  schema?: Record<string, unknown>
}

export interface McpServerConfig {
  id: string
  name: string
  transport: McpTransportType
  enabled: boolean
  // SSE: SSE 端点；HTTP: Streamable HTTP 的 baseUrl；Inmemory: 留空
  url: string
  // 自定义请求头（对齐 Flutter 版 headers）
  headers: Record<string, string>
  tools: McpToolConfig[]
  createdAt: string
  updatedAt: string
}

// ============ 搜索服务配置 ============
export type SearchServiceType = 'tavily' | 'exa' | 'brave' | 'duckduckgo' | 'serper' | 'bing' | 'searxng' | 'custom'
export type SearchLoadBalanceStrategy = 'roundRobin' | 'priority' | 'leastUsed' | 'random'
export type SearchKeyStatus = 'active' | 'error' | 'rateLimited' | 'disabled'
export type SearchConnectionStatus = 'untested' | 'testing' | 'connected' | 'failed' | 'rateLimited'

export interface SearchApiKeyConfig {
  id: string
  key: string
  name?: string
  isEnabled: boolean
  priority: number
  sortIndex: number
  maxRequestsPerMinute?: number
  createdAt: number
  status?: SearchKeyStatus
  totalRequests?: number
  lastError?: string
}

export interface SearchServiceConfig {
  id: string
  name: string
  type: SearchServiceType
  enabled: boolean
  baseUrl?: string
  apiKeys: SearchApiKeyConfig[]
  strategy: SearchLoadBalanceStrategy
  connectionStatus: SearchConnectionStatus
  lastError?: string
  serviceConfig?: Record<string, unknown>
}

export interface SearchGlobalConfig {
  enabled: boolean
  defaultServiceId: string | null
  maxResults: number
  timeout: number
}

export interface SearchConfig {
  global: SearchGlobalConfig
  services: SearchServiceConfig[]
}

// ============ API 测试服务配置 ============
export interface ApiTestConfig {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'google'
  apiKey: string
  baseUrl: string
  models: string[]
  selectedModel: string | null
}

// ============ 显示设置 ============
export interface DisplaySettings {
  // 语言
  language: AppLanguage
  // 主题
  themePalette: ThemePalette
  usePureBackground: boolean
  chatMessageBackgroundStyle: ChatMessageBackgroundStyle
  chatBubbleOpacity: number // 0-100
  topicPosition: TopicPosition
  desktopContentWidth: 'narrow' | 'wide'
  desktopNarrowWidth: number // px
  // 字体
  appFontFamily: string
  codeFontFamily: string
  uiFontSize: number // 12-20
  globalFontScale: number // 0.8-1.5
  chatFontSize: number // 12-24
  // 消息显示
  hideAllAvatars: boolean
  showUserAvatar: boolean
  showUserNameTimestamp: boolean
  showUserMessageActions: boolean
  showModelIcon: boolean
  showModelNameTimestamp: boolean
  showTokenStats: boolean
  showStickerToolUI: boolean
  // 渲染
  enableDollarLatex: boolean
  enableMathRendering: boolean
  enableUserMarkdown: boolean
  enableReasoningMarkdown: boolean
  // 行为与启动
  autoCollapseThinking: boolean
  showAppUpdates: boolean
  showMessageNav: boolean
  showChatListDate: boolean
  newChatOnLaunch: boolean
  closeToTray: boolean
  // 其他
  autoScrollIdleSeconds: number
  disableAutoScroll: boolean
  chatBackgroundMaskStrength: number // 0-100

}

export type DesktopTopicPosition = 'left' | 'right'

export interface DesktopUiStateV2 {
  sidebarWidth: number
  sidebarOpen: boolean
  rightSidebarWidth: number
  rightSidebarOpen: boolean
  settingsSidebarWidth: number
  selectedSettingsMenu: SettingsMenuKey
  topicPosition: DesktopTopicPosition
}

export interface UiStateV2 {
  desktop: DesktopUiStateV2
}

export interface AppConfigV1 {
  version: 1
  defaultProviderId: string | null
  providers: Array<{
    id: string
    type: 'openai_compatible'
    name: string
    baseUrl: string
    apiKey: string
    createdAt: string
    updatedAt: string
  }>
}

export interface AppConfigV2 {
  version: 2
  themeMode: ThemeMode
  // 用户配置
  user: UserConfig
  providersOrder: string[]
  providerConfigs: Record<string, ProviderConfigV2>
  // Chat 默认模型（等价于旧版 currentModelProvider/currentModelId）
  currentModelProvider: string | null
  currentModelId: string | null
  // Translate 默认模型（等价于旧版 translateModelProvider/translateModelId）
  translateModelProvider: string | null
  translateModelId: string | null
  // 标题生成模型
  titleModelProvider: string | null
  titleModelId: string | null
  titlePrompt: string
  // 摘要生成模型
  summaryModelProvider: string | null
  summaryModelId: string | null
  summaryPrompt: string
  // 翻译 Prompt
  translatePrompt?: string
  // OCR 模型
  ocrModelProvider?: string | null
  ocrModelId?: string | null
  ocrEnabled?: boolean
  // Agent（用于 Agent Tab；仅存 name/prompt，运行时再选 provider/model/权限）
  agentsOrder: string[]
  agentConfigs: Record<string, AgentConfig>
  agentRuntime: AgentRuntimeConfig
  // MCP
  mcpServers: McpServerConfig[]
  mcpToolCallMode: McpToolCallMode
  // 快捷短语（包含全局 + 助手专属）
  quickPhrases: QuickPhrase[]
  // 助手记忆库（按 assistantId 归属）
  assistantMemories: AssistantMemory[]
  // 搜索服务配置
  searchConfig: SearchConfig
  // 全局代理
  proxyEnabled?: boolean
  proxyType?: 'http' | 'https' | 'socks5'
  proxyHost?: string
  proxyPort?: string
  proxyUsername?: string
  proxyPassword?: string
  proxyBypass?: string
  // 备份配置
  backupConfig: BackupConfig
  imageStudio: ImageStudioConfig
  // Api Test
  apiTestConfigs: ApiTestConfig[]
  apiTestActiveConfigId: string
  // 显示设置
  display: DisplaySettings
  ui: UiStateV2
}

export type AppConfig = AppConfigV2

// ============ 备份配置 ============
export type RestoreMode = 'overwrite' | 'merge'
export type BackupWebdavProgressStage = 'prepare' | 'ensureCollection' | 'upload' | 'done'

export interface BackupWebdavProgress {
  stage: BackupWebdavProgressStage
  percent: number
  message: string
}

export interface WebDavConfig {
  id: string
  name: string
  url: string
  username: string
  password: string
  path: string
  includeChats: boolean
  includeAttachments: boolean
  includeGeneratedImages: boolean
  createdAt: string
  updatedAt: string
}

export interface BackupFileItem {
  href: string
  displayName: string
  size: number
  lastModified: string | null
}

export interface BackupConfig {
  webdavConfigs: WebDavConfig[]
  currentWebdavConfigId: string | null
}

// ============ 存储服务 ============
export type StorageCategoryKey = 'images' | 'files' | 'chatData' | 'assistantData' | 'cache' | 'logs' | 'other'

export interface StorageItem {
  id: string
  name: string
  size: number
  count?: number
  clearable?: boolean
}

export interface StorageCategory {
  key: StorageCategoryKey
  name: string
  size: number
  items: StorageItem[]
}

export interface StorageReport {
  total: number
  categories: StorageCategory[]
}

export interface BundleImportResult {
  providers: ProviderConfigV2[]
}

export type McpToolSummary = Pick<McpToolConfig, 'name' | 'description' | 'schema'>

export type McpListToolsResponse =
  | { success: true; tools: McpToolSummary[] }
  | { success: false; error: string }

export interface McpCallToolRequest {
  serverId: string
  toolName: string
  arguments?: Record<string, unknown>
}

export type McpCallToolResponse =
  | { success: true; content: string; isError?: boolean }
  | { success: false; error: string }

export interface StorageItemDetail {
  name: string
  path: string
  size: number
  modifiedAt: number
  kind?: 'avatar' | 'chat' | 'generated' | 'other'
  thumbnailPath?: string
}
