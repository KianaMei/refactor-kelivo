import type { ImageStudioConfig } from './imageStudio'
import { createDefaultImageStudioConfig, normalizeImageStudioConfig } from './imageStudio'

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

export type ProviderKind = 'openai' | 'claude' | 'google'

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

export function createDefaultSearchConfig(): SearchConfig {
  return {
    global: {
      enabled: false,
      defaultServiceId: 'duckduckgo',
      maxResults: 10,
      timeout: 10
    },
    services: [
      { id: 'duckduckgo', name: 'DuckDuckGo', type: 'duckduckgo', enabled: true, apiKeys: [], strategy: 'roundRobin', connectionStatus: 'connected', serviceConfig: { region: 'wt-wt', safeSearch: 'moderate', timeRange: '' } }
    ]
  }
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
  globalFontScale: number // 0.8-1.5
  chatFontSize: number // 12-24
  // 消息显示
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
  // 助手配置
  assistantsOrder: string[]
  assistantConfigs: Record<string, AssistantConfig>
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
  // 备份配置
  backupConfig: BackupConfig
  imageStudio: ImageStudioConfig
  // 显示设置
  display: DisplaySettings
  ui: UiStateV2
}

export type AppConfig = AppConfigV2

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'system' || v === 'light' || v === 'dark'
}

function nowIso(): string {
  return new Date().toISOString()
}

function defaultKeyManagement(): KeyManagementConfig {
  return {
    strategy: 'roundRobin',
    maxFailuresBeforeDisable: 3,
    failureRecoveryTimeMinutes: 5,
    enableAutoRecovery: true
  }
}

function classifyProviderKindByUrl(url: string): ProviderKind {
  const s = url.toLowerCase()
  if (s.includes('anthropic') || s.includes('claude')) return 'claude'
  if (s.includes('googleapis') || s.includes('generativelanguage') || s.includes('gemini')) return 'google'
  return 'openai'
}

export function classifyProviderKind(idOrName: string): ProviderKind {
  const s = idOrName.toLowerCase()
  if (s.includes('claude') || s.includes('anthropic')) return 'claude'
  if (s.includes('google') || s.includes('gemini')) return 'google'
  return 'openai'
}

export function inferDefaultBaseUrl(idOrName: string, kind: ProviderKind): string {
  const s = idOrName.toLowerCase()
  // 与 Flutter ProviderConfig.defaultsFor 对齐
  if (s.includes('tensdaq')) return 'https://tensdaq-api.x-aio.com/v1'
  if (s.includes('kelivoin')) return 'https://text.pollinations.ai/openai'
  if (s.includes('openrouter')) return 'https://openrouter.ai/api/v1'
  if (/qwen|aliyun|dashscope|阿里|百炼/.test(s)) return 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  if (/bytedance|doubao|volces|ark|火山/.test(s)) return 'https://ark.cn-beijing.volces.com/api/v3'
  if (/silicon|硅基/.test(s)) return 'https://api.siliconflow.cn/v1'
  if (/grok|x\.ai/.test(s)) return 'https://api.x.ai/v1'
  if (s.includes('deepseek')) return 'https://api.deepseek.com/v1'
  if (/zhipu|智谱|glm/.test(s)) return 'https://open.bigmodel.cn/api/paas/v4'
  if (s.includes('minimax')) return 'https://api.minimax.chat/v1'
  if (s.includes('kimi') || s.includes('moonshot')) return 'https://api.moonshot.cn/v1'
  if (/step|阶跃/.test(s)) return 'https://api.stepfun.com/v1'
  if (s.includes('aihubmix')) return 'https://aihubmix.com/v1'
  if (s.includes('github')) return 'https://models.inference.ai.azure.com'
  if (s.includes('cloudflare')) return 'https://gateway.ai.cloudflare.com/v1'
  if (s.includes('ollama')) return 'http://localhost:11434/v1'
  if (s.includes('302')) return 'https://api.302.ai/v1'
  if (/metaso|秘塔/.test(s)) return 'https://metaso.cn/api/open/v1'
  if (s.includes('perplexity')) return 'https://api.perplexity.ai'
  if (s.includes('mistral')) return 'https://api.mistral.ai/v1'
  if (s.includes('cohere')) return 'https://api.cohere.com/v1'
  if (/hunyuan|tencent|腾讯/.test(s)) return 'https://api.hunyuan.cloud.tencent.com/v1'
  if (/internlm|书生/.test(s)) return 'https://internlm-chat.intern-ai.org.cn/puyu/api/v1'
  if (kind === 'claude') return 'https://api.anthropic.com/v1'
  if (kind === 'google') return 'https://generativelanguage.googleapis.com/v1beta'
  return 'https://api.openai.com/v1'
}

export function createDefaultProviderConfig(id: string, name?: string): ProviderConfigV2 {
  const lower = (name ?? id).toLowerCase()
  const kind = classifyProviderKind(lower)
  const baseUrl = inferDefaultBaseUrl(lower, kind)

  return {
    id,
    enabled: true,
    name: name ?? id,
    apiKey: '',
    baseUrl,
    providerType: kind,
    chatPath: kind === 'openai' ? '/chat/completions' : undefined,
    useResponseApi: false,
    vertexAI: false,
    location: '',
    projectId: '',
    serviceAccountJson: '',
    models: [],
    modelOverrides: {},
    proxyEnabled: false,
    proxyHost: '',
    proxyPort: '8080',
    proxyUsername: '',
    proxyPassword: '',
    multiKeyEnabled: false,
    apiKeys: [],
    keyManagement: defaultKeyManagement(),
    allowInsecureConnection: false,
    customAvatarPath: '',
    createdAt: nowIso(),
    updatedAt: nowIso()
  }
}

export const DEFAULT_TITLE_PROMPT = `I will give you some dialogue content in the \`<content>\` block.
You need to summarize the conversation between user and assistant into a short title.
1. The title language should be consistent with the user's primary language
2. Do not use punctuation or other special symbols
3. Reply directly with the title
4. Summarize using {locale} language
5. The title should not exceed 10 characters

<content>
{content}
</content>`

export const DEFAULT_SUMMARY_PROMPT = `I will give you user messages from a conversation in the \`<messages>\` block.
Generate or update a brief summary of the user's questions and intentions.

1. The summary should be in the same language as the user messages
2. Focus on the user's core questions and intentions
3. Keep it under 100 characters
4. Output the summary directly without any prefix
5. If a previous summary exists, incorporate it with the new messages

<previous_summary>
{previous_summary}
</previous_summary>

<messages>
{user_messages}
</messages>`

export const DEFAULT_TRANSLATE_PROMPT = `You are a translation expert, skilled in translating various languages, and maintaining accuracy, faithfulness, and elegance in translation.
Next, I will send you text. Please translate it into {target_lang}, and return the translation result directly, without adding any explanations or other content.

Please translate the <source_text> section:
<source_text>
{source_text}
</source_text>`

