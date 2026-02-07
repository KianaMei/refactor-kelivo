/**
 * OCR 服务
 * 提供图片 OCR 功能和缓存管理
 */

import { sendMessageStream } from '../api/chatApiService'
import type { ProviderConfigV2 } from '../../shared/types'

/** OCR 服务配置 */
export interface OcrConfig {
  /** 是否启用 OCR */
  enabled: boolean
  /** OCR 使用的 Provider ID */
  providerId: string | null
  /** OCR 使用的模型 ID */
  modelId: string | null
  /** OCR 提示词 */
  prompt: string
}

/** 默认 OCR 提示词 */
export const DEFAULT_OCR_PROMPT =
  'Please describe the content of this image in detail, including any text, diagrams, or visual elements.'

/**
 * OCR 服务类
 * 提供 LRU 缓存管理和 OCR 执行
 */
export class OcrService {
  private cache = new Map<string, string>()
  private cacheKeys: string[] = []
  private maxCacheSize: number

  constructor(maxCacheSize = 50) {
    this.maxCacheSize = maxCacheSize
  }

  /**
   * 获取缓存的 OCR 文本 (LRU 访问更新)
   */
  getCached(imagePath: string): string | null {
    const key = imagePath.trim()

    if (this.cache.has(key)) {
      // Move to end (most recently used)
      const index = this.cacheKeys.indexOf(key)
      if (index > -1) {
        this.cacheKeys.splice(index, 1)
        this.cacheKeys.push(key)
      }
      return this.cache.get(key) ?? null
    }

    return null
  }

  /**
   * 缓存 OCR 文本 (LRU 淘汰)
   */
  setCache(imagePath: string, text: string): void {
    const key = imagePath.trim()

    if (this.cache.has(key)) {
      // 已存在，更新位置
      const index = this.cacheKeys.indexOf(key)
      if (index > -1) {
        this.cacheKeys.splice(index, 1)
      }
    } else if (this.cacheKeys.length >= this.maxCacheSize) {
      // 缓存已满，淘汰最老的
      const oldest = this.cacheKeys.shift()
      if (oldest) {
        this.cache.delete(oldest)
      }
    }

    this.cache.set(key, text)
    this.cacheKeys.push(key)
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear()
    this.cacheKeys = []
  }

  /**
   * 获取缓存大小
   */
  getCacheSize(): number {
    return this.cache.size
  }

  /**
   * 包装 OCR 文本为结构化块
   */
  static wrapOcrBlock(ocrText: string): string {
    return `The image_file_ocr tag contains a description of an image that the user uploaded to you, not the user's prompt.
<image_file_ocr>
${ocrText.trim()}
</image_file_ocr>
`
  }

  /**
   * 检查 OCR 是否已配置并启用
   */
  static isConfigured(config: OcrConfig): boolean {
    return config.enabled && config.providerId !== null && config.modelId !== null
  }
}

/**
 * 执行 OCR - 使用配置的 OCR 模型
 *
 * @param params OCR 参数
 * @returns 提取的文本，如果失败返回 null
 */
export async function runOcr(params: {
  imagePaths: string[]
  providerConfig: ProviderConfigV2
  modelId: string
  prompt?: string
}): Promise<string | null> {
  const { imagePaths, providerConfig, modelId, prompt } = params

  if (imagePaths.length === 0) {
    return null
  }

  const messages = [
    {
      role: 'user' as const,
      content: prompt ?? DEFAULT_OCR_PROMPT
    }
  ]

  let result = ''

  try {
    for await (const chunk of sendMessageStream({
      config: providerConfig,
      modelId,
      messages,
      userImagePaths: imagePaths,
      temperature: 0.0,
      maxTokens: 4096
    })) {
      if (chunk.content) {
        result += chunk.content
      }
      if (chunk.isDone) {
        break
      }
    }

    const trimmed = result.trim()
    return trimmed || null
  } catch (error) {
    console.error('OCR failed:', error)
    return null
  }
}

// 全局 OCR 服务实例
let globalOcrService: OcrService | null = null

/**
 * 获取全局 OCR 服务实例
 */
export function getOcrService(): OcrService {
  if (!globalOcrService) {
    globalOcrService = new OcrService()
  }
  return globalOcrService
}
