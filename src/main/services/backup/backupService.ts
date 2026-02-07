import { app } from 'electron'
import { join, basename } from 'path'
import { existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs'
import { readFile, writeFile, mkdir, readdir, stat, copyFile } from 'fs/promises'
import { Readable } from 'stream'
import AdmZip from 'adm-zip'
import { loadConfig, saveConfig } from '../../configStore'
import type { WebDavConfig, BackupFileItem, RestoreMode, AppConfig, BackupWebdavProgress } from '../../../shared/types'

// ================== 备份文件名生成 ==================

function getBackupFileNameEpoch(): string {
  const epoch = Date.now()
  return `kelivo_backup_electron_${epoch}.zip`
}

function tryParseBackupTimestamp(filename: string): Date | null {
  // 格式1: kelivo_backup_<platform>_2025-01-19T12-34-56-123456Z.zip
  const isoMatch = filename.match(/kelivo_backup_\w+_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/i)
  if (isoMatch) {
    const parsed = new Date(isoMatch[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3'))
    if (!isNaN(parsed.getTime())) return parsed
  }
  // 格式2: kelivo_backup_<platform>_<epoch>.zip
  const epochMatch = filename.match(/kelivo_backup_\w+_(\d{13,})\.zip/i)
  if (epochMatch) {
    const epoch = parseInt(epochMatch[1], 10)
    if (!isNaN(epoch)) return new Date(epoch)
  }
  return null
}

// ================== 目录路径 ==================

function getDataPath(): string {
  return app.getPath('userData')
}

function getDbPath(): string {
  return join(getDataPath(), 'kelivo.db')
}

function getConfigPath(): string {
  return join(getDataPath(), 'config.json')
}

function getAvatarsDir(): string {
  return join(getDataPath(), 'avatars')
}

function getUploadDir(): string {
  return join(getDataPath(), 'upload')
}

function getImagesDir(): string {
  return join(getDataPath(), 'images')
}

// ================== WebDAV 工具函数 ==================

function buildAuthHeader(cfg: WebDavConfig): Record<string, string> {
  if (!cfg.username.trim()) return {}
  const token = Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')
  return { Authorization: `Basic ${token}` }
}

function buildCollectionUri(cfg: WebDavConfig): string {
  let base = cfg.url.trim()
  if (base.endsWith('/')) base = base.slice(0, -1)
  let pathPart = cfg.path.trim()
  if (pathPart && !pathPart.startsWith('/')) pathPart = '/' + pathPart
  return `${base}${pathPart}/`
}

function buildFileUri(cfg: WebDavConfig, childName: string): string {
  const base = buildCollectionUri(cfg)
  const child = childName.replace(/^\/+/, '')
  return `${base}${child}`
}

// ================== WebDAV 操作 ==================

async function ensureCollection(cfg: WebDavConfig): Promise<void> {
  const collectionUrl = buildCollectionUri(cfg)
  const headers = {
    ...buildAuthHeader(cfg),
    'Content-Type': 'application/xml; charset=utf-8',
    Depth: '0'
  }

  // 检查集合是否存在
  const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:displayname/></d:prop>
</d:propfind>`

  try {
    const res = await fetch(collectionUrl, {
      method: 'PROPFIND',
      headers,
      body: propfindBody
    })

    if (res.status === 404) {
      // 创建集合
      const mkcolRes = await fetch(collectionUrl, {
        method: 'MKCOL',
        headers: buildAuthHeader(cfg)
      })
      if (mkcolRes.status !== 201 && mkcolRes.status !== 200 && mkcolRes.status !== 405) {
        throw new Error(`MKCOL failed: ${mkcolRes.status}`)
      }
    } else if (res.status !== 207 && (res.status < 200 || res.status >= 300)) {
      throw new Error(`PROPFIND check failed: ${res.status}`)
    }
  } catch (err) {
    throw new Error(`WebDAV setup failed: ${err}`)
  }
}

export async function testWebdav(cfg: WebDavConfig): Promise<void> {
  const collectionUrl = buildCollectionUri(cfg)
  const headers = {
    ...buildAuthHeader(cfg),
    'Content-Type': 'application/xml; charset=utf-8',
    Depth: '1'
  }

  const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:displayname/></d:prop>
</d:propfind>`

  const res = await fetch(collectionUrl, {
    method: 'PROPFIND',
    headers,
    body: propfindBody
  })

  if (res.status !== 207 && (res.status < 200 || res.status >= 300)) {
    throw new Error(`WebDAV test failed: ${res.status}`)
  }
}

// ================== 本地备份导出 ==================

export async function exportLocalBackup(includeChats: boolean, includeFiles: boolean): Promise<Buffer> {
  const zip = new AdmZip()

  // 添加配置文件
  const configPath = getConfigPath()
  if (existsSync(configPath)) {
    zip.addLocalFile(configPath, '', 'config.json')
  }

  // 添加数据库
  if (includeChats) {
    const dbPath = getDbPath()
    if (existsSync(dbPath)) {
      zip.addLocalFile(dbPath, '', 'kelivo.db')
    }
  }

  // 添加文件目录
  if (includeFiles) {
    const avatarsDir = getAvatarsDir()
    if (existsSync(avatarsDir)) {
      zip.addLocalFolder(avatarsDir, 'avatars')
    }

    const uploadDir = getUploadDir()
    if (existsSync(uploadDir)) {
      zip.addLocalFolder(uploadDir, 'upload')
    }

    const imagesDir = getImagesDir()
    if (existsSync(imagesDir)) {
      zip.addLocalFolder(imagesDir, 'images')
    }
  }

  return zip.toBuffer()
}

// ================== 本地备份导入 ==================

export async function importLocalBackup(
  zipBuffer: Buffer,
  mode: RestoreMode,
  includeChats: boolean,
  includeFiles: boolean
): Promise<{ success: boolean; message: string }> {
  const tmpDir = app.getPath('temp')
  const extractDir = join(tmpDir, `kelivo_restore_${Date.now()}`)

  try {
    // 解压到临时目录
    const zip = new AdmZip(zipBuffer)
    zip.extractAllTo(extractDir, true)

    // 恢复配置
    const configSrc = join(extractDir, 'config.json')
    if (existsSync(configSrc)) {
      const importedConfig = JSON.parse(await readFile(configSrc, 'utf-8')) as Partial<AppConfig>

      if (mode === 'overwrite') {
        // 完全覆盖
        await writeFile(getConfigPath(), JSON.stringify(importedConfig, null, 2))
      } else {
        // 合并模式：只添加新的配置项
        const currentConfig = await loadConfig()
        const mergedConfig = mergeConfigs(currentConfig, importedConfig)
        await saveConfig(mergedConfig)
      }
    }

    // 恢复数据库
    if (includeChats) {
      const dbSrc = join(extractDir, 'kelivo.db')
      if (existsSync(dbSrc)) {
        const dbDst = getDbPath()
        if (mode === 'overwrite') {
          await copyFile(dbSrc, dbDst)
        }
        // 合并模式的数据库合并较复杂，暂时跳过
      }
    }

    // 恢复文件
    if (includeFiles) {
      await restoreDirectory(join(extractDir, 'avatars'), getAvatarsDir(), mode)
      await restoreDirectory(join(extractDir, 'upload'), getUploadDir(), mode)
      await restoreDirectory(join(extractDir, 'images'), getImagesDir(), mode)
    }

    // 清理临时文件
    try {
      rmSync(extractDir, { recursive: true })
    } catch {
      // ignore
    }

    return { success: true, message: '导入成功' }
  } catch (err) {
    // 清理临时文件
    try {
      rmSync(extractDir, { recursive: true })
    } catch {
      // ignore
    }
    throw err
  }
}

async function restoreDirectory(src: string, dst: string, mode: RestoreMode): Promise<void> {
  if (!existsSync(src)) return

  if (mode === 'overwrite') {
    // 先删除目标目录
    if (existsSync(dst)) {
      rmSync(dst, { recursive: true })
    }
  }

  // 确保目标目录存在
  await mkdir(dst, { recursive: true })

  // 递归复制
  await copyDirectoryRecursive(src, dst, mode)
}

async function copyDirectoryRecursive(src: string, dst: string, mode: RestoreMode): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const dstPath = join(dst, entry.name)

    if (entry.isDirectory()) {
      await mkdir(dstPath, { recursive: true })
      await copyDirectoryRecursive(srcPath, dstPath, mode)
    } else {
      // 合并模式下，只复制不存在的文件
      if (mode === 'merge' && existsSync(dstPath)) {
        continue
      }
      await copyFile(srcPath, dstPath)
    }
  }
}

function mergeConfigs(current: AppConfig, imported: Partial<AppConfig>): AppConfig {
  // 简单合并逻辑：保留当前配置，只合并导入配置中存在但当前不存在的项
  const merged = { ...current }

  // 合并供应商配置
  if (imported.providerConfigs) {
    merged.providerConfigs = { ...current.providerConfigs }
    for (const [id, config] of Object.entries(imported.providerConfigs)) {
      if (!merged.providerConfigs[id]) {
        merged.providerConfigs[id] = config
        if (!merged.providersOrder.includes(id)) {
          merged.providersOrder.push(id)
        }
      }
    }
  }

  // 合并助手配置
  if (imported.assistantConfigs) {
    merged.assistantConfigs = { ...current.assistantConfigs }
    for (const [id, config] of Object.entries(imported.assistantConfigs)) {
      if (!merged.assistantConfigs[id]) {
        merged.assistantConfigs[id] = config
        if (!merged.assistantsOrder.includes(id)) {
          merged.assistantsOrder.push(id)
        }
      }
    }
  }

  // 合并 MCP 服务器
  if (imported.mcpServers) {
    const existingIds = new Set(current.mcpServers.map((s) => s.id))
    for (const server of imported.mcpServers) {
      if (!existingIds.has(server.id)) {
        merged.mcpServers.push(server)
      }
    }
  }

  // 合并快捷短语
  if (imported.quickPhrases) {
    const existingIds = new Set(current.quickPhrases.map((p) => p.id))
    for (const phrase of imported.quickPhrases) {
      if (!existingIds.has(phrase.id)) {
        merged.quickPhrases.push(phrase)
      }
    }
  }

  return merged
}

// ================== WebDAV 备份 ==================

export async function backupToWebDav(
  cfg: WebDavConfig,
  onProgress?: (progress: BackupWebdavProgress) => void
): Promise<void> {
  console.log('[WebDAV Backup] Starting backup...')
  onProgress?.({ stage: 'prepare', percent: 5, message: '准备备份内容...' })

  // 准备备份文件
  const zipBuffer = await exportLocalBackup(cfg.includeChats, cfg.includeFiles)
  console.log(`[WebDAV Backup] Backup file prepared: ${zipBuffer.length} bytes`)
  onProgress?.({ stage: 'prepare', percent: 40, message: '备份文件已生成' })

  // 确保远程目录存在
  onProgress?.({ stage: 'ensureCollection', percent: 50, message: '检查远程目录...' })
  await ensureCollection(cfg)
  console.log('[WebDAV Backup] Collection ensured')
  onProgress?.({ stage: 'ensureCollection', percent: 58, message: '远程目录就绪' })

  // 上传文件
  const filename = getBackupFileNameEpoch()
  const targetUrl = buildFileUri(cfg, filename)
  console.log(`[WebDAV Backup] Target URL: ${targetUrl}`)

  let lastPercent = -1
  const uploadBody = Readable.from((async function* () {
    const total = zipBuffer.length || 1
    const chunkSize = 128 * 1024
    let sent = 0

    while (sent < zipBuffer.length) {
      const next = Math.min(sent + chunkSize, zipBuffer.length)
      const chunk = zipBuffer.subarray(sent, next)
      sent = next

      const percent = Math.min(95, Math.round(58 + (sent / total) * 37))
      if (percent !== lastPercent) {
        lastPercent = percent
        onProgress?.({
          stage: 'upload',
          percent,
          message: `正在上传 ${percent}%`
        })
      }

      yield chunk
    }
  })())

  const res = await fetch(targetUrl, {
    method: 'PUT',
    headers: {
      ...buildAuthHeader(cfg),
      'Content-Type': 'application/zip',
      'Content-Length': zipBuffer.length.toString()
    },
    body: uploadBody,
    duplex: 'half'
  })

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Upload failed: ${res.status}`)
  }

  onProgress?.({ stage: 'done', percent: 100, message: '备份完成' })
  console.log('[WebDAV Backup] Backup successful!')
}

// ================== WebDAV 列表 ==================

export async function listWebDavBackups(cfg: WebDavConfig): Promise<BackupFileItem[]> {
  await ensureCollection(cfg)

  const collectionUrl = buildCollectionUri(cfg)
  const headers = {
    ...buildAuthHeader(cfg),
    'Content-Type': 'application/xml; charset=utf-8',
    Depth: '1'
  }

  const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getlastmodified/>
    <d:getcontentlength/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`

  const res = await fetch(collectionUrl, {
    method: 'PROPFIND',
    headers,
    body: propfindBody
  })

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`PROPFIND failed: ${res.status}`)
  }

  const xml = await res.text()
  const items: BackupFileItem[] = []

  // 简单的 XML 解析
  const responseMatches = xml.match(/<d:response[^>]*>[\s\S]*?<\/d:response>/gi) || []

  for (const response of responseMatches) {
    const hrefMatch = response.match(/<d:href[^>]*>([^<]*)<\/d:href>/i)
    const displayNameMatch = response.match(/<d:displayname[^>]*>([^<]*)<\/d:displayname>/i)
    const sizeMatch = response.match(/<d:getcontentlength[^>]*>([^<]*)<\/d:getcontentlength>/i)
    const modifiedMatch = response.match(/<d:getlastmodified[^>]*>([^<]*)<\/d:getlastmodified>/i)
    const isCollection = /<d:collection\s*\/?>/i.test(response)

    if (!hrefMatch || isCollection) continue

    const href = hrefMatch[1]
    // 跳过集合本身
    if (href.endsWith('/')) continue

    const displayName = displayNameMatch?.[1] || basename(href)
    const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0
    let lastModified: string | null = null

    if (modifiedMatch) {
      const parsed = new Date(modifiedMatch[1])
      if (!isNaN(parsed.getTime())) {
        lastModified = parsed.toISOString()
      }
    }

    // 从文件名解析时间戳
    if (!lastModified) {
      const parsed = tryParseBackupTimestamp(displayName)
      if (parsed) {
        lastModified = parsed.toISOString()
      }
    }

    // 构建完整 URL
    const fullHref = href.startsWith('http') ? href : new URL(href, collectionUrl).toString()

    items.push({
      href: fullHref,
      displayName,
      size,
      lastModified
    })
  }

  // 按时间倒序排列
  items.sort((a, b) => {
    const ta = a.lastModified ? new Date(a.lastModified).getTime() : 0
    const tb = b.lastModified ? new Date(b.lastModified).getTime() : 0
    return tb - ta
  })

  return items
}