export const DEFAULT_ASSISTANT_SAMPLE_SYSTEM_PROMPT =
  '你是{model_name}, 一个人工智能助手，乐意为用户提供准确，有益的帮助。现在时间是{cur_datetime}，用户设备语言为{locale}，时区为{timezone}，用户正在使用{device_info}，版本{system_version}。如果用户没有明确说明，请使用用户设备语言进行回复。'

export const DEFAULT_ASSISTANT_OCR_SYSTEM_PROMPT = `You are an OCR assistant.

Extract all visible text from the image and also describe any non-text elements (icons, shapes, arrows, objects, symbols, or emojis).

Please ensure:
- Preserve original formatting as much as possible
- Keep hierarchical structure (headings, lists, tables)
- Describe visual elements that convey meaning
- Keep the original reading order and layout structure as much as possible.

Do not interpret or translate—only transcribe and describe what is visually present.`

export function createDefaultAssistantConfig(id: string, name: string, options?: Partial<AssistantConfig>): AssistantConfig {
  const now = nowIso()
  return {
    id,
    name,
    avatar: '🤖',
    avatarType: 'emoji',
    useAssistantAvatar: false,
    systemPrompt: '',
    messageTemplate: '{{ message }}',
    isDefault: false,
    deletable: true,
    boundModelProvider: null,
    boundModelId: null,
    temperature: undefined,
    topP: undefined,
    maxTokens: undefined,
    streamOutput: true,
    contextMessageSize: 64,
    limitContextMessages: true,
    maxToolLoopIterations: 10,
    mcpServerIds: [],
    background: null,
    customHeaders: [],
    customBody: [],
    enableMemory: false,
    enableRecentChatsReference: false,
    presetMessages: [],
    regexRules: [],
    createdAt: now,
    updatedAt: now,
    ...options
  }
}

export function createDefaultAgentConfig(id: string, name: string, options?: Partial<AgentConfig>): AgentConfig {
  const now = nowIso()
  return {
    id,
    name,
    prompt: '',
    createdAt: now,
    updatedAt: now,
    ...options
  }
}

export function createDefaultConfig(): AppConfigV2 {
  return {
    version: 2,
    themeMode: 'system',
    user: { name: 'Kelivo', avatarType: 'initial', avatarValue: '' },
    providersOrder: ['openai', 'claude', 'google'],
    providerConfigs: {
      openai: createDefaultProviderConfig('openai', 'OpenAI'),
      claude: createDefaultProviderConfig('claude', 'Claude / Anthropic'),
      google: createDefaultProviderConfig('google', 'Google / Gemini')
    },
    currentModelProvider: null,
    currentModelId: null,
    translateModelProvider: null,
    translateModelId: null,
    titleModelProvider: null,
    titleModelId: null,
    titlePrompt: DEFAULT_TITLE_PROMPT,
    summaryModelProvider: null,
    summaryModelId: null,
    summaryPrompt: DEFAULT_SUMMARY_PROMPT,
    assistantsOrder: ['default', 'sample', 'ocr'],
    assistantConfigs: {
      default: createDefaultAssistantConfig('default', '默认助手', {
        avatar: '🤖',
        systemPrompt: '',
        isDefault: true,
        deletable: false,
        temperature: 0.6,
        topP: 1.0,
      }),
      sample: createDefaultAssistantConfig('sample', '示例助手', {
        avatar: '🧩',
        systemPrompt: DEFAULT_ASSISTANT_SAMPLE_SYSTEM_PROMPT,
        deletable: false,
        temperature: 0.6,
        topP: 1.0,
      }),
      ocr: createDefaultAssistantConfig('ocr', 'OCR 助手', {
        avatar: '🔍',
        systemPrompt: DEFAULT_ASSISTANT_OCR_SYSTEM_PROMPT,
        deletable: false,
        temperature: 0.6,
        topP: 1.0,
      })
    },
    agentsOrder: ['default'],
    agentConfigs: {
      default: createDefaultAgentConfig('default', '默认 Agent', {
        prompt: ''
      })
    },
    agentRuntime: {
      lastSdkProvider: 'claude',
      lastApiProviderIdBySdk: { claude: 'claude', codex: 'openai' },
      lastModelIdBySdk: { claude: null, codex: null },
      claudePermissionMode: 'default',
      codexSandboxMode: 'read-only',
      codexApprovalPolicy: 'untrusted',
      deps: { useExternal: false, claudeVersionSpec: 'latest', codexVersionSpec: 'latest' },
    },
    mcpServers: [],
    mcpToolCallMode: 'native',
    quickPhrases: [],
    assistantMemories: [],
    proxyEnabled: false,
    proxyType: 'http',
    proxyHost: '',
    proxyPort: '8080',
    proxyUsername: '',
    proxyPassword: '',
    searchConfig: createDefaultSearchConfig(),
    backupConfig: createDefaultBackupConfig(),
    imageStudio: createDefaultImageStudioConfig(),
    display: createDefaultDisplaySettings(),
    ui: {
      desktop: {
        sidebarWidth: 300,
        sidebarOpen: true,
        rightSidebarWidth: 300,
        rightSidebarOpen: true,
        settingsSidebarWidth: 256,
        selectedSettingsMenu: 'display',
        topicPosition: 'left'
      }
    }
  }
}

export function createDefaultDisplaySettings(): DisplaySettings {
  return {
    language: 'system',
    themePalette: 'blue',
    usePureBackground: false,
    chatMessageBackgroundStyle: 'default',
    chatBubbleOpacity: 80,
    topicPosition: 'left',
    desktopContentWidth: 'wide',
    desktopNarrowWidth: 800,
    appFontFamily: '',
    codeFontFamily: '',
    globalFontScale: 1.0,
    chatFontSize: 14,
    showUserAvatar: true,
    showUserNameTimestamp: false,
    showUserMessageActions: true,
    showModelIcon: true,
    showModelNameTimestamp: true,
    showTokenStats: true,
    showStickerToolUI: true,
    enableDollarLatex: true,
    enableMathRendering: true,
    enableUserMarkdown: true,
    enableReasoningMarkdown: true,
    autoCollapseThinking: true,
    showAppUpdates: true,
    showMessageNav: true,
    showChatListDate: true,
    newChatOnLaunch: false,
    closeToTray: false,
    autoScrollIdleSeconds: 8,
    disableAutoScroll: false,
    chatBackgroundMaskStrength: 50,

  }
}

