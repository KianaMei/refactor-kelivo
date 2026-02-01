/**
 * Agent 页面
 * 对齐旧版 Kelivo 的 desktop_agent_page.dart
 * 包括：Agent 管理、会话列表、消息流、权限控制
 */
import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Plus,
  Settings,
  Play,
  Square,
  Trash2,
  FolderOpen,
  ChevronRight,
  Bot,
  MessageSquare,
  Send,
  RefreshCw,
  Terminal,
  Shield,
  Check,
  X,
  Edit2,
  Cpu
} from 'lucide-react'
import { MarkdownView } from '../components/MarkdownView'

interface Agent {
  id: string
  name: string
  model: string
  systemPrompt?: string
  maxIterations?: number
  createdAt: number
}

interface AgentSession {
  id: string
  agentId: string
  name: string
  createdAt: number
  messages: AgentMessage[]
}

interface AgentMessage {
  id: string
  type: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  ts: number
  toolName?: string
  toolStatus?: 'pending' | 'running' | 'done' | 'error'
}

interface PermissionRequest {
  id: string
  toolName: string
  description: string
  args?: Record<string, any>
}

function safeUuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}

export function AgentPage() {
  // Agent 列表
  const [agents, setAgents] = useState<Agent[]>(() => [
    {
      id: 'agent-1',
      name: '默认 Agent',
      model: 'claude-3-5-sonnet-20241022',
      systemPrompt: '你是一个智能助手，可以帮助用户完成各种任务。',
      maxIterations: 10,
      createdAt: Date.now() - 1000 * 60 * 60 * 24
    }
  ])
  const [currentAgentId, setCurrentAgentId] = useState<string>('agent-1')

  // 会话列表
  const [sessions, setSessions] = useState<AgentSession[]>(() => [
    {
      id: 'session-1',
      agentId: 'agent-1',
      name: '示例会话',
      createdAt: Date.now() - 1000 * 60 * 30,
      messages: [
        { id: 'm1', type: 'user', content: '帮我创建一个 React 组件', ts: Date.now() - 1000 * 60 * 25 },
        { id: 'm2', type: 'assistant', content: '好的，我来帮你创建一个 React 组件。首先让我分析一下需求...', ts: Date.now() - 1000 * 60 * 24 },
        { id: 'm3', type: 'tool', content: '写入文件 src/components/MyComponent.tsx', toolName: 'write_file', toolStatus: 'done', ts: Date.now() - 1000 * 60 * 23 },
        { id: 'm4', type: 'assistant', content: '我已经创建了一个基础的 React 组件 `MyComponent.tsx`。你可以根据需要修改它。', ts: Date.now() - 1000 * 60 * 22 }
      ]
    }
  ])
  const [currentSessionId, setCurrentSessionId] = useState<string>('session-1')

  // 工作目录
  const [workingDirectory, setWorkingDirectory] = useState('C:\\mycode')

  // 输入与生成状态
  const [input, setInput] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  // 权限请求
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null)

  // 设置对话框
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)

  // 滚动引用
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 当前 agent 和 session
  const currentAgent = useMemo(() => agents.find((a) => a.id === currentAgentId) ?? null, [agents, currentAgentId])
  const currentSession = useMemo(() => sessions.find((s) => s.id === currentSessionId) ?? null, [sessions, currentSessionId])
  const agentSessions = useMemo(() => sessions.filter((s) => s.agentId === currentAgentId), [sessions, currentAgentId])

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentSession?.messages.length])

  // 创建新 Agent
  function handleCreateAgent() {
    const id = safeUuid()
    const newAgent: Agent = {
      id,
      name: `Agent ${agents.length + 1}`,
      model: 'claude-3-5-sonnet-20241022',
      maxIterations: 10,
      createdAt: Date.now()
    }
    setAgents((prev) => [...prev, newAgent])
    setCurrentAgentId(id)
  }

  // 删除 Agent
  function handleDeleteAgent(agentId: string) {
    if (agents.length <= 1) return
    setAgents((prev) => prev.filter((a) => a.id !== agentId))
    setSessions((prev) => prev.filter((s) => s.agentId !== agentId))
    if (currentAgentId === agentId) {
      setCurrentAgentId(agents.find((a) => a.id !== agentId)?.id ?? '')
    }
  }

  // 创建新会话
  function handleCreateSession() {
    if (!currentAgentId) return
    const id = safeUuid()
    const newSession: AgentSession = {
      id,
      agentId: currentAgentId,
      name: '新会话',
      createdAt: Date.now(),
      messages: []
    }
    setSessions((prev) => [newSession, ...prev])
    setCurrentSessionId(id)
  }

  // 删除会话
  function handleDeleteSession(sessionId: string) {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    if (currentSessionId === sessionId) {
      const remaining = sessions.filter((s) => s.id !== sessionId && s.agentId === currentAgentId)
      setCurrentSessionId(remaining[0]?.id ?? '')
    }
  }

  // 提交任务
  async function handleSubmit() {
    const prompt = input.trim()
    if (!prompt) return
    if (isRunning) return
    if (!currentAgentId) return

    // 如果没有当前会话，创建一个
    let sessionId = currentSessionId
    const existingSession = sessions.find((s) => s.id === sessionId)
    if (!sessionId || !existingSession || existingSession.agentId !== currentAgentId) {
      const id = safeUuid()
      const newSession: AgentSession = {
        id,
        agentId: currentAgentId,
        name: prompt.slice(0, 30),
        createdAt: Date.now(),
        messages: []
      }
      setSessions((prev) => [newSession, ...prev])
      setCurrentSessionId(id)
      sessionId = id
    }

    // 添加用户消息
    const userMsg: AgentMessage = { id: safeUuid(), type: 'user', content: prompt, ts: Date.now() }
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, messages: [...s.messages, userMsg] } : s))
    )
    setInput('')
    setIsRunning(true)

    // 模拟 Agent 执行
    try {
      await simulateAgentRun(sessionId, prompt)
    } finally {
      setIsRunning(false)
    }
  }

  // 模拟 Agent 执行流程
  async function simulateAgentRun(sessionId: string, prompt: string) {
    // 思考
    await new Promise((r) => setTimeout(r, 500))
    const thinkMsg: AgentMessage = {
      id: safeUuid(),
      type: 'assistant',
      content: '让我分析一下这个任务...',
      ts: Date.now()
    }
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, messages: [...s.messages, thinkMsg] } : s))
    )

    // 工具调用
    await new Promise((r) => setTimeout(r, 800))
    const toolMsg: AgentMessage = {
      id: safeUuid(),
      type: 'tool',
      content: '执行命令: ls -la',
      toolName: 'execute_command',
      toolStatus: 'done',
      ts: Date.now()
    }
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, messages: [...s.messages, toolMsg] } : s))
    )

    // 最终回复
    await new Promise((r) => setTimeout(r, 600))
    const finalMsg: AgentMessage = {
      id: safeUuid(),
      type: 'assistant',
      content: `我已经完成了你的任务：\n\n> ${prompt}\n\n任务执行成功！`,
      ts: Date.now()
    }
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, messages: [...s.messages, finalMsg] } : s))
    )
  }

  // 停止执行
  function handleStop() {
    setIsRunning(false)
  }

  // 响应权限请求
  function handlePermissionResponse(approved: boolean) {
    // 在实际实现中通知 Agent
    console.log('Permission response:', approved)
    setPermissionRequest(null)
  }

  // 保存 Agent 设置
  function handleSaveAgent(agent: Agent) {
    setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)))
    setEditingAgent(null)
    setSettingsOpen(false)
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 左侧边栏 */}
      <div className="agentSidebar frosted">
        {/* Agent 选择 */}
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
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                className={`agentListItem ${agent.id === currentAgentId ? 'agentListItemActive' : ''}`}
                onClick={() => setCurrentAgentId(agent.id)}
              >
                <Bot size={14} />
                <span style={{ flex: 1 }}>{agent.name}</span>
                <button
                  type="button"
                  className="btn btn-icon btn-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingAgent(agent)
                    setSettingsOpen(true)
                  }}
                >
                  <Settings size={12} />
                </button>
              </button>
            ))}
          </div>
        </div>

        {/* 会话列表 */}
        <div className="agentSidebarSection" style={{ flex: 1 }}>
          <div className="agentSidebarSectionHeader">
            <MessageSquare size={14} />
            <span>会话</span>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-icon btn-sm" onClick={handleCreateSession} title="新建会话">
              <Plus size={14} />
            </button>
          </div>
          <div className="agentSessionList">
            {agentSessions.length === 0 ? (
              <div style={{ padding: 12, opacity: 0.5, fontSize: 12 }}>暂无会话</div>
            ) : (
              agentSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`agentSessionItem ${session.id === currentSessionId ? 'agentSessionItemActive' : ''}`}
                  onClick={() => setCurrentSessionId(session.id)}
                >
                  <span style={{ flex: 1 }}>{session.name}</span>
                  <span style={{ fontSize: 11, opacity: 0.5 }}>{session.messages.length}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 工作目录 */}
        <div className="agentWorkingDir">
          <FolderOpen size={14} />
          <span style={{ flex: 1, fontSize: 12, opacity: 0.7 }}>{workingDirectory}</span>
          <button
            type="button"
            className="btn btn-icon btn-sm"
            onClick={() => {
              const dir = prompt('输入工作目录', workingDirectory)
              if (dir) setWorkingDirectory(dir)
            }}
          >
            <Edit2 size={12} />
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* 顶部栏 */}
        <div className="agentTopBar frosted">
          <Bot size={20} />
          <span style={{ fontWeight: 700 }}>{currentAgent?.name ?? 'Agent'}</span>
          <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 }}>{currentAgent?.model ?? ''}</span>
          <div style={{ flex: 1 }} />
          {isRunning && (
            <span style={{ fontSize: 12, color: 'var(--primary)' }}>
              <RefreshCw size={12} className="spinning" style={{ marginRight: 6 }} />
              执行中...
            </span>
          )}
        </div>

        {/* 消息列表 */}
        <div className="agentMessages">
          {!currentSession || currentSession.messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, opacity: 0.5 }}>
              <Cpu size={48} style={{ marginBottom: 16 }} />
              <div style={{ fontSize: 16, marginBottom: 8 }}>Agent 模式</div>
              <div style={{ fontSize: 13 }}>输入任务描述，Agent 将自动规划并执行</div>
            </div>
          ) : (
            currentSession.messages.map((msg) => (
              <div key={msg.id} className={`agentMessage agentMessage-${msg.type}`}>
                {msg.type === 'tool' ? (
                  <div className="agentToolCall">
                    <Terminal size={14} />
                    <span style={{ flex: 1 }}>{msg.toolName}</span>
                    <span className={`agentToolStatus agentToolStatus-${msg.toolStatus}`}>
                      {msg.toolStatus === 'done' ? <Check size={12} /> : <RefreshCw size={12} className="spinning" />}
                    </span>
                  </div>
                ) : null}
                <div className="agentMessageContent">
                  <MarkdownView content={msg.content} />
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区 */}
        <div className="agentInputArea frosted">
          <textarea
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="描述你想要完成的任务..."
            rows={3}
            style={{ flex: 1, resize: 'none' }}
            disabled={isRunning}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            {isRunning ? (
              <button type="button" className="btn btn-primary" onClick={handleStop}>
                <Square size={16} />
                <span>停止</span>
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={!input.trim()}>
                <Play size={16} />
                <span>执行</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 权限请求对话框 */}
      {permissionRequest && (
        <div className="modalOverlay">
          <div className="modalSurface frosted" style={{ width: 440, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Shield size={24} style={{ color: 'var(--warning)' }} />
              <div style={{ fontWeight: 700, fontSize: 16 }}>权限请求</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>{permissionRequest.toolName}</strong>
            </div>
            <div style={{ opacity: 0.8, marginBottom: 16 }}>{permissionRequest.description}</div>
            {permissionRequest.args && (
              <pre style={{ padding: 12, borderRadius: 8, background: 'var(--panel)', fontSize: 12, overflow: 'auto', maxHeight: 150, marginBottom: 16 }}>
                {JSON.stringify(permissionRequest.args, null, 2)}
              </pre>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => handlePermissionResponse(false)}>
                <X size={14} />
                <span>拒绝</span>
              </button>
              <button type="button" className="btn btn-primary" onClick={() => handlePermissionResponse(true)}>
                <Check size={14} />
                <span>允许</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent 设置对话框 */}
      {settingsOpen && editingAgent && (
        <div className="modalOverlay" onMouseDown={() => setSettingsOpen(false)}>
          <div className="modalSurface frosted" style={{ width: 500, padding: 20 }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Agent 设置</div>
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
                <label style={{ display: 'block', fontSize: 12, opacity: 0.7, marginBottom: 4 }}>模型</label>
                <input
                  className="input"
                  value={editingAgent.model}
                  onChange={(e) => setEditingAgent({ ...editingAgent, model: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, opacity: 0.7, marginBottom: 4 }}>系统提示词</label>
                <textarea
                  className="input"
                  value={editingAgent.systemPrompt ?? ''}
                  onChange={(e) => setEditingAgent({ ...editingAgent, systemPrompt: e.target.value })}
                  style={{ width: '100%', minHeight: 100, resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, opacity: 0.7, marginBottom: 4 }}>最大迭代次数</label>
                <input
                  className="input"
                  type="number"
                  value={editingAgent.maxIterations ?? 10}
                  onChange={(e) => setEditingAgent({ ...editingAgent, maxIterations: Number(e.target.value) })}
                  style={{ width: 100 }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn" onClick={() => setSettingsOpen(false)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={() => handleSaveAgent(editingAgent)}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
