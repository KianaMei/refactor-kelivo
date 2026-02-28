import { safeReadText } from '../../../http'
import type { ImageStudioJobStatus } from '../../../../shared/imageStudio'
import type {
  ImageStudioCancelParams,
  ImageStudioPollParams,
  ImageStudioProvider,
  ImageStudioProviderResult,
  ImageStudioResultParams,
  ImageStudioStatusResult,
  ImageStudioSubmitParams
} from './types'

interface FalQueueSubmitResponse {
  request_id?: string
  requestId?: string
  status_url?: string
  response_url?: string
  cancel_url?: string
}

interface FalStatusLogEntry {
  message?: string
  log?: string
  level?: string
}

interface FalStatusResponse {
  status?: string
  logs?: Array<FalStatusLogEntry | string>
  error?: string
  message?: string
}

interface FalResultImage {
  url?: string
  content_type?: string
  width?: number
  height?: number
}

interface FalResultResponse {
  images?: FalResultImage[]
}

function buildAuthHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Key ${apiKey}`,
    'Content-Type': 'application/json'
  }
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function extractQueueRequestId(payload: FalQueueSubmitResponse, statusUrl: string): string {
  const direct = payload.request_id ?? payload.requestId
  if (direct && direct.trim()) return direct.trim()

  try {
    const url = new URL(statusUrl)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] ?? statusUrl
  } catch {
    return statusUrl
  }
}

function mapFalStatus(rawStatus: string, errorMessage?: string): ImageStudioStatusResult {
  const normalized = rawStatus.toUpperCase()

  switch (normalized) {
    case 'IN_QUEUE':
    case 'QUEUED':
      return { rawStatus, status: 'queued', logs: [], done: false }
    case 'IN_PROGRESS':
    case 'RUNNING':
      return { rawStatus, status: 'in_progress', logs: [], done: false }
    case 'COMPLETED':
      return { rawStatus, status: 'completed', logs: [], done: true }
    case 'CANCELLATION_REQUESTED':
      return { rawStatus, status: 'in_progress', logs: [], done: false }
    case 'CANCELLED':
    case 'CANCELED':
      return { rawStatus, status: 'cancelled', logs: [], done: true }
    case 'FAILED':
    case 'ERROR':
      return { rawStatus, status: 'failed', logs: [], done: true, errorMessage: errorMessage ?? 'fal 任务失败' }
    default:
      return { rawStatus, status: 'in_progress', logs: [], done: false }
  }
}

function parseStatusLogs(logsRaw: unknown): string[] {
  if (!Array.isArray(logsRaw)) return []

  const logs: string[] = []
  for (const item of logsRaw) {
    if (typeof item === 'string' && item.trim()) {
      logs.push(item.trim())
      continue
    }

    if (item && typeof item === 'object') {
      const entry = item as FalStatusLogEntry
      const message = (entry.message ?? entry.log ?? '').trim()
      if (!message) continue
      logs.push(entry.level ? `[${entry.level}] ${message}` : message)
    }
  }

  return logs
}

function parseResult(payload: unknown): ImageStudioProviderResult {
  if (!payload || typeof payload !== 'object') {
    return { images: [] }
  }

  const result = payload as FalResultResponse
  const images = Array.isArray(result.images)
    ? result.images
      .filter((item) => item && typeof item === 'object' && typeof item.url === 'string')
      .map((item) => ({
        url: item.url as string,
        contentType: item.content_type ?? null,
        width: typeof item.width === 'number' ? Math.round(item.width) : null,
        height: typeof item.height === 'number' ? Math.round(item.height) : null
      }))
    : []

  return { images }
}

export const falSeedreamProvider: ImageStudioProvider = {
  async submit(params: ImageStudioSubmitParams) {
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      image_urls: params.imageUrls,
      image_size: params.options.imageSize,
      num_images: params.options.numImages,
      max_images: params.options.maxImages,
      seed: params.options.seed,
      sync_mode: params.options.syncMode,
      enable_safety_checker: params.options.enableSafetyChecker,
      enhance_prompt_mode: params.options.enhancePromptMode
    }

    const response = await fetch(normalizeBaseUrl(params.baseUrl), {
      method: 'POST',
      headers: buildAuthHeaders(params.apiKey),
      body: JSON.stringify(body),
      signal: params.signal
    })

    if (!response.ok) {
      const detail = await safeReadText(response)
      throw new Error(`fal submit 失败 (${response.status}) ${detail}`.trim())
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    if (!contentType.includes('application/json')) {
      const detail = (await safeReadText(response)).trim()
      const snippet = detail.length > 400 ? `${detail.slice(0, 400)}…` : detail
      throw new Error(
        `fal submit 返回非 JSON（content-type=${contentType || 'unknown'}）。` +
          `Base URL 必须是 queue endpoint（例如 https://queue.fal.run/fal-ai/...），不要填 fal.ai/models 的页面链接。` +
          (snippet ? ` 响应片段：${snippet}` : '')
      )
    }

    const payload = (await response.json()) as FalQueueSubmitResponse

    if (!payload.status_url || !payload.response_url || !payload.cancel_url) {
      throw new Error('fal submit 返回缺少队列 URL')
    }

    return {
      queueRequestId: extractQueueRequestId(payload, payload.status_url),
      statusUrl: payload.status_url,
      responseUrl: payload.response_url,
      cancelUrl: payload.cancel_url
    }
  },

  async pollStatus(params: ImageStudioPollParams) {
    const response = await fetch(params.statusUrl, {
      method: 'GET',
      headers: buildAuthHeaders(params.apiKey),
      signal: params.signal
    })

    if (!response.ok) {
      const detail = await safeReadText(response)
      throw new Error(`fal status 查询失败 (${response.status}) ${detail}`.trim())
    }

    const payload = (await response.json()) as FalStatusResponse
    const rawStatus = typeof payload.status === 'string' ? payload.status : 'IN_PROGRESS'

    const mapped = mapFalStatus(rawStatus, payload.error ?? payload.message)
    const logs = parseStatusLogs(payload.logs)

    return {
      ...mapped,
      logs
    }
  },

  async getResult(params: ImageStudioResultParams) {
    const response = await fetch(params.responseUrl, {
      method: 'GET',
      headers: buildAuthHeaders(params.apiKey),
      signal: params.signal
    })

    if (!response.ok) {
      const detail = await safeReadText(response)
      throw new Error(`fal result 获取失败 (${response.status}) ${detail}`.trim())
    }

    const payload = await response.json()
    const parsed = parseResult(payload)
    if (parsed.images.length === 0) {
      throw new Error('fal result 未返回图片')
    }

    return parsed
  },

  async cancel(params: ImageStudioCancelParams) {
    const response = await fetch(params.cancelUrl, {
      method: 'PUT',
      headers: buildAuthHeaders(params.apiKey),
      signal: params.signal
    })

    if (response.ok || response.status === 409 || response.status === 404) {
      return
    }

    const detail = await safeReadText(response)
    throw new Error(`fal cancel 失败 (${response.status}) ${detail}`.trim())
  }
}