export function normalizeConfig(input: unknown): AppConfigV2 {
  const def = createDefaultConfig()
  if (!isRecord(input)) return def

  const version = input['version']
  if (version === 1) {
    return migrateV1ToV2(input as unknown as AppConfigV1)
  }
  if (version !== 2) return def

  const cfg = input as Record<string, unknown>
  const themeMode: ThemeMode = isThemeMode(cfg['themeMode']) ? (cfg['themeMode'] as ThemeMode) : def.themeMode

  // 规范化用户配置
  const userRaw = cfg['user']
  const user: UserConfig = isRecord(userRaw)
    ? {
      name: typeof userRaw['name'] === 'string' && userRaw['name'].trim() ? userRaw['name'] : def.user.name,
      avatarType: ['initial', 'emoji', 'url', 'file'].includes(userRaw['avatarType'] as string)
        ? (userRaw['avatarType'] as UserAvatarType)
        : def.user.avatarType,
      avatarValue: typeof userRaw['avatarValue'] === 'string' ? userRaw['avatarValue'] : def.user.avatarValue
    }
    : def.user

  let providersOrder = Array.isArray(cfg['providersOrder'])
    ? (cfg['providersOrder'].filter((x) => typeof x === 'string') as string[])
    : def.providersOrder

  const providerConfigsRaw = cfg['providerConfigs']
  let providerConfigs: Record<string, ProviderConfigV2> = {}
  if (isRecord(providerConfigsRaw)) {
    for (const [key, value] of Object.entries(providerConfigsRaw)) {
      const norm = normalizeProviderConfig(key, value)
      if (norm) providerConfigs[key] = norm
    }
  }

  // providerConfigs 为空时，视为首次启动：注入内置默认供应商，避免 UI 空白。
  if (Object.keys(providerConfigs).length === 0) {
    providerConfigs = def.providerConfigs
    providersOrder = def.providersOrder
  }

  const ui = normalizeUi(cfg['ui'], def.ui)
  const display = normalizeDisplaySettings(cfg['display'], def.display)

  // 处理助手配置
  let assistantsOrder = Array.isArray(cfg['assistantsOrder'])
    ? (cfg['assistantsOrder'].filter((x) => typeof x === 'string') as string[])
    : def.assistantsOrder

  const assistantConfigsRaw = cfg['assistantConfigs']
  let assistantConfigs: Record<string, AssistantConfig> = {}
  if (isRecord(assistantConfigsRaw)) {
    for (const [key, value] of Object.entries(assistantConfigsRaw)) {
      const norm = normalizeAssistantConfig(key, value)
      if (norm) assistantConfigs[key] = norm
    }
  }

  // assistantConfigs 为空时，注入内置默认助手
  if (Object.keys(assistantConfigs).length === 0) {
    assistantConfigs = def.assistantConfigs
    assistantsOrder = def.assistantsOrder
  }

  // 版本升级兼容：补齐内置助手（只在缺失时注入，不覆盖用户同名 id）
  for (const [id, builtin] of Object.entries(def.assistantConfigs)) {
    if (!assistantConfigs[id]) assistantConfigs[id] = builtin
  }

  // 规范化 assistantsOrder：去重 + 过滤不存在 + 补齐缺失
  {
    const seen = new Set<string>()
    assistantsOrder = assistantsOrder.filter((id) => {
      if (!assistantConfigs[id]) return false
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    for (const id of Object.keys(assistantConfigs)) {
      if (!seen.has(id)) assistantsOrder.push(id)
    }
  }

  // 规范化默认助手：保证至少且仅有一个 isDefault=true
  {
    const defaultIds = assistantsOrder.filter((id) => assistantConfigs[id]?.isDefault)
    const fallbackId = assistantsOrder[0] ?? Object.keys(assistantConfigs)[0]

    if (defaultIds.length === 0 && fallbackId && assistantConfigs[fallbackId]) {
      assistantConfigs = {
        ...assistantConfigs,
        [fallbackId]: { ...assistantConfigs[fallbackId], isDefault: true, updatedAt: nowIso() }
      }
    } else if (defaultIds.length > 1) {
      const keepId = defaultIds[0]
      const next: Record<string, AssistantConfig> = { ...assistantConfigs }
      for (const id of defaultIds) {
        if (id === keepId) continue
        next[id] = { ...next[id], isDefault: false, updatedAt: nowIso() }
      }
      assistantConfigs = next
    }
  }

  // Agent（Claude/Codex）模板
  let agentsOrder = Array.isArray(cfg['agentsOrder'])
    ? (cfg['agentsOrder'].filter((x) => typeof x === 'string') as string[])
    : def.agentsOrder

  const agentConfigsRaw = cfg['agentConfigs']
  let agentConfigs: Record<string, AgentConfig> = {}
  if (isRecord(agentConfigsRaw)) {
    for (const [key, value] of Object.entries(agentConfigsRaw)) {
      const norm = normalizeAgentConfig(key, value)
      if (norm) agentConfigs[key] = norm
    }
  }

  // agentConfigs 为空时注入内置默认 Agent
  if (Object.keys(agentConfigs).length === 0) {
    agentConfigs = def.agentConfigs
    agentsOrder = def.agentsOrder
  }

  // 补齐缺失内置 Agent（不覆盖用户同名 id）
  for (const [id, builtin] of Object.entries(def.agentConfigs)) {
    if (!agentConfigs[id]) agentConfigs[id] = builtin
  }

  // 规整 agentsOrder：去重 + 过滤不存在 + 补齐缺失
  {
    const seen = new Set<string>()
    agentsOrder = agentsOrder.filter((id) => {
      if (!agentConfigs[id]) return false
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    for (const id of Object.keys(agentConfigs)) {
      if (!seen.has(id)) agentsOrder.push(id)
    }
  }

  const agentRuntime: AgentRuntimeConfig = normalizeAgentRuntime(cfg['agentRuntime'], def.agentRuntime, providerConfigs)

  function str(v: unknown, d: string): string {
    return typeof v === 'string' ? v : d
  }
  function safeId(v: unknown, prefix: string): string {
    const s = typeof v === 'string' ? v.trim() : ''
    if (s) return s
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }

  // 快捷短语（全局 + 助手专属）
  const quickPhrases: QuickPhrase[] = Array.isArray(cfg['quickPhrases'])
    ? (cfg['quickPhrases']
      .filter((x) => isRecord(x))
      .map((x) => {
        const isGlobal = typeof (x as any)['isGlobal'] === 'boolean'
          ? ((x as any)['isGlobal'] as boolean)
          : !((x as any)['assistantId'] as any)
        const assistantIdRaw = (x as any)['assistantId']
        const assistantId = isGlobal ? null : (typeof assistantIdRaw === 'string' && assistantIdRaw.trim() ? assistantIdRaw : null)
        return {
          id: safeId((x as any)['id'], 'phrase'),
          title: str((x as any)['title'], ''),
          content: str((x as any)['content'], ''),
          isGlobal,
          assistantId
        }
      }))
    : def.quickPhrases

  // 助手记忆
  const assistantMemories: AssistantMemory[] = Array.isArray(cfg['assistantMemories'])
    ? (cfg['assistantMemories']
      .filter((x) => isRecord(x))
      .map((x) => {
        const rawId = (x as any)['id']
        const id = typeof rawId === 'number'
          ? Math.round(rawId)
          : typeof rawId === 'string' && rawId.trim() && Number.isFinite(Number(rawId))
            ? Math.round(Number(rawId))
            : -1
        const assistantId = str((x as any)['assistantId'], '').trim()
        const content = str((x as any)['content'], '').trim()
        if (!assistantId || id <= 0) return null
        return { id, assistantId, content }
      })
      .filter(Boolean) as AssistantMemory[])
    : def.assistantMemories

  // MCP
  const mcpToolCallMode: McpToolCallMode = cfg['mcpToolCallMode'] === 'prompt' ? 'prompt' : 'native'

  function normalizeMcpTransport(v: unknown): McpTransportType {
    const raw = typeof v === 'string' ? v.trim().toLowerCase() : ''
    if (raw === 'sse') return 'sse'
    if (raw === 'http') return 'http'
    if (raw === 'inmemory') return 'inmemory'
    // 兼容 Flutter UI JSON：streamableHttp
    if (raw.includes('http')) return 'http'
    // 兼容旧字段
    if (raw === 'stdio') return 'inmemory'
    if (raw === 'websocket') return 'http'
    return 'sse'
  }

  function normalizeStringMap(v: unknown): Record<string, string> {
    return isRecord(v) ? Object.fromEntries(Object.entries(v).map(([k, val]) => [k, String(val)])) : {}
  }

  const mcpServers: McpServerConfig[] = (() => {
    const raw = cfg['mcpServers']
    // v2：数组
    const listFromArray = Array.isArray(raw) ? raw : null
    // 兼容：map 结构（例如 Flutter 导出的 mcpServers 对象）
    const listFromMap = !listFromArray && isRecord(raw)
      ? Object.entries(raw).map(([id, value]) => ({ ...(value as any), id }))
      : null

    const items = (listFromArray ?? listFromMap ?? []) as any[]
    if (!items.length) return def.mcpServers

    return items
      .filter((x) => isRecord(x))
      .map((x) => {
        const transport = normalizeMcpTransport((x as any)['transport'] ?? (x as any)['type'])

        const enabled =
          typeof (x as any)['enabled'] === 'boolean'
            ? ((x as any)['enabled'] as boolean)
            : typeof (x as any)['isActive'] === 'boolean'
              ? ((x as any)['isActive'] as boolean)
              : true

        const url = str((x as any)['url'] ?? (x as any)['baseUrl'], '').trim()

        // headers：对齐 Flutter；兼容旧字段 env
        const headers = normalizeStringMap((x as any)['headers'] ?? (x as any)['env'])

        const tools: McpToolConfig[] = Array.isArray((x as any)['tools'])
          ? ((x as any)['tools']
            .filter((t: unknown) => isRecord(t))
            .map((t: any) => {
              const name = str(t['name'], '').trim()
              if (!name) return null
              const schema = isRecord(t['schema']) ? (t['schema'] as Record<string, unknown>) : undefined
              return {
                name,
                description: typeof t['description'] === 'string' ? (t['description'] as string) : undefined,
                enabled: typeof t['enabled'] === 'boolean' ? (t['enabled'] as boolean) : true,
                schema
              }
            })
            .filter(Boolean) as McpToolConfig[])
          : []

        const createdAt = typeof (x as any)['createdAt'] === 'string' ? ((x as any)['createdAt'] as string) : nowIso()
        const updatedAt = typeof (x as any)['updatedAt'] === 'string' ? ((x as any)['updatedAt'] as string) : nowIso()

        return {
          id: safeId((x as any)['id'], 'mcp'),
          name: str((x as any)['name'], '').trim() || 'MCP',
          transport,
          enabled,
          url: transport === 'inmemory' ? '' : url,
          headers: transport === 'inmemory' ? {} : headers,
          tools,
          createdAt,
          updatedAt
        }
      })
  })()

  // 搜索服务配置
  const searchConfig: SearchConfig = normalizeSearchConfig(cfg['searchConfig'])

  // 备份配置
  const backupConfig: BackupConfig = normalizeBackupConfig(cfg['backupConfig'])
  const imageStudio: ImageStudioConfig = normalizeImageStudioConfig(cfg['imageStudio'])

  return {
    version: 2,
    themeMode,
    user,
    providersOrder: providersOrder.length ? providersOrder : Object.keys(providerConfigs),
    providerConfigs,
    currentModelProvider: typeof cfg['currentModelProvider'] === 'string' ? (cfg['currentModelProvider'] as string) : null,
    currentModelId: typeof cfg['currentModelId'] === 'string' ? (cfg['currentModelId'] as string) : null,
    translateModelProvider:
      typeof cfg['translateModelProvider'] === 'string' ? (cfg['translateModelProvider'] as string) : null,
    translateModelId: typeof cfg['translateModelId'] === 'string' ? (cfg['translateModelId'] as string) : null,
    titleModelProvider:
      typeof cfg['titleModelProvider'] === 'string' ? (cfg['titleModelProvider'] as string) : null,
    titleModelId: typeof cfg['titleModelId'] === 'string' ? (cfg['titleModelId'] as string) : null,
    titlePrompt: typeof cfg['titlePrompt'] === 'string' ? (cfg['titlePrompt'] as string) : def.titlePrompt,
    summaryModelProvider:
      typeof cfg['summaryModelProvider'] === 'string' ? (cfg['summaryModelProvider'] as string) : null,
    summaryModelId: typeof cfg['summaryModelId'] === 'string' ? (cfg['summaryModelId'] as string) : null,
    summaryPrompt: typeof cfg['summaryPrompt'] === 'string' ? (cfg['summaryPrompt'] as string) : def.summaryPrompt,
    assistantsOrder: assistantsOrder.length ? assistantsOrder : Object.keys(assistantConfigs),
    assistantConfigs,
    agentsOrder: agentsOrder.length ? agentsOrder : Object.keys(agentConfigs),
    agentConfigs,
    agentRuntime,
    mcpServers,
    mcpToolCallMode,
    quickPhrases,
    assistantMemories,
    proxyEnabled: typeof cfg['proxyEnabled'] === 'boolean' ? (cfg['proxyEnabled'] as boolean) : def.proxyEnabled,
    proxyType: (['http', 'https', 'socks5'] as const).includes(cfg['proxyType'] as 'http' | 'https' | 'socks5')
      ? (cfg['proxyType'] as 'http' | 'https' | 'socks5')
      : def.proxyType,
    proxyHost: typeof cfg['proxyHost'] === 'string' ? (cfg['proxyHost'] as string) : def.proxyHost,
    proxyPort: typeof cfg['proxyPort'] === 'string' ? (cfg['proxyPort'] as string) : def.proxyPort,
    proxyUsername: typeof cfg['proxyUsername'] === 'string' ? (cfg['proxyUsername'] as string) : def.proxyUsername,
    proxyPassword: typeof cfg['proxyPassword'] === 'string' ? (cfg['proxyPassword'] as string) : def.proxyPassword,
    searchConfig,
    backupConfig,
    imageStudio,
    display,
    ui
  }
}

function normalizeAgentConfig(id: string, input: unknown): AgentConfig | null {
  if (!isRecord(input)) return null

  const name = typeof input['name'] === 'string' && input['name'].trim() ? (input['name'] as string) : id
  const prompt = typeof input['prompt'] === 'string' ? (input['prompt'] as string) : ''
  const createdAt = typeof input['createdAt'] === 'string' ? (input['createdAt'] as string) : nowIso()
  const updatedAt = typeof input['updatedAt'] === 'string' ? (input['updatedAt'] as string) : nowIso()

  return { id, name, prompt, createdAt, updatedAt }
}

function normalizeAgentRuntime(
  input: unknown,
  def: AgentRuntimeConfig,
  providerConfigs: Record<string, ProviderConfigV2>
): AgentRuntimeConfig {
  const raw = isRecord(input) ? input : {}

  const lastSdkProvider: AgentSdkProvider = raw['lastSdkProvider'] === 'codex' ? 'codex' : def.lastSdkProvider

  function normalizeProviderIdForSdk(sdk: AgentSdkProvider, v: unknown): string | null {
    const id = typeof v === 'string' && v.trim() ? v.trim() : null
    if (id && providerConfigs[id]) return id

    // 兜底：尽量选一个“合理的默认”
    if (sdk === 'claude' && providerConfigs['claude']) return 'claude'
    if (sdk === 'codex' && providerConfigs['openai']) return 'openai'
    return null
  }

  const mapRaw = isRecord(raw['lastApiProviderIdBySdk']) ? (raw['lastApiProviderIdBySdk'] as any) : {}
  const lastApiProviderIdBySdk: Record<AgentSdkProvider, string | null> = {
    claude: normalizeProviderIdForSdk('claude', mapRaw['claude'] ?? def.lastApiProviderIdBySdk.claude),
    codex: normalizeProviderIdForSdk('codex', mapRaw['codex'] ?? def.lastApiProviderIdBySdk.codex),
  }

  const modelRaw = isRecord(raw['lastModelIdBySdk']) ? (raw['lastModelIdBySdk'] as any) : {}
  const lastModelIdBySdk: Record<AgentSdkProvider, string | null> = {
    claude: typeof modelRaw['claude'] === 'string' ? (modelRaw['claude'] as string) : def.lastModelIdBySdk.claude,
    codex: typeof modelRaw['codex'] === 'string' ? (modelRaw['codex'] as string) : def.lastModelIdBySdk.codex,
  }

  function normalizeClaudePermissionMode(v: unknown): ClaudePermissionMode {
    const s = typeof v === 'string' ? v : ''
    if (s === 'acceptEdits') return 'acceptEdits'
    if (s === 'dontAsk') return 'dontAsk'
    if (s === 'bypassPermissions') return 'bypassPermissions'
    if (s === 'plan') return 'plan'
    if (s === 'delegate') return 'delegate'
    return 'default'
  }

  function normalizeCodexSandboxMode(v: unknown): CodexSandboxMode {
    const s = typeof v === 'string' ? v : ''
    if (s === 'workspace-write') return 'workspace-write'
    if (s === 'danger-full-access') return 'danger-full-access'
    return 'read-only'
  }

  function normalizeCodexApprovalPolicy(v: unknown): CodexApprovalPolicy {
    const s = typeof v === 'string' ? v : ''
    if (s === 'on-failure') return 'on-failure'
    if (s === 'on-request') return 'on-request'
    if (s === 'never') return 'never'
    return 'untrusted'
  }

  const depsRaw = isRecord(raw['deps']) ? (raw['deps'] as Record<string, unknown>) : {}
  const deps = {
    useExternal: typeof depsRaw['useExternal'] === 'boolean' ? (depsRaw['useExternal'] as boolean) : def.deps.useExternal,
    claudeVersionSpec: typeof depsRaw['claudeVersionSpec'] === 'string' && (depsRaw['claudeVersionSpec'] as string).trim()
      ? (depsRaw['claudeVersionSpec'] as string).trim()
      : def.deps.claudeVersionSpec,
    codexVersionSpec: typeof depsRaw['codexVersionSpec'] === 'string' && (depsRaw['codexVersionSpec'] as string).trim()
      ? (depsRaw['codexVersionSpec'] as string).trim()
      : def.deps.codexVersionSpec,
  }

  const depsInstallDir = typeof raw['depsInstallDir'] === 'string' && raw['depsInstallDir'].trim()
    ? (raw['depsInstallDir'] as string).trim()
    : undefined

  return {
    lastSdkProvider,
    lastApiProviderIdBySdk,
    lastModelIdBySdk,
    claudePermissionMode: normalizeClaudePermissionMode(raw['claudePermissionMode']),
    codexSandboxMode: normalizeCodexSandboxMode(raw['codexSandboxMode']),
    codexApprovalPolicy: normalizeCodexApprovalPolicy(raw['codexApprovalPolicy']),
    deps,
    depsInstallDir
  }
}

function normalizeAssistantConfig(id: string, input: unknown): AssistantConfig | null {
  if (!isRecord(input)) return null

  const name = typeof input['name'] === 'string' && input['name'].trim() ? (input['name'] as string) : id
  const avatar = typeof input['avatar'] === 'string' ? (input['avatar'] as string) : '🤖'
  const avatarType = input['avatarType'] === 'image' ? 'image' : 'emoji'
  const useAssistantAvatar = typeof input['useAssistantAvatar'] === 'boolean' ? (input['useAssistantAvatar'] as boolean) : false
  const systemPrompt = typeof input['systemPrompt'] === 'string' ? (input['systemPrompt'] as string) : ''
  const messageTemplate = typeof input['messageTemplate'] === 'string' && input['messageTemplate'].trim()
    ? (input['messageTemplate'] as string)
    : '{{ message }}'
  const isDefault = typeof input['isDefault'] === 'boolean' ? (input['isDefault'] as boolean) : false
  const deletable = typeof input['deletable'] === 'boolean' ? (input['deletable'] as boolean) : true

  const boundModelProvider = typeof input['boundModelProvider'] === 'string' ? (input['boundModelProvider'] as string) : null
  const boundModelId = typeof input['boundModelId'] === 'string' ? (input['boundModelId'] as string) : null

  const temperature = typeof input['temperature'] === 'number' ? (input['temperature'] as number) : undefined
  const topP = typeof input['topP'] === 'number' ? (input['topP'] as number) : undefined
  const maxTokens = typeof input['maxTokens'] === 'number' ? (input['maxTokens'] as number) : undefined
  const streamOutput = typeof input['streamOutput'] === 'boolean' ? (input['streamOutput'] as boolean) : true

  function num(v: unknown, d: number, min?: number, max?: number): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) return d
    if (min !== undefined && v < min) return min
    if (max !== undefined && v > max) return max
    return v
  }
  function str(v: unknown, d: string): string {
    return typeof v === 'string' ? v : d
  }
  function safeId(v: unknown, prefix: string): string {
    const s = typeof v === 'string' ? v.trim() : ''
    if (s) return s
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }

  const contextMessageSize = Math.round(num(input['contextMessageSize'], 64, 0, 512))
  const limitContextMessages = typeof input['limitContextMessages'] === 'boolean' ? (input['limitContextMessages'] as boolean) : true
  const maxToolLoopIterations = Math.round(num(input['maxToolLoopIterations'], 10, 0, 100))
  const mcpServerIds = Array.isArray(input['mcpServerIds'])
    ? (input['mcpServerIds'].filter((x) => typeof x === 'string') as string[])
    : []
  const background = typeof input['background'] === 'string' ? (input['background'] as string) : null

  const customHeaders: AssistantCustomHeader[] = Array.isArray(input['customHeaders'])
    ? (input['customHeaders']
      .filter((x) => isRecord(x))
      .map((x) => ({
        name: str((x as any)['name'], str((x as any)['key'], '')),
        value: str((x as any)['value'], '')
      }))
      .filter((x) => x.name || x.value))
    : []

  const customBody: AssistantCustomBodyParam[] = Array.isArray(input['customBody'])
    ? (input['customBody']
      .filter((x) => isRecord(x))
      .map((x) => ({
        key: str((x as any)['key'], str((x as any)['name'], '')),
        value: str((x as any)['value'], '')
      }))
      .filter((x) => x.key || x.value))
    : []

  const enableMemory = typeof input['enableMemory'] === 'boolean' ? (input['enableMemory'] as boolean) : false
  const enableRecentChatsReference = typeof input['enableRecentChatsReference'] === 'boolean'
    ? (input['enableRecentChatsReference'] as boolean)
    : false

  const presetMessages: AssistantPresetMessage[] = Array.isArray(input['presetMessages'])
    ? (input['presetMessages']
      .filter((x) => isRecord(x))
      .map((x) => {
        const roleRaw = (x as any)['role']
        const role: AssistantPresetRole = roleRaw === 'assistant' ? 'assistant' : 'user'
        return {
          id: safeId((x as any)['id'], 'preset'),
          role,
          content: str((x as any)['content'], '')
        }
      })
      .filter((x) => x.content.trim()))
    : []

  const regexRules: AssistantRegexRule[] = Array.isArray(input['regexRules'])
    ? (input['regexRules']
      .filter((x) => isRecord(x))
      .map((x) => {
        const scopesRaw = (x as any)['scopes']
        const scopes: AssistantRegexScope[] = Array.isArray(scopesRaw)
          ? (scopesRaw.filter((s) => s === 'user' || s === 'assistant') as AssistantRegexScope[])
          : typeof scopesRaw === 'string' && (scopesRaw === 'user' || scopesRaw === 'assistant')
            ? ([scopesRaw] as AssistantRegexScope[])
            : ([] as AssistantRegexScope[])
        return {
          id: safeId((x as any)['id'], 'regex'),
          name: str((x as any)['name'], ''),
          pattern: str((x as any)['pattern'], ''),
          replacement: str((x as any)['replacement'], ''),
          scopes,
          visualOnly: typeof (x as any)['visualOnly'] === 'boolean' ? (x as any)['visualOnly'] : false,
          enabled: typeof (x as any)['enabled'] === 'boolean' ? (x as any)['enabled'] : true,
        }
      })
      .filter((x) => x.pattern.trim()))
    : []

  const createdAt = typeof input['createdAt'] === 'string' ? (input['createdAt'] as string) : nowIso()
  const updatedAt = typeof input['updatedAt'] === 'string' ? (input['updatedAt'] as string) : nowIso()

  return {
    id,
    name,
    avatar,
    avatarType,
    useAssistantAvatar,
    systemPrompt,
    messageTemplate,
    isDefault,
    deletable,
    boundModelProvider,
    boundModelId,
    temperature,
    topP,
    maxTokens,
    streamOutput,
    contextMessageSize,
    limitContextMessages,
    maxToolLoopIterations,
    mcpServerIds,
    background,
    customHeaders,
    customBody,
    enableMemory,
    enableRecentChatsReference,
    presetMessages,
    regexRules,
    createdAt,
    updatedAt
  }
}

function normalizeUi(input: unknown, fallback: UiStateV2): UiStateV2 {
  if (!isRecord(input)) return fallback
  const desk = input['desktop']
  if (!isRecord(desk)) return fallback
  const selected = desk['selectedSettingsMenu']
  const selectedSettingsMenu: SettingsMenuKey =
    typeof selected === 'string' && isSettingsMenuKey(selected) ? (selected as SettingsMenuKey) : fallback.desktop.selectedSettingsMenu
  const topicPos = desk['topicPosition']
  const topicPosition: DesktopTopicPosition =
    topicPos === 'left' || topicPos === 'right' ? (topicPos as DesktopTopicPosition) : fallback.desktop.topicPosition

  function num(v: unknown, d: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : d
  }
  function bool(v: unknown, d: boolean): boolean {
    return typeof v === 'boolean' ? v : d
  }

  return {
    desktop: {
      sidebarWidth: num(desk['sidebarWidth'], fallback.desktop.sidebarWidth),
      sidebarOpen: bool(desk['sidebarOpen'], fallback.desktop.sidebarOpen),
      rightSidebarWidth: num(desk['rightSidebarWidth'], fallback.desktop.rightSidebarWidth),
      rightSidebarOpen: bool(desk['rightSidebarOpen'], fallback.desktop.rightSidebarOpen),
      settingsSidebarWidth: num(desk['settingsSidebarWidth'], fallback.desktop.settingsSidebarWidth),
      selectedSettingsMenu,
      topicPosition
    }
  }
}

function normalizeDisplaySettings(input: unknown, fallback: DisplaySettings): DisplaySettings {
  if (!isRecord(input)) return fallback

  function num(v: unknown, d: number, min?: number, max?: number): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) return d
    if (min !== undefined && v < min) return min
    if (max !== undefined && v > max) return max
    return v
  }
  function bool(v: unknown, d: boolean): boolean {
    return typeof v === 'boolean' ? v : d
  }
  function str(v: unknown, d: string): string {
    return typeof v === 'string' ? v : d
  }

  const themePalette = (['blue', 'purple', 'green', 'orange', 'pink', 'teal', 'red', 'yellow'] as const).includes(input['themePalette'] as any)
    ? (input['themePalette'] as ThemePalette)
    : fallback.themePalette

  const chatMessageBackgroundStyle = (['default', 'frosted', 'solid'] as const).includes(input['chatMessageBackgroundStyle'] as any)
    ? (input['chatMessageBackgroundStyle'] as ChatMessageBackgroundStyle)
    : fallback.chatMessageBackgroundStyle

  const topicPosition = input['topicPosition'] === 'left' || input['topicPosition'] === 'right'
    ? (input['topicPosition'] as TopicPosition)
    : fallback.topicPosition

  const desktopContentWidth = input['desktopContentWidth'] === 'narrow' || input['desktopContentWidth'] === 'wide'
    ? (input['desktopContentWidth'] as 'narrow' | 'wide')
    : fallback.desktopContentWidth



  const language = (['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR', 'ru-RU', 'system'] as const).includes(input['language'] as any)
    ? (input['language'] as AppLanguage)
    : fallback.language

  return {
    language,
    themePalette,
    usePureBackground: bool(input['usePureBackground'], fallback.usePureBackground),
    chatMessageBackgroundStyle,
    chatBubbleOpacity: num(input['chatBubbleOpacity'], fallback.chatBubbleOpacity, 0, 100),
    topicPosition,
    desktopContentWidth,
    desktopNarrowWidth: num(input['desktopNarrowWidth'], fallback.desktopNarrowWidth, 400, 1200),
    appFontFamily: str(input['appFontFamily'], fallback.appFontFamily),
    codeFontFamily: str(input['codeFontFamily'], fallback.codeFontFamily),
    globalFontScale: num(input['globalFontScale'], fallback.globalFontScale, 0.8, 1.5),
    chatFontSize: num(input['chatFontSize'], fallback.chatFontSize, 12, 24),
    showUserAvatar: bool(input['showUserAvatar'], fallback.showUserAvatar),
    showUserNameTimestamp: bool(input['showUserNameTimestamp'], fallback.showUserNameTimestamp),
    showUserMessageActions: bool(input['showUserMessageActions'], fallback.showUserMessageActions),
    showModelIcon: bool(input['showModelIcon'], fallback.showModelIcon),
    showModelNameTimestamp: bool(input['showModelNameTimestamp'], fallback.showModelNameTimestamp),
    showTokenStats: bool(input['showTokenStats'], fallback.showTokenStats),
    showStickerToolUI: bool(input['showStickerToolUI'], fallback.showStickerToolUI),
    enableDollarLatex: bool(input['enableDollarLatex'], fallback.enableDollarLatex),
    enableMathRendering: bool(input['enableMathRendering'], fallback.enableMathRendering),
    enableUserMarkdown: bool(input['enableUserMarkdown'], fallback.enableUserMarkdown),
    enableReasoningMarkdown: bool(input['enableReasoningMarkdown'], fallback.enableReasoningMarkdown),
    autoCollapseThinking: bool(input['autoCollapseThinking'], fallback.autoCollapseThinking),
    showAppUpdates: bool(input['showAppUpdates'], fallback.showAppUpdates),
    showMessageNav: bool(input['showMessageNav'], fallback.showMessageNav),
    showChatListDate: bool(input['showChatListDate'], fallback.showChatListDate),
    newChatOnLaunch: bool(input['newChatOnLaunch'], fallback.newChatOnLaunch),
    closeToTray: bool(input['closeToTray'], fallback.closeToTray),
    autoScrollIdleSeconds: num(input['autoScrollIdleSeconds'], fallback.autoScrollIdleSeconds, 2, 64),
    disableAutoScroll: bool(input['disableAutoScroll'], fallback.disableAutoScroll),
    chatBackgroundMaskStrength: num(input['chatBackgroundMaskStrength'], fallback.chatBackgroundMaskStrength, 0, 200),

  }
}

