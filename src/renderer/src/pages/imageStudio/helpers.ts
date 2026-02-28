import {
  createDefaultImageStudioConfig,
  FAL_SEEDREAM_IMAGE_SIZE_PRESETS,
  normalizeFalSeedreamEditOptions,
  type FalSeedreamImageSize,
  type FalSeedreamImageSizePreset,
  type ImageInputSource,
  type ImageStudioJob,
  type ImageStudioJobStatus,
  type ImageStudioOutput
} from '../../../../shared/imageStudio'

export type InputDraft = ImageInputSource & { previewUrl?: string }

export const MAX_INPUT_IMAGES = 10
export const MAX_TOTAL_IMAGES = 15
export const HISTORY_COLLAPSED_STORAGE_KEY = 'kelivo:imageStudio:historyCollapsed'
export const REF_DOCK_WIDTH_STORAGE_KEY = 'kelivo:imageStudio:refDockWidth'
export const HISTORY_WIDTH_STORAGE_KEY = 'kelivo:imageStudio:historyWidth'

export const DEFAULT_IMAGE_STUDIO_CONFIG = createDefaultImageStudioConfig()

export const FAL_QUEUE_HOST = 'queue.fal.run'
export const FAL_MODEL_PAGE_SUFFIXES = new Set(['api', 'playground', 'llms.txt'])

export const REF_DOCK_MIN_WIDTH = 140
export const REF_DOCK_MAX_WIDTH = 520
export const HISTORY_MIN_WIDTH = 44
export const HISTORY_MAX_WIDTH = 360

export function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function readStoredNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const value = Number.parseFloat(raw)
    if (!Number.isFinite(value)) return null
    return value
  } catch {
    return null
  }
}

export function writeStoredNumber(key: string, value: number) {
  try {
    localStorage.setItem(key, String(Math.round(value)))
  } catch {
    // ignore
  }
}

export const IMAGE_SIZE_LABELS: Record<FalSeedreamImageSizePreset, string> = {
  square_hd: 'square_hd',
  square: 'square',
  portrait_4_3: 'portrait_4_3',
  portrait_16_9: 'portrait_16_9',
  landscape_4_3: 'landscape_4_3',
  landscape_16_9: 'landscape_16_9',
  auto_2K: 'auto_2K',
  auto_3K: 'auto_3K',
  auto_4K: 'auto_4K'
}

export type SeedreamEndpointPresetSet = 'seedream_v45_edit' | 'seedream_v5_lite_edit' | 'unknown'

export const IMAGE_SIZE_PRESETS_SEEDREAM_V45: FalSeedreamImageSizePreset[] = [
  'square_hd',
  'square',
  'portrait_4_3',
  'portrait_16_9',
  'landscape_4_3',
  'landscape_16_9',
  'auto_2K',
  'auto_4K'
]

export const IMAGE_SIZE_PRESETS_SEEDREAM_V5_LITE: FalSeedreamImageSizePreset[] = [
  'square_hd',
  'square',
  'portrait_4_3',
  'portrait_16_9',
  'landscape_4_3',
  'landscape_16_9',
  'auto_2K',
  'auto_3K'
]

export function inferSeedreamEndpointPresetSet(baseUrl: string): SeedreamEndpointPresetSet {
  const raw = baseUrl.trim()
  if (!raw) return 'unknown'

  const path = (() => {
    try {
      return new URL(raw).pathname.toLowerCase()
    } catch {
      return raw.toLowerCase()
    }
  })()

  if (path.includes('/seedream/v5/lite/edit')) return 'seedream_v5_lite_edit'
  if (path.includes('/seedream/v4.5/edit')) return 'seedream_v45_edit'
  return 'unknown'
}

export function defaultBaseUrlForImageStudioProvider(providerId: string): string {
  return DEFAULT_IMAGE_STUDIO_CONFIG.providers.find((provider) => provider.id === providerId)?.baseUrl ?? ''
}

export function formatSeedreamModelMeta(baseUrl: string | undefined): string {
  const raw = (baseUrl ?? '').trim()
  if (!raw) return '未配置'

  try {
    const url = new URL(raw)
    const parts = url.pathname
      .split('/')
      .map((seg) => seg.trim())
      .filter(Boolean)

    // 兼容用户粘贴 fal.ai/models/.../api 或 /playground 等页面 URL：去掉最后的展示页后缀。
    if (parts.length && FAL_MODEL_PAGE_SUFFIXES.has(parts[parts.length - 1].toLowerCase())) {
      parts.pop()
    }

    const idx = parts.findIndex((seg) => seg.toLowerCase() === 'seedream')
    if (idx >= 0) {
      const version = parts[idx + 1] ?? ''
      const variant = parts[idx + 2] ?? ''
      const action = parts[idx + 3] ?? ''

      const versionLabel = version ? ` ${version}` : ''
      if (variant && action) return `Seedream${versionLabel} ${variant} · ${action}`
      if (variant) return `Seedream${versionLabel} · ${variant}`
      return `Seedream${versionLabel}`
    }

    const tail = parts.slice(-3).join('/')
    if (tail) return `${url.hostname} · ${tail}`
    return url.hostname
  } catch {
    return raw
  }
}

