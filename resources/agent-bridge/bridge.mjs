/**
 * Kelivo Agent Bridge (Protocol v1)
 *
 * 约束：
 * - stdout：只输出 JSON-RPC（每行一个 JSON）
 * - stderr：调试日志（禁止输出 apiKey/baseUrl 原文）
 *
 * 入口：
 * - Electron main 通过：spawn(process.execPath, [bridge.mjs], env.ELECTRON_RUN_AS_NODE=1)
 */

import { createInterface } from 'node:readline'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'

const BRIDGE_VERSION = '1.0.0'
const PROTOCOL_VERSION = 1

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** @type {AbortController|null} */
let currentAbortController = null
/** @type {{ runId: string, sdkProvider: string, resumeId: string|null } | null} */
let currentRun = null

/** @type {Map<string, { resolve: Function, reject: Function, timeout: NodeJS.Timeout }>} */
const pendingPermissions = new Map()

let externalDepsDir = null

function stderrInfo(msg, extra) {
  const suffix = extra ? ` ${extra}` : ''
  // 只写 stderr，避免污染 stdout 协议流
  process.stderr.write(`[agent-bridge] ${msg}${suffix}\n`)
}

function safePreview(v, maxChars = 500) {
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    if (!s) return ''
    if (s.length <= maxChars) return s
    return `${s.slice(0, maxChars)}…(truncated)`
  } catch {
    return ''
  }
}

function isTruthyEnvValue(v) {
  if (typeof v !== 'string') return false
  const s = v.trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

function isBridgeDebugEnabled(env = process.env) {
  return isTruthyEnvValue(env?.KELIVO_AGENT_BRIDGE_DEBUG) || isTruthyEnvValue(env?.KELIVO_BRIDGE_DEBUG)
}

function trimEnvValue(v) {
  return typeof v === 'string' ? v.trim() : ''
}

function resolveUserHomeFromEnv(env) {
  const fromKelivo = trimEnvValue(env?.KELIVO_HOME_DIR)
  if (fromKelivo) return fromKelivo

  const fromUserProfile = trimEnvValue(env?.USERPROFILE)
  if (fromUserProfile) return fromUserProfile

  const fromHome = trimEnvValue(env?.HOME)
  if (fromHome) return fromHome

  const drive = trimEnvValue(env?.HOMEDRIVE)
  const homePath = trimEnvValue(env?.HOMEPATH)
  if (drive && homePath) return `${drive}${homePath}`

  try {
    return homedir()
  } catch {
    return ''
  }
}

function resolveClaudeConfigDir(env, homeDir) {
  /** @type {string[]} */
  const candidates = []
  const add = (v) => {
    const s = trimEnvValue(v)
    if (!s) return
    if (candidates.includes(s)) return
    candidates.push(s)
  }

  // 用户显式指定优先（但如果路径不存在，则忽略以避免误导）
  const fromEnv = trimEnvValue(env?.CLAUDE_CONFIG_DIR)
  if (fromEnv) {
    try {
      if (existsSync(fromEnv)) add(fromEnv)
    } catch { }
  }

  if (homeDir) add(join(homeDir, '.claude'))

  const userProfile = trimEnvValue(env?.USERPROFILE)
  if (userProfile) add(join(userProfile, '.claude'))

  const home = trimEnvValue(env?.HOME)
  if (home) add(join(home, '.claude'))

  try {
    add(join(homedir(), '.claude'))
  } catch { }

  for (const dir of candidates) {
    try {
      if (existsSync(join(dir, '.credentials.json'))) return dir
    } catch { }
  }

  if (fromEnv) return fromEnv
  if (homeDir) return join(homeDir, '.claude')
  return candidates[0] ?? ''
}

function safeExistsSync(p) {
  try {
    return !!p && existsSync(p)
  } catch {
    return false
  }
}

function stripWrappingQuotes(s) {
  if (typeof s !== 'string') return ''
  const t = s.trim()
  if (t.length < 2) return t
  const first = t[0]
  const last = t[t.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) return t.slice(1, -1)
  return t
}

function toAbsolutePathMaybe(p) {
  const s = stripWrappingQuotes(trimEnvValue(p))
  if (!s) return ''
  try {
    return isAbsolute(s) ? s : resolve(process.cwd(), s)
  } catch {
    return s
  }
}

function splitPathLikeEnvValue(pathValue) {
  const s = typeof pathValue === 'string' ? pathValue : ''
  return s
    .split(delimiter)
    .map((p) => stripWrappingQuotes(p))
    .map((p) => p.trim())
    .filter(Boolean)
}

function findFirstExistingInPath(env, fileNames) {
  const pathValue = trimEnvValue(env?.PATH) || trimEnvValue(env?.Path)
  if (!pathValue) return ''

  const dirs = splitPathLikeEnvValue(pathValue)
  for (const dir of dirs) {
    for (const name of fileNames) {
      const candidate = join(dir, name)
      if (safeExistsSync(candidate)) return candidate
    }
  }

  return ''
}

function resolveSystemClaudeBinary(env, homeDir) {
  const names = process.platform === 'win32' ? ['claude.exe'] : ['claude']

  if (homeDir) {
    const localBin = join(homeDir, '.local', 'bin', names[0])
    if (safeExistsSync(localBin)) return localBin
  }

  const fromPath = findFirstExistingInPath(env, names)
  if (fromPath) return fromPath

  if (process.platform === 'win32') {
    const localAppData = trimEnvValue(env?.LOCALAPPDATA)
    if (localAppData) {
      const candidates = [
        join(localAppData, 'Programs', 'Claude', 'claude.exe'),
        join(localAppData, 'Programs', 'claude', 'claude.exe'),
        join(localAppData, 'Programs', 'Anthropic', 'Claude', 'claude.exe')
      ]
      for (const p of candidates) {
        if (safeExistsSync(p)) return p
      }
    }
  }

  return ''
}

function resolveCodexHomeDir(env, homeDir) {
  /** @type {string[]} */
  const candidates = []
  const add = (v) => {
    const s = trimEnvValue(v)
    if (!s) return
    if (candidates.includes(s)) return
    candidates.push(s)
  }

  // 用户显式指定优先（但如果路径不存在，则忽略以避免误导）
  const fromEnv = trimEnvValue(env?.CODEX_HOME)
  if (fromEnv) {
    try {
      if (existsSync(fromEnv)) add(fromEnv)
    } catch { }
  }

  if (homeDir) add(join(homeDir, '.codex'))

  const userProfile = trimEnvValue(env?.USERPROFILE)
  if (userProfile) add(join(userProfile, '.codex'))

  const home = trimEnvValue(env?.HOME)
  if (home) add(join(home, '.codex'))

  try {
    add(join(homedir(), '.codex'))
  } catch { }

  // 优先选择存在 auth.json 的目录（Codex 登录态）
  for (const dir of candidates) {
    try {
      if (safeExistsSync(join(dir, 'auth.json'))) return dir
    } catch { }
  }

  if (fromEnv) return fromEnv
  if (homeDir) return join(homeDir, '.codex')
  return candidates[0] ?? ''
}

function getExtraCliSearchPaths(env, homeDir) {
  /** @type {string[]} */
  const dirs = []
  const add = (p) => {
    if (!p) return
    try {
      if (existsSync(p)) dirs.push(p)
    } catch { }
  }

  if (process.platform === 'win32') {
    const appData = trimEnvValue(env?.APPDATA)
    if (appData) add(join(appData, 'npm'))

    const localAppData = trimEnvValue(env?.LOCALAPPDATA)
    if (localAppData) {
      add(join(localAppData, 'pnpm'))
      add(join(localAppData, 'Volta', 'bin'))
    }

    const userProfile = trimEnvValue(env?.USERPROFILE) || homeDir
    if (userProfile) {
      add(join(userProfile, 'AppData', 'Roaming', 'npm'))
      add(join(userProfile, '.cargo', 'bin'))
      add(join(userProfile, '.bun', 'bin'))
      add(join(userProfile, '.local', 'bin'))
    }
  } else {
    if (homeDir) add(join(homeDir, '.local', 'bin'))
    try { add(join(homedir(), '.local', 'bin')) } catch { }
  }

  return Array.from(new Set(dirs))
}

function applyExtraSearchPathsToEnv(env, extraDirs) {
  if (!extraDirs || !Array.isArray(extraDirs) || extraDirs.length === 0) return
  const current = trimEnvValue(env?.PATH) || trimEnvValue(env?.Path)
  const curDirs = splitPathLikeEnvValue(current)
  const nextDirs = Array.from(new Set([...extraDirs, ...curDirs]))
  const next = nextDirs.join(delimiter)
  env.PATH = next
  env.Path = next
}

function resolveSystemCodexBinary(env, homeDir) {
  const names = process.platform === 'win32'
    ? ['codex.cmd', 'codex.exe', 'codex.bat']
    : ['codex']

  if (homeDir) {
    const localBin = join(homeDir, '.local', 'bin', names[0])
    if (safeExistsSync(localBin)) return localBin
  }

  const fromPath = findFirstExistingInPath(env, names)
  if (fromPath) return fromPath

  if (process.platform === 'win32') {
    const appData = trimEnvValue(env?.APPDATA)
    if (appData) {
      const p = join(appData, 'npm', 'codex.cmd')
      if (safeExistsSync(p)) return p
    }
    const localAppData = trimEnvValue(env?.LOCALAPPDATA)
    if (localAppData) {
      const p = join(localAppData, 'pnpm', 'codex.cmd')
      if (safeExistsSync(p)) return p
    }
  }

  return ''
}

function spawnCliCommand(command, argv, options) {
  const args = Array.isArray(argv) ? argv : []
  const opts = options ?? {}

  // Windows 下 .cmd/.bat 需要通过 cmd.exe 执行（否则可能 EINVAL）
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', command, ...args], { ...opts, windowsHide: true })
  }

  return spawn(command, args, opts)
}

