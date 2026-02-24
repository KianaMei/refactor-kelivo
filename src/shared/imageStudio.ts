export type ImageStudioProviderType = 'fal_seedream_edit' | 'openrouter_seedream_placeholder'

export type ImageStudioProviderId = 'fal_seedream' | 'openrouter_seedream'

export type ImageStudioInputType = 'url' | 'localPath'

export type ImageStudioJobStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

export interface FalSeedreamCustomImageSize {
  width: number
  height: number
}

export type FalSeedreamImageSizePreset =
  | 'square_hd'
  | 'square'
  | 'portrait_4_3'
  | 'portrait_16_9'
  | 'landscape_4_3'
  | 'landscape_16_9'
  | 'auto_2K'
  | 'auto_4K'

export type FalSeedreamImageSize = FalSeedreamImageSizePreset | FalSeedreamCustomImageSize

export type FalSeedreamEnhancePromptMode = 'standard' | 'fast'

export interface FalSeedreamEditOptions {
  imageSize?: FalSeedreamImageSize
  numImages?: number
  maxImages?: number
  seed?: number
  syncMode?: boolean
  enableSafetyChecker?: boolean
  enhancePromptMode?: FalSeedreamEnhancePromptMode
}

export interface ImageInputSource {
  id: string
  type: ImageStudioInputType
  value: string
  fileName?: string
  preparedDataUrl?: string
}

export interface ImageStudioProviderConfig {
  id: ImageStudioProviderId
  name: string
  type: ImageStudioProviderType
  enabled: boolean
  apiKey: string
  baseUrl?: string
  description?: string
  placeholderOnly?: boolean
}

export interface ImageStudioUiDefaults {
  prompt: string
  falSeedreamEditOptions: Required<FalSeedreamEditOptions>
}

export interface ImageStudioConfig {
  providers: ImageStudioProviderConfig[]
  defaultProviderId: ImageStudioProviderId
  uiDefaults: ImageStudioUiDefaults
}

export interface ImageStudioSubmitRequest {
  providerId: string
  prompt: string
  inputs: ImageInputSource[]
  falSeedreamEditOptions?: FalSeedreamEditOptions
  /**
   * 可选：由渲染进程临时传入的 Key（仅用于本次请求，不落库、不写日志）。
   * 用于避免“配置保存/读取竞态”导致主进程瞬间读到空 Key。
   */
  apiKey?: string
}

export interface ImageStudioSubmitResult {
  success: boolean
  job?: ImageStudioJob
  error?: string
}

export interface ImageStudioCancelResult {
  success: boolean
  error?: string
}

export interface ImageStudioHistoryListResult {
  success: boolean
  jobs?: ImageStudioJob[]
  error?: string
}

export interface ImageStudioHistoryGetResult {
  success: boolean
  job?: ImageStudioJob | null
  error?: string
}

export interface ImageStudioHistoryDeleteResult {
  success: boolean
  error?: string
}

export interface ImageStudioOutputDeleteRequest {
  outputId: string
  deleteFile?: boolean
}

export interface ImageStudioOutputDeleteResult {
  success: boolean
  job?: ImageStudioJob | null
  error?: string
}

export interface ImageStudioListRequest {
  status?: ImageStudioJobStatus | 'all'
  providerId?: string
  limit?: number
  offset?: number
}

export interface ImageStudioRetryRequest {
  generationId: string
}

export interface ImageStudioDeleteRequest {
  generationId: string
  deleteFiles?: boolean
}

export interface ImageStudioOutput {
  id: string
  generationId: string
  outputIndex: number
  remoteUrl: string | null
  localPath: string | null
  contentType: string | null
  width: number | null
  height: number | null
  fileSize: number | null
  createdAt: number
}

export interface ImageStudioJob {
  id: string
  providerId: string
  providerType: ImageStudioProviderType
  status: ImageStudioJobStatus
  prompt: string
  inputSources: ImageInputSource[]
  requestOptions: FalSeedreamEditOptions
  queueRequestId: string | null
  statusUrl: string | null
  responseUrl: string | null
  cancelUrl: string | null
  logs: string[]
  errorMessage: string | null
  createdAt: number
  updatedAt: number
  finishedAt: number | null
  outputs: ImageStudioOutput[]
}

export type ImageStudioEventType = 'status' | 'log' | 'outputs' | 'completed' | 'failed' | 'cancelled'

export interface ImageStudioEvent {
  type: ImageStudioEventType
  generationId: string
  status?: ImageStudioJobStatus
  message?: string
  outputs?: ImageStudioOutput[]
  job?: ImageStudioJob
  timestamp: number
}

export const IMAGE_STUDIO_CHANNELS = {
  SUBMIT: 'imageStudio:submit',
  CANCEL: 'imageStudio:cancel',
  HISTORY_LIST: 'imageStudio:history:list',
  HISTORY_GET: 'imageStudio:history:get',
  HISTORY_DELETE: 'imageStudio:history:delete',
  OUTPUT_DELETE: 'imageStudio:output:delete',
  HISTORY_RETRY: 'imageStudio:history:retry',
  EVENT: 'imageStudio:event'
} as const

export const FAL_SEEDREAM_IMAGE_SIZE_PRESETS: FalSeedreamImageSizePreset[] = [
  'square_hd',
  'square',
  'portrait_4_3',
  'portrait_16_9',
  'landscape_4_3',
  'landscape_16_9',
  'auto_2K',
  'auto_4K'
]

