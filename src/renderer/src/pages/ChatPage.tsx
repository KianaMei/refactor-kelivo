import { useEffect, useMemo, useRef, useState } from 'react'

import type { AppConfig } from '../../../shared/types'
import type { ChatMessageInput } from '../../../shared/chat'
import { MarkdownView } from '../components/MarkdownView'

type Msg = { id: string; role: 'user' | 'assistant'; content: string; ts: number }
type Conv = { id: string; title: string; updatedAt: number }

function safeUuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}

export function ChatPage(props: { config: AppConfig; onSave: (next: AppConfig) => Promise<void>; onOpenDefaultModelSettings: () => void }) {
  const [conversations, setConversations] = useState<Conv[]>(() => [
    { id: 'c1', title: '新对话', updatedAt: Date.now() },
    { id: 'c2', title: '示例：代码渲染', updatedAt: Date.now() - 1000 * 60 * 20 }
  ])
  const [activeConvId, setActiveConvId] = useState<string>('c1')
  const [draft, setDraft] = useState('')
  const [rightOpen, setRightOpen] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const streamingRef = useRef<{ streamId: string; convId: string; msgId: string } | null>(null)

  // 顶部“切换模型”：直接拉取 /models 并切换 currentModel*
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
          '```ts\\nexport function add(a: number, b: number) {\\n  return a + b\\n}\\n```\\n\\n（后续这里会接入 Markdown + 高亮 + 复制按钮。）',
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
    const conv: Conv = { id, title: '新对话', updatedAt: Date.now() }
    setConversations((prev) => [conv, ...prev])
    setMessagesByConv((prev) => ({ ...prev, [id]: [] }))
    setActiveConvId(id)
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
              content: '请先配置默认模型（右上角提示处或点击“去设置”）。',
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
        .map((c) => (c.id === activeConvId ? { ...c, updatedAt: Date.now() } : c))
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
        setModelPickerErr('\u4e0a\u6e38\u672a\u8fd4\u56de\u53ef\u7528\u6a21\u578b\u5217\u8868\uff08\u53ef\u624b\u52a8\u8f93\u5165\u6a21\u578b ID\uff09')
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      const m1 = /Error invoking remote method 'models:list':\\s*(.+)$/.exec(raw)
      const m2 = /TypeError:\\s*(.+)$/.exec(raw)
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

  return (
    <div style={styles.root}>
      {/* 左侧会话栏（对齐旧版 Kelivo 的嵌入式侧边栏概念） */}
      <div className="chatSidebar frosted">
        <div className="chatSidebarHeader">
          <button type="button" className="btn btn-primary" onClick={newConversation}>
            + 新建
          </button>
          <input className="input" style={{ flex: 1 }} placeholder="搜索" />
        </div>
        <div className="chatConvList">
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveConvId(c.id)}
              className={`chatConvItem ${c.id === activeConvId ? 'chatConvItemActive' : ''}`}
            >
              <div style={styles.convTitle}>{c.title}</div>
              <div style={styles.convSub}>{new Date(c.updatedAt).toLocaleString()}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 中间聊天区 */}
      <div style={styles.center}>
        <div className="chatTopBar frosted">
          <div style={{ fontWeight: 700 }}>Kelivo</div>
          <div style={{ opacity: 0.75, fontSize: 12 }}>
            默认模型：{currentProvider ? currentProvider.name : '未设置'}
            {props.config.currentModelId ? ` · ${props.config.currentModelId}` : ''}
          </div>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn"
            onClick={() => {
              const pid = props.config.currentModelProvider ?? providers[0]?.id ?? ''
              setModelPickerProviderId(pid)
              setModelPickerOpen(true)
            }}
          >
            {'\u5207\u6362\u6A21\u578B'}
          </button>
          <button type="button" className="btn" onClick={() => setRightOpen((v) => !v)}>
            {rightOpen ? '隐藏右侧' : '显示右侧'}
          </button>
        </div>

        {needsDefaultModel ? (
          <div className="surface frosted" style={{ margin: 12, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800 }}>还未配置默认模型</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>配置后即可开始对话与流式输出。</div>
            </div>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-primary" onClick={props.onOpenDefaultModelSettings}>
              去设置
            </button>
          </div>
        ) : null}

        <div style={styles.messageList}>
          {activeMessages.map((m) => (
            <div key={m.id} style={{ ...styles.msgRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div className={`chatBubble ${m.role === 'user' ? 'chatBubbleUser' : ''}`}>
                <MarkdownView content={m.content} />
              </div>
            </div>
          ))}
        </div>

        <div className="chatInputBar frosted">
          <textarea
            className="input"
            style={{ flex: 1, resize: 'none', height: 64, lineHeight: 1.5 }}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="输入消息"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          {isGenerating ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                const st = streamingRef.current
                if (!st) return
                void window.api.chat.abort(st.streamId)
              }}
            >
              停止
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={send} disabled={isGenerating}>
            发送
          </button>
        </div>
      </div>

      {/* 右侧信息栏（旧版有推理预算/MCP/最大 tokens 等） */}
      {rightOpen ? (
        <div style={styles.right} className="frosted">
          <div style={styles.rightHeader}>右侧面板</div>
          <div style={styles.rightBody}>
            <Section title="模型">
              <div style={styles.kvRow}>
                <div style={styles.kvKey}>供应商</div>
                <div style={styles.kvVal}>{currentProvider ? currentProvider.name : '未设置'}</div>
              </div>
              <div style={styles.kvRow}>
                <div style={styles.kvKey}>模型</div>
                <div style={styles.kvVal}>{props.config.currentModelId ?? '未设置'}</div>
              </div>
            </Section>
            <Section title="推理预算 / 最大 Tokens">
              <div style={{ opacity: 0.75, fontSize: 12 }}>后续会对齐 Kelivo 的 popover/侧栏控件。</div>
            </Section>
            <Section title="MCP">
              <div style={{ opacity: 0.75, fontSize: 12 }}>后续接入 MCP 服务器选择与调用。</div>
            </Section>
          </div>
        </div>
      ) : null}

      {modelPickerOpen ? (
        <div style={styles.modalOverlay} onMouseDown={() => setModelPickerOpen(false)}>
          <div className="modalSurface frosted" style={styles.modelModal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.modelModalHeader}>
              <div style={{ fontWeight: 800 }}>{'\u5207\u6362\u6a21\u578b'}</div>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="btn"
                onClick={() => void refreshModelList(modelPickerProviderId)}
                disabled={modelPickerBusy}
              >
                {modelPickerBusy ? '\u83b7\u53d6\u4e2d...' : '\u5237\u65b0'}
              </button>
              <button type="button" className="btn" onClick={() => setModelPickerOpen(false)}>
                {'\u5173\u95ed'}
              </button>
            </div>

            <div style={styles.modelModalToolbar}>
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
                placeholder={'\u641c\u7d22\u6a21\u578b'}
                value={modelPickerQuery}
                onChange={(e) => setModelPickerQuery(e.target.value)}
              />

              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {filteredModelList.length}/{modelPickerModels.length}
              </div>
            </div>

            {modelPickerErr ? (
              <div className="surface" style={{ margin: 12, padding: 12 }}>
                {modelPickerErr}
              </div>
            ) : null}

            <div style={{ padding: '0 12px 12px' }}>
              <div style={{ fontSize: 12, opacity: 0.75, margin: '10px 0 8px' }}>{'\u624b\u52a8\u8f93\u5165\u6a21\u578b ID'}</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input className="input" style={{ flex: 1 }} value={modelPickerManual} onChange={(e) => setModelPickerManual(e.target.value)} />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!modelPickerManual.trim()}
                  onClick={() => void pickModel(modelPickerManual.trim())}
                >
                  {'\u4f7f\u7528'}
                </button>
              </div>
            </div>

            <div style={styles.modelList}>
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
              {modelPickerBusy ? <div style={{ padding: 12, opacity: 0.75 }}>{'\u83b7\u53d6\u4e2d...'}</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Section(props: { title: string; children: any }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{props.title}</div>
      <div>{props.children}</div>
    </div>
  )
}

const styles: Record<string, any> = {
  root: {
    display: 'flex',
    height: '100%'
  },
  left: {
    width: 300,
    borderRight: '1px solid var(--border)',
    background: 'var(--panel)'
  },
  leftHeader: {
    padding: 12,
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    gap: 8
  },
  searchInput: {
    flex: 1,
    padding: '9px 10px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text)',
    outline: 'none'
  },
  convList: {
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    overflow: 'auto',
    height: 'calc(100% - 64px)'
  },
  convItem: {
    textAlign: 'left',
    padding: 10,
    borderRadius: 12,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--text)',
    cursor: 'pointer'
  },
  convItemActive: {
    background: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.10)'
  },
  convTitle: {
    fontWeight: 700,
    fontSize: 13
  },
  convSub: {
    marginTop: 4,
    fontSize: 11,
    opacity: 0.65
  },
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  topBar: {
    height: 44,
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    gap: 12
  },
  messageList: {
    flex: 1,
    overflow: 'auto',
    padding: 12
  },
  msgRow: {
    display: 'flex',
    marginBottom: 10
  },
  msgBubble: {
    maxWidth: 760,
    padding: 12,
    borderRadius: 14,
    border: '1px solid var(--border)',
    background: 'var(--panel-2)'
  },
  msgBubbleUser: {
    background: 'rgba(120,200,255,0.12)',
    borderColor: 'rgba(120,200,255,0.25)'
  },
  msgBubbleAssistant: {
    background: 'rgba(255,255,255,0.04)'
  },
  inputBar: {
    borderTop: '1px solid var(--border)',
    padding: 12,
    display: 'flex',
    gap: 10,
    alignItems: 'flex-end'
  },
  textarea: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text)',
    outline: 'none',
    resize: 'none'
  },
  right: {
    width: 300,
    borderLeft: '1px solid var(--border)',
    background: 'var(--panel)'
  },
  rightHeader: {
    height: 44,
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    borderBottom: '1px solid var(--border)',
    fontWeight: 700
  },
  rightBody: {
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    overflow: 'auto',
    height: 'calc(100% - 44px)'
  },
  section: {
    padding: 12,
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.04)'
  },
  sectionTitle: {
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 8
  },
  kvRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    padding: '6px 0',
    fontSize: 12
  },
  kvKey: {
    opacity: 0.7
  },
  kvVal: {
    opacity: 0.9
  },
  primaryButton: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(120,200,255,0.35)',
    background: 'rgba(120,200,255,0.22)',
    color: 'var(--text)',
    cursor: 'pointer'
  },
  smallButton: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: 'var(--text)',
    cursor: 'pointer'
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
    width: 860,
    maxWidth: 'calc(100vw - 48px)',
    height: 640,
    maxHeight: 'calc(100vh - 48px)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },
  modelModalHeader: {
    height: 46,
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
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
  modelList: {
    flex: 1,
    overflow: 'auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  }
}