function abortError(message = 'Operation aborted') {
  const e = new Error(message)
  e.name = 'AbortError'
  return e
}

async function waitChildExit(child) {
  return await new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal }))
  })
}

async function* streamClaudeCliPrintMessages(args) {
  const {
    command,
    argv,
    cwd,
    env,
    abortController,
    bridgeDebug
  } = args

  const child = spawn(command, argv, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  const exitPromise = waitChildExit(child)

  const signal = abortController?.signal
  let aborted = false
  const onAbort = () => {
    aborted = true
    try { child.kill('SIGTERM') } catch { }
  }
  if (signal) signal.addEventListener('abort', onAbort, { once: true })

  if (bridgeDebug) {
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      const s = String(chunk ?? '')
      if (!s) return
      stderrInfo('claude stderr', safePreview(s, 800))
    })
  }

  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })
  try {
    for await (const line of rl) {
      const s = String(line ?? '').trim()
      if (!s) continue
      try {
        yield JSON.parse(s)
      } catch {
        if (bridgeDebug) stderrInfo('claude stdout 非 JSON（已忽略）', safePreview(s, 200))
      }
    }
  } finally {
    try { rl.close() } catch { }
    if (signal) signal.removeEventListener('abort', onAbort)
  }

  const { code, signal: termSignal } = await exitPromise
  if (aborted || signal?.aborted) throw abortError()
  if (code !== 0 && code !== null) throw new Error(`Claude Code process exited with code ${code}`)
  if (termSignal) throw new Error(`Claude Code process terminated by signal ${termSignal}`)
}