export function normalizeFalQueueBaseUrlInput(input: string): { baseUrl: string; normalizedFrom: string | null } {
  const raw = input.trim()
  if (!raw) return { baseUrl: raw, normalizedFrom: null }

  // 支持直接粘贴 endpoint id（例如：fal-ai/bytedance/seedream/v5/lite/edit）
  if (!raw.includes('://') && raw.startsWith('fal-ai/')) {
    return { baseUrl: `https://${FAL_QUEUE_HOST}/${raw.replace(/^\/+/, '')}`, normalizedFrom: raw }
  }

  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    const path = url.pathname

    // 支持直接粘贴 fal.ai model 页面 URL（/models/...），自动转换为 queue endpoint。
    if (host === 'fal.ai' || host.endsWith('.fal.ai')) {
      if (path.startsWith('/models/')) {
        const parts = path
          .slice('/models/'.length)
          .split('/')
          .map((seg) => seg.trim())
          .filter(Boolean)

        if (parts.length && FAL_MODEL_PAGE_SUFFIXES.has(parts[parts.length - 1].toLowerCase())) {
          parts.pop()
        }

        const endpoint = parts.join('/')
        if (endpoint) {
          return { baseUrl: `https://${FAL_QUEUE_HOST}/${endpoint}`, normalizedFrom: raw }
        }
      }

      // 支持粘贴 OpenAPI schema URL（带 endpoint_id 查询参数）
      if (path.startsWith('/api/openapi/queue/openapi.json')) {
        const endpointId = url.searchParams.get('endpoint_id')?.trim() ?? ''
        if (endpointId) {
          return { baseUrl: `https://${FAL_QUEUE_HOST}/${endpointId.replace(/^\/+/, '')}`, normalizedFrom: raw }
        }
      }
    }

    // 兜底：如果用户粘贴了某些展示页 URL（末尾带 /api、/playground 等），至少去掉后缀，避免把 HTML 页面当成 API。
    {
      const parts = url.pathname
        .split('/')
        .map((seg) => seg.trim())
        .filter(Boolean)
      if (parts.length && FAL_MODEL_PAGE_SUFFIXES.has(parts[parts.length - 1].toLowerCase())) {
        parts.pop()
        const nextPath = parts.join('/')
        const nextUrl = nextPath ? `${url.origin}/${nextPath}` : url.origin
        return { baseUrl: nextUrl, normalizedFrom: raw }
      }
    }
  } catch {
    // 非 URL：原样返回
  }

  return { baseUrl: raw, normalizedFrom: null }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

export function statusLabel(status: ImageStudioJobStatus): string {
  if (status === 'queued') return '排队中'
  if (status === 'in_progress') return '执行中'
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  return '已取消'
}

export function statusClassName(status: ImageStudioJobStatus): string {
  if (status === 'queued') return 'imageStudioStatus--queued'
  if (status === 'in_progress') return 'imageStudioStatus--inProgress'
  if (status === 'completed') return 'imageStudioStatus--completed'
  if (status === 'failed') return 'imageStudioStatus--failed'
  return 'imageStudioStatus--cancelled'
}

export function kelivoFileUrl(localPath: string): string {
  return `kelivo-file:///${encodeURI(localPath.replace(/\\/g, '/'))}`
}

export function outputSrc(output: ImageStudioOutput): string | null {
  if (output.localPath) return kelivoFileUrl(output.localPath)
  if (output.remoteUrl) return output.remoteUrl
  return null
}

export function outputName(output: ImageStudioOutput): string {
  if (output.localPath) {
    const parts = output.localPath.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] ?? `${output.generationId}_${output.outputIndex}.png`
  }
  if (!output.remoteUrl) return `${output.generationId}_${output.outputIndex}.png`

  try {
    const url = new URL(output.remoteUrl)
    return url.pathname.split('/').pop() ?? `${output.generationId}_${output.outputIndex}.png`
  } catch {
    return `${output.generationId}_${output.outputIndex}.png`
  }
}

export function initialImageState(options: Required<import('../../../../shared/imageStudio').FalSeedreamEditOptions>) {
  if (typeof options.imageSize === 'string') {
    return { mode: 'preset' as const, preset: options.imageSize, width: 2560, height: 1440 }
  }

  return {
    mode: 'custom' as const,
    preset: 'landscape_16_9' as FalSeedreamImageSizePreset,
    width: Math.max(1, Math.round(options.imageSize.width)),
    height: Math.max(1, Math.round(options.imageSize.height))
  }
}

export function briefPrompt(prompt: string): string {
  const value = prompt.trim()
  return value || '(空 Prompt)'
}

export function inputPreviewSrc(input: ImageInputSource): string | null {
  if (input.preparedDataUrl && input.preparedDataUrl.startsWith('data:')) return input.preparedDataUrl
  if (input.type === 'url') return input.value
  if (input.type === 'localPath' && input.value) {
    // 兼容历史记录里 value 可能就是 data/http（主进程存储时会剥离 preparedDataUrl）。
    if (input.value.startsWith('data:') || input.value.startsWith('http://') || input.value.startsWith('https://')) {
      return input.value
    }
    return kelivoFileUrl(input.value)
  }
  return null
}

export function jobThumbSrc(job: ImageStudioJob): string | null {
  const output = job.outputs[0]
  if (!output) return null
  return outputSrc(output)
}

export function ensureFileHasImageExtension(fileName: string): string {
  const trimmed = fileName.trim()
  let base = trimmed

  // Lightbox 里 title 可能是 URL；优先取最后一段路径作为文件名。
  try {
    const u = new URL(trimmed)
    base = u.pathname.split('/').pop() || u.hostname
  } catch {
    // ignore
  }

  base = base
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()

  if (!base) base = 'image'
  if (base.length > 120) base = base.slice(0, 120)

  if (/\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i.test(base)) return base
  return `${base}.png`
}
