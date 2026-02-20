import { BrowserWindow, ipcMain, app } from 'electron'
import { join } from 'path'

import { IpcChannel } from '../../shared/ipc'
import type {
  AgentEventPayload,
  AgentPermissionRespondParams,
  AgentRunAbortParams,
  AgentRunStartParams,
  AgentRunStartResult
} from '../../shared/agentRuntime'
import { loadConfig, saveConfig } from '../configStore'
import * as agentSessionRepo from '../db/repositories/agentSessionRepo'
import * as agentMessageRepo from '../db/repositories/agentMessageRepo'
import type { DbAgentSession } from '../../shared/db-types'

import { AgentBridgeManager, type AgentBridgeEvent } from './agentBridgeManager'

function safeUuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}

function broadcast(payload: AgentEventPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents.isDestroyed()) continue
    win.webContents.send(IpcChannel.AgentEvent, payload)
  }
}

type ActiveRunState = {
  runId: string
  sessionId: string
  nextSortOrder: number
  assistantDbIdByMessageId: Map<string, string>
  toolDbIdByToolCallId: Map<string, string>
}

const bridge = new AgentBridgeManager()
let activeRun: ActiveRunState | null = null

function computeDepsRoot(cfg: any): string {
  const fromCfg = cfg?.agentRuntime?.depsInstallDir
  if (typeof fromCfg === 'string' && fromCfg.trim()) return fromCfg.trim()
  return join(app.getPath('userData'), 'dependencies')
}

function computeTotalTokens(usage: any): number | null {
  if (!usage || typeof usage !== 'object') return null
  const input = Number((usage as any).input_tokens ?? (usage as any).inputTokens ?? 0)
  const output = Number((usage as any).output_tokens ?? (usage as any).outputTokens ?? 0)
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null
  return Math.max(0, Math.round(input + output))
}

async function upsertSession(sessionId: string): Promise<void> {
  const session = agentSessionRepo.getAgentSession(sessionId)
  if (!session) return
  broadcast({ kind: 'session.upsert', session })
}

async function upsertMessage(messageId: string): Promise<void> {
  const msg = agentMessageRepo.getAgentMessage(messageId)
  if (!msg) return
  broadcast({ kind: 'message.upsert', message: msg })
}

function makeAssistantDbId(sessionId: string, messageId: string): string {
  return `${sessionId}:assistant:${messageId}`
}

function makeToolDbId(sessionId: string, toolCallId: string): string {
  return `${sessionId}:tool:${toolCallId}`
}