function sendJson(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

function sendResponse(id, result) {
  sendJson({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message, data) {
  const err = { code, message }
  if (data !== undefined) err.data = data
  sendJson({ jsonrpc: '2.0', id, error: err })
}

function sendNotification(method, params) {
  sendJson({ jsonrpc: '2.0', method, params })
}

function sendEvent(params) {
  sendNotification('notifications/event', params)
}

function getBundledResolvePaths() {
  const paths = []
  const pushIfExists = (p) => {
    if (!p) return
    try {
      if (existsSync(p)) paths.push(p)
    } catch { }
  }

  pushIfExists(process.cwd())
  pushIfExists(__dirname)
  pushIfExists(join(__dirname, '..'))

  // Electron 下通常存在
  const rp = process.resourcesPath
  if (typeof rp === 'string' && rp.trim()) {
    pushIfExists(rp)
    pushIfExists(join(rp, 'app.asar'))
    pushIfExists(join(rp, 'app.asar.unpacked'))
  }

  // 去重
  return Array.from(new Set(paths))
}

function pickSource(externalBaseDir, resolvedPath) {
  if (!externalBaseDir) return 'bundled'
  try {
    const normBase = externalBaseDir.replace(/\\/g, '/')
    const normResolved = String(resolvedPath).replace(/\\/g, '/')
    return normResolved.startsWith(normBase.replace(/\/+$/, '') + '/') ? 'external' : 'bundled'
  } catch {
    return 'bundled'
  }
}

async function loadPackage(pkgName, externalBaseDir) {
  const bundledPaths = getBundledResolvePaths()

  const findNearestPkgJson = (entryFilePath) => {
    try {
      let dir = dirname(entryFilePath)
      for (let i = 0; i < 12; i++) {
        const candidate = join(dir, 'package.json')
        if (safeExistsSync(candidate)) return candidate
        const parent = dirname(dir)
        if (parent === dir) break
        dir = parent
      }
    } catch { }
    return ''
  }

  const tryLoad = async (paths, source) => {
    /** @type {string} */
    let entryUrl = ''

    // 1) 优先 ESM 解析（可覆盖 exports.import 场景，例如 @openai/codex-sdk）。
    if (typeof import.meta.resolve === 'function') {
      for (const baseDir of paths) {
        try {
          const parentUrl = pathToFileURL(join(baseDir, '__kelivo_resolve__.mjs')).href
          entryUrl = import.meta.resolve(pkgName, parentUrl)
          break
        } catch { }
      }

      if (!entryUrl) {
        try {
          entryUrl = import.meta.resolve(pkgName)
        } catch { }
      }
    }

    // 2) 回退 CJS 解析（兼容 CJS-only 包或缺少 import 条件的 exports）。
    if (!entryUrl) {
      const entryPath = require.resolve(pkgName, { paths })
      entryUrl = pathToFileURL(entryPath).href
    }

    const mod = await import(entryUrl)

    let version = 'unknown'
    try {
      const entryFilePath = fileURLToPath(entryUrl)
      const pkgJsonPath = findNearestPkgJson(entryFilePath)
      if (pkgJsonPath) {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
        if (typeof pkgJson.version === 'string') version = pkgJson.version
      }
    } catch { }

    return { mod, version, source }
  }

  // 优先 external，失败自动回退 bundled（保证“可升级”不影响内置可用性）
  if (externalBaseDir && existsSync(externalBaseDir)) {
    try {
      return await tryLoad([externalBaseDir], 'external')
    } catch (e) {
      stderrInfo(`${pkgName} external 加载失败，回退 bundled：${e?.message ?? String(e)}`)
    }
  }

  return await tryLoad(bundledPaths, 'bundled')
}

/** @type {{ claude: any, codex: any }} */
const sdkCache = { claude: null, codex: null }

async function ensureClaudeSdk() {
  if (process.env.MOCK === '1') {
    return { available: true, version: 'mock', source: 'mock', query: null }
  }

  if (sdkCache.claude) return sdkCache.claude

  const externalBase = externalDepsDir ? join(externalDepsDir, 'claude-sdk') : null
  const { mod, version, source } = await loadPackage('@anthropic-ai/claude-agent-sdk', externalBase)
  const query = mod.query ?? mod.default?.query
  if (typeof query !== 'function') {
    throw new Error('Claude SDK 加载成功，但未找到 query() 导出')
  }

  sdkCache.claude = { available: true, version, source, query }
  return sdkCache.claude
}

async function ensureCodexSdk() {
  if (process.env.MOCK === '1') {
    return { available: true, version: 'mock', source: 'mock', Codex: null }
  }

  if (sdkCache.codex) return sdkCache.codex

  const externalBase = externalDepsDir ? join(externalDepsDir, 'codex-sdk') : null
  const { mod, version, source } = await loadPackage('@openai/codex-sdk', externalBase)
  const Codex = mod.Codex ?? mod.default?.Codex ?? mod.default
  if (typeof Codex !== 'function') {
    throw new Error('Codex SDK 加载成功，但未找到 Codex 构造函数导出')
  }

  sdkCache.codex = { available: true, version, source, Codex }
  return sdkCache.codex
}

async function tryReadCliVersion(command, env, timeoutMs = 8000) {
  return await new Promise((resolve) => {
    let stdout = ''
    let stderr = ''

    let child
    try {
      child = spawnCliCommand(command, ['--version'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch {
      resolve(null)
      return
    }

    if (!child?.stdout || !child?.stderr) {
      try { child?.kill() } catch { }
      resolve(null)
      return
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (c) => { stdout += String(c ?? '') })
    child.stderr.on('data', (c) => { stderr += String(c ?? '') })

    const timer = setTimeout(() => {
      try { child.kill() } catch { }
      resolve(null)
    }, Math.max(1000, timeoutMs))

    child.on('exit', (code) => {
      clearTimeout(timer)
      const out = String(stdout ?? '').trim()
      const err = String(stderr ?? '').trim()
      if (code !== 0) {
        resolve(null)
        return
      }
      const text = out || err
      resolve(text ? text.split(/\\r?\\n/)[0].trim() : null)
    })

    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
  })
}

async function getCodexCliStatus() {
  // NOTE: Codemoss 思路：直接用 `codex app-server`（复用本机 CODEX_HOME/auth.json 登录态）
  const env = { ...process.env }
  const bridgeDebug = isBridgeDebugEnabled(env)

  const resolvedHome = resolveUserHomeFromEnv(env)
  if (resolvedHome) {
    if (!env.HOME) env.HOME = resolvedHome
    if (!env.USERPROFILE) env.USERPROFILE = resolvedHome
  }

  const codexHomeDir = resolveCodexHomeDir(env, resolvedHome)
  if (codexHomeDir) env.CODEX_HOME = codexHomeDir

  // 确保 Windows 关键变量存在
  if (!env.HOME) env.HOME = homedir()
  if (!env.USERPROFILE) env.USERPROFILE = homedir()
  if (!env.APPDATA && process.env.APPDATA) env.APPDATA = process.env.APPDATA
  if (!env.LOCALAPPDATA && process.env.LOCALAPPDATA) env.LOCALAPPDATA = process.env.LOCALAPPDATA

  applyExtraSearchPathsToEnv(env, getExtraCliSearchPaths(env, resolvedHome))

  const explicitCodexBin = toAbsolutePathMaybe(env?.KELIVO_CODEX_BIN)
  const codexBin = explicitCodexBin || resolveSystemCodexBinary(env, resolvedHome) || 'codex'

  const versionLine = await tryReadCliVersion(codexBin, env)
  const version = typeof versionLine === 'string' && versionLine.trim() ? versionLine.trim() : null

  if (bridgeDebug) {
    const authPath = codexHomeDir ? join(codexHomeDir, 'auth.json') : ''
    const hasAuthFile = authPath ? safeExistsSync(authPath) : false
    stderrInfo('codex status', `available=${!!version} version=${version || 'null'} CODEX_HOME=${codexHomeDir || 'unknown'} authFile=${hasAuthFile}`)
  }

  return { available: !!version, version, source: 'system' }
}

async function getProviderStatus(provider) {
  try {
    if (provider === 'claude') {
      const sdk = await ensureClaudeSdk()
      return { available: !!sdk.available, version: sdk.version, source: sdk.source }
    }
    if (provider === 'codex') {
      return await getCodexCliStatus()
    }
    return { available: false, version: null, source: 'bundled' }
  } catch (e) {
    stderrInfo(`${provider} 初始化失败：${e?.message ?? String(e)}`)
    return { available: false, version: null, source: 'bundled' }
  }
}

function clearPendingPermissions(reason) {
  for (const [requestId, pending] of pendingPermissions.entries()) {
    clearTimeout(pending.timeout)
    pendingPermissions.delete(requestId)
    try {
      pending.resolve({ behavior: 'deny', message: reason, interrupt: true })
    } catch { }
  }
}

function createCanUseTool(runId) {
  return async (toolName, input, options) => {
    if (options?.signal?.aborted) {
      return { behavior: 'deny', message: '已中止', interrupt: true }
    }

    const requestId = `perm_${Date.now()}_${Math.random().toString(16).slice(2)}`
    const expiresAt = Date.now() + 300000

    sendEvent({
      runId,
      type: 'permission.request',
      requestId,
      toolName: String(toolName ?? ''),
      toolUseId: typeof options?.toolUseID === 'string' ? options.toolUseID : null,
      inputPreview: safePreview(input, 500),
      decisionReason: typeof options?.decisionReason === 'string' ? options.decisionReason : null,
      expiresAt
    })

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingPermissions.delete(requestId)
        resolve({ behavior: 'deny', message: '权限请求超时', interrupt: true })
      }, 300000)

      pendingPermissions.set(requestId, { resolve, reject, timeout })
    })
  }
}

function normalizeClaudePermissionMode(permissionMode, allowDangerouslySkipPermissions) {
  const s = typeof permissionMode === 'string' ? permissionMode : ''
  if (s === 'acceptEdits') return 'acceptEdits'
  if (s === 'dontAsk') return 'dontAsk'
  if (s === 'plan') return 'plan'
  if (s === 'delegate') return 'delegate'
  if (s === 'bypassPermissions') {
    // 额外保护：必须显式确认 allowDangerouslySkipPermissions 才允许 bypass
    return allowDangerouslySkipPermissions ? 'bypassPermissions' : 'default'
  }
  return 'default'
}

async function runClaude(params) {
  const {
    runId,
    prompt,
    cwd,
    apiKey,
    baseUrl,
    model,
    permissionMode,
    allowDangerouslySkipPermissions,
    resumeId
  } = params

  // 构造独立的 env，避免污染全局 process.env
  const env = { ...process.env }
  const bridgeDebug = isBridgeDebugEnabled(env)

  // 关键：显式给 claude-code 指定 home/config 目录，避免 GUI 启动时 env 差异导致找不到 ~/.claude/.credentials.json（进而回落到 API Key 并报 Invalid API key）。
  const resolvedHome = resolveUserHomeFromEnv(env)
  if (resolvedHome) {
    if (!env.HOME) env.HOME = resolvedHome
    if (!env.USERPROFILE) env.USERPROFILE = resolvedHome
  }

  const claudeConfigDir = resolveClaudeConfigDir(env, resolvedHome)
  if (claudeConfigDir) {
    env.CLAUDE_CONFIG_DIR = claudeConfigDir
    // 兼容 codemoss 等实现：使用 CLAUDE_HOME 指向 ~/.claude 目录
    if (!env.CLAUDE_HOME) env.CLAUDE_HOME = claudeConfigDir
  }

  const credPath = claudeConfigDir ? join(claudeConfigDir, '.credentials.json') : ''
  const hasCredFile = credPath ? safeExistsSync(credPath) : false
  const superTokenPath = claudeConfigDir ? join(claudeConfigDir, '.super_yi_token') : ''
  const hasSuperTokenFile = superTokenPath ? safeExistsSync(superTokenPath) : false

  if (bridgeDebug) {
    stderrInfo('claude env', `home=${resolvedHome || 'unknown'} config=${claudeConfigDir || 'unknown'} credentialsFile=${hasCredFile} superTokenFile=${hasSuperTokenFile}`)
  }


  // 确保 Windows 关键变量存在
  if (!env.HOME) env.HOME = homedir()
  if (!env.USERPROFILE) env.USERPROFILE = homedir()
  if (!env.APPDATA && process.env.APPDATA) env.APPDATA = process.env.APPDATA
  if (!env.LOCALAPPDATA && process.env.LOCALAPPDATA) env.LOCALAPPDATA = process.env.LOCALAPPDATA

  // [DEBUG] 将环境信息写入日志文件以便排查（仅在 KELIVO_BRIDGE_DEBUG/KELIVO_AGENT_BRIDGE_DEBUG 开启时启用）
  if (bridgeDebug) {
    try {
      const fs = await import('node:fs/promises')
      const logPath = join(homedir(), 'kelivo-bridge-debug.log')
      const debugInfo = {
        timestamp: new Date().toISOString(),
        homedir: homedir(),
        env_HOME: env.HOME,
        env_APPDATA: env.APPDATA,
        env_USERPROFILE: env.USERPROFILE,
        env_ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY ? '******' : 'undefined',
        has_process_APPDATA: !!process.env.APPDATA,
        cwd: process.cwd()
      }
      await fs.appendFile(logPath, JSON.stringify(debugInfo, null, 2) + '\n---\n')
    } catch {
      // ignore logging errors
    }
  }

  if (typeof apiKey === 'string' && apiKey.trim()) env.ANTHROPIC_API_KEY = apiKey.trim()
  if (typeof baseUrl === 'string' && baseUrl.trim()) env.ANTHROPIC_BASE_URL = baseUrl.trim()

  const apiKeyProvided = typeof apiKey === 'string' && apiKey.trim()

  /** @type {Map<string, string>} */
  const assistantSeen = new Map()
  let currentStreamAssistantMessageId = null
  let sdkSessionId = null
  let usage = null
  let costUSD = null

  const explicitClaudeBin = toAbsolutePathMaybe(env?.KELIVO_CLAUDE_BIN)

  let selectedClaudeExec = ''
  let selectedClaudeExecSource = ''

  if (explicitClaudeBin) {
    if (safeExistsSync(explicitClaudeBin)) {
      selectedClaudeExec = explicitClaudeBin
      selectedClaudeExecSource = 'override'
    } else if (bridgeDebug) {
      stderrInfo('claude exec', `overrideNotFound path=${explicitClaudeBin}`)
    }
  }

  if (!selectedClaudeExec) {
    const sys = resolveSystemClaudeBinary(env, resolvedHome)
    if (sys) {
      selectedClaudeExec = sys
      selectedClaudeExecSource = 'system'
    }
  }

  // 选择运行方式：
  // - 不填 API Key（隐式认证）：优先走 `claude -p`（codemoss 同款），复用本机登录态（.super_yi_token）。
  // - 填了 API Key：走 @anthropic-ai/claude-agent-sdk（支持 tool 权限回调等）。
  const useCliPrintMode = !apiKeyProvided

  if (bridgeDebug) {
    if (selectedClaudeExec) stderrInfo('claude exec', `selected=${selectedClaudeExecSource} path=${selectedClaudeExec}`)
    else stderrInfo('claude exec', 'selected=PATH')
    stderrInfo('claude mode', useCliPrintMode ? 'engine=cli-print' : 'engine=agent-sdk')
  }

  let iter
  if (useCliPrintMode) {
    if (!selectedClaudeExec) {
      throw new Error('未找到 Claude CLI（claude/claude.exe）。请先安装 Claude Code，或设置环境变量 KELIVO_CLAUDE_BIN 指向 claude 可执行文件。')
    }

    const cliCwd = typeof cwd === 'string' && cwd.trim() ? cwd.trim() : process.cwd()
    const perm = normalizeClaudePermissionMode(permissionMode, allowDangerouslySkipPermissions)
    const cliArgs = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages'
    ]

    if (typeof model === 'string' && model.trim()) {
      cliArgs.push('--model', model.trim())
    }

    if (resumeId) {
      cliArgs.push('--resume', resumeId)
    }

    // -p 模式无法交互式弹窗询问权限，因此默认把 default 映射为 acceptEdits（codemoss 同款）。
    if (perm === 'bypassPermissions') {
      cliArgs.push('--dangerously-skip-permissions')
    } else {
      cliArgs.push('--permission-mode', perm === 'default' ? 'acceptEdits' : perm)
    }

    cliArgs.push(String(prompt ?? ''))

    iter = streamClaudeCliPrintMessages({
      command: selectedClaudeExec,
      argv: cliArgs,
      cwd: cliCwd,
      env,
      abortController: currentAbortController,
      bridgeDebug
    })
  } else {
    const sdk = await ensureClaudeSdk()
    const query = sdk.query

    const options = {
      model: typeof model === 'string' && model.trim() ? model.trim() : 'claude-sonnet-4-20250514',
      cwd: typeof cwd === 'string' && cwd.trim() ? cwd.trim() : process.cwd(),
      maxTurns: 100,
      abortController: currentAbortController,
      includePartialMessages: true,
      permissionMode: normalizeClaudePermissionMode(permissionMode, allowDangerouslySkipPermissions),
      ...(resumeId ? { resume: resumeId } : {}),
      canUseTool: createCanUseTool(runId),
      env // 显式传递 env
    }

    if (selectedClaudeExec) {
      options.pathToClaudeCodeExecutable = selectedClaudeExec
    }

    iter = query({ prompt: String(prompt ?? ''), options })
  }

  for await (const message of iter) {
    const t = message?.type

    if (t === 'stream_event') {
      const ev = message.event

      if (ev?.type === 'message_start') {
        const msgId = ev.message?.id
        if (typeof msgId === 'string' && msgId.trim()) currentStreamAssistantMessageId = msgId.trim()
        continue
      }
      if (ev?.type === 'message_stop') {
        currentStreamAssistantMessageId = null
        continue
      }

      if (ev?.type === 'content_block_delta') {
        const delta = ev.delta
        if (delta?.type === 'text_delta') {
          const messageId = currentStreamAssistantMessageId || (typeof message.uuid === 'string' ? message.uuid : 'assistant')
          const text = String(delta.text ?? '')
          if (text) {
            assistantSeen.set(messageId, (assistantSeen.get(messageId) ?? '') + text)
            sendEvent({ runId, type: 'assistant.delta', messageId, textDelta: text })
          }
        } else if (delta?.type === 'thinking_delta') {
          const messageId = currentStreamAssistantMessageId || (typeof message.uuid === 'string' ? message.uuid : 'thinking')
          const thinking = String(delta.thinking ?? '')
          if (thinking) sendEvent({ runId, type: 'thinking.delta', messageId, textDelta: thinking })
        }
      }
      continue
    }

    if (t === 'system' && message.subtype === 'init') {
      sdkSessionId = typeof message.session_id === 'string' ? message.session_id : null
      if (sdkSessionId) sendEvent({ runId, type: 'resume.id', resumeId: sdkSessionId })
      continue
    }

    if (t === 'assistant') {
      const messageId = typeof message.message?.id === 'string'
        ? message.message.id
        : (typeof message.uuid === 'string' ? message.uuid : null)
      const content = message.message?.content

      if (Array.isArray(content)) {
        const toolUseBlocks = content.filter((b) => b?.type === 'tool_use')
        for (const block of toolUseBlocks) {
          const toolUseId = typeof block.id === 'string' ? block.id : randomUUID()
          const toolName = typeof block.name === 'string' ? block.name : 'tool'
          const toolInput = block.input ?? {}
          sendEvent({
            runId,
            type: 'tool.start',
            toolCallId: toolUseId,
            toolName,
            toolInput,
            toolInputPreview: safePreview(toolInput, 500)
          })
        }

        // 兜底：如果没有产生 delta，则把完整文本补发出来
        if (messageId) {
          const textBlocks = content.filter((b) => b?.type === 'text')
          const fullText = textBlocks.map((b) => String(b.text ?? '')).join('')
          if (fullText && !assistantSeen.has(messageId)) {
            assistantSeen.set(messageId, fullText)
            sendEvent({ runId, type: 'assistant.delta', messageId, textDelta: fullText })
          }
          sendEvent({ runId, type: 'assistant.done', messageId })
        }
      }
      continue
    }

    if (t === 'user') {
      // tool result
      if (message.tool_use_result !== undefined) {
        const toolUseId = typeof message.parent_tool_use_id === 'string' ? message.parent_tool_use_id : null
        const resultText = typeof message.tool_use_result === 'string'
          ? message.tool_use_result
          : safePreview(message.tool_use_result, 20000)
        if (toolUseId) {
          sendEvent({
            runId,
            type: 'tool.done',
            toolCallId: toolUseId,
            toolResult: resultText
          })
        }
      }
      continue
    }

    if (t === 'result') {
      if (message.subtype === 'success') {
        usage = message.usage ?? null
        costUSD = message.total_cost_usd ?? null
      } else {
        const errors = Array.isArray(message.errors) ? message.errors.join(', ') : ''
        const msg = errors || `执行失败：${String(message.subtype ?? 'unknown')}`
        sendEvent({ runId, type: 'status', status: 'error', message: msg })
      }
      continue
    }

    if (t === 'tool_progress') {
      const toolUseId = typeof message.tool_use_id === 'string' ? message.tool_use_id : null
      if (toolUseId) {
        sendEvent({
          runId,
          type: 'tool.progress',
          toolCallId: toolUseId,
          toolName: typeof message.tool_name === 'string' ? message.tool_name : null,
          elapsedSeconds: typeof message.elapsed_time_seconds === 'number' ? message.elapsed_time_seconds : null
        })
      }
      continue
    }
  }

  return { resumeId: sdkSessionId, usage, costUSD }
}

async function runCodexSdk(params) {
  const {
    runId,
    prompt,
    cwd,
    apiKey,
    baseUrl,
    sandboxMode,
    approvalPolicy,
    resumeId
  } = params

  const sdk = await ensureCodexSdk()
  const Codex = sdk.Codex

  // 避免把 key/baseUrl 打到日志；这里只做存在性标记
  stderrInfo('codex run', `hasApiKey=${!!(apiKey && String(apiKey).trim())} hasBaseUrl=${!!(baseUrl && String(baseUrl).trim())}`)

  // 兼容不同 SDK 版本：尽量使用构造参数，否则退回 env
  const ctorConfig = {}
  if (typeof apiKey === 'string' && apiKey.trim()) ctorConfig.apiKey = apiKey.trim()
  if (typeof baseUrl === 'string' && baseUrl.trim()) ctorConfig.baseUrl = baseUrl.trim()
  if (typeof cwd === 'string' && cwd.trim()) ctorConfig.cwd = cwd.trim()
  if (typeof sandboxMode === 'string' && sandboxMode.trim()) ctorConfig.sandboxMode = sandboxMode.trim()
  if (typeof approvalPolicy === 'string' && approvalPolicy.trim()) ctorConfig.approvalPolicy = approvalPolicy.trim()

  if (typeof apiKey === 'string' && apiKey.trim()) process.env.OPENAI_API_KEY = apiKey.trim()
  else delete process.env.OPENAI_API_KEY
  if (typeof baseUrl === 'string' && baseUrl.trim()) process.env.OPENAI_BASE_URL = baseUrl.trim()
  else delete process.env.OPENAI_BASE_URL

  const codex = new Codex(ctorConfig)
  const thread = resumeId ? codex.resumeThread(String(resumeId)) : codex.startThread()

  /** @type {Map<string, string>} */
  const assistantTextById = new Map()
  /** @type {Map<string, any>} */
  const toolById = new Map()

  let threadId = null
  let usage = null

  const runInput = String(prompt ?? '')

  // 尝试 streamed API（不同版本可能签名不同，做降级）
  let events
  try {
    const r = await thread.runStreamed(runInput, {
      cwd: typeof cwd === 'string' && cwd.trim() ? cwd.trim() : undefined,
      sandboxMode,
      approvalPolicy,
      signal: currentAbortController?.signal
    })
    events = r?.events ?? r
  } catch (e) {
    // fallback：无 streamed 时直接 run()
    stderrInfo(`codex runStreamed 失败，尝试 run()：${e?.message ?? String(e)}`)
    const result = await thread.run(runInput)
    const text = typeof result === 'string' ? result : safePreview(result, 20000)
    const msgId = randomUUID()
    sendEvent({ runId, type: 'assistant.delta', messageId: msgId, textDelta: text })
    sendEvent({ runId, type: 'assistant.done', messageId: msgId })
    return { resumeId: threadId, usage, costUSD: null }
  }

  if (!events || typeof events[Symbol.asyncIterator] !== 'function') {
    const msgId = randomUUID()
    sendEvent({ runId, type: 'assistant.delta', messageId: msgId, textDelta: '(codex) 未获得事件流' })
    sendEvent({ runId, type: 'assistant.done', messageId: msgId })
    return { resumeId: threadId, usage, costUSD: null }
  }

  for await (const ev of events) {
    const type = ev?.type

    if (type === 'thread.started') {
      threadId = typeof ev.thread_id === 'string' ? ev.thread_id : null
      if (threadId) sendEvent({ runId, type: 'resume.id', resumeId: threadId })
      continue
    }

    if (type === 'turn.completed') {
      usage = ev.usage ?? usage
      continue
    }

    const item = ev?.item
    const itemId = typeof item?.id === 'string' ? item.id : null

    if ((type === 'item.started' || type === 'item.updated' || type === 'item.completed') && item && itemId) {
      // assistant message streaming
      if (item.type === 'agent_message' && typeof item.text === 'string') {
        const prev = assistantTextById.get(itemId) ?? ''
        const next = item.text
        const delta = next.startsWith(prev) ? next.slice(prev.length) : next
        if (delta) sendEvent({ runId, type: 'assistant.delta', messageId: itemId, textDelta: delta })
        assistantTextById.set(itemId, next)
        if (type === 'item.completed') sendEvent({ runId, type: 'assistant.done', messageId: itemId })
        continue
      }

      // tool mapping
      if (item.type === 'command_execution') {
        const command = typeof item.command === 'string' ? item.command : ''
        if (type === 'item.started') {
          toolById.set(itemId, { toolName: 'command_execution', command })
          sendEvent({
            runId,
            type: 'tool.start',
            toolCallId: itemId,
            toolName: 'command_execution',
            toolInput: { command },
            toolInputPreview: safePreview({ command }, 500)
          })
        } else if (type === 'item.completed') {
          const output = typeof item.output === 'string'
            ? item.output
            : typeof item.result === 'string'
              ? item.result
              : safePreview(item.output ?? item.result ?? '', 20000)
          sendEvent({ runId, type: 'tool.done', toolCallId: itemId, toolResult: output })
        }
        continue
      }

      if (item.type === 'mcp_tool_call') {
        const server = typeof item.server === 'string' ? item.server : 'mcp'
        const tool = typeof item.tool === 'string' ? item.tool : 'tool'
        const toolName = `mcp__${server}__${tool}`
        if (type === 'item.started') {
          const args = item.arguments ?? {}
          sendEvent({
            runId,
            type: 'tool.start',
            toolCallId: itemId,
            toolName,
            toolInput: args,
            toolInputPreview: safePreview(args, 500)
          })
        } else if (type === 'item.completed') {
          const output = safePreview(item.output ?? item.result ?? '', 20000)
          sendEvent({ runId, type: 'tool.done', toolCallId: itemId, toolResult: output })
        }
        continue
      }
    }

    if (type === 'turn.failed' || type === 'error') {
      const msg = ev?.error?.message ?? ev?.message ?? 'Codex 执行失败'
      sendEvent({ runId, type: 'status', status: 'error', message: String(msg) })
      throw new Error(String(msg))
    }
  }

  return { resumeId: threadId, usage, costUSD: null }
}

async function runCodex(params) {
  const {
    runId,
    prompt,
    cwd,
    apiKey,
    baseUrl,
    model,
    sandboxMode,
    approvalPolicy,
    resumeId
  } = params

  // 参照 codemoss：使用 `codex app-server`（JSON-RPC over stdio），复用 CODEX_HOME/auth.json 登录态
  const env = { ...process.env }
  const bridgeDebug = isBridgeDebugEnabled(env)

  // 避免把 key/baseUrl 打到日志；这里只做存在性标记
  stderrInfo('codex run', `hasApiKey=${!!(apiKey && String(apiKey).trim())} hasBaseUrl=${!!(baseUrl && String(baseUrl).trim())}`)

  const resolvedHome = resolveUserHomeFromEnv(env)
  if (resolvedHome) {
    if (!env.HOME) env.HOME = resolvedHome
    if (!env.USERPROFILE) env.USERPROFILE = resolvedHome
  }

  const codexHomeDir = resolveCodexHomeDir(env, resolvedHome)
  if (codexHomeDir) env.CODEX_HOME = codexHomeDir

  const authPath = codexHomeDir ? join(codexHomeDir, 'auth.json') : ''
  const hasAuthFile = authPath ? safeExistsSync(authPath) : false
  const configPath = codexHomeDir ? join(codexHomeDir, 'config.toml') : ''
  const hasConfigFile = configPath ? safeExistsSync(configPath) : false

  if (bridgeDebug) {
    stderrInfo('codex env', `home=${resolvedHome || 'unknown'} CODEX_HOME=${codexHomeDir || 'unknown'} authFile=${hasAuthFile} configFile=${hasConfigFile}`)
  }

  // 构造独立 env，避免污染全局 process.env
  if (typeof apiKey === 'string' && apiKey.trim()) env.OPENAI_API_KEY = apiKey.trim()
  else delete env.OPENAI_API_KEY
  if (typeof baseUrl === 'string' && baseUrl.trim()) env.OPENAI_BASE_URL = baseUrl.trim()
  else delete env.OPENAI_BASE_URL

  // 确保 Windows 关键变量存在
  if (!env.HOME) env.HOME = homedir()
  if (!env.USERPROFILE) env.USERPROFILE = homedir()
  if (!env.APPDATA && process.env.APPDATA) env.APPDATA = process.env.APPDATA
  if (!env.LOCALAPPDATA && process.env.LOCALAPPDATA) env.LOCALAPPDATA = process.env.LOCALAPPDATA

  applyExtraSearchPathsToEnv(env, getExtraCliSearchPaths(env, resolvedHome))

  const normalizedCwd = typeof cwd === 'string' && cwd.trim() ? cwd.trim() : process.cwd()

  const normalizeApprovalPolicy = (v) => {
    const s = typeof v === 'string' ? v.trim() : ''
    if (s === 'untrusted' || s === 'on-failure' || s === 'on-request' || s === 'never') return s
    return 'on-request'
  }
  const normalizeSandboxMode = (v) => {
    const s = typeof v === 'string' ? v.trim() : ''
    if (s === 'read-only' || s === 'workspace-write' || s === 'danger-full-access') return s
    return 'workspace-write'
  }

  const normalizedApprovalPolicy = normalizeApprovalPolicy(approvalPolicy)
  const normalizedSandboxMode = normalizeSandboxMode(sandboxMode)

  const sandboxPolicy = (() => {
    if (normalizedSandboxMode === 'danger-full-access') return { type: 'dangerFullAccess' }
    if (normalizedSandboxMode === 'read-only') return { type: 'readOnly' }
    return {
      type: 'workspaceWrite',
      writableRoots: [normalizedCwd],
      networkAccess: true
    }
  })()

  const explicitCodexBin = toAbsolutePathMaybe(env?.KELIVO_CODEX_BIN)
  const codexBin = explicitCodexBin || resolveSystemCodexBinary(env, resolvedHome) || 'codex'

  if (bridgeDebug) {
    stderrInfo('codex exec selected', `path=${codexBin} argv=app-server approvalPolicy=${normalizedApprovalPolicy} sandboxMode=${normalizedSandboxMode}`)
  }

  const child = spawnCliCommand(codexBin, ['app-server'], {
    env,
    cwd: normalizedCwd,
    stdio: ['pipe', 'pipe', 'pipe']
  })

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')

  /** @type {Map<string, { resolve: Function, reject: Function, timeout: NodeJS.Timeout }>} */
  const pending = new Map()
  let nextId = 1

  /** @type {string|null} */
  let threadId = typeof resumeId === 'string' && resumeId.trim() ? resumeId.trim() : null
  let resumeIdEmitted = false
  let usage = null

  /** @type {Map<string, string>} */
  const assistantTextByItemId = new Map()
  /** @type {Map<string, string>} */
  const toolOutputByItemId = new Map()
  /** @type {Map<string, string>} */
  const toolNameByItemId = new Map()

  const signal = currentAbortController?.signal
  let aborted = false

  const writeJsonLine = (obj) => {
    try {
      child.stdin.write(JSON.stringify(obj) + '\n')
    } catch { }
  }

  const rejectAllPending = (err) => {
    for (const [key, p] of pending.entries()) {
      clearTimeout(p.timeout)
      pending.delete(key)
      try { p.reject(err) } catch { }
    }
  }

  child.on('exit', (code, sig) => {
    rejectAllPending(new Error(`Codex app-server exited: code=${code ?? 'null'} signal=${sig ?? 'null'}`))
  })

  const sendRequest = async (method, params, timeoutMs = 60000) => {
    const id = nextId++
    const key = String(id)
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(key)
        reject(new Error(`Codex request timeout: ${String(method)}`))
      }, Math.max(1000, timeoutMs))
      pending.set(key, { resolve, reject, timeout })
      writeJsonLine({ id, method, params })
    })
  }

  const sendNotification = (method, params) => {
    if (params === undefined) writeJsonLine({ method })
    else writeJsonLine({ method, params })
  }

  const sendResponse = (id, result) => {
    writeJsonLine({ id, result })
  }

  const onAbort = () => {
    aborted = true
    try { child.kill() } catch { }
    rejectAllPending(abortError())
  }

  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  // stderr：仅在 debug 打印，避免污染正常输出（以及避免潜在敏感信息）
  const stderrRl = createInterface({ input: child.stderr, crlfDelay: Infinity })
  void (async () => {
    for await (const line of stderrRl) {
      const s = String(line ?? '').trim()
      if (!s) continue
      if (bridgeDebug) stderrInfo('codex stderr', safePreview(s, 400))
    }
  })()

  let doneResolve
  let doneReject
  const donePromise = new Promise((resolve, reject) => { doneResolve = resolve; doneReject = reject })

  const extractUsage = (params) => {
    const u = params?.usage ?? params?.result?.usage ?? params?.info?.usage ?? null
    if (!u || typeof u !== 'object') return null
    const input = Number(u.input_tokens ?? u.inputTokens ?? 0)
    const output = Number(u.output_tokens ?? u.outputTokens ?? 0)
    const cached = Number(u.cached_input_tokens ?? u.cache_read_input_tokens ?? u.cachedInputTokens ?? u.cacheReadInputTokens ?? 0)
    const modelContextWindow = Number(u.model_context_window ?? u.modelContextWindow ?? u.context_window ?? 0)
    if (!Number.isFinite(input) && !Number.isFinite(output)) return null
    return {
      input_tokens: Number.isFinite(input) ? input : undefined,
      output_tokens: Number.isFinite(output) ? output : undefined,
      cached_input_tokens: Number.isFinite(cached) ? cached : undefined,
      model_context_window: Number.isFinite(modelContextWindow) ? modelContextWindow : undefined
    }
  }

  const getString = (obj, keys) => {
    for (const k of keys) {
      const v = obj?.[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return ''
  }

  const handleNotification = (method, params) => {
    const m = String(method ?? '')

    if (m === 'thread/started') {
      const p = params && typeof params === 'object' ? params : {}
      const threadObj = p.thread && typeof p.thread === 'object' ? p.thread : null
      const tid = getString(threadObj, ['id']) || getString(p, ['threadId', 'thread_id'])
      if (tid) {
        if (!threadId) threadId = tid
        if (!resumeIdEmitted) {
          resumeIdEmitted = true
          sendEvent({ runId, type: 'resume.id', resumeId: tid })
        }
      }
      return
    }

    if (m === 'item/agentMessage/delta') {
      const p = params && typeof params === 'object' ? params : {}
      const itemId = getString(p, ['itemId', 'item_id'])
      const delta = typeof p.delta === 'string' ? p.delta : ''
      if (itemId && delta) {
        assistantTextByItemId.set(itemId, (assistantTextByItemId.get(itemId) ?? '') + delta)
        sendEvent({ runId, type: 'assistant.delta', messageId: itemId, textDelta: delta })
      }
      return
    }

    if (m === 'item/commandExecution/outputDelta' || m === 'item/fileChange/outputDelta') {
      const p = params && typeof params === 'object' ? params : {}
      const itemId = getString(p, ['itemId', 'item_id'])
      const delta = typeof p.delta === 'string' ? p.delta : ''
      if (itemId && delta) {
        toolOutputByItemId.set(itemId, (toolOutputByItemId.get(itemId) ?? '') + delta)
      }
      return
    }

    if (m === 'item/started') {
      const p = params && typeof params === 'object' ? params : {}
      const item = p.item && typeof p.item === 'object' ? p.item : null
      if (!item) return
      const itemType = getString(item, ['type'])
      const itemId = getString(item, ['id'])
      if (!itemId || itemType === 'agentMessage') return
      if (itemType !== 'commandExecution' && itemType !== 'fileChange' && itemType !== 'mcpToolCall') return

      let toolName = itemType || 'tool'
      let toolInput = item

      if (itemType === 'commandExecution') {
        toolName = 'command_execution'
        toolInput = {
          command: item.command ?? item.commandLine ?? item.tokens ?? item.argv ?? item
        }
      } else if (itemType === 'fileChange') {
        toolName = 'file_change'
      } else if (itemType === 'mcpToolCall') {
        const server = getString(item, ['server']) || 'mcp'
        const tool = getString(item, ['tool']) || 'tool'
        toolName = `mcp__${server}__${tool}`
        toolInput = item.arguments ?? item.args ?? item
      }

      toolNameByItemId.set(itemId, toolName)
      if (!toolOutputByItemId.has(itemId)) toolOutputByItemId.set(itemId, '')

      sendEvent({
        runId,
        type: 'tool.start',
        toolCallId: itemId,
        toolName,
        toolInput,
        toolInputPreview: safePreview(toolInput, 500)
      })
      return
    }

    if (m === 'item/completed') {
      const p = params && typeof params === 'object' ? params : {}
      const item = p.item && typeof p.item === 'object' ? p.item : null
      if (!item) return

      const itemType = getString(item, ['type'])
      const itemId = getString(item, ['id'])
      if (!itemId) return

      if (itemType === 'agentMessage') {
        const fullText = typeof item.text === 'string' ? item.text : ''
        const prev = assistantTextByItemId.get(itemId) ?? ''
        const delta = fullText
          ? (fullText.startsWith(prev) ? fullText.slice(prev.length) : (fullText === prev ? '' : fullText))
          : ''
        if (delta) sendEvent({ runId, type: 'assistant.delta', messageId: itemId, textDelta: delta })
        sendEvent({ runId, type: 'assistant.done', messageId: itemId })
        assistantTextByItemId.set(itemId, fullText || prev)
        return
      }

      const supportedToolItem = toolNameByItemId.has(itemId) || itemType === 'commandExecution' || itemType === 'fileChange' || itemType === 'mcpToolCall'
      if (!supportedToolItem) return

      const toolName = toolNameByItemId.get(itemId) ?? itemType ?? 'tool'
      const outputAccum = toolOutputByItemId.get(itemId) ?? ''
      const outputFromItem = typeof item.output === 'string'
        ? item.output
        : typeof item.result === 'string'
          ? item.result
          : ''
      const toolResult = outputAccum || outputFromItem || safePreview(item.output ?? item.result ?? item, 20000)

      sendEvent({ runId, type: 'tool.done', toolCallId: itemId, toolResult: toolResult })
      toolOutputByItemId.delete(itemId)
      toolNameByItemId.delete(itemId)
      return
    }

    if (m === 'turn/completed') {
      usage = extractUsage(params) ?? usage
      doneResolve(true)
      return
    }

    if (m === 'turn/error' || m === 'error') {
      const p = params && typeof params === 'object' ? params : {}
      const errVal = p.error
      const msg = typeof errVal === 'string'
        ? errVal
        : errVal && typeof errVal === 'object'
          ? String(errVal.message ?? '')
          : ''
      doneReject(new Error(msg || 'Codex 执行失败'))
      return
    }
  }

  const handleServerRequest = async (id, method, params) => {
    const m = String(method ?? '')
    if (!m) return

    // 1) approval requests（需回包 { decision: "accept" | "decline" }）
    if (m.includes('requestApproval')) {
      if (normalizedApprovalPolicy === 'never') {
        sendResponse(id, { decision: 'accept' })
        return
      }

      const p = params && typeof params === 'object' ? params : {}
      const toolUseId = getString(p, ['itemId', 'item_id']) || null

      const uiRequestId = `codex_perm_${Date.now()}_${Math.random().toString(16).slice(2)}`
      const expiresAt = Date.now() + 300000

      sendEvent({
        runId,
        type: 'permission.request',
        requestId: uiRequestId,
        toolName: m,
        toolUseId,
        inputPreview: safePreview(p, 500),
        decisionReason: m,
        expiresAt
      })

      const decision = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve({ behavior: 'deny', message: '权限请求超时', interrupt: true }), 300000)
        pendingPermissions.set(uiRequestId, {
          resolve: (r) => { clearTimeout(timeout); resolve(r) },
          reject: () => { clearTimeout(timeout); resolve({ behavior: 'deny', message: '权限请求被取消', interrupt: true }) },
          timeout
        })
      })

      const ok = decision?.behavior === 'allow'
      sendResponse(id, { decision: ok ? 'accept' : 'decline' })
      return
    }

    // 2) request user input（目前 Kelivo UI 未支持；先返回空答案避免卡死）
    if (m === 'item/tool/requestUserInput') {
      sendResponse(id, { answers: {} })
      return
    }

    // 兜底：避免 server 等待响应导致 hang
    if (bridgeDebug) stderrInfo('codex server request (unknown)', `${m} id=${String(id)}`)
    sendResponse(id, {})
  }

  const stdoutRl = createInterface({ input: child.stdout, crlfDelay: Infinity })
  void (async () => {
    for await (const line of stdoutRl) {
      const s = String(line ?? '').trim()
      if (!s) continue

      let msg
      try {
        msg = JSON.parse(s)
      } catch {
        if (bridgeDebug) stderrInfo('codex stdout 非 JSON（已忽略）', safePreview(s, 200))
        continue
      }

      const hasId = msg?.id !== undefined && msg?.id !== null
      const hasMethod = typeof msg?.method === 'string' && msg.method
      const hasResultOrError = msg?.result !== undefined || msg?.error !== undefined

      if (hasId && hasResultOrError) {
        const key = String(msg.id)
        const p = pending.get(key)
        if (p) {
          pending.delete(key)
          clearTimeout(p.timeout)
          if (msg.error) {
            const e = new Error(String(msg.error?.message ?? 'Codex request failed'))
            e.code = msg.error?.code
            e.data = msg.error?.data
            p.reject(e)
          } else {
            p.resolve(msg.result)
          }
        }
        continue
      }

      if (hasId && hasMethod) {
        void handleServerRequest(msg.id, msg.method, msg.params)
        continue
      }

      if (hasMethod) {
        handleNotification(msg.method, msg.params)
      }
    }
  })()

  const exitPromise = waitChildExit(child)

  try {
    // 1) initialize handshake
    await sendRequest('initialize', {
      clientInfo: {
        name: 'kelivo',
        title: 'Kelivo',
        version: BRIDGE_VERSION
      }
    }, 15000)
    sendNotification('initialized')

    // 2) thread start/resume
    const extractThreadId = (result) => {
      if (!result || typeof result !== 'object') return ''
      const threadObj = result.thread && typeof result.thread === 'object' ? result.thread : null
      return getString(result, ['threadId', 'thread_id']) || getString(threadObj, ['id'])
    }

    if (threadId) {
      const r = await sendRequest('thread/resume', { threadId }, 15000).catch(() => null)
      const tid = extractThreadId(r)
      if (tid) threadId = tid
    } else {
      const r = await sendRequest('thread/start', { cwd: normalizedCwd, approvalPolicy: normalizedApprovalPolicy }, 15000)
      const tid = extractThreadId(r)
      threadId = tid || threadId
    }

    if (!threadId) {
      throw new Error('Codex threadId 获取失败（thread/start|resume）')
    }
    if (!resumeIdEmitted) {
      resumeIdEmitted = true
      sendEvent({ runId, type: 'resume.id', resumeId: threadId })
    }

    // 3) start turn
    const text = String(prompt ?? '').trim()
    if (!text) throw new Error('empty prompt')

    const turnParams = {
      threadId,
      input: [{ type: 'text', text }],
      cwd: normalizedCwd,
      approvalPolicy: normalizedApprovalPolicy,
      sandboxPolicy,
      ...(typeof model === 'string' && model.trim() ? { model: model.trim() } : {})
    }

    await sendRequest('turn/start', turnParams, 30000)

    // 4) wait completion or exit
    await Promise.race([
      donePromise,
      exitPromise.then(({ code, signal: sig }) => {
        throw new Error(`Codex app-server exited: code=${code ?? 'null'} signal=${sig ?? 'null'}`)
      })
    ])
  } finally {
    try { if (!child.killed) child.kill() } catch { }
    try { stdoutRl.close() } catch { }
    try { stderrRl.close() } catch { }
    if (signal) {
      try { signal.removeEventListener('abort', onAbort) } catch { }
    }
    rejectAllPending(abortError())
  }

  if (aborted || signal?.aborted) throw abortError()

  // 不强依赖退出码：有些场景下 turn 完成后 app-server 可能仍在运行/退出
  return { resumeId: threadId, usage, costUSD: null }
}

