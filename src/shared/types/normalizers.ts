import { normalizeImageStudioConfig } from '../imageStudio'
import type { ImageStudioConfig } from '../imageStudio'
import type {
  AgentConfig,
  AgentRuntimeConfig,
  AgentSdkProvider,
  ApiKeyConfig,
  ApiTestConfig,
  AppConfigV1,
  AppConfigV2,
  AssistantConfig,
  AssistantCustomBodyParam,
  AssistantCustomHeader,
  AssistantMemory,
  AssistantPresetMessage,
  AssistantPresetRole,
  AssistantRegexRule,
  AssistantRegexScope,
  BackupConfig,
  ChatMessageBackgroundStyle,
  ClaudePermissionMode,
  CodexApprovalPolicy,
  CodexSandboxMode,
  DesktopTopicPosition,
  DisplaySettings,
  KeyManagementConfig,
  McpServerConfig,
  McpToolCallMode,
  McpToolConfig,
  McpTransportType,
  ProviderConfigV2,
  ProviderKind,
  QuickPhrase,
  SearchApiKeyConfig,
  SearchConfig,
  SearchConnectionStatus,
  SearchGlobalConfig,
  SearchKeyStatus,
  SearchLoadBalanceStrategy,
  SearchServiceConfig,
  SearchServiceType,
  SettingsMenuKey,
  ThemeMode,
  ThemePalette,
  TopicPosition,
  UiStateV2,
  UserAvatarType,
  UserConfig,
  WebDavConfig,
  AppLanguage
} from './definitions'
import {
  cfgBool,
  cfgNum,
  cfgStr,
  cfgSafeId,
  classifyProviderKindByUrl,
  defaultKeyManagement,
  isRecord,
  isSettingsMenuKey,
  isThemeMode,
  nowIso
} from './helpers'
import {
  createDefaultBackupConfig,
  createDefaultConfig,
  createDefaultProviderConfig,
  createDefaultSearchConfig
} from './defaults'

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

  // 快捷短语（全局 + 助手专属）
  const quickPhrases: QuickPhrase[] = Array.isArray(cfg['quickPhrases'])
    ? (cfg['quickPhrases']
      .filter((x): x is Record<string, unknown> => isRecord(x))
      .map((x) => {
        const isGlobal = typeof x['isGlobal'] === 'boolean'
          ? (x['isGlobal'] as boolean)
          : !x['assistantId']
        const assistantIdRaw = x['assistantId']
        const assistantId = isGlobal ? null : (typeof assistantIdRaw === 'string' && assistantIdRaw.trim() ? assistantIdRaw : null)
        return {
          id: cfgSafeId(x['id'], 'phrase'),
          title: cfgStr(x['title'], ''),
          content: cfgStr(x['content'], ''),
          isGlobal,
          assistantId
        }
      }))
    : def.quickPhrases

  // 助手记忆
  const assistantMemories: AssistantMemory[] = Array.isArray(cfg['assistantMemories'])
    ? (cfg['assistantMemories']
      .filter((x): x is Record<string, unknown> => isRecord(x))
      .map((x) => {
        const rawId = x['id']
        const id = typeof rawId === 'number'
          ? Math.round(rawId)
          : typeof rawId === 'string' && rawId.trim() && Number.isFinite(Number(rawId))
            ? Math.round(Number(rawId))
            : -1
        const assistantId = cfgStr(x['assistantId'], '').trim()
        const content = cfgStr(x['content'], '').trim()
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
      ? Object.entries(raw).map(([id, value]) => (isRecord(value) ? { ...value, id } : { id }))
      : null

    const items = (listFromArray ?? listFromMap ?? []) as unknown[]
    if (!items.length) return def.mcpServers

    return items
      .filter((x): x is Record<string, unknown> => isRecord(x))
      .map((x) => {
        const transport = normalizeMcpTransport(x['transport'] ?? x['type'])

        const enabled =
          typeof x['enabled'] === 'boolean'
            ? (x['enabled'] as boolean)
            : typeof x['isActive'] === 'boolean'
              ? (x['isActive'] as boolean)
              : true

        const url = cfgStr(x['url'] ?? x['baseUrl'], '').trim()

        // headers：对齐 Flutter；兼容旧字段 env
        const headers = normalizeStringMap(x['headers'] ?? x['env'])

        const tools: McpToolConfig[] = Array.isArray(x['tools'])
          ? ((x['tools'] as unknown[])
            .filter((t): t is Record<string, unknown> => isRecord(t))
            .map((t) => {
              const name = cfgStr(t['name'], '').trim()
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

        const createdAt = typeof x['createdAt'] === 'string' ? (x['createdAt'] as string) : nowIso()
        const updatedAt = typeof x['updatedAt'] === 'string' ? (x['updatedAt'] as string) : nowIso()

        return {
          id: cfgSafeId(x['id'], 'mcp'),
          name: cfgStr(x['name'], '').trim() || 'MCP',
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
    translatePrompt: typeof cfg['translatePrompt'] === 'string' ? (cfg['translatePrompt'] as string) : def.translatePrompt,
    titleModelProvider:
      typeof cfg['titleModelProvider'] === 'string' ? (cfg['titleModelProvider'] as string) : null,
    titleModelId: typeof cfg['titleModelId'] === 'string' ? (cfg['titleModelId'] as string) : null,
    titlePrompt: typeof cfg['titlePrompt'] === 'string' ? (cfg['titlePrompt'] as string) : def.titlePrompt,
    summaryModelProvider:
      typeof cfg['summaryModelProvider'] === 'string' ? (cfg['summaryModelProvider'] as string) : null,
    summaryModelId: typeof cfg['summaryModelId'] === 'string' ? (cfg['summaryModelId'] as string) : null,
    summaryPrompt: typeof cfg['summaryPrompt'] === 'string' ? (cfg['summaryPrompt'] as string) : def.summaryPrompt,
    ocrModelProvider: typeof cfg['ocrModelProvider'] === 'string' ? (cfg['ocrModelProvider'] as string) : null,
    ocrModelId: typeof cfg['ocrModelId'] === 'string' ? (cfg['ocrModelId'] as string) : null,
    ocrEnabled: typeof cfg['ocrEnabled'] === 'boolean' ? (cfg['ocrEnabled'] as boolean) : false,
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
    proxyBypass: typeof cfg['proxyBypass'] === 'string' ? (cfg['proxyBypass'] as string) : def.proxyBypass,
    searchConfig,
    backupConfig,
    imageStudio,
    apiTestConfigs: Array.isArray(cfg['apiTestConfigs']) ? (cfg['apiTestConfigs'] as ApiTestConfig[]) : def.apiTestConfigs,
    apiTestActiveConfigId: typeof cfg['apiTestActiveConfigId'] === 'string' ? (cfg['apiTestActiveConfigId'] as string) : def.apiTestActiveConfigId,
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

    // 兜底：尽量选一个"合理的默认"
    if (sdk === 'claude' && providerConfigs['claude']) return 'claude'
    if (sdk === 'codex' && providerConfigs['openai']) return 'openai'
    return null
  }

  const mapRaw = isRecord(raw['lastApiProviderIdBySdk']) ? (raw['lastApiProviderIdBySdk'] as Record<string, unknown>) : {} as Record<string, unknown>
  const lastApiProviderIdBySdk: Record<AgentSdkProvider, string | null> = {
    claude: normalizeProviderIdForSdk('claude', mapRaw['claude'] ?? def.lastApiProviderIdBySdk.claude),
    codex: normalizeProviderIdForSdk('codex', mapRaw['codex'] ?? def.lastApiProviderIdBySdk.codex),
  }

  const modelRaw = isRecord(raw['lastModelIdBySdk']) ? (raw['lastModelIdBySdk'] as Record<string, unknown>) : {} as Record<string, unknown>
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

export function normalizeAssistantConfig(id: string, input: unknown): AssistantConfig | null {
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

  const contextMessageSize = Math.round(cfgNum(input['contextMessageSize'], 64, 0, 512))
  const limitContextMessages = typeof input['limitContextMessages'] === 'boolean' ? (input['limitContextMessages'] as boolean) : true
  const maxToolLoopIterations = Math.round(cfgNum(input['maxToolLoopIterations'], 10, 0, 100))
  const mcpServerIds = Array.isArray(input['mcpServerIds'])
    ? (input['mcpServerIds'].filter((x) => typeof x === 'string') as string[])
    : []
  const background = typeof input['background'] === 'string' ? (input['background'] as string) : null

  const customHeaders: AssistantCustomHeader[] = Array.isArray(input['customHeaders'])
    ? (input['customHeaders']
      .filter((x): x is Record<string, unknown> => isRecord(x))
      .map((x) => ({
        name: cfgStr(x['name'], cfgStr(x['key'], '')),
        value: cfgStr(x['value'], '')
      }))
      .filter((x) => x.name || x.value))
    : []

  const customBody: AssistantCustomBodyParam[] = Array.isArray(input['customBody'])
    ? (input['customBody']
      .filter((x): x is Record<string, unknown> => isRecord(x))
      .map((x) => ({
        key: cfgStr(x['key'], cfgStr(x['name'], '')),
        value: cfgStr(x['value'], '')
      }))
      .filter((x) => x.key || x.value))
    : []

  const enableMemory = typeof input['enableMemory'] === 'boolean' ? (input['enableMemory'] as boolean) : false
  const enableRecentChatsReference = typeof input['enableRecentChatsReference'] === 'boolean'
    ? (input['enableRecentChatsReference'] as boolean)
    : false

  const presetMessages: AssistantPresetMessage[] = Array.isArray(input['presetMessages'])
    ? (input['presetMessages']
      .filter((x): x is Record<string, unknown> => isRecord(x))
      .map((x) => {
        const roleRaw = x['role']
        const role: AssistantPresetRole = roleRaw === 'assistant' ? 'assistant' : 'user'
        return {
          id: cfgSafeId(x['id'], 'preset'),
          role,
          content: cfgStr(x['content'], '')
        }
      })
      .filter((x) => x.content.trim()))
    : []

  const regexRules: AssistantRegexRule[] = Array.isArray(input['regexRules'])
    ? (input['regexRules']
      .filter((x): x is Record<string, unknown> => isRecord(x))
      .map((x) => {
        const scopesRaw = x['scopes']
        const scopes: AssistantRegexScope[] = Array.isArray(scopesRaw)
          ? scopesRaw.filter((s): s is AssistantRegexScope => s === 'user' || s === 'assistant')
          : typeof scopesRaw === 'string' && (scopesRaw === 'user' || scopesRaw === 'assistant')
            ? ([scopesRaw] as AssistantRegexScope[])
            : ([] as AssistantRegexScope[])

        const visualOnly = typeof x['visualOnly'] === 'boolean' ? x['visualOnly'] : false
        const replaceOnlyRaw = typeof x['replaceOnly'] === 'boolean' ? x['replaceOnly'] : false

        return {
          id: cfgSafeId(x['id'], 'regex'),
          name: cfgStr(x['name'], ''),
          pattern: cfgStr(x['pattern'], ''),
          replacement: cfgStr(x['replacement'], ''),
          scopes,
          visualOnly,
          replaceOnly: visualOnly && replaceOnlyRaw ? false : replaceOnlyRaw,
          enabled: typeof x['enabled'] === 'boolean' ? x['enabled'] : true,
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

  return {
    desktop: {
      sidebarWidth: cfgNum(desk['sidebarWidth'], fallback.desktop.sidebarWidth),
      sidebarOpen: cfgBool(desk['sidebarOpen'], fallback.desktop.sidebarOpen),
      rightSidebarWidth: cfgNum(desk['rightSidebarWidth'], fallback.desktop.rightSidebarWidth),
      rightSidebarOpen: cfgBool(desk['rightSidebarOpen'], fallback.desktop.rightSidebarOpen),
      settingsSidebarWidth: cfgNum(desk['settingsSidebarWidth'], fallback.desktop.settingsSidebarWidth),
      selectedSettingsMenu,
      topicPosition
    }
  }
}

function normalizeDisplaySettings(input: unknown, fallback: DisplaySettings): DisplaySettings {
  if (!isRecord(input)) return fallback

  const themePaletteValues: readonly string[] = ['default', 'blue', 'purple', 'green', 'orange', 'pink', 'teal', 'red', 'yellow']
  const themePalette = typeof input['themePalette'] === 'string' && themePaletteValues.includes(input['themePalette'])
    ? (input['themePalette'] as ThemePalette)
    : fallback.themePalette

  const bgStyleValues: readonly string[] = ['default', 'frosted', 'solid']
  const chatMessageBackgroundStyle = typeof input['chatMessageBackgroundStyle'] === 'string' && bgStyleValues.includes(input['chatMessageBackgroundStyle'])
    ? (input['chatMessageBackgroundStyle'] as ChatMessageBackgroundStyle)
    : fallback.chatMessageBackgroundStyle

  const topicPosition = input['topicPosition'] === 'left' || input['topicPosition'] === 'right'
    ? (input['topicPosition'] as TopicPosition)
    : fallback.topicPosition

  const desktopContentWidth = input['desktopContentWidth'] === 'narrow' || input['desktopContentWidth'] === 'wide'
    ? (input['desktopContentWidth'] as 'narrow' | 'wide')
    : fallback.desktopContentWidth



  const langValues: readonly string[] = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR', 'ru-RU', 'system']
  const language = typeof input['language'] === 'string' && langValues.includes(input['language'])
    ? (input['language'] as AppLanguage)
    : fallback.language

  return {
    language,
    themePalette,
    usePureBackground: cfgBool(input['usePureBackground'], fallback.usePureBackground),
    chatMessageBackgroundStyle,
    chatBubbleOpacity: cfgNum(input['chatBubbleOpacity'], fallback.chatBubbleOpacity, 0, 100),
    topicPosition,
    desktopContentWidth,
    desktopNarrowWidth: cfgNum(input['desktopNarrowWidth'], fallback.desktopNarrowWidth, 400, 1200),
    appFontFamily: cfgStr(input['appFontFamily'], fallback.appFontFamily),
    codeFontFamily: cfgStr(input['codeFontFamily'], fallback.codeFontFamily),
    uiFontSize: cfgNum(input['uiFontSize'], fallback.uiFontSize, 12, 20),
    globalFontScale: cfgNum(input['globalFontScale'], fallback.globalFontScale, 0.8, 1.5),
    chatFontSize: cfgNum(input['chatFontSize'], fallback.chatFontSize, 12, 24),
    hideAllAvatars: cfgBool(input['hideAllAvatars'], fallback.hideAllAvatars),
    showUserAvatar: cfgBool(input['showUserAvatar'], fallback.showUserAvatar),
    showUserNameTimestamp: cfgBool(input['showUserNameTimestamp'], fallback.showUserNameTimestamp),
    showUserMessageActions: cfgBool(input['showUserMessageActions'], fallback.showUserMessageActions),
    showModelIcon: cfgBool(input['showModelIcon'], fallback.showModelIcon),
    showModelNameTimestamp: cfgBool(input['showModelNameTimestamp'], fallback.showModelNameTimestamp),
    showTokenStats: cfgBool(input['showTokenStats'], fallback.showTokenStats),
    showStickerToolUI: cfgBool(input['showStickerToolUI'], fallback.showStickerToolUI),
    enableDollarLatex: cfgBool(input['enableDollarLatex'], fallback.enableDollarLatex),
    enableMathRendering: cfgBool(input['enableMathRendering'], fallback.enableMathRendering),
    enableUserMarkdown: cfgBool(input['enableUserMarkdown'], fallback.enableUserMarkdown),
    enableReasoningMarkdown: cfgBool(input['enableReasoningMarkdown'], fallback.enableReasoningMarkdown),
    autoCollapseThinking: cfgBool(input['autoCollapseThinking'], fallback.autoCollapseThinking),
    showAppUpdates: cfgBool(input['showAppUpdates'], fallback.showAppUpdates),
    showMessageNav: cfgBool(input['showMessageNav'], fallback.showMessageNav),
    showChatListDate: cfgBool(input['showChatListDate'], fallback.showChatListDate),
    newChatOnLaunch: cfgBool(input['newChatOnLaunch'], fallback.newChatOnLaunch),
    closeToTray: cfgBool(input['closeToTray'], fallback.closeToTray),
    autoScrollIdleSeconds: cfgNum(input['autoScrollIdleSeconds'], fallback.autoScrollIdleSeconds, 2, 64),
    disableAutoScroll: cfgBool(input['disableAutoScroll'], fallback.disableAutoScroll),
    chatBackgroundMaskStrength: cfgNum(input['chatBackgroundMaskStrength'], fallback.chatBackgroundMaskStrength, 0, 200),

  }
}

function normalizeProviderConfig(key: string, input: unknown): ProviderConfigV2 | null {
  const def = createDefaultProviderConfig(key)
  if (!isRecord(input)) return def

  const id = typeof input['id'] === 'string' && input['id'].trim() ? (input['id'] as string) : def.id
  const enabled = typeof input['enabled'] === 'boolean' ? (input['enabled'] as boolean) : def.enabled
  const name = typeof input['name'] === 'string' && input['name'].trim() ? (input['name'] as string) : def.name
  const apiKey = typeof input['apiKey'] === 'string' ? (input['apiKey'] as string) : def.apiKey
  const rawBaseUrl = typeof input['baseUrl'] === 'string' && input['baseUrl'].trim() ? (input['baseUrl'] as string) : def.baseUrl
  const providerType: ProviderKind | undefined = (() => {
    const t = input['providerType']
    if (t === 'openai' || t === 'openai_response' || t === 'claude' || t === 'google'
      || t === 'claude_oauth' || t === 'codex_oauth' || t === 'gemini_cli_oauth' || t === 'antigravity_oauth'
      || t === 'kimi_oauth' || t === 'qwen_oauth') return t
    // 兼容旧数据：尝试从 baseUrl 推断
    return classifyProviderKindByUrl(rawBaseUrl)
  })()

  // OAuth 供应商强制使用正确的 base URL（修正旧配置）
  const OAUTH_BASE_URLS: Partial<Record<ProviderKind, string>> = {
    codex_oauth: 'https://chatgpt.com/backend-api/codex',
    kimi_oauth: 'https://api.kimi.com/coding/v1',
    qwen_oauth: 'https://portal.qwen.ai/v1'
  }
  const baseUrl = (providerType && OAUTH_BASE_URLS[providerType]) || rawBaseUrl

  return {
    ...def,
    id,
    enabled,
    name,
    apiKey,
    baseUrl,
    providerType,
    chatPath: typeof input['chatPath'] === 'string' ? (input['chatPath'] as string) : def.chatPath,
    useResponseApi: providerType === 'codex_oauth'
      ? true
      : typeof input['useResponseApi'] === 'boolean'
        ? (input['useResponseApi'] as boolean)
        : providerType === 'openai_response'
          ? true
          : def.useResponseApi,
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
      ? ({ ...defaultKeyManagement(), ...(input['keyManagement'] as Record<string, unknown>) } as KeyManagementConfig)
      : def.keyManagement,
    allowInsecureConnection:
      typeof input['allowInsecureConnection'] === 'boolean' ? (input['allowInsecureConnection'] as boolean) : def.allowInsecureConnection,
    customAvatarPath: typeof input['customAvatarPath'] === 'string' ? (input['customAvatarPath'] as string) : def.customAvatarPath,
    oauthEnabled: typeof input['oauthEnabled'] === 'boolean' ? (input['oauthEnabled'] as boolean) : def.oauthEnabled,
    oauthData: isRecord(input['oauthData']) ? (input['oauthData'] as ProviderConfigV2['oauthData']) : def.oauthData,
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
          includeAttachments: typeof x['includeAttachments'] === 'boolean' ? x['includeAttachments'] : (typeof x['includeFiles'] === 'boolean' ? x['includeFiles'] : true),
          includeGeneratedImages: typeof x['includeGeneratedImages'] === 'boolean' ? x['includeGeneratedImages'] : false,
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
