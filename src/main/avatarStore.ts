import { app } from 'electron'
import { join, extname } from 'path'
import { mkdir, writeFile, unlink, readdir, readFile } from 'fs/promises'
import { createHash } from 'crypto'

function getAvatarDir(): string {
  return join(app.getPath('userData'), 'avatars', 'providers')
}

/**
 * 保存供应商头像到文件系统。
 * 返回相对路径（相对于 userData），用于存入 config。
 */
export async function saveProviderAvatar(
  providerId: string,
  base64DataUrl: string
): Promise<string> {
  const dir = getAvatarDir()
  await mkdir(dir, { recursive: true })

  // 从 data URL 解析出 buffer 和扩展名
  const match = base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!match) {
    throw new Error('Invalid base64 data URL')
  }
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
  const buffer = Buffer.from(match[2], 'base64')

  // 用内容哈希命名，避免重复
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 12)
  const filename = `${providerId}_${hash}.${ext}`
  const filepath = join(dir, filename)

  // 删除该供应商的旧头像
  await cleanProviderAvatars(providerId, filename)

  await writeFile(filepath, buffer)

  // 返回相对路径
  return `avatars/providers/${filename}`
}

/**
 * 删除指定供应商的所有头像文件。
 */
export async function deleteProviderAvatar(providerId: string): Promise<void> {
  await cleanProviderAvatars(providerId)
}

/**
 * 将相对路径解析为绝对路径。
 */
export function resolveAvatarPath(relativePath: string): string {
  return join(app.getPath('userData'), relativePath)
}

/**
 * 将相对路径解析为 data:image URL（供渲染进程直接使用）。
 * 避免 file:// URL 被浏览器安全策略拦截。
 */
export async function resolveAvatarAsDataUrl(relativePath: string): Promise<string | null> {
  const absPath = join(app.getPath('userData'), relativePath)
  try {
    const buf = await readFile(absPath)
    const ext = extname(absPath).slice(1).toLowerCase()
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext || 'png'
    return `data:image/${mime};base64,${buf.toString('base64')}`
  } catch {
    console.warn(`[avatar] 文件不存在: ${absPath}`)
    return null
  }
}

/**
 * 清理指定供应商的旧头像文件，可排除某个文件。
 */
async function cleanProviderAvatars(
  providerId: string,
  excludeFilename?: string
): Promise<void> {
  const dir = getAvatarDir()
  try {
    const files = await readdir(dir)
    const prefix = `${providerId}_`
    for (const f of files) {
      if (f.startsWith(prefix) && f !== excludeFilename) {
        await unlink(join(dir, f)).catch(() => {})
      }
    }
  } catch {
    // 目录不存在时忽略
  }
}
