/**
 * Chat API Helper (main)
 * re-export shared 纯逻辑 + 仅保留 Node.js fs 依赖的 encodeBase64File
 */

import * as fs from 'fs'
import { mimeFromPath } from '../../../shared/chatApiHelper'

// 所有纯逻辑函数从 shared 层 re-export
export * from '../../../shared/chatApiHelper'

/**
 * 将文件编码为 base64（需要 Node.js fs，仅 Main 侧可用）
 */
export async function encodeBase64File(filePath: string, withPrefix = false): Promise<string> {
  const bytes = await fs.promises.readFile(filePath)
  const b64 = bytes.toString('base64')
  if (withPrefix) {
    const mime = mimeFromPath(filePath)
    return `data:${mime};base64,${b64}`
  }
  return b64
}
