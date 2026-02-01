/**
 * 聊天页面 - 重构版
 * 对齐旧版 Kelivo 的 home_page.dart
 * 包括：三栏布局（会话列表 + 消息区 + 右侧面板）
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Settings, ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react'

import type { AppConfig } from '../../../shared/types'
import type { ChatMessageInput } from '../../../shared/chat'
import { ConversationSidebar, type Conversation } from './chat/ConversationSidebar'
import { ChatRightPanel } from './chat/ChatRightPanel'
import { MessageBubble, type ChatMessage } from './chat/MessageBubble'
import { ChatInputBar, type Attachment, type MentionedModel } from './chat/ChatInputBar'

function safeUuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}

interface Props {
  config: AppConfig
  onSave: (next: AppConfig) => Promise<void>
  onOpenDefaultModelSettings: () => void
  onOpenSettings?: (pane?: string) => void
}

export function ChatPage(props: Props) {
  const { config, onSave } = props

  // 会话状态
  const [conversations, setConversations] = useState<Conversation[]>(() => [
    { id: 'c1', title: '新对话', updatedAt: Date.now(), messageCount: 1 },
    { id: 'c2', title: '示例：代码渲染', updatedAt: Date.now() - 1000 * 60 * 20, messageCount: 2 }
  ])
  const [activeConvId, setActiveConvId] = useState<string>('c1')
  const [loadingConversationIds, setLoadingConversationIds] = useState<Set<string>>(new Set())

  // 消息状态
  const [messagesByConv, setMessagesByConv] = useState<Record<string, ChatMessage[]>>(() => ({
    c1: [
      {
        id: 'm_welcome',
        role: 'assistant',
        content: 'Kelivo（重构版）已启动。现在先把 UI 结构对齐旧版 Kelivo，后续再接入真实后端与流式输出。',
        ts: Date.now() - 1000 * 10
      }
    ],
    c2: [
      {
        id: 'm_code_user',
        role: 'user',
        content: '请渲染一段 TypeScript 代码块。',
        ts: Date.now() - 1000 * 60 * 10
      },
      {
        id: 'm_code_assistant',
        role: 'assistant',
        content:
          '```ts\nexport function add(a: number, b: number) {\n  return a + b\n}\n```\n\n这是一个简单的加法函数示例。',
        ts: Date.now() - 1000 * 60 * 9,
        usage: { promptTokens: 45, completionTokens: 32, totalTokens: 77 }
      }
    ]
  }))

  // 输入状态
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [mentionedModels, setMentionedModels] = useState<MentionedModel[]>([])

  // UI 状态
  const [rightOpen, setRightOpen] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const streamingRef = useRef<{ streamId: string; convId: string; msgId: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 模型选择器
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelPickerProviderId, setModelPickerProviderId] = useState<string>('')
  const [modelPickerModels, setModelPickerModels] = useState<string[]>([])
  const [modelPickerBusy, setModelPickerBusy] = useState(false)
  const [modelPickerErr, setModelPickerErr] = useState<string | null>(null)
  const [modelPickerQuery, setModelPickerQuery] = useState('')
  const [modelPickerManual, setModelPickerManual] = useState('')

  // 计算属性
  const activeMessages = messagesByConv[activeConvId] ?? []
  const currentProvider = useMemo(() => {
    const k = config.currentModelProvider
    if (!k) return null
    return config.providerConfigs[k] ?? null
  }, [config])

  const needsDefaultModel = !config.currentModelProvider || !config.currentModelId

  const providers = useMemo(() => {
    const map = config.providerConfigs
    const order = config.providersOrder
    const list = order.map((k) => map[k]).filter(Boolean)
    for (const [k, v] of Object.entries(map)) {
      if (!order.includes(k)) list.push(v)
    }
    return list
  }, [config.providerConfigs, config.providersOrder])

  const filteredModelList = useMemo(() => {
    const q = modelPickerQuery.trim().toLowerCase()
    if (!q) return modelPickerModels
    return modelPickerModels.filter((m) => m.toLowerCase().includes(q))
  }, [modelPickerModels, modelPickerQuery])

  // 快捷短语（后续从 config 读取）
  const quickPhrases = useMemo(() => [
    { id: 'qp-1', title: '继续', content: '请继续' },
    { id: 'qp-2', title: '总结', content: '请总结上面的内容' },
    { id: 'qp-3', title: '翻译中文', content: '请将上面的内容翻译成中文' }
  ], [])

  // 流式监听
  useEffect(() => {
    const offChunk = window.api.chat.onChunk((evt) => {
      const st = streamingRef.current
      if (!st || st.streamId !== evt.streamId) return

      if (evt.chunk.content) {
        setMessagesByConv((prev) => {
          const list = prev[st.convId] ?? []
          const next = list.map((m) => (m.id === st.msgId ? { ...m, content: m.content + evt.chunk.content } : m))
          return { ...prev, [st.convId]: next }
        })
      }

      if (evt.chunk.isDone) {
        streamingRef.current = null
        setIsGenerating(false)
        setLoadingConversationIds((prev) => {
          const next = new Set(prev)
          next.delete(st.convId)
          return next
        })
      }
    })

    const offError = window.api.chat.onError((evt) => {
      const st = streamingRef.current
      if (!st || st.streamId !== evt.streamId) return
      setMessagesByConv((prev) => {
        const list = prev[st.convId] ?? []
        const next = list.map((m) =>
          m.id === st.msgId ? { ...m, content: (m.content ? m.content + '\n\n' : '') + `【错误】${evt.message}` } : m
        )
        return { ...prev, [st.convId]: next }
      })
      streamingRef.current = null
      setIsGenerating(false)
      setLoadingConversationIds((prev) => {
        const next = new Set(prev)
        next.delete(st.convId)
        return next
      })
    })

    return () => {
      offChunk()
      offError()
    }
  }, [])

  // 模型列表刷新
  useEffect(() => {
    if (!modelPickerOpen) return
    if (!modelPickerProviderId) return
    setModelPickerQuery('')
    setModelPickerManual('')
    void refreshModelList(modelPickerProviderId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelPickerOpen, modelPickerProviderId])

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages.length])

  // 会话操作
  function handleNewConversation() {
    const id = safeUuid()
    const conv: Conversation = { id, title: '新对话', updatedAt: Date.now(), messageCount: 0 }
    setConversations((prev) => [conv, ...prev])
    setMessagesByConv((prev) => ({ ...prev, [id]: [] }))
    setActiveConvId(id)
  }

  function handleRenameConversation(id: string, newTitle: string) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c)))
  }

  function handleDeleteConversation(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    setMessagesByConv((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    if (activeConvId === id) {
      const remaining = conversations.filter((c) => c.id !== id)
      if (remaining.length > 0) {
        setActiveConvId(remaining[0].id)
      } else {
        handleNewConversation()
      }
    }
  }

  function handleTogglePinConversation(id: string) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)))
  }

  // 发送消息
  function handleSend() {
    const text = draft.trim()
    if (!text) return
    if (isGenerating) return

    const providerId = config.currentModelProvider
    const modelId = config.currentModelId
    const now = Date.now()
    const userMsg: ChatMessage = { id: safeUuid(), role: 'user', content: text, ts: now }

    setDraft('')
    setAttachments([])
    setMentionedModels([])

    // 未配置默认模型时，直接提示用户去设置页配置。
    if (!providerId || !modelId) {
      setMessagesByConv((prev) => {
        const list = prev[activeConvId] ?? []
        return {
          ...prev,
          [activeConvId]: [
            ...list,
            userMsg,
            {
              id: safeUuid(),
              role: 'assistant',
              content: '请先配置默认模型（右上角提示处或点击"去设置"）。',
              ts: now + 1
            }
          ]
        }
      })
      return
    }

    const assistantMsgId = safeUuid()
    setMessagesByConv((prev) => {
      const list = prev[activeConvId] ?? []
      return {
        ...prev,
        [activeConvId]: [
          ...list,
          userMsg,
          {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            ts: now + 1
          }
        ]
      }
    })

    // 更新会话时间和消息数
    setConversations((prev) =>
      prev
        .map((c) =>
          c.id === activeConvId
            ? { ...c, updatedAt: Date.now(), messageCount: (c.messageCount ?? 0) + 2 }
            : c
        )
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return b.updatedAt - a.updatedAt
        })
    )

    setIsGenerating(true)
    setLoadingConversationIds((prev) => new Set(prev).add(activeConvId))

    void (async () => {
      try {
        const reqMessages: ChatMessageInput[] = [...activeMessages, userMsg].map((m) => ({
          role: m.role,
          content: m.content
        }))
        const streamId = await window.api.chat.startStream({
          providerId,
          modelId,
          messages: reqMessages
        })
        streamingRef.current = { streamId, convId: activeConvId, msgId: assistantMsgId }
      } catch (e) {
        setMessagesByConv((prev) => {
          const list = prev[activeConvId] ?? []
          const next = list.map((m) =>
            m.id === assistantMsgId ? { ...m, content: `【错误】${e instanceof Error ? e.message : String(e)}` } : m
          )
          return { ...prev, [activeConvId]: next }
        })
        setIsGenerating(false)
        setLoadingConversationIds((prev) => {
          const next = new Set(prev)
          next.delete(activeConvId)
          return next
        })
      }
    })()
  }

  function handleStop() {
    const st = streamingRef.current
    if (!st) return
    void window.api.chat.abort(st.streamId)
  }

  // 消息操作
  function handleDeleteMessage(msg: ChatMessage) {
    setMessagesByConv((prev) => {
      const list = prev[activeConvId] ?? []
      return { ...prev, [activeConvId]: list.filter((m) => m.id !== msg.id) }
    })
  }

  function handleEditMessage(msg: ChatMessage, newContent: string) {
    setMessagesByConv((prev) => {
      const list = prev[activeConvId] ?? []
      return { ...prev, [activeConvId]: list.map((m) => (m.id === msg.id ? { ...m, content: newContent } : m)) }
    })
  }

  function handleRegenerateMessage(msg: ChatMessage) {
    // TODO: 实现重新生成逻辑
    console.log('Regenerate:', msg.id)
  }

  // 附件操作
  function handleAddAttachment(files: FileList) {
    const newAttachments: Attachment[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const isImage = file.type.startsWith('image/')
      newAttachments.push({
        id: safeUuid(),
        type: isImage ? 'image' : 'file',
        name: file.name,
        url: URL.createObjectURL(file),
        file
      })
    }
    setAttachments((prev) => [...prev, ...newAttachments])
  }

  function handleRemoveAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  // 模型选择
  async function refreshModelList(providerId: string) {
    setModelPickerErr(null)
    if (!providerId) return
    setModelPickerBusy(true)
    try {
      const res = await window.api.models.list(providerId)
      setModelPickerModels(res.models)
      if (res.models.length === 0) {
        setModelPickerErr('上游未返回可用模型列表（可手动输入模型 ID）')
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      const m1 = /Error invoking remote method 'models:list':\s*(.+)$/.exec(raw)
      const m2 = /TypeError:\s*(.+)$/.exec(raw)
      const msg = m1?.[1] ?? m2?.[1] ?? raw
      if (modelPickerModels.length > 0) setModelPickerErr(`刷新失败：${msg}（已显示上次获取的模型列表）`)
      else setModelPickerErr(msg)
    } finally {
      setModelPickerBusy(false)
    }
  }

  async function pickModel(modelId: string) {
    const mid = modelId.trim()
    if (!mid) return

    const pid = modelPickerProviderId || config.currentModelProvider
    if (!pid) return

    await onSave({
      ...config,
      currentModelProvider: pid,
      currentModelId: mid
    })
    setModelPickerOpen(false)
  }

  function openModelPicker() {
    const pid = config.currentModelProvider ?? providers[0]?.id ?? ''
    setModelPickerProviderId(pid)
    setModelPickerOpen(true)
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 左侧会话栏 */}
      <ConversationSidebar
        conversations={conversations}
        activeConvId={activeConvId}
        loadingConversationIds={loadingConversationIds}
        onSelect={setActiveConvId}
        onNew={handleNewConversation}
        onRename={handleRenameConversation}
        onDelete={handleDeleteConversation}
        onTogglePin={handleTogglePinConversation}
      />

      {/* 中间聊天区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* 顶部栏 */}
        <div className="chatTopBar frosted">
          <div style={{ fontWeight: 700 }}>Kelivo</div>
          <div style={{ opacity: 0.75, fontSize: 12 }}>
            默认模型：{currentProvider ? currentProvider.name : '未设置'}
            {config.currentModelId ? ` · ${config.currentModelId}` : ''}
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={openModelPicker}>
            切换模型
          </button>
          <button type="button" className="btn btn-icon" onClick={() => setRightOpen((v) => !v)} title={rightOpen ? '隐藏右侧' : '显示右侧'}>
            {rightOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* 默认模型提示 */}
        {needsDefaultModel && (
          <div className="surface frosted" style={{ margin: 12, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            <AlertCircle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800 }}>还未配置默认模型</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>配置后即可开始对话与流式输出。</div>
            </div>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-primary" onClick={props.onOpenDefaultModelSettings}>
              去设置
            </button>
          </div>
        )}

        {/* 消息列表 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {activeMessages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
              <div>开始新对话</div>
            </div>
          ) : (
            activeMessages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                isLoading={isGenerating && streamingRef.current?.msgId === m.id && !m.content}
                onEdit={handleEditMessage}
                onDelete={handleDeleteMessage}
                onRegenerate={m.role === 'assistant' ? handleRegenerateMessage : undefined}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入栏 */}
        <ChatInputBar
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          onStop={handleStop}
          isGenerating={isGenerating}
          disabled={needsDefaultModel}
          attachments={attachments}
          onAddAttachment={handleAddAttachment}
          onRemoveAttachment={handleRemoveAttachment}
          mentionedModels={mentionedModels}
          onRemoveMention={(m) => setMentionedModels((prev) => prev.filter((x) => x.modelId !== m.modelId || x.providerId !== m.providerId))}
          quickPhrases={quickPhrases}
          onQuickPhrase={(content) => setDraft((prev) => prev + content)}
        />
      </div>

      {/* 右侧工具面板 */}
      {rightOpen && (
        <ChatRightPanel
          config={config}
          currentProvider={currentProvider}
          onOpenSettings={props.onOpenSettings}
        />
      )}

      {/* 模型选择弹窗 */}
      {modelPickerOpen && (
        <div className="modalOverlay" onMouseDown={() => setModelPickerOpen(false)}>
          <div className="modalSurface frosted" style={{ width: 860, maxWidth: 'calc(100vw - 48px)', height: 640, maxHeight: 'calc(100vh - 48px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onMouseDown={(e) => e.stopPropagation()}>
            {/* 模型选择器头部 */}
            <div style={{ height: 46, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 800 }}>切换模型</div>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn" onClick={() => void refreshModelList(modelPickerProviderId)} disabled={modelPickerBusy}>
                {modelPickerBusy ? '获取中...' : '刷新'}
              </button>
              <button type="button" className="btn" onClick={() => setModelPickerOpen(false)}>
                关闭
              </button>
            </div>

            {/* 工具栏 */}
            <div style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <select
                className="select"
                value={modelPickerProviderId}
                onChange={(e) => setModelPickerProviderId(e.target.value)}
                style={{ width: 240 }}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="搜索模型"
                value={modelPickerQuery}
                onChange={(e) => setModelPickerQuery(e.target.value)}
              />
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {filteredModelList.length}/{modelPickerModels.length}
              </div>
            </div>

            {/* 错误提示 */}
            {modelPickerErr && (
              <div className="surface" style={{ margin: 12, padding: 12 }}>
                {modelPickerErr}
              </div>
            )}

            {/* 手动输入 */}
            <div style={{ padding: '0 12px 12px' }}>
              <div style={{ fontSize: 12, opacity: 0.75, margin: '10px 0 8px' }}>手动输入模型 ID</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input className="input" style={{ flex: 1 }} value={modelPickerManual} onChange={(e) => setModelPickerManual(e.target.value)} />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!modelPickerManual.trim()}
                  onClick={() => void pickModel(modelPickerManual.trim())}
                >
                  使用
                </button>
              </div>
            </div>

            {/* 模型列表 */}
            <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredModelList.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="btn btn-ghost"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => void pickModel(m)}
                >
                  {m}
                </button>
              ))}
              {modelPickerBusy && <div style={{ padding: 12, opacity: 0.75 }}>获取中...</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
