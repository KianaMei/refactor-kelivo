import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { createInterface } from 'readline'

type JsonRpcId = number

type JsonRpcError = {
  code: number
  message: string
  data?: unknown
}

type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: any
  error?: JsonRpcError
}

type JsonRpcNotification = {
  jsonrpc: '2.0'
  method: string
  params?: any
}

export type AgentBridgeInitializeResult = {
  bridgeVersion: string
  protocolVersion: number
  providers: {
    claude: { available: boolean; version: string | null; source: string }
    codex: { available: boolean; version: string | null; source: string }
  }
}

export type AgentBridgeEvent = {
  runId: string
  type: string
  [k: string]: any
}

type PendingRequest = {
  resolve: (v: any) => void
  reject: (e: Error) => void
  timeout: NodeJS.Timeout
}

function resolveBridgePath(): string {
  // 打包后：electron-builder extraResources -> process.resourcesPath/agent-bridge/bridge.mjs
  const packaged = join(process.resourcesPath, 'agent-bridge', 'bridge.mjs')
  if (existsSync(packaged)) return packaged

  // 开发态：从 out/main 回到项目根
  const dev = join(__dirname, '../../resources/agent-bridge/bridge.mjs')
  if (existsSync(dev)) return dev

  // 兜底：尝试从 app.getAppPath()（可能是 app.asar 或项目根）
  const maybe = join(app.getAppPath(), 'resources', 'agent-bridge', 'bridge.mjs')
  if (existsSync(maybe)) return maybe

  throw new Error(`未找到 bridge 脚本：${packaged} / ${dev} / ${maybe}`)
}

function safeGetElectronPath(name: Parameters<typeof app.getPath>[0]): string | null {
  try {
    const p = app.getPath(name)
    if (typeof p !== 'string') return null
    const trimmed = p.trim()
    return trimmed ? trimmed : null
  } catch {
    return null
  }
}

function buildAgentBridgeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // Electron 没有稳定公开的 `--runAsNode` 参数；通过环境变量让子进程以 Node 模式执行。
    ELECTRON_RUN_AS_NODE: '1'
  }

  // 关键：显式把 Electron 解析出来的用户目录透传给 bridge 进程。
  // 这样 claude-code 侧基于 homedir()/CLAUDE_CONFIG_DIR 的凭证发现逻辑，能与“终端启动”保持一致。
  const home = safeGetElectronPath('home')
  const appData = safeGetElectronPath('appData')
  const userData = safeGetElectronPath('userData')

  if (home) {
    env.KELIVO_HOME_DIR = home
    if (!env.HOME) env.HOME = home
    if (!env.CODEX_HOME) env.CODEX_HOME = join(home, '.codex')

    // Windows 下 Node 的 homedir() 优先取 USERPROFILE；补齐它以避免回落到异常路径。
    if (process.platform === 'win32') {
      if (!env.USERPROFILE) env.USERPROFILE = home

      const drive = /^[a-zA-Z]:/.exec(home)?.[0] ?? null
      if (drive) {
        if (!env.HOMEDRIVE) env.HOMEDRIVE = drive
        if (!env.HOMEPATH) env.HOMEPATH = home.slice(drive.length)
      }

      if (appData && !env.APPDATA) env.APPDATA = appData
      if (!env.LOCALAPPDATA) env.LOCALAPPDATA = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')
    }

    // claude-code 的默认配置目录就是 ~/.claude；显式指定可避免 homedir() 差异导致找不到凭证。
    if (!env.CLAUDE_CONFIG_DIR) env.CLAUDE_CONFIG_DIR = join(home, '.claude')
  }

  if (appData) env.KELIVO_APPDATA_DIR = appData
  if (userData) env.KELIVO_USER_DATA_DIR = userData

  return env
}

export class AgentBridgeManager {
  private child: ChildProcessWithoutNullStreams | null = null
  private nextId: JsonRpcId = 1
  private pending = new Map<JsonRpcId, PendingRequest>()
  private listeners = new Set<(evt: AgentBridgeEvent) => void>()
  private lastInit: AgentBridgeInitializeResult | null = null
  private lastExternalDepsDir: string | null = null

