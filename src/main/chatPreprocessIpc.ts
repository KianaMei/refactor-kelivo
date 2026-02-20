/**
 * Chat Preprocess IPC Handler
 * 在 Main 进程中预处理图片文件：读取本地文件并编码为 base64
 * 返回 UserImage[] 供 Renderer 进程直接使用
 */

import { ipcMain } from 'electron'
import { IpcChannel } from '../shared/ipc'
import { encodeBase64File, mimeFromPath } from './api/helpers/chatApiHelper'

export interface PreprocessImageParams {
  /** 本地文件路径列表 */
  imagePaths: string[]
}

export interface PreprocessImageResult {
  /** 预编码的图片数据 */
  images: Array<{ mime: string; base64: string }>
}

export function registerChatPreprocessIpc(): void {
  ipcMain.handle(
    IpcChannel.ChatPreprocess,
    async (_event, params: PreprocessImageParams): Promise<PreprocessImageResult> => {
      const { imagePaths } = params
      if (!imagePaths || imagePaths.length === 0) {
        return { images: [] }
      }

      const images: Array<{ mime: string; base64: string }> = []

      for (const p of imagePaths) {
        // 跳过 URL 和 data URL（这些 Renderer 可以直接使用）
        if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) {
          continue
        }

        try {
          const mime = mimeFromPath(p)
          const base64 = await encodeBase64File(p, false)
          images.push({ mime, base64 })
        } catch (err) {
          console.warn('[ChatPreprocess] Failed to encode image:', p, err)
        }
      }

      return { images }
    }
  )
}
