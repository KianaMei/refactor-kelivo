import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Plus, Search, MoreHorizontal, Trash2 } from 'lucide-react'

import type { AppConfig } from '../../../shared/types'
import type { ChatMessageInput } from '../../../shared/chat'
import { MarkdownView } from '../components/MarkdownView'
import { ChatRightPanel } from './chat/ChatRightPanel'
import { ChatInputBar, type Attachment, type MentionedModel } from './chat/ChatInputBar'

type Msg = { id: string; role: 'user' | 'assistant'; content: string; ts: number }
type Conv = { id: string; title: string; updatedAt: number; msgCount: number }

function safeUuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return '昨天'
  } else if (diffDays < 7) {
    return `${diffDays}天前`
  } else {
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  }
}

export function ChatPage(props: {
  config: AppConfig
  onSave: (next: AppConfig) => Promise<void>
  onOpenSettings: (pane?: string) => void
}) {
  const [conversations, setConversations] = useState<Conv[]>(() => [
    { id: 'c1', title: '新对话', updatedAt: Date.now(), msgCount: 1 },
    { id: 'c2', title: '示例：代码渲染', updatedAt: Date.now() - 1000 * 60 * 20, msgCount: 2 }
  ])
  const [activeConvId, setActiveConvId] = useState<string>('c1')
  const [draft, setDraft] = useState('')
  const [rightOpen, setRightOpen] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const streamingRef = useRef<{ streamId: string; convId: string; msgId: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 附件与 @ 提及
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [mentionedModels, setMentionedModels] = useState<MentionedModel[]>([])

  // 模型切换弹窗
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelPickerProviderId, setModelPickerProviderId] = useState<string>('')
  const [modelPickerModels, setModelPickerModels] = useState<string[]>([])
  const [modelPickerBusy, setModelPickerBusy] = useState(false)
  const [modelPickerErr, setModelPickerErr] = useState<string | null>(null)
  const [modelPickerQuery, setModelPickerQuery] = useState('')
  const [modelPickerManual, setModelPickerManual] = useState('')

  const [messagesByConv, setMessagesByConv] = useState<Record<string, Msg[]>>(() => ({
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
        content: '请渲染一段 TypeScript 代码块（占位）。',
        ts: Date.now() - 1000 * 60 * 10
      },
      {
        id: 'm_code_assistant',
        role: 'assistant',
        content:
          '```ts\nexport function add(a: number, b: number) {\n  return a + b\n}\n```\n\n（后续这里会接入 Markdown + 高亮 + 复制按钮。）',
        ts: Date.now() - 1000 * 60 * 9
      }
    ]
  }))

  const activeMessages = messagesByConv[activeConvId] ?? []
  const currentProvider = useMemo(() => {
    const k = props.config.currentModelProvider
    if (!k) return null
    return props.config.providerConfigs[k] ?? null
  }, [props.config])

  const needsDefaultModel = !props.config.currentModelProvider || !props.config.currentModelId

  const providers = useMemo(() => {
    const map = props.config.providerConfigs
    const order = props.config.providersOrder
    const list = order.map((k) => map[k]).filter(Boolean)
    for (const [k, v] of Object.entries(map)) {
      if (!order.includes(k)) list.push(v)
    }
    return list
  }, [props.config.providerConfigs, props.config.providersOrder])

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations
    const q = searchQuery.toLowerCase()
    return conversations.filter((c) => c.title.toLowerCase().includes(q))
  }, [conversations, searchQuery])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages])

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
    })

    return () => {
      offChunk()
      offError()
    }
  }, [])

  useEffect(() => {
    if (!modelPickerOpen) return
    if (!modelPickerProviderId) return
    setModelPickerQuery('')
    setModelPickerManual('')
    void refreshModelList(modelPickerProviderId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelPickerOpen, modelPickerProviderId])

  function newConversation() {
    const id = safeUuid()
    const conv: Conv = { id, title: '新对话', updatedAt: Date.now(), msgCount: 0 }
    setConversations((prev) => [conv, ...prev])
    setMessagesByConv((prev) => ({ ...prev, [id]: [] }))
    setActiveConvId(id)
  }

  function deleteConversation(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    setMessagesByConv((prev) => {
      const { [id]: _, ...rest } = prev
      return rest
    })
    if (activeConvId === id) {
      const remaining = conversations.filter((c) => c.id !== id)
      if (remaining.length > 0) {
        setActiveConvId(remaining[0].id)
      } else {
        newConversation()
      }
    }
  }

  function send() {
    const text = draft.trim()
    if (!text) return
    if (isGenerating) return

    const providerId = props.config.currentModelProvider
    const modelId = props.config.currentModelId
    const now = Date.now()
    const userMsg: Msg = { id: safeUuid(), role: 'user', content: text, ts: now }

    setDraft('')
    setAttachments([])
    setMentionedModels([])

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

    setConversations((prev) =>
      prev
        .map((c) =>
          c.id === activeConvId
            ? { ...c, updatedAt: Date.now(), msgCount: (messagesByConv[activeConvId]?.length ?? 0) + 2 }
            : c
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)
    )

    setIsGenerating(true)
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
      }
    })()
  }

  function stopGeneration() {
    const st = streamingRef.current
    if (!st) return
    void window.api.chat.abort(st.streamId)
  }

  const filteredModelList = useMemo(() => {
    const q = modelPickerQuery.trim().toLowerCase()
    if (!q) return modelPickerModels
    return modelPickerModels.filter((m) => m.toLowerCase().includes(q))
  }, [modelPickerModels, modelPickerQuery])

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

    const pid = modelPickerProviderId || props.config.currentModelProvider
    if (!pid) return

    await props.onSave({
      ...props.config,
      currentModelProvider: pid,
      currentModelId: mid
    })
    setModelPickerOpen(false)
  }

  function handleAddAttachment(files: FileList) {
    const newAttachments: Attachment[] = Array.from(files).map((file) => ({
      id: safeUuid(),
      type: file.type.startsWith('image/') ? 'image' : 'file',
      name: file.name,
      url: URL.createObjectURL(file),
      file
    }))
    setAttachments((prev) => [...prev, ...newAttachments])
  }

  function handleRemoveAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  function handleRemoveMention(model: MentionedModel) {
    setMentionedModels((prev) => prev.filter((m) => m.providerId !== model.providerId || m.modelId !== model.modelId))
  }

  function openModelPicker() {
    const pid = props.config.currentModelProvider ?? providers[0]?.id ?? ''
    setModelPickerProviderId(pid)
    setModelPickerOpen(true)
  }

  return (
    <div style={styles.root}>
      {/* 左侧会话列表 */}
      <div className="chatSidebar frosted">
        <div className="chatSidebarHeader">
          <button type="button" className="btn btn-primary" style={{ gap: 4 }} onClick={newConversation}>
            <Plus size={16} />
            新建
          </button>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
            <input
              className="input"
              style={{ width: '100%', paddingLeft: 32 }}
              placeholder="搜索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="chatConvList">
          {filteredConversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveConvId(c.id)}
              className={`chatConvItem ${c.id === activeConvId ? 'chatConvItemActive' : ''}`}
            >
              <div style={styles.convTitle}>{c.title}</div>
              <div style={styles.convMeta}>
                <span>{formatTime(c.updatedAt)}</span>
                <span style={styles.convBadge}>{c.msgCount}</span>
              </div>
              {c.id !== 'c1' && (
                <button
                  type="button"
                  className="convDeleteBtn"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteConversation(c.id)
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 中间聊天区 */}
      <div style={styles.center}>
        {/* 顶部栏 */}
        <div className="chatTopBar frosted">
          <div style={{ fontWeight: 700, fontSize: 16 }}>Kelivo</div>
          <div style={{ opacity: 0.7, fontSize: 12, marginLeft: 8 }}>
            默认模型：{currentProvider ? currentProvider.name : '未设置'}
            {props.config.currentModelId ? ` · ${props.config.currentModelId}` : ''}
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={openModelPicker}>
            切换模型
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setRightOpen((v) => !v)}
            style={{ padding: 8 }}
            title={rightOpen ? '隐藏工具面板' : '显示工具面板'}
          >
            <ChevronRight size={18} style={{ transform: rightOpen ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
          </button>
        </div>

        {/* 未配置模型提示 */}
        {needsDefaultModel && (
          <div className="surface frosted" style={styles.needModelBanner}>
            <div>
              <div style={{ fontWeight: 700 }}>还未配置默认模型</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>配置后即可开始对话与流式输出。</div>
            </div>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-primary" onClick={() => props.onOpenSettings('defaultModel')}>
              去设置
            </button>
          </div>
        )}

        {/* 消息列表 */}
        <div style={styles.messageList}>
          {activeMessages.map((m) => (
            <div key={m.id} style={{ ...styles.msgRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div className={`chatBubble ${m.role === 'user' ? 'chatBubbleUser' : ''}`}>
                <MarkdownView content={m.content} />
                {m.content === '' && isGenerating && (
                  <div className="typingIndicator">
                    <span /><span /><span />
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入栏 */}
        <ChatInputBar
          value={draft}
          onChange={setDraft}
          onSend={send}
          onStop={stopGeneration}
          isGenerating={isGenerating}
          disabled={false}
          placeholder="输入消息..."
          attachments={attachments}
          onAddAttachment={handleAddAttachment}
          onRemoveAttachment={handleRemoveAttachment}
          mentionedModels={mentionedModels}
          onRemoveMention={handleRemoveMention}
          availableProviders={providers}
          quickPhrases={[
            { id: 'qp-1', title: '继续', content: '请继续' },
            { id: 'qp-2', title: '总结', content: '请总结上面的内容' },
            { id: 'qp-3', title: '翻译中文', content: '请将上面的内容翻译成中文' }
          ]}
          onQuickPhrase={(content) => setDraft(content)}
        />
      </div>

      {/* 右侧工具面板 */}
      {rightOpen && (
        <ChatRightPanel
          config={props.config}
          currentProvider={currentProvider}
          onOpenSettings={props.onOpenSettings}
        />
      )}

      {/* 模型选择弹窗 */}
      {modelPickerOpen && (
        <div style={styles.modalOverlay} onMouseDown={() => setModelPickerOpen(false)}>
          <div className="modalSurface frosted" style={styles.modelModal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.modelModalHeader}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>切换模型</div>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="btn"
                onClick={() => void refreshModelList(modelPickerProviderId)}
                disabled={modelPickerBusy}
              >
                {modelPickerBusy ? '获取中...' : '刷新'}
              </button>
              <button type="button" className="btn" onClick={() => setModelPickerOpen(false)}>
                关闭
              </button>
            </div>

            <div style={styles.modelModalToolbar}>
              <select
                className="select"
                value={modelPickerProviderId}
                onChange={(e) => setModelPickerProviderId(e.target.value)}
                style={{ width: 200 }}
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

              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {filteredModelList.length}/{modelPickerModels.length}
              </div>
            </div>

            {modelPickerErr && (
              <div style={styles.errorBox}>{modelPickerErr}</div>
            )}

            <div style={{ padding: '0 12px 12px' }}>
              <div style={{ fontSize: 12, opacity: 0.7, margin: '10px 0 8px' }}>手动输入模型 ID</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={modelPickerManual}
                  onChange={(e) => setModelPickerManual(e.target.value)}
                  placeholder="例如：gpt-4o"
                />
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

            <div style={styles.modelList}>
              {filteredModelList.map((m) => (
                <button
                  key={m}
                  type="button"
                  style={{
                    ...styles.modelItem,
                    ...(m === props.config.currentModelId ? styles.modelItemActive : {})
                  }}
                  onClick={() => void pickModel(m)}
                >
                  {m}
                </button>
              ))}
              {modelPickerBusy && <div style={{ padding: 12, opacity: 0.7, textAlign: 'center' }}>获取中...</div>}
              {!modelPickerBusy && filteredModelList.length === 0 && (
                <div style={{ padding: 12, opacity: 0.7, textAlign: 'center' }}>暂无模型列表</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100%',
    overflow: 'hidden'
  },
  convTitle: {
    fontWeight: 600,
    fontSize: 13,
    marginBottom: 4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  convMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 11,
    opacity: 0.6
  },
  convBadge: {
    padding: '1px 6px',
    borderRadius: 10,
    background: 'var(--primary-2)',
    color: 'var(--primary)',
    fontSize: 10,
    fontWeight: 600
  },
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  needModelBanner: {
    margin: 12,
    padding: 12,
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    borderRadius: 12
  },
  messageList: {
    flex: 1,
    overflow: 'auto',
    padding: '12px 16px'
  },
  msgRow: {
    display: 'flex',
    marginBottom: 12
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modelModal: {
    width: 720,
    maxWidth: 'calc(100vw - 48px)',
    height: 560,
    maxHeight: 'calc(100vh - 48px)',
    borderRadius: 16,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },
  modelModalHeader: {
    height: 50,
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: 10,
    borderBottom: '1px solid var(--border)'
  },
  modelModalToolbar: {
    padding: 12,
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    borderBottom: '1px solid var(--border)'
  },
  errorBox: {
    margin: '0 12px 12px',
    padding: 12,
    borderRadius: 10,
    border: '1px solid rgba(255,80,80,0.35)',
    background: 'rgba(255,80,80,0.12)',
    color: '#ffb3b3',
    fontSize: 13
  },
  modelList: {
    flex: 1,
    overflow: 'auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  modelItem: {
    textAlign: 'left',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--text)',
    cursor: 'pointer',
    transition: 'background 0.15s'
  },
  modelItemActive: {
    background: 'var(--primary-2)',
    borderColor: 'var(--primary-3)'
  }
}
