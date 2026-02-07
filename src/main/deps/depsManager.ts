import { mkdir, readFile, rm, writeFile, rename } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { app } from 'electron'
import { createRequire } from 'module'

import type { AppConfig } from '../../shared/types'
import type { DepsInstallParams, DepsProgressEvent, DepsSdkProvider, DepsStatusResult } from '../../shared/deps'

const LAST_ERROR: Record<DepsSdkProvider, string | null> = { claude: null, codex: null }
const require = createRequire(import.meta.url)

function sdkDirName(sdk: DepsSdkProvider): string {
  return sdk === 'claude' ? 'claude-sdk' : 'codex-sdk'
}

function sdkPackageName(sdk: DepsSdkProvider): string {
  return sdk === 'claude' ? '@anthropic-ai/claude-agent-sdk' : '@openai/codex-sdk'
}

function defaultDepsRoot(): string {
  return join(app.getPath('userData'), 'dependencies')
}

export function resolveDepsRoot(cfg: AppConfig): string {
  const v = cfg.agentRuntime?.depsInstallDir
  if (typeof v === 'string' && v.trim()) return v.trim()
  return defaultDepsRoot()
}

function externalSdkDir(depsRoot: string, sdk: DepsSdkProvider): string {
  return join(depsRoot, sdkDirName(sdk))
}

async function readJsonFile(path: string): Promise<any> {
  const txt = await readFile(path, 'utf8')
  return JSON.parse(txt)
}

async function getExternalVersion(depsRoot: string, sdk: DepsSdkProvider): Promise<string | null> {
  const pkg = sdkPackageName(sdk)
  const p = join(externalSdkDir(depsRoot, sdk), 'node_modules', pkg, 'package.json')
  if (!existsSync(p)) return null
  try {
    const j = await readJsonFile(p)
    return typeof j.version === 'string' ? j.version : null
  } catch {
    return null
  }
}

async function getBundledVersion(sdk: DepsSdkProvider): Promise<string | null> {
  const pkg = sdkPackageName(sdk)
  // 开发态：node_modules 在项目根；打包态：可能在 app.asar / app.asar.unpacked
  const candidates: string[] = [
    process.cwd(),
    app.getAppPath(),
    process.resourcesPath,
    join(process.resourcesPath, 'app.asar'),
    join(process.resourcesPath, 'app.asar.unpacked')
  ]

  for (const base of candidates) {
    try {
      const resolved = require.resolve(`${pkg}/package.json`, { paths: [base] })
      const j = await readJsonFile(resolved)
      return typeof j.version === 'string' ? j.version : null
    } catch {
      // ignore
    }
  }

  try {
    const resolved = require.resolve(`${pkg}/package.json`)
    const j = await readJsonFile(resolved)
    return typeof j.version === 'string' ? j.version : null
  } catch {
    return null
  }
}

export async function getDepsStatus(cfg: AppConfig): Promise<DepsStatusResult> {
  const depsRoot = resolveDepsRoot(cfg)
  const useExternal = !!cfg.agentRuntime?.deps?.useExternal

  const [claudeBundled, codexBundled, claudeExternal, codexExternal] = await Promise.all([
    getBundledVersion('claude'),
    getBundledVersion('codex'),
    getExternalVersion(depsRoot, 'claude'),
    getExternalVersion(depsRoot, 'codex')
  ])

  const claudeActiveSource =
    useExternal && claudeExternal ? 'external' : claudeBundled ? 'bundled' : 'none'
  const codexActiveSource =
    useExternal && codexExternal ? 'external' : codexBundled ? 'bundled' : 'none'

  return {
    depsRoot,
    useExternal,
    claude: {
      bundled: { available: !!claudeBundled, version: claudeBundled },
      external: { available: !!claudeExternal, version: claudeExternal, dir: externalSdkDir(depsRoot, 'claude') },
      activeSource: claudeActiveSource,
      lastError: LAST_ERROR.claude
    },
    codex: {
      bundled: { available: !!codexBundled, version: codexBundled },
      external: { available: !!codexExternal, version: codexExternal, dir: externalSdkDir(depsRoot, 'codex') },
      activeSource: codexActiveSource,
      lastError: LAST_ERROR.codex
    }
  }
}

