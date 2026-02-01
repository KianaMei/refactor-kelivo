export type ThemeMode = 'system' | 'light' | 'dark'

export type ThemePalette = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'teal' | 'red' | 'yellow'

export type TopicPosition = 'left' | 'right'

export type ChatMessageBackgroundStyle = 'none' | 'bubble' | 'card'

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
  | 'about'

// ============ 显示设置 ============
export interface DisplaySettings {
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
  providersOrder: string[]
  providerConfigs: Record<string, ProviderConfigV2>
  // Chat 默认模型（等价于旧版 currentModelProvider/currentModelId）
  currentModelProvider: string | null
  currentModelId: string | null
  // Translate 默认模型（等价于旧版 translateModelProvider/translateModelId）
  translateModelProvider: string | null
  translateModelId: string | null
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

export function createDefaultConfig(): AppConfigV2 {
  return {
    version: 2,
    themeMode: 'system',
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
    themePalette: 'blue',
    usePureBackground: false,
    chatMessageBackgroundStyle: 'bubble',
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
    autoScrollIdleSeconds: 3,
    disableAutoScroll: false,
    chatBackgroundMaskStrength: 50
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

  return {
    version: 2,
    themeMode,
    providersOrder: providersOrder.length ? providersOrder : Object.keys(providerConfigs),
    providerConfigs,
    currentModelProvider: typeof cfg['currentModelProvider'] === 'string' ? (cfg['currentModelProvider'] as string) : null,
    currentModelId: typeof cfg['currentModelId'] === 'string' ? (cfg['currentModelId'] as string) : null,
    translateModelProvider:
      typeof cfg['translateModelProvider'] === 'string' ? (cfg['translateModelProvider'] as string) : null,
    translateModelId: typeof cfg['translateModelId'] === 'string' ? (cfg['translateModelId'] as string) : null,
    display,
    ui
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

  const chatMessageBackgroundStyle = (['none', 'bubble', 'card'] as const).includes(input['chatMessageBackgroundStyle'] as any)
    ? (input['chatMessageBackgroundStyle'] as ChatMessageBackgroundStyle)
    : fallback.chatMessageBackgroundStyle

  const topicPosition = input['topicPosition'] === 'left' || input['topicPosition'] === 'right'
    ? (input['topicPosition'] as TopicPosition)
    : fallback.topicPosition

  const desktopContentWidth = input['desktopContentWidth'] === 'narrow' || input['desktopContentWidth'] === 'wide'
    ? (input['desktopContentWidth'] as 'narrow' | 'wide')
    : fallback.desktopContentWidth

  return {
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
    autoScrollIdleSeconds: num(input['autoScrollIdleSeconds'], fallback.autoScrollIdleSeconds, 1, 30),
    disableAutoScroll: bool(input['disableAutoScroll'], fallback.disableAutoScroll),
    chatBackgroundMaskStrength: num(input['chatBackgroundMaskStrength'], fallback.chatBackgroundMaskStrength, 0, 100)
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
