/**
 * OCR IPC
 * 将 OCR 服务通过 IPC 暴露给 renderer 进程
 */

import { ipcMain } from 'electron'
import { getOcrService, runOcr, OcrService } from './services/ocrService'
import { loadConfig } from './configStore'
import { IpcChannel } from '../shared/ipc'
import { type OcrRunRequest, type OcrRunResult } from '../shared/ocr'
export { type OcrRunRequest, type OcrRunResult }

/**
 * 注册 OCR IPC 处理器
 */
export function registerOcrIpc(): void {
  const ocrService = getOcrService()

  // 执行 OCR
  ipcMain.handle(IpcChannel.OcrRun, async (_event, request: OcrRunRequest): Promise<OcrRunResult> => {
    const { imagePaths, providerId, modelId, prompt, useCache = true } = request

    if (!imagePaths || imagePaths.length === 0) {
      return { success: false, error: 'No image paths provided' }
    }

    // 检查缓存 (仅单图片时)
    if (useCache && imagePaths.length === 1) {
      const cached = ocrService.getCached(imagePaths[0])
      if (cached) {
        return { success: true, text: cached }
      }
    }

    try {
      // 获取配置
      const appConfig = await loadConfig()

      // 确定 provider 和 model
      const effectiveProviderId = providerId ?? appConfig.ocrModelProvider
      const effectiveModelId = modelId ?? appConfig.ocrModelId

      if (!effectiveProviderId || !effectiveModelId) {
        return { success: false, error: 'OCR provider or model not configured' }
      }

      const providerConfig = appConfig.providerConfigs[effectiveProviderId]
      if (!providerConfig) {
        return { success: false, error: `Provider not found: ${effectiveProviderId}` }
      }

      // 执行 OCR (使用默认 OCR 提示词)
      const text = await runOcr({
        imagePaths,
        providerConfig,
        modelId: effectiveModelId,
        prompt
      })

      if (text) {
        // 缓存结果 (仅单图片时)
        if (useCache && imagePaths.length === 1) {
          ocrService.setCache(imagePaths[0], text)
        }
        return { success: true, text }
      } else {
        return { success: false, error: 'OCR returned no text' }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 获取缓存
  ipcMain.handle(IpcChannel.OcrGetCached, (_event, imagePath: string): string | null => {
    return ocrService.getCached(imagePath)
  })

  // 设置缓存
  ipcMain.handle(IpcChannel.OcrSetCache, (_event, imagePath: string, text: string): void => {
    ocrService.setCache(imagePath, text)
  })

  // 清空缓存
  ipcMain.handle(IpcChannel.OcrClearCache, (): void => {
    ocrService.clearCache()
  })

  // 获取缓存大小
  ipcMain.handle(IpcChannel.OcrGetCacheSize, (): number => {
    return ocrService.getCacheSize()
  })
}

/**
 * OCR preload API 类型定义
 */
export interface OcrPreloadApi {
  run: (request: OcrRunRequest) => Promise<OcrRunResult>
  getCached: (imagePath: string) => Promise<string | null>
  setCache: (imagePath: string, text: string) => Promise<void>
  clearCache: () => Promise<void>
  getCacheSize: () => Promise<number>
  wrapOcrBlock: (text: string) => string
}

/**
 * 创建 preload API 实现
 * 用于在 preload.ts 中暴露给 renderer
 */
export function createOcrPreloadApi(ipcRenderer: Electron.IpcRenderer): OcrPreloadApi {
  return {
    run: (request) => ipcRenderer.invoke(IpcChannel.OcrRun, request),
    getCached: (imagePath) => ipcRenderer.invoke(IpcChannel.OcrGetCached, imagePath),
    setCache: (imagePath, text) => ipcRenderer.invoke(IpcChannel.OcrSetCache, imagePath, text),
    clearCache: () => ipcRenderer.invoke(IpcChannel.OcrClearCache),
    getCacheSize: () => ipcRenderer.invoke(IpcChannel.OcrGetCacheSize),
    wrapOcrBlock: OcrService.wrapOcrBlock
  }
}