async function validateExternalInstall(dir: string, sdk: DepsSdkProvider): Promise<void> {
  const pkg = sdkPackageName(sdk)
  const pkgJsonPath = join(dir, 'node_modules', pkg, 'package.json')
  if (!existsSync(pkgJsonPath)) throw new Error(`安装验证失败：未找到 ${pkg}/package.json`)

  // 额外验证：尝试动态 import 入口（更接近 bridge 的真实加载）
  const entry = require.resolve(pkg, { paths: [dir] })
  await import(pathToFileURL(entry).href)
}

export async function installSdk(
  cfg: AppConfig,
  params: DepsInstallParams,
  onProgress?: (evt: DepsProgressEvent) => void
): Promise<void> {
  const sdk = params.sdk
  const versionSpec = String(params.versionSpec ?? '').trim() || 'latest'
  const depsRoot = resolveDepsRoot(cfg)
  const destDir = externalSdkDir(depsRoot, sdk)
  const pkg = sdkPackageName(sdk)

  LAST_ERROR[sdk] = null

  const tmpRoot = join(depsRoot, '.tmp')
  const tmpDir = join(tmpRoot, `${sdkDirName(sdk)}_${Date.now()}_${Math.random().toString(16).slice(2)}`)
  const tmpSdkDir = join(tmpDir, sdkDirName(sdk))

  const emit = (phase: DepsProgressEvent['phase'], message: string) => {
    onProgress?.({ sdk, phase, message })
  }

  emit('prepare', `准备安装：${pkg}@${versionSpec}`)
  await mkdir(tmpSdkDir, { recursive: true })

  // 写入最小 package.json（claude-sdk 需要 zod 作为 peer 依赖，外置安装时一起带上）
  const deps: Record<string, string> = { [pkg]: versionSpec }
  if (sdk === 'claude') deps['zod'] = '^3.24.1'

  await writeFile(join(tmpSdkDir, 'package.json'), JSON.stringify({
    name: `kelivo-${sdk}-sdk`,
    private: true,
    dependencies: deps
  }, null, 2), 'utf8')

  emit('download', '下载并安装依赖中…')
  const ArboristMod = require('@npmcli/arborist') as any
  const ArboristCtor = ArboristMod?.default ?? ArboristMod
  const arb = new ArboristCtor({ path: tmpSdkDir })
  await arb.reify()

  emit('verify', '验证安装结果…')
  await validateExternalInstall(tmpSdkDir, sdk)

  emit('activate', '切换到新版本（原子替换）…')
  await mkdir(depsRoot, { recursive: true })
  await rm(destDir, { recursive: true, force: true })
  await rename(tmpSdkDir, destDir)
  await rm(tmpDir, { recursive: true, force: true })

  emit('done', `安装完成：${pkg}@${versionSpec}`)
}

export async function uninstallSdk(
  cfg: AppConfig,
  sdk: DepsSdkProvider,
  onProgress?: (evt: DepsProgressEvent) => void
): Promise<void> {
  const depsRoot = resolveDepsRoot(cfg)
  const dir = externalSdkDir(depsRoot, sdk)

  LAST_ERROR[sdk] = null

  const emit = (phase: DepsProgressEvent['phase'], message: string) => onProgress?.({ sdk, phase, message })

  emit('prepare', '准备卸载…')
  await rm(dir, { recursive: true, force: true })
  emit('done', '已卸载外置 SDK（将自动回退到内置版本）')
}

export function setLastError(sdk: DepsSdkProvider, err: unknown): void {
  LAST_ERROR[sdk] = err instanceof Error ? err.message : String(err)
}
