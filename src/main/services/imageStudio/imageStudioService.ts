import { app, BrowserWindow } from 'electron'
import { mkdir, rm, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'

import { encodeBase64File } from '../../api/helpers/chatApiHelper'
import { loadConfig } from '../../configStore'
import {
  addImageGenerationOutputs,
  appendImageGenerationLog,
  createImageGeneration,
  deleteImageGeneration,
  deleteImageGenerationOutput,
  getImageGeneration,
  getImageGenerationOutput,
  listImageGenerations,
  updateImageGeneration
} from '../../db/repositories/imageGenerationRepo'
import {
  normalizeFalSeedreamEditOptions,
  type FalSeedreamEditOptions,
  type ImageInputSource,
  type ImageStudioCancelResult,
  type ImageStudioConfig,
  type ImageStudioDeleteRequest,
  type ImageStudioEvent,
  type ImageStudioHistoryDeleteResult,
  type ImageStudioHistoryGetResult,
  type ImageStudioHistoryListResult,
  type ImageStudioJob,
  type ImageStudioJobStatus,
  type ImageStudioListRequest,
  type ImageStudioOutputDeleteRequest,
  type ImageStudioOutputDeleteResult,
  type ImageStudioProviderConfig,
  type ImageStudioProviderType,
  type ImageStudioRetryRequest,
  type ImageStudioSubmitRequest,
  type ImageStudioSubmitResult
} from '../../../shared/imageStudio'
import { IpcChannel } from '../../../shared/ipc'
import { safeUuid } from '../../../shared/utils'
import { falSeedreamProvider } from './providers/falSeedreamProvider'
import {
  openRouterSeedreamPlaceholderProvider,
  PLACEHOLDER_ERROR
} from './providers/openRouterSeedreamPlaceholder'
import type { ImageStudioProvider, ImageStudioProviderImageResult } from './providers/types'

interface ActiveJobContext {
  generationId: string
  abortController: AbortController
  provider: ImageStudioProvider
  providerType: ImageStudioProviderType
  apiKey: string
  cancelRequested: boolean
  seenLogs: Set<string>
}

interface RunJobParams {
  generationId: string
  prompt: string
  imageUrls: string[]
  options: Required<FalSeedreamEditOptions>
  providerConfig: ImageStudioProviderConfig
  context: ActiveJobContext
}

const FAL_QUEUE_POLL_INTERVAL_MS = 1500
const INPUT_IMAGE_LIMIT = 10
const TOTAL_IMAGE_LIMIT = 15
const CUSTOM_IMAGE_SIZE_MIN = 1920
const CUSTOM_IMAGE_SIZE_MAX = 4096
const CUSTOM_IMAGE_PIXELS_MIN = 2560 * 1440
const CUSTOM_IMAGE_PIXELS_MAX = 4096 * 4096

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timer)
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
    }

    if (signal?.aborted) {
      clearTimeout(timer)
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof Error) {
    const message = err.message.toLowerCase()
    return message.includes('abort') || message.includes('aborted')
  }
  return false
}

function nowDatePart(timestamp: number): string {
  const dt = new Date(timestamp)
  const year = dt.getFullYear()
  const month = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

function isDataUrl(value: string): boolean {
  return value.startsWith('data:')
}

function toSafeErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return String(err)
}

function extensionFromContentType(contentType: string | null | undefined, fallbackUrl: string): string {
  const normalized = (contentType ?? '').toLowerCase()
  if (normalized.includes('image/png')) return 'png'
  if (normalized.includes('image/jpeg') || normalized.includes('image/jpg')) return 'jpg'
  if (normalized.includes('image/webp')) return 'webp'
  if (normalized.includes('image/gif')) return 'gif'

  const ext = extname(fallbackUrl).toLowerCase().replace('.', '')
  if (ext && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext
  }

  return 'png'
}

function sanitizeInputSourcesForStorage(inputs: ImageInputSource[]): ImageInputSource[] {
  return inputs.map((item) => {
    const value = item.value.trim()
    return {
      id: item.id,
      type: item.type,
      value,
      ...(item.fileName ? { fileName: item.fileName } : {})
    }
  })
}

function mergeFalOptions(config: ImageStudioConfig, input?: FalSeedreamEditOptions): Required<FalSeedreamEditOptions> {
  const defaults = config.uiDefaults.falSeedreamEditOptions
  return normalizeFalSeedreamEditOptions({
    ...defaults,
    ...(input ?? {})
  })
}