async function handleBridgeEvent(evt: AgentBridgeEvent): Promise<void> {
  if (!activeRun) return
  if (evt.runId !== activeRun.runId) return

  const sessionId = activeRun.sessionId

  switch (evt.type) {
    case 'permission.request': {
      broadcast({
        kind: 'permission.request',
        request: {
          runId: activeRun.runId,
          requestId: String(evt.requestId ?? ''),
          toolName: String(evt.toolName ?? ''),
          toolUseId: typeof evt.toolUseId === 'string' ? evt.toolUseId : null,
          inputPreview: String(evt.inputPreview ?? ''),
          decisionReason: typeof evt.decisionReason === 'string' ? evt.decisionReason : null,
          expiresAt: Number(evt.expiresAt ?? Date.now() + 300000)
        }
      })
      return
    }

    case 'resume.id': {
      const resumeId = typeof evt.resumeId === 'string' ? evt.resumeId : null
      if (resumeId) {
        agentSessionRepo.updateAgentSession(sessionId, { sdkSessionId: resumeId })
        await upsertSession(sessionId)
      }
      return
    }

    case 'status': {
      const statusRaw = String(evt.status ?? '')
      const status: DbAgentSession['status'] =
        statusRaw === 'running' ? 'running'
          : statusRaw === 'done' ? 'done'
            : statusRaw === 'aborted' ? 'aborted'
              : statusRaw === 'error' ? 'error'
                : statusRaw || 'idle'

      const msg = typeof evt.message === 'string' ? evt.message : null
      agentSessionRepo.updateAgentSession(sessionId, {
        status,
        lastError: status === 'error' ? (msg ?? 'Unknown error') : null
      })
      await upsertSession(sessionId)

      broadcast({
        kind: 'run.status',
        runId: activeRun.runId,
        status: status === 'idle' ? 'running' : (status as any),
        ...(msg ? { message: msg } : {})
      })
      return
    }

    case 'assistant.delta': {
      const messageId = typeof evt.messageId === 'string' && evt.messageId.trim() ? evt.messageId.trim() : 'assistant'
      const delta = typeof evt.textDelta === 'string' ? evt.textDelta : ''
      if (!delta) return

      const dbId = activeRun.assistantDbIdByMessageId.get(messageId) ?? makeAssistantDbId(sessionId, messageId)
      const existed = !!agentMessageRepo.getAgentMessage(dbId)
      if (!existed) {
        agentMessageRepo.createAgentMessage({
          id: dbId,
          sessionId,
          type: 'assistant',
          content: delta,
          isStreaming: true,
          sortOrder: activeRun.nextSortOrder++
        })
      } else {
        const cur = agentMessageRepo.getAgentMessage(dbId)
        const next = (cur?.content ?? '') + delta
        agentMessageRepo.updateAgentMessage(dbId, { content: next, isStreaming: true })
      }

      activeRun.assistantDbIdByMessageId.set(messageId, dbId)
      await upsertMessage(dbId)
      return
    }

    case 'assistant.done': {
      const messageId = typeof evt.messageId === 'string' && evt.messageId.trim() ? evt.messageId.trim() : 'assistant'
      const dbId = activeRun.assistantDbIdByMessageId.get(messageId) ?? makeAssistantDbId(sessionId, messageId)
      const existed = !!agentMessageRepo.getAgentMessage(dbId)
      if (!existed) {
        agentMessageRepo.createAgentMessage({
          id: dbId,
          sessionId,
          type: 'assistant',
          content: '',
          isStreaming: false,
          sortOrder: activeRun.nextSortOrder++
        })
      } else {
        agentMessageRepo.updateAgentMessage(dbId, { isStreaming: false })
      }
      await upsertMessage(dbId)
      return
    }

    case 'tool.start': {
      const toolCallId = typeof evt.toolCallId === 'string' && evt.toolCallId.trim() ? evt.toolCallId.trim() : safeUuid()
      const toolName = typeof evt.toolName === 'string' ? evt.toolName : 'tool'
      const toolInput = evt.toolInput ?? null
      const toolInputPreview = typeof evt.toolInputPreview === 'string' ? evt.toolInputPreview : null

      const dbId = activeRun.toolDbIdByToolCallId.get(toolCallId) ?? makeToolDbId(sessionId, toolCallId)
      if (!agentMessageRepo.getAgentMessage(dbId)) {
        agentMessageRepo.createAgentMessage({
          id: dbId,
          sessionId,
          type: 'tool',
          content: '',
          toolName,
          toolInput: toolInput ? JSON.stringify(toolInput) : null,
          toolInputPreview,
          toolStatus: 'running',
          relatedToolCallId: toolCallId,
          sortOrder: activeRun.nextSortOrder++
        })
      } else {
        agentMessageRepo.updateAgentMessage(dbId, { toolStatus: 'running' })
      }

      activeRun.toolDbIdByToolCallId.set(toolCallId, dbId)
      await upsertMessage(dbId)
      return
    }

    case 'tool.done': {
      const toolCallId = typeof evt.toolCallId === 'string' && evt.toolCallId.trim() ? evt.toolCallId.trim() : null
      if (!toolCallId) return
      const toolResult = typeof evt.toolResult === 'string' ? evt.toolResult : ''

      const dbId = activeRun.toolDbIdByToolCallId.get(toolCallId) ?? makeToolDbId(sessionId, toolCallId)
      const existed = !!agentMessageRepo.getAgentMessage(dbId)
      if (!existed) {
        agentMessageRepo.createAgentMessage({
          id: dbId,
          sessionId,
          type: 'tool',
          content: '',
          toolName: 'tool',
          toolResult,
          toolStatus: 'done',
          relatedToolCallId: toolCallId,
          sortOrder: activeRun.nextSortOrder++
        })
      } else {
        agentMessageRepo.updateAgentMessage(dbId, { toolResult, toolStatus: 'done' })
      }
      await upsertMessage(dbId)
      return
    }

    case 'tool.error': {
      const toolCallId = typeof evt.toolCallId === 'string' && evt.toolCallId.trim() ? evt.toolCallId.trim() : null
      if (!toolCallId) return
      const msg = typeof evt.message === 'string' ? evt.message : 'tool error'

      const dbId = activeRun.toolDbIdByToolCallId.get(toolCallId) ?? makeToolDbId(sessionId, toolCallId)
      const existed = !!agentMessageRepo.getAgentMessage(dbId)
      if (!existed) {
        agentMessageRepo.createAgentMessage({
          id: dbId,
          sessionId,
          type: 'tool',
          content: '',
          toolName: typeof evt.toolName === 'string' ? evt.toolName : 'tool',
          toolResult: msg,
          toolStatus: 'error',
          relatedToolCallId: toolCallId,
          sortOrder: activeRun.nextSortOrder++
        })
      } else {
        agentMessageRepo.updateAgentMessage(dbId, { toolResult: msg, toolStatus: 'error' })
      }
      await upsertMessage(dbId)
      return
    }

    default:
      return
  }
}

