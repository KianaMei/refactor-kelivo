import { app } from 'electron'
import { readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'

import { createDefaultConfig, normalizeConfig, type AppConfig } from '../shared/types'

function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

async function writeFileAtomic(targetPath: string, raw: string): Promise<void> {
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(tmpPath, raw, 'utf-8')
    // 用 rename 覆盖原文件，避免写入过程中被其它读操作读到“半截 JSON”。
    await rename(tmpPath, targetPath)
  } catch (err) {
    // 兜底：极端情况下（Windows 文件锁等）rename 可能失败；回退为普通写入。
    try {
      await writeFile(targetPath, raw, 'utf-8')
    } finally {
      // 尽力清理临时文件（忽略失败）。
      await rm(tmpPath, { force: true }).catch(() => undefined)
    }
  }
}

export async function loadConfig(): Promise<AppConfig> {
  const p = getConfigPath()
  try {
    const raw = await readFile(p, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizeConfig(parsed)
    // 自动修复/升级配置文件（避免 UI 因旧配置字段缺失而报错）
    const nextRaw = JSON.stringify(normalized, null, 2)
    if (raw.trim() !== nextRaw.trim()) {
      await writeFileAtomic(p, nextRaw)
    }
    return normalized
  } catch (err: any) {
    // 文件不存在/首次运行：返回默认配置
    if (err?.code === 'ENOENT') return createDefaultConfig()
    // 配置损坏：保守起见回退默认（后续可加“备份损坏文件”的策略）
    return createDefaultConfig()
  }
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  const normalized = normalizeConfig(cfg)
  const p = getConfigPath()
  const raw = JSON.stringify(normalized, null, 2)
  await writeFileAtomic(p, raw)
}

/**
 * 保存配置并返回最终落盘的标准化配置。
 * 说明：renderer 侧可能传入缺字段/旧版本对象，直接 setState 会造成 UI 访问 undefined 而白屏。
 */
export async function saveConfigAndReturn(cfg: AppConfig): Promise<AppConfig> {
  const normalized = normalizeConfig(cfg)
  const p = getConfigPath()
  const raw = JSON.stringify(normalized, null, 2)
  await writeFileAtomic(p, raw)
  return normalized
}