function validateCustomImageSize(options: Required<FalSeedreamEditOptions>): string | null {
  if (!options.imageSize || typeof options.imageSize !== 'object') return null

  const width = Math.round(Number(options.imageSize.width))
  const height = Math.round(Number(options.imageSize.height))

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '自定义尺寸必须是正整数。'
  }

  const area = width * height
  const edgeRangeValid =
    width >= CUSTOM_IMAGE_SIZE_MIN &&
    width <= CUSTOM_IMAGE_SIZE_MAX &&
    height >= CUSTOM_IMAGE_SIZE_MIN &&
    height <= CUSTOM_IMAGE_SIZE_MAX
  const pixelRangeValid = area >= CUSTOM_IMAGE_PIXELS_MIN && area <= CUSTOM_IMAGE_PIXELS_MAX

  if (!edgeRangeValid && !pixelRangeValid) {
    return '自定义尺寸不符合 fal 文档约束，请调整宽高后重试。'
  }

  return null
}

class ImageStudioService {
  private activeJobs = new Map<string, ActiveJobContext>()

  private getProviderByType(type: ImageStudioProviderType): ImageStudioProvider {
    if (type === 'fal_seedream_edit') return falSeedreamProvider
    return openRouterSeedreamPlaceholderProvider
  }

  private emit(event: ImageStudioEvent): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.webContents.isDestroyed()) continue
      window.webContents.send(IpcChannel.ImageStudioEvent, event)
    }
  }

  private async appendLog(generationId: string, message: string): Promise<void> {
    appendImageGenerationLog(generationId, message)
    this.emit({
      type: 'log',
      generationId,
      message,
      timestamp: Date.now()
    })
  }

  private async resolveProviderConfig(providerId: string): Promise<ImageStudioProviderConfig> {
    const config = await loadConfig()
    const provider = config.imageStudio.providers.find((item) => item.id === providerId)
    if (!provider) {
      throw new Error(`未找到供应商配置：${providerId}`)
    }
    if (!provider.enabled) {
      throw new Error(`供应商已禁用：${provider.name}`)
    }
    return provider
  }

  private async normalizeInputUrls(inputs: ImageInputSource[]): Promise<string[]> {
    const urls: string[] = []

    for (const input of inputs) {
      const rawValue = input.value.trim()
      if (!rawValue) continue

      if (input.type === 'url') {
        if (!isHttpUrl(rawValue) && !isDataUrl(rawValue)) {
          throw new Error(`图片 URL 无效：${rawValue}`)
        }
        urls.push(rawValue)
        continue
      }

      const preparedDataUrl = input.preparedDataUrl?.trim() ?? ''
      if (preparedDataUrl) {
        if (!isDataUrl(preparedDataUrl)) {
          throw new Error(`本地图片编码失败：${input.fileName ?? rawValue}`)
        }
        urls.push(preparedDataUrl)
        continue
      }

      if (isDataUrl(rawValue) || isHttpUrl(rawValue)) {
        urls.push(rawValue)
        continue
      }

      const dataUrl = await encodeBase64File(rawValue, true)
      urls.push(dataUrl)
    }

    return urls
  }

  private validateSubmitRequest(
    prompt: string,
    inputSources: ImageInputSource[],
    imageUrls: string[],
    options: Required<FalSeedreamEditOptions>
  ): void {
    if (!prompt.trim()) {
      throw new Error('Prompt 不能为空。')
    }

    if (inputSources.length === 0) {
      throw new Error('请至少提供 1 张输入图片。')
    }

    if (inputSources.length > INPUT_IMAGE_LIMIT) {
      throw new Error(`输入图片最多 ${INPUT_IMAGE_LIMIT} 张。`)
    }

    if (imageUrls.length === 0) {
      throw new Error('输入图片解析失败，请检查 URL 或本地文件。')
    }

    // fal 文档：当 max_images > 1 时，单次 generation 可能返回 1~max_images 张；总共会执行 num_images 次 generation。
    // 因此输出总数范围为 [num_images, num_images*max_images]。为了不触发 15 张总量限制，这里按“最大可能输出”进行校验。
    const maxPossibleOutputs = options.numImages * options.maxImages
    const maxPossibleTotal = imageUrls.length + maxPossibleOutputs

    if (maxPossibleTotal > TOTAL_IMAGE_LIMIT) {
      const outputBudget = Math.max(0, TOTAL_IMAGE_LIMIT - imageUrls.length)
      const maxImagesAllowed = Math.max(1, Math.floor(outputBudget / Math.max(1, options.numImages)))
      throw new Error(
        `总图上限为 ${TOTAL_IMAGE_LIMIT}（输入+输出）。当前输入 ${imageUrls.length} 张；num_images=${options.numImages} 且 max_images=${options.maxImages} 时，最大输出=${maxPossibleOutputs} 张，最大总图=${maxPossibleTotal}/${TOTAL_IMAGE_LIMIT}。` +
          `请将 max_images 降到 ≤ ${Math.min(6, maxImagesAllowed)}，或减少参考图/num_images；如果只想固定输出 ${options.numImages} 张，请将 max_images 设为 1。`
      )
    }

    const customSizeError = validateCustomImageSize(options)
    if (customSizeError) {
      throw new Error(customSizeError)
    }
  }

  private async persistOutputs(
    generationId: string,
    images: ImageStudioProviderImageResult[]
  ): Promise<ImageStudioJob> {
    const baseDir = join(app.getPath('userData'), 'images', 'generated', nowDatePart(Date.now()))
    await mkdir(baseDir, { recursive: true })

    const outputs: Array<{
      outputIndex: number
      remoteUrl: string | null
      localPath: string | null
      contentType: string | null
      width: number | null
      height: number | null
      fileSize: number | null
    }> = []

    let savedCount = 0

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index]
      const outputIndex = index
      const remoteUrl = image.url

      try {
        const response = await fetch(remoteUrl)
        if (!response.ok) {
          throw new Error(`下载失败 (${response.status})`)
        }

        const contentType = image.contentType ?? response.headers.get('content-type') ?? 'image/png'
        const ext = extensionFromContentType(contentType, remoteUrl)
        const filename = `${generationId}_${outputIndex}.${ext}`
        const filePath = join(baseDir, filename)

        const bytes = Buffer.from(await response.arrayBuffer())
        await writeFile(filePath, bytes)

        outputs.push({
          outputIndex,
          remoteUrl,
          localPath: filePath,
          contentType,
          width: image.width ?? null,
          height: image.height ?? null,
          fileSize: bytes.byteLength
        })

        savedCount += 1
      } catch (err) {
        await this.appendLog(generationId, `输出下载失败：${basename(remoteUrl)}，原因：${toSafeErrorMessage(err)}`)
        outputs.push({
          outputIndex,
          remoteUrl,
          localPath: null,
          contentType: image.contentType ?? null,
          width: image.width ?? null,
          height: image.height ?? null,
          fileSize: null
        })
      }
    }

    if (savedCount === 0) {
      throw new Error('模型返回了结果，但图片下载全部失败。')
    }

    addImageGenerationOutputs(generationId, outputs)
    const job = getImageGeneration(generationId)
    if (!job) {
      throw new Error('保存输出后无法读取任务记录。')
    }

    this.emit({
      type: 'outputs',
      generationId,
      outputs: job.outputs,
      timestamp: Date.now()
    })

    return job
  }

  private async markJobStatus(
    generationId: string,
    status: ImageStudioJobStatus,
    options?: { errorMessage?: string | null; finished?: boolean }
  ): Promise<ImageStudioJob | null> {
    const updated = updateImageGeneration(generationId, {
      status,
      errorMessage: options?.errorMessage ?? null,
      finishedAt: options?.finished ? Date.now() : null
    })

    this.emit({
      type: 'status',
      generationId,
      status,
      message: options?.errorMessage ?? undefined,
      timestamp: Date.now(),
      ...(updated ? { job: updated } : {})
    })

    return updated
  }

  private async runJob(params: RunJobParams): Promise<void> {
    const { generationId, context, providerConfig, prompt, imageUrls, options } = params

    try {
      await this.appendLog(generationId, `提交任务到 ${providerConfig.name}`)

      const queue = await context.provider.submit({
        prompt,
        imageUrls,
        options,
        apiKey: context.apiKey,
        baseUrl: providerConfig.baseUrl ?? 'https://queue.fal.run/fal-ai/bytedance/seedream/v4.5/edit',
        signal: context.abortController.signal
      })

      updateImageGeneration(generationId, {
        status: 'queued',
        queueRequestId: queue.queueRequestId,
        statusUrl: queue.statusUrl,
        responseUrl: queue.responseUrl,
        cancelUrl: queue.cancelUrl,
        errorMessage: null,
        finishedAt: null
      })

      this.emit({
        type: 'status',
        generationId,
        status: 'queued',
        timestamp: Date.now(),
        job: getImageGeneration(generationId) ?? undefined
      })

      while (true) {
        await sleep(FAL_QUEUE_POLL_INTERVAL_MS, context.abortController.signal)

        const current = getImageGeneration(generationId)
        if (!current) {
          return
        }

        const statusUrl = current.statusUrl
        const responseUrl = current.responseUrl
        if (!statusUrl || !responseUrl) {
          throw new Error('队列 URL 丢失，无法继续轮询。')
        }

        const statusResult = await context.provider.pollStatus({
          apiKey: context.apiKey,
          statusUrl,
          signal: context.abortController.signal
        })

        for (const log of statusResult.logs) {
          if (context.seenLogs.has(log)) continue
          context.seenLogs.add(log)
          await this.appendLog(generationId, log)
        }

        if (current.status !== statusResult.status) {
          await this.markJobStatus(generationId, statusResult.status)
        }

        if (!statusResult.done) {
          continue
        }

        if (statusResult.status === 'completed') {
          await this.appendLog(generationId, '队列执行完成，开始获取结果。')

          const result = await context.provider.getResult({
            apiKey: context.apiKey,
            responseUrl,
            signal: context.abortController.signal
          })

          await this.persistOutputs(generationId, result.images)

          const finalJob = updateImageGeneration(generationId, {
            status: 'completed',
            errorMessage: null,
            finishedAt: Date.now()
          })

          this.emit({
            type: 'completed',
            generationId,
            status: 'completed',
            timestamp: Date.now(),
            job: finalJob ?? undefined
          })
          return
        }

        if (statusResult.status === 'cancelled') {
          const cancelledJob = updateImageGeneration(generationId, {
            status: 'cancelled',
            errorMessage: null,
            finishedAt: Date.now()
          })
          this.emit({
            type: 'cancelled',
            generationId,
            status: 'cancelled',
            timestamp: Date.now(),
            job: cancelledJob ?? undefined
          })
          return
        }

        const errorMessage = statusResult.errorMessage ?? '任务执行失败。'
        await this.appendLog(generationId, errorMessage)
        const failedJob = updateImageGeneration(generationId, {
          status: 'failed',
          errorMessage,
          finishedAt: Date.now()
        })

        this.emit({
          type: 'failed',
          generationId,
          status: 'failed',
          message: errorMessage,
          timestamp: Date.now(),
          job: failedJob ?? undefined
        })
        return
      }
    } catch (err) {
      if (isAbortError(err) && context.cancelRequested) {
        const cancelledJob = updateImageGeneration(generationId, {
          status: 'cancelled',
          errorMessage: null,
          finishedAt: Date.now()
        })

        this.emit({
          type: 'cancelled',
          generationId,
          status: 'cancelled',
          timestamp: Date.now(),
          job: cancelledJob ?? undefined
        })
        return
      }

      const errorMessage = toSafeErrorMessage(err)
      await this.appendLog(generationId, `任务失败：${errorMessage}`)
      const failedJob = updateImageGeneration(generationId, {
        status: 'failed',
        errorMessage,
        finishedAt: Date.now()
      })

      this.emit({
        type: 'failed',
        generationId,
        status: 'failed',
        message: errorMessage,
        timestamp: Date.now(),
        job: failedJob ?? undefined
      })
    } finally {
      this.activeJobs.delete(generationId)
    }
  }

  async submit(request: ImageStudioSubmitRequest): Promise<ImageStudioSubmitResult> {
    try {
      const providerConfig = await this.resolveProviderConfig(request.providerId)

      if (providerConfig.type === 'openrouter_seedream_placeholder') {
        return { success: false, error: PLACEHOLDER_ERROR }
      }

      // 允许 renderer 临时传入 apiKey（仅用于本次请求），避免配置读写竞态导致的“明明有 key 却提示为空”。
      // 注意：空字符串不应覆盖已保存的配置 key（否则会出现“明明保存了 key 仍提示为空”的偶发 bug）。
      const apiKeyFromRequest = typeof request.apiKey === 'string' ? request.apiKey.trim() : ''
      const apiKeyFromConfig = providerConfig.apiKey.trim()
      const apiKey = apiKeyFromRequest || apiKeyFromConfig
      if (!apiKey) {
        return { success: false, error: `请先填写 ${providerConfig.name} 的 API Key。` }
      }

      const config = await loadConfig()
      const options = mergeFalOptions(config.imageStudio, request.falSeedreamEditOptions)
      const inputSources = request.inputs ?? []
      const imageUrls = await this.normalizeInputUrls(inputSources)
      const prompt = request.prompt.trim()

      this.validateSubmitRequest(prompt, inputSources, imageUrls, options)

      const generationId = safeUuid()
      const provider = this.getProviderByType(providerConfig.type)

      const created = createImageGeneration({
        id: generationId,
        providerId: providerConfig.id,
        providerType: providerConfig.type,
        status: 'queued',
        prompt,
        inputSources: sanitizeInputSourcesForStorage(inputSources),
        requestOptions: options,
        logs: ['任务已创建，等待提交队列。']
      })

      this.emit({
        type: 'status',
        generationId,
        status: 'queued',
        timestamp: Date.now(),
        job: created
      })

      const context: ActiveJobContext = {
        generationId,
        abortController: new AbortController(),
        provider,
        providerType: providerConfig.type,
        apiKey,
        cancelRequested: false,
        seenLogs: new Set(created.logs)
      }

      this.activeJobs.set(generationId, context)

      void this.runJob({
        generationId,
        context,
        providerConfig,
        prompt,
        imageUrls,
        options
      })

      return {
        success: true,
        job: created
      }
    } catch (err) {
      return {
        success: false,
        error: toSafeErrorMessage(err)
      }
    }
  }

  async cancel(generationId: string): Promise<ImageStudioCancelResult> {
    const job = getImageGeneration(generationId)
    if (!job) return { success: false, error: '任务不存在。' }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return { success: true }
    }

    const context = this.activeJobs.get(generationId)

    try {
      const providerConfig = await this.resolveProviderConfig(job.providerId)
      const provider = this.getProviderByType(providerConfig.type)
      const apiKey = providerConfig.apiKey.trim()

      if (!apiKey) {
        throw new Error('当前供应商缺少 API Key，无法执行取消。')
      }

      if (job.cancelUrl) {
        await provider.cancel({ apiKey, cancelUrl: job.cancelUrl })
      }

      if (context) {
        context.cancelRequested = true
        context.abortController.abort()
      }

      await this.appendLog(generationId, '用户取消任务。')
      const cancelledJob = updateImageGeneration(generationId, {
        status: 'cancelled',
        errorMessage: null,
        finishedAt: Date.now()
      })

      this.emit({
        type: 'cancelled',
        generationId,
        status: 'cancelled',
        timestamp: Date.now(),
        job: cancelledJob ?? undefined
      })

      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: toSafeErrorMessage(err)
      }
    }
  }

  listHistory(request: ImageStudioListRequest): ImageStudioHistoryListResult {
    try {
      const jobs = listImageGenerations(request)
      return { success: true, jobs }
    } catch (err) {
      return { success: false, error: toSafeErrorMessage(err) }
    }
  }

  getHistory(generationId: string): ImageStudioHistoryGetResult {
    try {
      return { success: true, job: getImageGeneration(generationId) }
    } catch (err) {
      return { success: false, error: toSafeErrorMessage(err) }
    }
  }

  async deleteHistory(request: ImageStudioDeleteRequest): Promise<ImageStudioHistoryDeleteResult> {
    try {
      const job = getImageGeneration(request.generationId)
      if (!job) {
        return { success: false, error: '任务不存在。' }
      }

      if (request.deleteFiles) {
        for (const output of job.outputs) {
          if (!output.localPath) continue
          await rm(output.localPath, { force: true })
        }
      }

      deleteImageGeneration(request.generationId)
      return { success: true }
    } catch (err) {
      return { success: false, error: toSafeErrorMessage(err) }
    }
  }

  async deleteOutput(request: ImageStudioOutputDeleteRequest): Promise<ImageStudioOutputDeleteResult> {
    try {
      const output = getImageGenerationOutput(request.outputId)
      if (!output) {
        return { success: false, error: '输出不存在。' }
      }

      if (request.deleteFile && output.localPath) {
        await rm(output.localPath, { force: true })
      }

      deleteImageGenerationOutput(request.outputId)

      // 输出变更后，推送最新 outputs 给渲染进程，避免必须刷新历史。
      const job = getImageGeneration(output.generationId)
      if (job) {
        this.emit({
          type: 'outputs',
          generationId: job.id,
          outputs: job.outputs,
          timestamp: Date.now()
        })
      }

      return { success: true, job }
    } catch (err) {
      return { success: false, error: toSafeErrorMessage(err) }
    }
  }

  async retryHistory(request: ImageStudioRetryRequest): Promise<ImageStudioSubmitResult> {
    const history = getImageGeneration(request.generationId)
    if (!history) {
      return { success: false, error: '要重试的任务不存在。' }
    }

    return this.submit({
      providerId: history.providerId,
      prompt: history.prompt,
      inputs: history.inputSources,
      falSeedreamEditOptions: history.requestOptions
    })
  }
}

let imageStudioService: ImageStudioService | null = null

export function getImageStudioService(): ImageStudioService {
  if (!imageStudioService) {
    imageStudioService = new ImageStudioService()
  }
  return imageStudioService
}
