import { createDefaultImageStudioConfig } from '../imageStudio'
import type {
  AgentConfig,
  AgentRuntimeConfig,
  AssistantConfig,
  BackupConfig,
  DisplaySettings,
  ProviderConfigV2,
  ProviderKind,
  SearchConfig,
  WebDavConfig,
  AppConfigV2
} from './definitions'
import { defaultKeyManagement, inferProviderKindFromName, nowIso } from './helpers'

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
  const kind = inferProviderKindFromName(lower)
  const normalizedKind = kind === 'openai_response' ? 'openai' : kind
  const baseUrl = inferDefaultBaseUrl(lower, normalizedKind)

  return {
    id,
    enabled: true,
    name: name ?? id,
    apiKey: '',
    baseUrl,
    providerType: kind,
    chatPath: normalizedKind === 'openai' ? '/chat/completions' : undefined,
    useResponseApi: kind === 'openai_response',
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
    uiFontSize: 14,
    globalFontScale: 1.0,
    chatFontSize: 14,
    hideAllAvatars: false,
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
    includeAttachments: true,
    includeGeneratedImages: false,
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
    translatePrompt: DEFAULT_TRANSLATE_PROMPT,
    titleModelProvider: null,
    titleModelId: null,
    titlePrompt: DEFAULT_TITLE_PROMPT,
    summaryModelProvider: null,
    summaryModelId: null,
    summaryPrompt: DEFAULT_SUMMARY_PROMPT,
    ocrModelProvider: null,
    ocrModelId: null,
    ocrEnabled: false,
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
    proxyBypass: 'localhost,127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1',
    searchConfig: createDefaultSearchConfig(),
    backupConfig: createDefaultBackupConfig(),
    imageStudio: createDefaultImageStudioConfig(),
    apiTestConfigs: [
      {
        id: 'default',
        name: '默认配置',
        provider: 'openai',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        selectedModel: null
      }
    ],
    apiTestActiveConfigId: 'default',
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