async function runMock(params) {
  const runId = params.runId
  const resumeId = `mock_${Date.now()}`
  sendEvent({ runId, type: 'resume.id', resumeId })

  const assistantId = `mock_assistant_${Date.now()}`
  sendEvent({ runId, type: 'assistant.delta', messageId: assistantId, textDelta: '（MOCK）我将请求一次权限，然后执行一个工具。' })
  sendEvent({ runId, type: 'assistant.done', messageId: assistantId })

  const toolCallId = `mock_tool_${Date.now()}`
  sendEvent({ runId, type: 'tool.start', toolCallId, toolName: 'mock_tool', toolInput: { foo: 'bar' }, toolInputPreview: '{"foo":"bar"}' })

  const requestId = `mock_perm_${Date.now()}`
  sendEvent({
    runId,
    type: 'permission.request',
    requestId,
    toolName: 'mock_tool',
    toolUseId: toolCallId,
    inputPreview: '{"foo":"bar"}',
    decisionReason: 'mock',
    expiresAt: Date.now() + 300000
  })

  const decision = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ behavior: 'deny', message: 'mock 超时', interrupt: true }), 300000)
    pendingPermissions.set(requestId, {
      resolve: (r) => { clearTimeout(timeout); resolve(r) },
      reject: () => { clearTimeout(timeout); resolve({ behavior: 'deny', message: 'mock reject', interrupt: true }) },
      timeout
    })
  })

  if (decision?.behavior !== 'allow') {
    sendEvent({ runId, type: 'tool.error', toolCallId, toolName: 'mock_tool', message: '用户拒绝权限' })
    return { resumeId, usage: null, costUSD: null, success: false }
  }

  sendEvent({ runId, type: 'tool.done', toolCallId, toolResult: 'ok' })
  const assistantId2 = randomUUID()
  sendEvent({ runId, type: 'assistant.delta', messageId: assistantId2, textDelta: '（MOCK）工具执行完成。' })
  sendEvent({ runId, type: 'assistant.done', messageId: assistantId2 })
  return { resumeId, usage: { input_tokens: 1, output_tokens: 1 }, costUSD: 0, success: true }
}

