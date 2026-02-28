import { app, nativeImage } from 'electron'
import { join, extname } from 'path'
import { readdir, stat, rm, mkdir, writeFile, access } from 'fs/promises'
import { createHash } from 'crypto'
import { getDb } from '../../db/database'
import type { StorageReport, StorageCategory, StorageItem, StorageCategoryKey, StorageItemDetail } from '../../../shared/types'

const THUMB_SIZE = 400
const THUMB_DIR_NAME = '.thumbnails'
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg'])

function getThumbnailDir(): string {
    return join(app.getPath('userData'), THUMB_DIR_NAME)
}

function thumbName(filePath: string): string {
    const hash = createHash('md5').update(`${filePath}:${THUMB_SIZE}:92`).digest('hex')
    return `${hash}.jpg`
}

async function fileExists(p: string): Promise<boolean> {
    try { await access(p); return true } catch { return false }
}

async function ensureThumbnail(filePath: string): Promise<string | undefined> {
    const ext = extname(filePath).toLowerCase()
    if (!IMAGE_EXTS.has(ext)) return undefined

    const thumbDir = getThumbnailDir()
    const thumbPath = join(thumbDir, thumbName(filePath))

    if (await fileExists(thumbPath)) return thumbPath

    try {
        await mkdir(thumbDir, { recursive: true })
        const img = nativeImage.createFromPath(filePath)
        if (img.isEmpty()) return undefined

        const { width, height } = img.getSize()
        if (width <= THUMB_SIZE && height <= THUMB_SIZE) return undefined // 原图已经很小

        const scale = Math.min(THUMB_SIZE / width, THUMB_SIZE / height)
        const resized = img.resize({
            width: Math.round(width * scale),
            height: Math.round(height * scale),
            quality: 'good'
        })
        const buf = resized.toJPEG(92)
        await writeFile(thumbPath, buf)
        return thumbPath
    } catch {
        return undefined
    }
}

// 辅助函数：计算目录大小
async function getDirSize(dirPath: string): Promise<number> {
    let size = 0
    try {
        const files = await readdir(dirPath)
        for (const file of files) {
            const filePath = join(dirPath, file)
            const stats = await stat(filePath)
            if (stats.isDirectory()) {
                size += await getDirSize(filePath)
            } else {
                size += stats.size
            }
        }
    } catch (err) {
        // 忽略目录不存在或其他错误
    }
    return size
}

// 辅助函数：清空目录
async function clearDir(dirPath: string, exclude: string[] = []): Promise<void> {
    try {
        const files = await readdir(dirPath)
        for (const file of files) {
            if (exclude.includes(file)) continue
            const filePath = join(dirPath, file)
            await rm(filePath, { recursive: true, force: true })
        }
    } catch (err) {
        // 忽略错误
    }
}

export async function getStorageReport(): Promise<StorageReport> {
    const userData = app.getPath('userData')
    const db = getDb()

    // 1. 数据库统计
    const dbPath = join(userData, 'kelivo.db')
    let dbSize = 0
    try {
        dbSize = (await stat(dbPath)).size
    } catch { }

    // 统计记录数
    const msgCount = (db.prepare('SELECT COUNT(*) as c FROM messages').get() as { c: number }).c
    const convCount = (db.prepare('SELECT COUNT(*) as c FROM conversations').get() as { c: number }).c

    // 检查 migrations 发现 assistant_memories 表存在
    const memoryCount = (db.prepare('SELECT COUNT(*) as c FROM assistant_memories').get() as { c: number }).c

    // 2. 文件统计
    const avatarDir = join(userData, 'avatars')
    const avatarSize = await getDirSize(avatarDir)
    const generatedDir = join(userData, 'images', 'generated')
    const generatedSize = await getDirSize(generatedDir)

    const logsDir = join(userData, 'logs') // 假设日志在这里，或者 electron-log 的默认位置
    const logsSize = await getDirSize(logsDir)

    // 缓存目录 (Electron 默认 cache: user/AppData/Local/kelivo/Cache or similar)
    // 注意：'cache' 是合法的 electron path name，但可能不在 TS 定义中？
    // 实际上 Electron app.getPath('cache') 是存在的。
    // 如果 TS 报错，可能是类型定义问题。这里尝试用 userData 下的 cache 目录代替，或者以此修正。
    // 但为了稳妥，我们暂时只统计 userData 下的特定缓存目录（如图片缓存）
    // 或者使用 any 绕过 TS 检查，如果确定运行时支持。
    // 这里改为统计 userData 下的 'Cache' 目录（Electron 默认存放处）
    const cacheDir = join(userData, 'Cache')
    const cacheSize = await getDirSize(cacheDir)

    // 构建报告
    const categories: StorageCategory[] = [
        {
            key: 'chatData',
            name: '聊天数据',
            size: dbSize, // 简单地将数据库大小归为聊天数据（虽然也包含其他配置）
            items: [
                { id: 'messages', name: '消息记录', size: dbSize * 0.8, count: msgCount }, // 估算占比
                { id: 'conversations', name: '对话列表', size: dbSize * 0.1, count: convCount },
                { id: 'db_file', name: '数据库文件', size: dbSize, clearable: false }
            ]
        },
        {
            key: 'images',
            name: 'Images',
            size: avatarSize + generatedSize,
            items: [
                { id: 'avatars', name: 'Avatars', size: avatarSize, clearable: true },
                { id: 'generated', name: 'Generated Images', size: generatedSize, clearable: true }
            ]
        },
        {
            key: 'logs',
            name: '日志',
            size: logsSize,
            items: [
                { id: 'app_logs', name: '应用日志', size: logsSize, clearable: true }
            ]
        },
        {
            key: 'cache',
            name: '缓存',
            size: cacheSize,
            items: [
                { id: 'app_cache', name: '应用缓存', size: cacheSize, clearable: true }
            ]
        },
        // 占位，避免前端报错
        { key: 'files', name: '文件', size: 0, items: [] },
        { key: 'assistantData', name: '助手数据', size: 0, items: [{ id: 'memories', name: '记忆', size: 0, count: memoryCount }] },
        { key: 'other', name: '其他', size: 0, items: [] }
    ]

    const total = categories.reduce((sum, c) => sum + c.size, 0)

    return { total, categories }
}

