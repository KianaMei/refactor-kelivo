/**
 * Agent 页面（Bridge 子进程）
 * - Agent 模板：来自 config.agentConfigs（仅 name/prompt）
 * - 会话/消息：来自 SQLite（agent_sessions/agent_messages）
 * - 运行：通过 main 的 Agent IPC 启动，并监听 AgentEvent 增量更新
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  Check,
  MessageSquare,
  Plus,
  Settings,
  Shield,
  Trash2,
  X
} from 'lucide-react'

import type {
  AgentSdkProvider,
  AppConfig,
  ClaudePermissionMode,
  CodexApprovalPolicy,
  CodexSandboxMode,
  AgentConfig,
  ProviderConfigV2
} from '../../../shared/types'
import { useConfig } from '../contexts/ConfigContext'
import type { DbAgentMessage, DbAgentSession } from '../../../shared/db-types'
import type { AgentPermissionRequestEvent, AgentRunStartParams } from '../../../shared/agentRuntime'
import { toast } from 'sonner'
import { AgentConfigDialog } from './agent/AgentConfigDialog'
import { AgentAlertDialog } from './agent/components/AgentAlertDialog'
import { AgentHome } from './agent/components/AgentHome'
import { AgentMessages } from './agent/components/AgentMessages'
import { AgentComposer } from './agent/components/AgentComposer'
import { safeUuid } from '../../../shared/utils'

function nowIso(): string {
  return new Date().toISOString()
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id)
  if (idx < 0) return [...list, item]
  const next = list.slice()
  next[idx] = item
  return next
}

export function AgentPage() {
  const { config, updateConfig: onSave } = useConfig()

  const agentList = useMemo(() => {
    const order = config.agentsOrder ?? []
    const map = config.agentConfigs ?? {}
    return order.map((id) => map[id]).filter(Boolean) as AgentConfig[]
  }, [config])

  const [currentAgentId, setCurrentAgentId] = useState<string>(() => agentList[0]?.id ?? '')

  const [sessions, setSessions] = useState<DbAgentSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string>('')
  const [messages, setMessages] = useState<DbAgentMessage[]>([])

  const [workingDirectory, setWorkingDirectory] = useState<string>('C:\\mycode')
  const [input, setInput] = useState<string>('')

  // 运行态配置（UI 选择；runStart 时 main 会持久化到 config.agentRuntime）
  const [sdkProvider, setSdkProvider] = useState<AgentSdkProvider>(config.agentRuntime.lastSdkProvider)
  const [apiProviderId, setApiProviderId] = useState<string | null>(config.agentRuntime.lastApiProviderIdBySdk[sdkProvider])
  const [modelId, setModelId] = useState<string | null>(config.agentRuntime.lastModelIdBySdk[sdkProvider])
  const [claudePermissionMode, setClaudePermissionMode] = useState<ClaudePermissionMode>(config.agentRuntime.claudePermissionMode)
  const [codexSandboxMode, setCodexSandboxMode] = useState<CodexSandboxMode>(config.agentRuntime.codexSandboxMode)
  const [codexApprovalPolicy, setCodexApprovalPolicy] = useState<CodexApprovalPolicy>(config.agentRuntime.codexApprovalPolicy)

  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [runningRunId, setRunningRunId] = useState<string | null>(null)
  const [permissionRequest, setPermissionRequest] = useState<AgentPermissionRequestEvent | null>(null)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null)
  const [agentConfigOpen, setAgentConfigOpen] = useState(false)
  const [showConfigAlert, setShowConfigAlert] = useState(false)

  const currentAgentIdRef = useRef<string>(currentAgentId)
  const currentSessionIdRef = useRef<string>(currentSessionId)
  const runningRunIdRef = useRef<string | null>(runningRunId)

  useEffect(() => { currentAgentIdRef.current = currentAgentId }, [currentAgentId])
  useEffect(() => { currentSessionIdRef.current = currentSessionId }, [currentSessionId])
  useEffect(() => { runningRunIdRef.current = runningRunId }, [runningRunId])

  // config 变化时：兜底修正当前选择
  useEffect(() => {
    if (!currentAgentIdRef.current && agentList[0]?.id) {
      setCurrentAgentId(agentList[0].id)
    }
  }, [agentList])

  // 切换 sdkProvider 时，跟随加载该 SDK 的 lastApiProviderId/modelId
  useEffect(() => {
    setApiProviderId(config.agentRuntime.lastApiProviderIdBySdk[sdkProvider])
    setModelId(config.agentRuntime.lastModelIdBySdk[sdkProvider])
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // config 不加入依赖：仅在 sdkProvider 切换时加载该 SDK 对应的上次使用记录，避免 config 变更时误重置
  }, [sdkProvider])

  // 加载 sessions
  useEffect(() => {
    let cancelled = false
    if (!currentAgentId) return
    window.api.db.agentSessions
      .list(currentAgentId)
      .then((rows) => {
        if (cancelled) return
        setSessions(rows)
        const first = rows[0]?.id ?? ''
        setCurrentSessionId((prev) => (prev && rows.some((s) => s.id === prev) ? prev : first))
      })
      .catch(() => { })
    return () => { cancelled = true }
  }, [currentAgentId])

  // 加载 messages
  useEffect(() => {
    let cancelled = false
    if (!currentSessionId) {
      setMessages([])
      return
    }
    window.api.db.agentMessages
      .list(currentSessionId)
      .then((rows) => {
        if (cancelled) return
        setMessages(rows)

        // 会话切换时，用会话 workingDirectory 兜底
        const sess = sessions.find((s) => s.id === currentSessionId)
        if (sess?.workingDirectory) setWorkingDirectory(sess.workingDirectory)
      })
      .catch(() => { })
    return () => { cancelled = true }
  }, [currentSessionId, sessions])

  // 增量事件订阅
  useEffect(() => {
    return window.api.agent.onEvent((evt) => {
      if (evt.kind === 'permission.request') {
        setPermissionRequest(evt.request)
        return
      }
      if (evt.kind === 'run.status') {
        if (evt.runId !== runningRunIdRef.current) return
        setIsRunning(evt.status === 'running')
        if (evt.status !== 'running') setRunningRunId(null)
        return
      }
      if (evt.kind === 'session.upsert') {
        const s = evt.session
        if (s.agentId !== currentAgentIdRef.current) return
        setSessions((prev) => {
          const next = upsertById(prev, s).sort((a, b) => b.updatedAt - a.updatedAt)
          return next
        })
        return
      }
      if (evt.kind === 'message.upsert') {
        const m = evt.message
        if (m.sessionId !== currentSessionIdRef.current) return
        setMessages((prev) => upsertById(prev, m).sort((a, b) => a.sortOrder - b.sortOrder))
      }
    })
  }, [])

  const currentAgent = agentList.find((a) => a.id === currentAgentId) ?? null
  const currentSession = sessions.find((s) => s.id === currentSessionId) ?? null

  async function handleCreateAgent() {
    const id = safeUuid()
    const now = nowIso()
    const next: AppConfig = {
      ...config,
      agentsOrder: [id, ...(config.agentsOrder ?? [])],
      agentConfigs: {
        ...(config.agentConfigs ?? {}),
        [id]: { id, name: `Agent ${agentList.length + 1}`, prompt: '', createdAt: now, updatedAt: now }
      }
    }
    await onSave(next)
    setCurrentAgentId(id)
  }

  async function handleDeleteAgent(agentId: string) {
    if ((config.agentsOrder?.length ?? 0) <= 1) return
    const nextOrder = (config.agentsOrder ?? []).filter((id) => id !== agentId)
    const nextMap = { ...(config.agentConfigs ?? {}) }
    delete nextMap[agentId]
    await onSave({ ...config, agentsOrder: nextOrder, agentConfigs: nextMap })
    if (currentAgentIdRef.current === agentId) setCurrentAgentId(nextOrder[0] ?? '')
  }

  async function handleCreateSession() {
    if (!currentAgentId) return
    const id = safeUuid()
    await window.api.db.agentSessions.create({
      id,
      agentId: currentAgentId,
      name: '新会话',
      sdkProvider,
      apiProviderId,
      modelId,
      permissionMode: sdkProvider === 'claude' ? claudePermissionMode : null,
      sandboxMode: sdkProvider === 'codex' ? codexSandboxMode : null,
      approvalPolicy: sdkProvider === 'codex' ? codexApprovalPolicy : null,
      workingDirectory
    })
    const rows = await window.api.db.agentSessions.list(currentAgentId)
    setSessions(rows)
    setCurrentSessionId(id)
  }

  async function handleDeleteSession(sessionId: string) {
    await window.api.db.agentSessions.delete(sessionId)
    const rows = await window.api.db.agentSessions.list(currentAgentId)
    setSessions(rows)
    setCurrentSessionId(rows[0]?.id ?? '')
  }

  async function handleSubmit() {
    const prompt = input.trim()
    if (!prompt) return
    if (!currentAgentId) return
    if (isRunning) return

    if (!apiProviderId) {
      setShowConfigAlert(true)
      return
    }

    let allowDangerouslySkipPermissions = false
    if (sdkProvider === 'claude' && claudePermissionMode === 'bypassPermissions') {
      toast.warning('正在以 bypassPermissions 高风险模式运行 Agent')
      allowDangerouslySkipPermissions = true
    }

    setIsRunning(true)
    try {
      const params: AgentRunStartParams = {
        agentId: currentAgentId,
        sessionId: currentSessionId || null,
        prompt,
        cwd: workingDirectory,
        sdkProvider,
        apiProviderId,
        modelId,
        claudePermissionMode,
        allowDangerouslySkipPermissions,
        codexSandboxMode,
        codexApprovalPolicy
      }

      const r = await window.api.agent.runStart(params)
      setRunningRunId(r.runId)
      setCurrentSessionId(r.sessionId)
      setInput('')
    } catch (e) {
      setIsRunning(false)
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  function handleStop() {
    if (!runningRunId) return
    void window.api.agent.abort({ runId: runningRunId })
  }

  async function handlePermissionResponse(approved: boolean) {
    if (!permissionRequest) return
    try {
      await window.api.agent.respondPermission({
        requestId: permissionRequest.requestId,
        behavior: approved ? 'allow' : 'deny'
      })
    } finally {
      setPermissionRequest(null)
    }
  }

  async function handleSaveAgent(nextAgent: AgentConfig) {
    const now = nowIso()
    const next: AppConfig = {
      ...config,
      agentConfigs: {
        ...(config.agentConfigs ?? {}),
        [nextAgent.id]: { ...nextAgent, updatedAt: now }
      }
    }
    await onSave(next)
    setEditingAgent(null)
    setSettingsOpen(false)
  }

  async function handleAgentConfigSave(providerId: string, updated: unknown) {
    // 1. Update Provider Config
    const nextMap = { ...(config.providerConfigs ?? {}) }
    nextMap[providerId] = updated as ProviderConfigV2
    const nextConfig = { ...config, providerConfigs: nextMap }
    await onSave(nextConfig)

    // 2. Set as active provider for current SDK
    setApiProviderId(providerId)
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 左侧：Agent 模板 + 会话列表 */}
      <div className="agentSidebar frosted">
        <div className="agentSidebarSection">
          <div className="agentSidebarSectionHeader">
            <Bot size={14} />
            <span>Agent</span>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-icon btn-sm" onClick={handleCreateAgent} title="新建 Agent">
              <Plus size={14} />
            </button>
          </div>
          <div className="agentList">
            {agentList.map((agent) => (
              <button
                key={agent.id}
                type="button"
                className={`agentListItem ${agent.id === currentAgentId ? 'agentListItemActive' : ''}`}
                onClick={() => setCurrentAgentId(agent.id)}
              >
                <Bot size={14} />
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }} title={agent.name}>{agent.name}</span>
                <button
                  type="button"
                  className="btn btn-icon btn-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingAgent(agent)
                    setSettingsOpen(true)
                  }}
                  title="编辑"
                >
                  <Settings size={12} />
                </button>
                <button
                  type="button"
                  className="btn btn-icon btn-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleDeleteAgent(agent.id)
                  }}
                  title="删除"
                >
                  <Trash2 size={12} />
                </button>
              </button>
            ))}
          </div>
        </div>

        <div className="agentSidebarSection" style={{ flex: 1 }}>
          <div className="agentSidebarSectionHeader">
            <MessageSquare size={14} />
            <span>会话</span>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-icon btn-sm" onClick={handleCreateSession} title="新建会话">
              <Plus size={14} />
            </button>
          </div>
          <div className="agentList">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`agentListItem ${s.id === currentSessionId ? 'agentListItemActive' : ''}`}
                onClick={() => setCurrentSessionId(s.id)}
              >
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }} title={s.name}>{s.name || s.id}</span>
                <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 8 }}>{s.status}</span>
                <button
                  type="button"
                  className="btn btn-icon btn-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleDeleteSession(s.id)
                  }}
                  title="删除会话"
                >
                  <Trash2 size={12} />
                </button>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧：主界面 (Home 或 Chat) */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* 如果没有消息且不是运行中（可选：或者明确定义了 currentSessionId 为空/新会话），显示 Home View */}
        {(!messages.length && !isRunning) ? (
          <AgentHome
            input={input}
            setInput={setInput}
            onRun={handleSubmit}
            onStop={handleStop}
            isRunning={isRunning}
            workingDirectory={workingDirectory}
            config={config}
            sdkProvider={sdkProvider}
            setSdkProvider={setSdkProvider}
            apiProviderId={apiProviderId}
            setApiProviderId={setApiProviderId}
            modelId={modelId}
            setModelId={setModelId}
            claudePermissionMode={claudePermissionMode}
            setClaudePermissionMode={setClaudePermissionMode}
            codexSandboxMode={codexSandboxMode}
            setCodexSandboxMode={setCodexSandboxMode}
            codexApprovalPolicy={codexApprovalPolicy}
            setCodexApprovalPolicy={setCodexApprovalPolicy}
            onOpenConfig={() => setAgentConfigOpen(true)}
          />
        ) : (
          <>
            {/* Chat View */}
            <AgentMessages messages={messages} currentSessionId={currentSessionId} isRunning={isRunning} />

            {/* Bottom Bar Composer */}
            <div style={{ padding: '0 24px 24px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: '100%', maxWidth: 920 }}>
                <AgentComposer
                  mode="bar"
                  input={input}
                  setInput={setInput}
                  onRun={handleSubmit}
                  onStop={handleStop}
                  isRunning={isRunning}
                  workingDirectory={workingDirectory}
                  config={config}
                  sdkProvider={sdkProvider}
                  setSdkProvider={setSdkProvider}
                  apiProviderId={apiProviderId}
                  setApiProviderId={setApiProviderId}
                  modelId={modelId}
                  setModelId={setModelId}
                  claudePermissionMode={claudePermissionMode}
                  setClaudePermissionMode={setClaudePermissionMode}
                  codexSandboxMode={codexSandboxMode}
                  setCodexSandboxMode={setCodexSandboxMode}
                  codexApprovalPolicy={codexApprovalPolicy}
                  setCodexApprovalPolicy={setCodexApprovalPolicy}
                  onOpenConfig={() => setAgentConfigOpen(true)}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* 权限请求弹窗（仅在 SDK 需要时触发） */}
      {permissionRequest && (
        <div className="modalOverlay">
          <div className="modalSurface frosted" style={{ width: 520, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Shield size={24} style={{ color: 'var(--warning)' }} />
              <div style={{ fontWeight: 700, fontSize: 16 }}>权限请求</div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <strong>{permissionRequest.toolName}</strong>
            </div>
            {permissionRequest.decisionReason ? (
              <div style={{ opacity: 0.8, marginBottom: 10 }}>原因：{permissionRequest.decisionReason}</div>
            ) : null}
            <pre style={{ padding: 12, borderRadius: 8, background: 'var(--panel)', fontSize: 12, overflow: 'auto', maxHeight: 220, marginBottom: 16 }}>
              {permissionRequest.inputPreview}
            </pre>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => void handlePermissionResponse(false)}>
                <X size={14} />
                <span>拒绝</span>
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void handlePermissionResponse(true)}>
                <Check size={14} />
                <span>允许</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent 模板设置弹窗 */}
      {settingsOpen && editingAgent && (
        <div className="modalOverlay" onMouseDown={() => setSettingsOpen(false)}>
          <div className="modalSurface frosted" style={{ width: 560, padding: 20 }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Agent 模板设置</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, opacity: 0.7, marginBottom: 4 }}>名称</label>
                <input
                  className="input"
                  value={editingAgent.name}
                  onChange={(e) => setEditingAgent({ ...editingAgent, name: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Prompt（仅存模板，不绑定模型/Provider）</label>
                <textarea
                  className="input"
                  value={editingAgent.prompt ?? ''}
                  onChange={(e) => setEditingAgent({ ...editingAgent, prompt: e.target.value })}
                  style={{ width: '100%', minHeight: 180, resize: 'vertical' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn" onClick={() => setSettingsOpen(false)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void handleSaveAgent(editingAgent)}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Provider Config Dialog */}
      <AgentConfigDialog
        isOpen={agentConfigOpen}
        onClose={() => setAgentConfigOpen(false)}
        sdkProvider={sdkProvider}
        currentProviderId={apiProviderId}
        config={config}
        onSave={handleAgentConfigSave}
      />

      {/* Missing Config Alert */}
      <AgentAlertDialog
        open={showConfigAlert}
        onOpenChange={setShowConfigAlert}
        title="需要配置 Provider"
        description="未检测到可用的 Provider 配置 (API Key)。是否立即进行配置？"
        confirmText="去配置"
        onConfirm={() => setAgentConfigOpen(true)}
      />
    </div>
  )
}
