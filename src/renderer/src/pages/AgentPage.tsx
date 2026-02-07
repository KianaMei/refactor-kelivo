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
  Play,
  Plus,
  Settings,
  Shield,
  Square,
  Trash2,
  X
} from 'lucide-react'

import type {
  AgentSdkProvider,
  AppConfig,
  ClaudePermissionMode,
  CodexApprovalPolicy,
  CodexSandboxMode,
  AgentConfig
} from '../../../shared/types'
import type { DbAgentMessage, DbAgentSession } from '../../../shared/db-types'
import type { AgentPermissionRequestEvent, AgentRunStartParams } from '../../../shared/agentRuntime'
import { MarkdownView } from '../components/MarkdownView'
import { AgentSettingsBar } from './agent/AgentSettingsBar'
import { AgentConfigDialog } from './agent/AgentConfigDialog'

function safeUuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

type Props = {
  config: AppConfig
  onSave: (next: AppConfig) => Promise<void>
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id)
  if (idx < 0) return [...list, item]
  const next = list.slice()
  next[idx] = item
  return next
}

export function AgentPage(props: Props) {
  const { config, onSave } = props

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

  const messagesEndRef = useRef<HTMLDivElement>(null)
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

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

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
      alert('请先在顶部选择一个 Providers 配置（用于提供 API Key）。')
      return
    }

    let allowDangerouslySkipPermissions = false
    if (sdkProvider === 'claude' && claudePermissionMode === 'bypassPermissions') {
      const ok = window.confirm('你选择了 bypassPermissions（高风险）。确认继续本次运行吗？')
      if (!ok) return
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
      alert(e instanceof Error ? e.message : String(e))
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
    nextMap[providerId] = updated as any
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

      {/* 右侧：消息区 + 运行配置 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* 顶部：运行配置 */}
        {/* 顶部：运行配置 */}


        {/* 消息列表 */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
          {currentSession ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map((m) => (
                <div key={m.id} className={`agentMsg ${m.type}`}>
                  {m.type === 'assistant' ? (
                    <div className="agentBubble agentBubbleAssistant">
                      <MarkdownView content={m.content} />
                      {m.isStreaming ? <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>输出中…</div> : null}
                    </div>
                  ) : m.type === 'user' ? (
                    <div className="agentBubble agentBubbleUser">
                      <MarkdownView content={m.content} />
                    </div>
                  ) : m.type === 'tool' ? (
                    <div className="agentBubble agentBubbleTool">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontWeight: 700 }}>{m.toolName ?? 'tool'}</div>
                        <div style={{ opacity: 0.7, fontSize: 12 }}>{m.toolStatus ?? ''}</div>
                      </div>
                      {m.toolInputPreview ? (
                        <pre style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'var(--panel)', fontSize: 12, overflow: 'auto' }}>
                          {m.toolInputPreview}
                        </pre>
                      ) : null}
                      {m.toolResult ? (
                        <pre style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'var(--panel)', fontSize: 12, overflow: 'auto' }}>
                          {m.toolResult}
                        </pre>
                      ) : null}
                    </div>
                  ) : (
                    <div className="agentBubble agentBubbleSystem">
                      <MarkdownView content={m.content} />
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div style={{ opacity: 0.7 }}>请选择或创建一个会话。</div>
          )}
        </div>

        {/* 输入区 */}
        {/* 输入区 */}
        <div className="agentInputBar frosted" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            className="input text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入你的任务…"
            style={{ minHeight: 80, resize: 'vertical', border: 'none', background: 'transparent', outline: 'none' }}
          />

          {/* 底部工具栏：左侧设置 Pills，右侧执行按钮 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <AgentSettingsBar
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

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ fontSize: 12, opacity: 0.5, marginRight: 8 }}>{workingDirectory}</div>
              {isRunning ? (
                <button type="button" className="btn btn-primary btn-icon" onClick={handleStop} title="停止">
                  <Square size={16} fill="white" />
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-icon" onClick={handleSubmit} disabled={!input.trim()} title="执行">
                  <Play size={16} fill="white" />
                </button>
              )}
            </div>
          </div>
        </div>
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
    </div>
  )
}