export async function clearStorageItem(categoryKey: StorageCategoryKey, itemId: string | null): Promise<void> {
    const userData = app.getPath('userData')

    if (categoryKey === 'logs') {
        const logsDir = join(userData, 'logs')
        await clearDir(logsDir)
    } else if (categoryKey === 'cache') {
        const cacheDir = join(userData, 'Cache')
        await clearDir(cacheDir)
    } else if (categoryKey === 'images') {
        if (itemId === 'avatars' || itemId === null) {
            const avatarDir = join(userData, 'avatars')
            await clearDir(avatarDir)
        }
        if (itemId === 'generated' || itemId === null) {
            const generatedDir = join(userData, 'images', 'generated')
            await clearDir(generatedDir)
        }
    }

    // 数据库清理比较复杂，通常不做物理删除，或者执行 VACUUM
    if (categoryKey === 'chatData' && itemId === null) {
        // 危险操作：清空消息？暂时仅支持 VACUUM
        const db = getDb()
        db.exec('VACUUM')
    }
}

// Helper to get all files recursively
async function getAllFiles(dirPath: string): Promise<StorageItemDetail[]> {
    let results: StorageItemDetail[] = []
    try {
        const files = await readdir(dirPath)
        for (const file of files) {
            const filePath = join(dirPath, file)
            const stats = await stat(filePath)
            if (stats.isDirectory()) {
                results = results.concat(await getAllFiles(filePath))
            } else if (stats.isFile()) {
                let kind: 'avatar' | 'chat' | 'generated' | 'other' = 'other'
                if (filePath.includes('avatars') && filePath.includes('providers')) {
                    kind = 'avatar'
                } else if (filePath.includes('images') && filePath.includes('generated')) {
                    kind = 'generated'
                } else if (filePath.includes('uploads') || filePath.includes('chat')) { // Future proofing
                    kind = 'chat'
                }

                results.push({
                    name: file,
                    path: filePath,
                    size: stats.size,
                    modifiedAt: stats.mtimeMs,
                    kind
                })
            }
        }
    } catch { }
    return results
}

// 获取详情列表（文件级）
export async function getStorageCategoryItems(categoryKey: string): Promise<StorageItemDetail[]> {
    const userData = app.getPath('userData')

    if (categoryKey === 'logs') {
        let targetDir = ''
        const logsPath = app.getPath('logs')
        try {
            const stats = await stat(logsPath)
            if (stats.isDirectory()) {
                targetDir = logsPath
            }
        } catch {
            targetDir = join(userData, 'logs')
        }

        try {
            const result = await getAllFiles(targetDir)
            return result.sort((a, b) => b.modifiedAt - a.modifiedAt)
        } catch {
            return []
        }
    }

    if (categoryKey === 'images') {
        const avatarDir = join(userData, 'avatars')
        const generatedDir = join(userData, 'images', 'generated')
        const avatarItems = (await getAllFiles(avatarDir)).map(i => ({ ...i, kind: 'avatar' as const }))
        const generatedItems = (await getAllFiles(generatedDir)).map(i => ({ ...i, kind: 'generated' as const }))
        const allItems = [...avatarItems, ...generatedItems].sort((a, b) => b.modifiedAt - a.modifiedAt)

        // 并发生成缩略图（限制并发数避免阻塞）
        const BATCH = 8
        for (let i = 0; i < allItems.length; i += BATCH) {
            const batch = allItems.slice(i, i + BATCH)
            const thumbs = await Promise.all(batch.map(item => ensureThumbnail(item.path)))
            for (let j = 0; j < batch.length; j++) {
                if (thumbs[j]) batch[j].thumbnailPath = thumbs[j]
            }
        }

        return allItems
    }

    return []
}

// 批量删除
export async function deleteStorageItems(paths: string[]): Promise<void> {
    for (const p of paths) {
        try {
            await rm(p, { force: true })
        } catch { }
    }
}