  onEvent(fn: (evt: AgentBridgeEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getLastInitializeResult(): AgentBridgeInitializeResult | null {
    return this.lastInit
  }

  private emit(evt: AgentBridgeEvent): void {
    for (const fn of this.listeners) {
      try { fn(evt) } catch { }
    }
  }

  private ensureProcess(): void {
    if (this.child && !this.child.killed) return

    const bridgePath = resolveBridgePath()
    const child = spawn(process.execPath, [bridgePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: app.getAppPath(),
      /* env: {
        ...process.env,
        // Electron 没有稳定公开的 `--runAsNode` 参数；通过环境变量让子进程以 Node 模式执行。
        ELECTRON_RUN_AS_NODE: '1'
      } */
      env: buildAgentBridgeEnv()
    })
    this.child = child

    child.on('exit', (code, signal) => {
      this.child = null
      this.lastInit = null
      const err = new Error(`Agent Bridge exited: code=${code ?? 'null'} signal=${signal ?? 'null'}`)
      for (const [id, p] of this.pending.entries()) {
        clearTimeout(p.timeout)
        this.pending.delete(id)
        p.reject(err)
      }
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      // bridge 约定 stderr 为调试日志；这里不做额外处理（避免把敏感信息打出来）
      // eslint-disable-next-line no-console
      console.error(String(chunk).trimEnd())
    })

    const rl = createInterface({ input: child.stdout })
    rl.on('line', (line) => this.handleStdoutLine(line))
  }

  private handleStdoutLine(line: string): void {
    const s = String(line ?? '').trim()
    if (!s) return
    let msg: JsonRpcResponse | JsonRpcNotification | null = null
    try {
      msg = JSON.parse(s)
    } catch {
      // stdout 只允许 JSON-RPC；解析失败直接忽略
      return
    }
    if (!msg || (msg as any).jsonrpc !== '2.0') return

    const id = (msg as any).id
    if (id !== undefined && id !== null) {
      const pending = this.pending.get(id as JsonRpcId)
      if (!pending) return
      this.pending.delete(id as JsonRpcId)
      clearTimeout(pending.timeout)

      const err = (msg as any).error as JsonRpcError | undefined
      if (err) {
        const e = new Error(err.message)
        ;(e as any).code = err.code
        ;(e as any).data = err.data
        pending.reject(e)
      } else {
        pending.resolve((msg as any).result)
      }
      return
    }

    const method = (msg as any).method
    if (typeof method === 'string' && method === 'notifications/event') {
      const params = (msg as any).params
      if (params && typeof params === 'object') {
        this.emit(params as AgentBridgeEvent)
      }
    }
  }

  private send(obj: any): void {
    this.ensureProcess()
    if (!this.child) throw new Error('Agent Bridge not started')
    this.child.stdin.write(JSON.stringify(obj) + '\n')
  }

  notify(method: string, params?: any): void {
    this.send({ jsonrpc: '2.0', method, params })
  }

  request<T = any>(method: string, params?: any, timeoutMs = 60000): Promise<T> {
    const id = this.nextId++
    this.ensureProcess()
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Agent Bridge request timeout: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  async initialize(externalDepsDir: string | null): Promise<AgentBridgeInitializeResult> {
    this.ensureProcess()
    const normalized = externalDepsDir && externalDepsDir.trim() ? externalDepsDir.trim() : null
    const shouldReinit = !this.lastInit || this.lastExternalDepsDir !== normalized
    if (!shouldReinit) return this.lastInit!

    const result = await this.request<AgentBridgeInitializeResult>('initialize', {
      protocolVersion: 1,
      sdkProviderSupported: ['claude', 'codex'],
      externalDepsDir: normalized
    }, 30000)

    this.lastInit = result
    this.lastExternalDepsDir = normalized
    return result
  }

  async run(params: any): Promise<any> {
    return await this.request('agent.run', params, 1000 * 60 * 60)
  }

  abort(runId: string): void {
    this.notify('agent.abort', { runId })
  }

  async respondPermission(params: any): Promise<any> {
    return await this.request('permission.respond', params, 30000)
  }

  stop(): void {
    if (!this.child) return
    try { this.child.kill() } catch { }
    this.child = null
    this.lastInit = null
  }
}