function isSettingsMenuKey(v: string): v is SettingsMenuKey {
  return (
    v === 'display' ||
    v === 'assistant' ||
    v === 'providers' ||
    v === 'defaultModel' ||
    v === 'search' ||
    v === 'mcp' ||
    v === 'quickPhrases' ||
    v === 'tts' ||
    v === 'networkProxy' ||
    v === 'backup' ||
    v === 'dependencies' ||
    v === 'data' ||
    v === 'about'
  )
}

function normalizeProviderConfig(key: string, input: unknown): ProviderConfigV2 | null {
  const def = createDefaultProviderConfig(key)
  if (!isRecord(input)) return def

  const id = typeof input['id'] === 'string' && input['id'].trim() ? (input['id'] as string) : def.id
  const enabled = typeof input['enabled'] === 'boolean' ? (input['enabled'] as boolean) : def.enabled
  const name = typeof input['name'] === 'string' && input['name'].trim() ? (input['name'] as string) : def.name
  const apiKey = typeof input['apiKey'] === 'string' ? (input['apiKey'] as string) : def.apiKey
  const baseUrl = typeof input['baseUrl'] === 'string' && input['baseUrl'].trim() ? (input['baseUrl'] as string) : def.baseUrl
  const providerType: ProviderKind | undefined = (() => {
    const t = input['providerType']
    if (t === 'openai' || t === 'claude' || t === 'google') return t
    // 兼容旧数据：尝试从 baseUrl 推断
    return classifyProviderKindByUrl(baseUrl)
  })()

  return {
    ...def,
    id,
    enabled,
    name,
    apiKey,
    baseUrl,
    providerType,
    chatPath: typeof input['chatPath'] === 'string' ? (input['chatPath'] as string) : def.chatPath,
    useResponseApi: typeof input['useResponseApi'] === 'boolean' ? (input['useResponseApi'] as boolean) : def.useResponseApi,
    vertexAI: typeof input['vertexAI'] === 'boolean' ? (input['vertexAI'] as boolean) : def.vertexAI,
    location: typeof input['location'] === 'string' ? (input['location'] as string) : def.location,
    projectId: typeof input['projectId'] === 'string' ? (input['projectId'] as string) : def.projectId,
    serviceAccountJson: typeof input['serviceAccountJson'] === 'string' ? (input['serviceAccountJson'] as string) : def.serviceAccountJson,
    models: Array.isArray(input['models']) ? (input['models'].filter((x) => typeof x === 'string') as string[]) : def.models,
    modelOverrides: isRecord(input['modelOverrides']) ? (input['modelOverrides'] as Record<string, any>) : def.modelOverrides,
    proxyEnabled: typeof input['proxyEnabled'] === 'boolean' ? (input['proxyEnabled'] as boolean) : def.proxyEnabled,
    proxyHost: typeof input['proxyHost'] === 'string' ? (input['proxyHost'] as string) : def.proxyHost,
    proxyPort: typeof input['proxyPort'] === 'string' ? (input['proxyPort'] as string) : def.proxyPort,
    proxyUsername: typeof input['proxyUsername'] === 'string' ? (input['proxyUsername'] as string) : def.proxyUsername,
    proxyPassword: typeof input['proxyPassword'] === 'string' ? (input['proxyPassword'] as string) : def.proxyPassword,
    multiKeyEnabled: typeof input['multiKeyEnabled'] === 'boolean' ? (input['multiKeyEnabled'] as boolean) : def.multiKeyEnabled,
    apiKeys: Array.isArray(input['apiKeys']) ? (input['apiKeys'] as ApiKeyConfig[]) : def.apiKeys,
    keyManagement: isRecord(input['keyManagement'])
      ? ({ ...defaultKeyManagement(), ...(input['keyManagement'] as any) } as KeyManagementConfig)
      : def.keyManagement,
    allowInsecureConnection:
      typeof input['allowInsecureConnection'] === 'boolean' ? (input['allowInsecureConnection'] as boolean) : def.allowInsecureConnection,
    customAvatarPath: typeof input['customAvatarPath'] === 'string' ? (input['customAvatarPath'] as string) : def.customAvatarPath,
    createdAt: typeof input['createdAt'] === 'string' ? (input['createdAt'] as string) : def.createdAt,
    updatedAt: typeof input['updatedAt'] === 'string' ? (input['updatedAt'] as string) : def.updatedAt
  }
}