async function handleInitialize(id, params) {
  const pv = params?.protocolVersion
  if (pv !== PROTOCOL_VERSION) {
    sendError(id, -32602, `protocolVersion 不匹配：期望 ${PROTOCOL_VERSION}，收到 ${String(pv)}`)
    return
  }

  externalDepsDir = typeof params?.externalDepsDir === 'string' && params.externalDepsDir.trim()
    ? params.externalDepsDir.trim()
    : null

  // externalDepsDir 变化时清缓存（让“一键升级”后可见）
  sdkCache.claude = null
  sdkCache.codex = null

  const claude = await getProviderStatus('claude')
  const codex = await getProviderStatus('codex')

  sendResponse(id, {
    bridgeVersion: BRIDGE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    providers: { claude, codex }
  })
}

async function handleAgentRun(id, params) {
  const runId = typeof params?.runId === 'string' && params.runId.trim() ? params.runId.trim() : null
  const sdkProvider = typeof params?.sdkProvider === 'string' ? params.sdkProvider : null
  const prompt = typeof params?.prompt === 'string' ? params.prompt : ''

  if (!runId) {
    sendError(id, -32602, 'agent.run 缺少 runId')
    return
  }
  if (sdkProvider !== 'claude' && sdkProvider !== 'codex') {
    sendError(id, -32602, `agent.run 不支持 sdkProvider=${String(sdkProvider)}`)
    return
  }
  if (currentRun) {
    sendError(id, -32000, '当前已有 run 在执行中（首期仅支持单并发）', { currentRunId: currentRun.runId })
    return
  }

  currentAbortController = new AbortController()
  currentRun = { runId, sdkProvider, resumeId: null }

  sendEvent({ runId, type: 'status', status: 'running' })

  try {
    let r
    if (process.env.MOCK === '1') {
      r = await runMock({ ...params, runId })
    } else if (sdkProvider === 'claude') {
      r = await runClaude({ ...params, runId, prompt })
    } else {
      r = await runCodex({ ...params, runId, prompt })
    }

    const resumeId = r?.resumeId ?? null
    const usage = r?.usage ?? null
    const costUSD = r?.costUSD ?? null

    sendEvent({ runId, type: 'status', status: 'done' })
    sendResponse(id, { success: true, resumeId, usage, costUSD })
  } catch (e) {
    const aborted = e?.name === 'AbortError' || currentAbortController?.signal?.aborted
    const msg = e?.message ?? String(e)

    sendEvent({ runId, type: 'status', status: aborted ? 'aborted' : 'error', message: msg })
    sendResponse(id, { success: false, aborted, error: msg })
  } finally {
    clearPendingPermissions('run 已结束')
    currentAbortController = null
    currentRun = null
  }
}