// ================== WebDAV 恢复 ==================

export async function restoreFromWebDav(
  cfg: WebDavConfig,
  item: BackupFileItem,
  mode: RestoreMode
): Promise<{ success: boolean; message: string }> {
  console.log(`[WebDAV Restore] Downloading: ${item.href}`)

  const res = await fetch(item.href, {
    method: 'GET',
    headers: buildAuthHeader(cfg)
  })

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Download failed: ${res.status}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  console.log(`[WebDAV Restore] Downloaded: ${buffer.length} bytes`)

  return importLocalBackup(buffer, mode, cfg.includeChats, cfg.includeFiles)
}

// ================== WebDAV 删除 ==================

export async function deleteWebDavBackup(cfg: WebDavConfig, item: BackupFileItem): Promise<void> {
  const res = await fetch(item.href, {
    method: 'DELETE',
    headers: buildAuthHeader(cfg)
  })

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Delete failed: ${res.status}`)
  }
}

// ================== 清除数据 ==================

export async function clearAllData(): Promise<void> {
  // 清除文件目录
  const dirs = [getAvatarsDir(), getUploadDir(), getImagesDir()]
  for (const dir of dirs) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true })
    }
  }

  console.log('[Clear Data] Data directories cleared. Database clearing requires app restart.')
}

// ================== 导出 ==================

export { getDataPath }