bridge.onEvent((evt) => { void handleBridgeEvent(evt) })

export function registerAgentIpc(): void {
  ipcMain.handle(IpcChannel.AgentRunStart, async (_e, input: AgentRunStartParams): Promise<AgentRunStartResult> => {
    if (activeRun) {
      throw new Error('当前已有 Agent 在运行中（首期仅支持单并发），请先停止/等待完成。')
    }

    const cfg = await loadConfig()

    // 校验 Agent 模板
    const agentId = String(input.agentId ?? '').trim()
    if (!agentId) throw new Error('缺少 agentId')
    const agentTemplate = cfg.agentConfigs?.[agentId]
    if (!agentTemplate) throw new Error(`未找到 Agent 模板：${agentId}`)

    const userPrompt = String(input.prompt ?? '')
    const templatePrompt = typeof agentTemplate.prompt === 'string' ? agentTemplate.prompt.trim() : ''
    const bridgePrompt = templatePrompt ? `${templatePrompt}\n\n${userPrompt}` : userPrompt

    // 持久化运行态选择（只存选择，不存密钥）
    const runtime = cfg.agentRuntime
    const sdkProvider = input.sdkProvider

    const nextCfg = {
      ...cfg,
      agentRuntime: {
        ...runtime,
        lastSdkProvider: sdkProvider,
        lastApiProviderIdBySdk: {
          ...runtime.lastApiProviderIdBySdk,
          [sdkProvider]: input.apiProviderId
        },
        lastModelIdBySdk: {
          ...runtime.lastModelIdBySdk,
          [sdkProvider]: input.modelId
        },
        claudePermissionMode: input.claudePermissionMode,
        codexSandboxMode: input.codexSandboxMode,
        codexApprovalPolicy: input.codexApprovalPolicy
      }
    }
    await saveConfig(nextCfg)

    // 解析 Provider（用于 apiKey/baseUrl；不写 DB、不写日志）
    if (!input.apiProviderId) throw new Error('请先选择 Providers 配置（用于提供 API Key）')
    const provider = nextCfg.providerConfigs?.[input.apiProviderId]
    if (!provider) throw new Error(`未找到 Providers 配置：${input.apiProviderId}`)
    // if (!provider.apiKey) throw new Error('该 Providers 配置未设置 API Key') // 允许空 Key，此时回退到 CLI 自身认证

    const cwd = String(input.cwd ?? '').trim()
    if (!cwd) throw new Error('缺少 cwd（工作目录）')

    // 创建或复用 session
    const existingSessionId = input.sessionId ? String(input.sessionId).trim() : ''
    const sessionId = existingSessionId || safeUuid()
    const existing = existingSessionId ? agentSessionRepo.getAgentSession(sessionId) : null

    if (existing && existing.sdkProvider !== sdkProvider) {
      throw new Error(`会话 provider 不匹配：session=${existing.sdkProvider} 当前=${sdkProvider}`)
    }

    if (!existing) {
      agentSessionRepo.createAgentSession({
        id: sessionId,
        agentId,
        name: agentTemplate.name ?? agentId,
        sdkProvider,
        apiProviderId: input.apiProviderId,
        modelId: input.modelId,
        permissionMode: sdkProvider === 'claude' ? input.claudePermissionMode : null,
        sandboxMode: sdkProvider === 'codex' ? input.codexSandboxMode : null,
        approvalPolicy: sdkProvider === 'codex' ? input.codexApprovalPolicy : null,
        workingDirectory: cwd,
        status: 'idle'
      })
    } else {
      agentSessionRepo.updateAgentSession(sessionId, {
        name: agentTemplate.name ?? agentId,
        apiProviderId: input.apiProviderId,
        modelId: input.modelId,
        permissionMode: sdkProvider === 'claude' ? input.claudePermissionMode : null,
        sandboxMode: sdkProvider === 'codex' ? input.codexSandboxMode : null,
        approvalPolicy: sdkProvider === 'codex' ? input.codexApprovalPolicy : null,
        workingDirectory: cwd
      })
    }

    await upsertSession(sessionId)

    // 写入用户消息
    const userMsgId = safeUuid()
    agentMessageRepo.createAgentMessage({
      id: userMsgId,
      sessionId,
      type: 'user',
      content: userPrompt,
      sortOrder: agentMessageRepo.getNextSortOrder(sessionId)
    })
    await upsertMessage(userMsgId)

    // 标记 session running
    agentSessionRepo.updateAgentSession(sessionId, { status: 'running', lastError: null })
    await upsertSession(sessionId)

    // 初始化 Bridge（external deps 按配置开关）
    const depsRoot = computeDepsRoot(nextCfg)
    const useExternal = !!nextCfg.agentRuntime?.deps?.useExternal
    await bridge.initialize(useExternal ? depsRoot : null)

    const runId = safeUuid()
    activeRun = {
      runId,
      sessionId,
      nextSortOrder: agentMessageRepo.getNextSortOrder(sessionId),
      assistantDbIdByMessageId: new Map(),
      toolDbIdByToolCallId: new Map()
    }

    const resumeId = existing?.sdkSessionId ?? null

    // 启动 run（长任务不阻塞 IPC 返回）
    void bridge.run({
      runId,
      sessionId,
      sdkProvider,
      prompt: bridgePrompt,
      cwd,
      apiKey: provider.apiKey ? provider.apiKey : undefined,
      baseUrl: provider.baseUrl,
      model: input.modelId,
      permissionMode: input.claudePermissionMode,
      allowDangerouslySkipPermissions: !!input.allowDangerouslySkipPermissions,
      sandboxMode: input.codexSandboxMode,
      approvalPolicy: input.codexApprovalPolicy,
      resumeId
    }).then(async (result) => {
      const totalTokens = computeTotalTokens(result?.usage)
      const lastError = result?.success === false ? String(result?.error ?? 'Agent run failed') : null

      agentSessionRepo.updateAgentSession(sessionId, {
        sdkSessionId: typeof result?.resumeId === 'string' ? result.resumeId : undefined,
        totalTokens: totalTokens ?? undefined,
        status: result?.success ? 'done' : (result?.aborted ? 'aborted' : 'error'),
        lastError
      })
      await upsertSession(sessionId)
    }).catch(async (err) => {
      agentSessionRepo.updateAgentSession(sessionId, { status: 'error', lastError: err instanceof Error ? err.message : String(err) })
      await upsertSession(sessionId)
    }).finally(() => {
      activeRun = null
    })

    return { runId, sessionId }
  })

  ipcMain.handle(IpcChannel.AgentRunAbort, async (_e, input: AgentRunAbortParams): Promise<void> => {
    const runId = String(input?.runId ?? '').trim()
    if (!runId) return
    bridge.abort(runId)
  })

  ipcMain.handle(IpcChannel.AgentPermissionRespond, async (_e, input: AgentPermissionRespondParams): Promise<void> => {
    await bridge.respondPermission(input)
  })
}