function normalizeSearchConfig(input: unknown): SearchConfig {
  const def = createDefaultSearchConfig()
  if (!isRecord(input)) return def

  // 全局配置
  const globalRaw = input['global']
  const global: SearchGlobalConfig = isRecord(globalRaw)
    ? {
      enabled: typeof globalRaw['enabled'] === 'boolean' ? globalRaw['enabled'] : def.global.enabled,
      defaultServiceId: typeof globalRaw['defaultServiceId'] === 'string' ? globalRaw['defaultServiceId'] : def.global.defaultServiceId,
      maxResults: typeof globalRaw['maxResults'] === 'number' ? Math.min(20, Math.max(1, Math.round(globalRaw['maxResults']))) : def.global.maxResults,
      timeout: typeof globalRaw['timeout'] === 'number' ? Math.min(60, Math.max(5, Math.round(globalRaw['timeout']))) : def.global.timeout
    }
    : def.global

  // 服务列表
  const servicesRaw = input['services']
  const services: SearchServiceConfig[] = Array.isArray(servicesRaw)
    ? servicesRaw
      .filter((x) => isRecord(x))
      .map((x) => {
        const type = ['tavily', 'exa', 'brave', 'duckduckgo', 'serper', 'bing', 'searxng', 'custom'].includes(String(x['type']))
          ? (x['type'] as SearchServiceType)
          : 'custom'
        const strategy = ['roundRobin', 'priority', 'leastUsed', 'random'].includes(String(x['strategy']))
          ? (x['strategy'] as SearchLoadBalanceStrategy)
          : 'roundRobin'
        const connectionStatus = ['untested', 'testing', 'connected', 'failed', 'rateLimited'].includes(String(x['connectionStatus']))
          ? (x['connectionStatus'] as SearchConnectionStatus)
          : 'untested'

        const apiKeysRaw = x['apiKeys']
        const apiKeys: SearchApiKeyConfig[] = Array.isArray(apiKeysRaw)
          ? apiKeysRaw
            .filter((k) => isRecord(k) && typeof k['key'] === 'string' && k['key'].trim())
            .map((k) => ({
              id: typeof k['id'] === 'string' ? k['id'] : `key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              key: String(k['key']),
              name: typeof k['name'] === 'string' ? k['name'] : undefined,
              isEnabled: typeof k['isEnabled'] === 'boolean' ? k['isEnabled'] : true,
              priority: typeof k['priority'] === 'number' ? Math.min(10, Math.max(1, Math.round(k['priority']))) : 5,
              sortIndex: typeof k['sortIndex'] === 'number' ? k['sortIndex'] : Date.now(),
              maxRequestsPerMinute: typeof k['maxRequestsPerMinute'] === 'number' ? k['maxRequestsPerMinute'] : undefined,
              createdAt: typeof k['createdAt'] === 'number' ? k['createdAt'] : Date.now(),
              status: ['active', 'error', 'rateLimited', 'disabled'].includes(String(k['status'])) ? (k['status'] as SearchKeyStatus) : 'active',
              totalRequests: typeof k['totalRequests'] === 'number' ? k['totalRequests'] : 0,
              lastError: typeof k['lastError'] === 'string' ? k['lastError'] : undefined
            }))
          : []

        return {
          id: typeof x['id'] === 'string' ? x['id'] : `service_${Date.now()}`,
          name: typeof x['name'] === 'string' ? x['name'] : type,
          type,
          enabled: typeof x['enabled'] === 'boolean' ? x['enabled'] : false,
          baseUrl: typeof x['baseUrl'] === 'string' ? x['baseUrl'] : undefined,
          apiKeys,
          strategy,
          connectionStatus,
          lastError: typeof x['lastError'] === 'string' ? x['lastError'] : undefined,
          serviceConfig: isRecord(x['serviceConfig']) ? (x['serviceConfig'] as Record<string, unknown>) : undefined
        }
      })
    : def.services

  // 确保 DuckDuckGo 总是存在
  if (!services.some((s) => s.type === 'duckduckgo')) {
    services.push(def.services[0])
  }

  return { global, services }
}

function normalizeBackupConfig(input: unknown): BackupConfig {
  const def = createDefaultBackupConfig()
  if (!isRecord(input)) return def

  const webdavConfigsRaw = input['webdavConfigs']
  const webdavConfigs: WebDavConfig[] = Array.isArray(webdavConfigsRaw)
    ? webdavConfigsRaw
      .filter((x) => isRecord(x))
      .map((x) => {
        const id = typeof x['id'] === 'string' && x['id'].trim() ? x['id'] : `webdav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        return {
          id,
          name: typeof x['name'] === 'string' ? x['name'] : '默认配置',
          url: typeof x['url'] === 'string' ? x['url'] : '',
          username: typeof x['username'] === 'string' ? x['username'] : '',
          password: typeof x['password'] === 'string' ? x['password'] : '',
          path: typeof x['path'] === 'string' ? x['path'] : 'kelivo_backups',
          includeChats: typeof x['includeChats'] === 'boolean' ? x['includeChats'] : true,
          includeFiles: typeof x['includeFiles'] === 'boolean' ? x['includeFiles'] : true,
          createdAt: typeof x['createdAt'] === 'string' ? x['createdAt'] : new Date().toISOString(),
          updatedAt: typeof x['updatedAt'] === 'string' ? x['updatedAt'] : new Date().toISOString()
        }
      })
    : def.webdavConfigs

  const currentWebdavConfigId = typeof input['currentWebdavConfigId'] === 'string' ? input['currentWebdavConfigId'] : null

  return {
    webdavConfigs,
    currentWebdavConfigId
  }
}

function migrateV1ToV2(v1: AppConfigV1): AppConfigV2 {
  const def = createDefaultConfig()
  const providerConfigs: Record<string, ProviderConfigV2> = { ...def.providerConfigs }
  const order: string[] = [...def.providersOrder]

  const list = Array.isArray(v1.providers) ? v1.providers : []
  for (const p of list) {
    if (!p || typeof p !== 'object') continue
    const id = typeof p.id === 'string' && p.id.trim() ? p.id : null
    if (!id) continue
    providerConfigs[id] = {
      ...createDefaultProviderConfig(id, typeof p.name === 'string' ? p.name : id),
      apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
      baseUrl: typeof p.baseUrl === 'string' ? p.baseUrl : '',
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : nowIso(),
      updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : nowIso()
    }
    if (!order.includes(id)) order.push(id)
  }

  return {
    ...def,
    providerConfigs,
    providersOrder: order,
    currentModelProvider: typeof v1.defaultProviderId === 'string' ? v1.defaultProviderId : null,
    currentModelId: null
  }
}

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
  includeFiles: boolean
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

export function createDefaultWebDavConfig(id: string, name?: string): WebDavConfig {
  const now = nowIso()
  return {
    id,
    name: name ?? '默认配置',
    url: '',
    username: '',
    password: '',
    path: 'kelivo_backups',
    includeChats: true,
    includeFiles: true,
    createdAt: now,
    updatedAt: now
  }
}

export function createDefaultBackupConfig(): BackupConfig {
  return {
    webdavConfigs: [],
    currentWebdavConfigId: null
  }
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
