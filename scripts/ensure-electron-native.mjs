import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function logInfo(msg) {
  // eslint-disable-next-line no-console
  console.log(`[native] ${msg}`)
}

function logWarn(msg) {
  // eslint-disable-next-line no-console
  console.warn(`[native] ${msg}`)
}

function logError(msg) {
  // eslint-disable-next-line no-console
  console.error(`[native] ${msg}`)
}

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function getProjectRoot() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  return path.resolve(__dirname, '..')
}

function getElectronInfo(projectRoot) {
  const pkgPath = path.join(projectRoot, 'node_modules', 'electron', 'package.json')
  if (!existsSync(pkgPath)) return null
  const version = readJson(pkgPath).version

  const distDir = path.join(projectRoot, 'node_modules', 'electron', 'dist')
  const binPath =
    process.platform === 'win32'
      ? path.join(distDir, 'electron.exe')
      : path.join(distDir, 'electron')

  if (!existsSync(binPath)) return null
  return { version, binPath }
}

function runElectronNodeEval({ binPath, projectRoot }, code) {
  const result = spawnSync(binPath, ['-e', code], {
    cwd: projectRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const stdout = String(result.stdout ?? '').trim()
  const stderr = String(result.stderr ?? '').trim()
  return { status: result.status ?? 0, stdout, stderr }
}

function checkBetterSqlite3(electronInfo, projectRoot) {
  const versions = runElectronNodeEval(
    { ...electronInfo, projectRoot },
    "console.log(JSON.stringify(process.versions))"
  )
  if (versions.status === 0 && versions.stdout) {
    try {
      const parsed = JSON.parse(versions.stdout)
      const abi = parsed?.modules ? String(parsed.modules) : 'unknown'
      logInfo(`Electron ${parsed?.electron ?? 'unknown'} / Node ${parsed?.node ?? 'unknown'} / ABI ${abi}`)
    } catch { }
  }

  const test = runElectronNodeEval(
    { ...electronInfo, projectRoot },
    "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.close(); console.log('ok')"
  )
  if (test.status === 0) return { ok: true, detail: test.stdout || 'ok' }
  return { ok: false, detail: (test.stderr || test.stdout || 'unknown error').slice(0, 2000) }
}

async function rebuildBetterSqlite3ForElectron(electronInfo, projectRoot) {
  logInfo(`开始重建 better-sqlite3（target Electron ${electronInfo.version}）…`)

  // 优先使用 @electron/rebuild（更稳定，不依赖 npm 的 “未知 config” 行为）
  try {
    const { rebuild } = await import('@electron/rebuild')
    await rebuild({
      buildPath: projectRoot,
      electronVersion: electronInfo.version,
      onlyModules: ['better-sqlite3'],
      force: true
    })
    return
  } catch (e) {
    logWarn(`@electron/rebuild 不可用或执行失败，回退到 npm rebuild：${String(e?.message ?? e)}`)
  }

  // 兜底：npm rebuild（当前 npm 会对 runtime/target/disturl 打 warning，但仍可用）
  const npmCmd = getNpmCommand()
  const env = {
    ...process.env,
    npm_config_runtime: 'electron',
    npm_config_target: electronInfo.version,
    npm_config_disturl: 'https://electronjs.org/headers'
  }

  const result = spawnSync(npmCmd, ['rebuild', 'better-sqlite3'], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    // Windows 下 npm 是 .cmd，需要通过 shell 执行
    shell: process.platform === 'win32'
  })

  if (result.error) {
    throw new Error(`调用 npm 失败：${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`npm rebuild 失败（exit=${result.status ?? 'null'}）`)
  }
}

async function main() {
  const projectRoot = getProjectRoot()
  const args = new Set(process.argv.slice(2))
  const checkOnly = args.has('--check-only')
  const forceRebuild = args.has('--rebuild') || args.has('--force')

  const electronInfo = getElectronInfo(projectRoot)
  if (!electronInfo) {
    logWarn('未检测到本地 electron（可能尚未安装依赖），跳过原生依赖检查。')
    return
  }

  const betterSqlite3Pkg = path.join(projectRoot, 'node_modules', 'better-sqlite3', 'package.json')
  if (!existsSync(betterSqlite3Pkg)) {
    logWarn('未检测到 better-sqlite3，跳过原生依赖检查。')
    return
  }

  logInfo('检查 Electron 原生依赖：better-sqlite3')
  const first = checkBetterSqlite3(electronInfo, projectRoot)
  if (first.ok && !forceRebuild) {
    logInfo('better-sqlite3 已可在 Electron 中加载。')
    return
  }

  if (checkOnly) {
    logError(`better-sqlite3 在 Electron 中不可用：${first.detail}`)
    process.exitCode = 1
    return
  }

  try {
    await rebuildBetterSqlite3ForElectron(electronInfo, projectRoot)
  } catch (e) {
    logError(String(e?.message ?? e))
    logError('如果是编译失败：请确认已安装 Windows C++ Build Tools（或使用可下载到 prebuild 的网络环境）。')
    process.exitCode = 1
    return
  }

  const second = checkBetterSqlite3(electronInfo, projectRoot)
  if (!second.ok) {
    logError(`重建后仍不可用：${second.detail}`)
    process.exitCode = 1
    return
  }

  logInfo('重建完成：better-sqlite3 已可在 Electron 中加载。')
}

main().catch((e) => {
  logError(String(e?.message ?? e))
  process.exitCode = 1
})