function handleAgentAbort(params) {
  const runId = typeof params?.runId === 'string' ? params.runId : null
  if (!currentRun || !currentAbortController) return
  if (runId && currentRun.runId !== runId) return
  currentAbortController.abort()
  clearPendingPermissions('已中止')
}

function handlePermissionRespond(id, params) {
  const requestId = typeof params?.requestId === 'string' ? params.requestId : null
  if (!requestId) {
    sendError(id, -32602, 'permission.respond 缺少 requestId')
    return
  }

  const pending = pendingPermissions.get(requestId)
  if (!pending) {
    sendResponse(id, { ok: false, reason: 'not_found' })
    return
  }

  pendingPermissions.delete(requestId)
  clearTimeout(pending.timeout)

  const behavior = params?.behavior === 'allow' ? 'allow' : 'deny'
  const updatedInput = params?.updatedInput
  const message = typeof params?.message === 'string' ? params.message : undefined
  const interrupt = typeof params?.interrupt === 'boolean' ? params.interrupt : undefined

  pending.resolve({
    behavior,
    ...(updatedInput !== undefined ? { updatedInput } : {}),
    ...(message ? { message } : {}),
    ...(interrupt !== undefined ? { interrupt } : {})
  })

  sendResponse(id, { ok: true })
}

async function handleMessage(line) {
  const s = String(line ?? '').trim()
  if (!s) return

  let msg
  try {
    msg = JSON.parse(s)
  } catch {
    stderrInfo('收到无法解析的 JSON（已忽略）')
    return
  }

  if (msg?.jsonrpc !== '2.0') return

  const { id, method, params } = msg

  if (!method) return

  try {
    if (method === 'initialize') {
      await handleInitialize(id, params)
      return
    }
    if (method === 'agent.run') {
      void handleAgentRun(id, params)
      return
    }
    if (method === 'agent.abort') {
      handleAgentAbort(params)
      return
    }
    if (method === 'permission.respond') {
      handlePermissionRespond(id, params)
      return
    }

    if (id !== undefined && id !== null) {
      sendError(id, -32601, `Method not found: ${String(method)}`)
    }
  } catch (e) {
    if (id !== undefined && id !== null) {
      sendError(id, -32000, e?.message ?? String(e))
    } else {
      stderrInfo(`处理消息失败：${e?.message ?? String(e)}`)
    }
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => { void handleMessage(line) })

process.on('SIGINT', () => {
  try { currentAbortController?.abort() } catch { }
  process.exit(0)
})

process.on('SIGTERM', () => {
  try { currentAbortController?.abort() } catch { }
  process.exit(0)
})

stderrInfo(`Kelivo Agent Bridge started (protocol=${PROTOCOL_VERSION}, mock=${process.env.MOCK === '1'})`)