export function createDefaultImageStudioConfig(): ImageStudioConfig {
  return {
    providers: [
      {
        id: 'fal_seedream',
        name: 'fal.ai Seedream Edit',
        type: 'fal_seedream_edit',
        enabled: true,
        apiKey: '',
        baseUrl: 'https://queue.fal.run/fal-ai/bytedance/seedream/v4.5/edit',
        description: 'fal.ai Seedream v4.5 Edit（真实可用）',
        placeholderOnly: false
      },
      {
        id: 'openrouter_seedream',
        name: 'OpenRouter Seedream 4.5',
        type: 'openrouter_seedream_placeholder',
        enabled: true,
        apiKey: '',
        baseUrl: 'https://openrouter.ai/api/v1',
        description: '一期占位：可配置 Key，暂不支持执行生成',
        placeholderOnly: true
      }
    ],
    defaultProviderId: 'fal_seedream',
    uiDefaults: {
      prompt: '',
      falSeedreamEditOptions: {
        imageSize: 'landscape_16_9',
        numImages: 1,
        maxImages: 1,
        seed: 42,
        syncMode: false,
        enableSafetyChecker: true,
        enhancePromptMode: 'standard'
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeFalSeedreamImageSize(value: unknown): FalSeedreamImageSize {
  if (typeof value === 'string' && FAL_SEEDREAM_IMAGE_SIZE_PRESETS.includes(value as FalSeedreamImageSizePreset)) {
    return value as FalSeedreamImageSizePreset
  }

  if (isRecord(value)) {
    const width = Number(value.width)
    const height = Number(value.height)
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return {
        width: Math.round(width),
        height: Math.round(height)
      }
    }
  }

  return 'landscape_16_9'
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
}

export function normalizeFalSeedreamEditOptions(input: unknown): Required<FalSeedreamEditOptions> {
  const fallback = createDefaultImageStudioConfig().uiDefaults.falSeedreamEditOptions
  if (!isRecord(input)) return fallback

  const enhancePromptModeRaw = typeof input.enhancePromptMode === 'string' ? input.enhancePromptMode : ''
  const enhancePromptMode =
    enhancePromptModeRaw === 'fast' || enhancePromptModeRaw === 'standard'
      ? (enhancePromptModeRaw as FalSeedreamEnhancePromptMode)
      : fallback.enhancePromptMode

  return {
    imageSize: normalizeFalSeedreamImageSize(input.imageSize),
    numImages: clampInt(input.numImages, fallback.numImages, 1, 6),
    maxImages: clampInt(input.maxImages, fallback.maxImages, 1, 6),
    seed: clampInt(input.seed, fallback.seed, 0, 2147483647),
    syncMode: typeof input.syncMode === 'boolean' ? input.syncMode : fallback.syncMode,
    enableSafetyChecker:
      typeof input.enableSafetyChecker === 'boolean' ? input.enableSafetyChecker : fallback.enableSafetyChecker,
    enhancePromptMode
  }
}

export function normalizeImageStudioConfig(input: unknown): ImageStudioConfig {
  const fallback = createDefaultImageStudioConfig()
  if (!isRecord(input)) return fallback

  const providers = Array.isArray(input.providers)
    ? input.providers
      .filter((item) => isRecord(item))
      .map((item) => {
        const rawId = String(item.id ?? '').trim()
        const id = rawId === 'openrouter_seedream' ? 'openrouter_seedream' : 'fal_seedream'
        const byDefault = fallback.providers.find((provider) => provider.id === id) ?? fallback.providers[0]

        return {
          ...byDefault,
          name: typeof item.name === 'string' && item.name.trim() ? item.name : byDefault.name,
          enabled: typeof item.enabled === 'boolean' ? item.enabled : byDefault.enabled,
          apiKey: typeof item.apiKey === 'string' ? item.apiKey : byDefault.apiKey,
          baseUrl: typeof item.baseUrl === 'string' && item.baseUrl.trim() ? item.baseUrl : byDefault.baseUrl,
          description:
            typeof item.description === 'string' && item.description.trim() ? item.description : byDefault.description,
          placeholderOnly:
            typeof item.placeholderOnly === 'boolean' ? item.placeholderOnly : byDefault.placeholderOnly
        }
      })
    : []

  const providerMap = new Map<ImageStudioProviderId, ImageStudioProviderConfig>()
  for (const provider of providers) {
    providerMap.set(provider.id, provider)
  }
  for (const provider of fallback.providers) {
    if (!providerMap.has(provider.id)) providerMap.set(provider.id, provider)
  }

  const normalizedProviders = Array.from(providerMap.values())

  const defaultProviderId =
    input.defaultProviderId === 'openrouter_seedream' || input.defaultProviderId === 'fal_seedream'
      ? input.defaultProviderId
      : fallback.defaultProviderId

  const hasDefaultProvider = normalizedProviders.some((provider) => provider.id === defaultProviderId)

  const uiDefaults = isRecord(input.uiDefaults) ? input.uiDefaults : {}

  return {
    providers: normalizedProviders,
    defaultProviderId: hasDefaultProvider ? defaultProviderId : fallback.defaultProviderId,
    uiDefaults: {
      prompt: typeof uiDefaults.prompt === 'string' ? uiDefaults.prompt : fallback.uiDefaults.prompt,
      falSeedreamEditOptions: normalizeFalSeedreamEditOptions(uiDefaults.falSeedreamEditOptions)
    }
  }
}
