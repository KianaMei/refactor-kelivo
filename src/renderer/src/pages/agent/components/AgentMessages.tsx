// Agent 消息列表（聊天视图）
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ChevronDown, Copy } from 'lucide-react'
import { toast } from 'sonner'
import type { DbAgentMessage } from '../../../../../shared/db-types'
import { MarkdownView } from '../../../components/MarkdownView'

interface AgentMessagesProps {
  messages: DbAgentMessage[]
  currentSessionId: string
  isRunning?: boolean
}

const SCROLL_THRESHOLD_PX = 120

function formatTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function safeCopy(text: string): void {
  void navigator.clipboard.writeText(text)
}

export function AgentMessages(props: AgentMessagesProps) {
  const { messages, currentSessionId } = props

  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const prevSessionIdRef = useRef<string>(currentSessionId)
  const prevLenRef = useRef<number>(0)

  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [newCount, setNewCount] = useState(0)
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(() => new Set())

  const lastMessageSignature = useMemo(() => {
    const last = messages[messages.length - 1]
    if (!last) return ''
    return [
      last.id,
      last.type,
      String(last.isStreaming),
      String(last.content?.length ?? 0),
      String(last.toolResult?.length ?? 0),
      String(last.toolStatus ?? '')
    ].join('|')
  }, [messages])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
    isAtBottomRef.current = true
    setHasNewMessages(false)
    setNewCount(0)
  }, [])

  const updateIsAtBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distance <= SCROLL_THRESHOLD_PX
    isAtBottomRef.current = atBottom
    if (atBottom) {
      setHasNewMessages(false)
      setNewCount(0)
    }
  }, [])

  // 切换会话：重置“新消息”状态并滚动到底部
  useEffect(() => {
    if (!currentSessionId) return
    if (prevSessionIdRef.current === currentSessionId) return
    prevSessionIdRef.current = currentSessionId
    prevLenRef.current = messages.length
    setHasNewMessages(false)
    setNewCount(0)
    setExpandedToolIds(new Set())
    requestAnimationFrame(() => scrollToBottom('auto'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId])

  // 新消息/流式更新：仅在接近底部时自动滚动，否则提示“新消息”
  useEffect(() => {
    if (!currentSessionId) return

    const prevLen = prevLenRef.current
    const nextLen = messages.length
    prevLenRef.current = nextLen

    if (isAtBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom('auto'))
      return
    }

    if (nextLen > prevLen) {
      setHasNewMessages(true)
      setNewCount((c) => Math.min(99, c + (nextLen - prevLen)))
    }
  }, [currentSessionId, messages.length, lastMessageSignature, scrollToBottom])

  const handleCopy = useCallback((text: string) => {
    const t = String(text ?? '').trim()
    if (!t) return
    safeCopy(t)
    toast.success('已复制到剪贴板')
  }, [])

  const toggleToolExpanded = useCallback((id: string) => {
    setExpandedToolIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  if (!currentSessionId) {
    return null
  }

  return (
    <div className="agentMessages" ref={scrollRef} onScroll={updateIsAtBottom}>
      <div className="agentMessagesInner">
        {messages.map((m) => {
          const time = formatTime(m.createdAt)

          if (m.type === 'system') {
            return (
              <div key={m.id} className="agentMsgRow agentMsgRow-system">
                <div className="agentSystemNotice">{m.content}</div>
              </div>
            )
          }

          if (m.type === 'tool') {
            const expanded = expandedToolIds.has(m.id)
            const status = (m.toolStatus || '').trim() || 'done'
            const preview = (m.toolResult || m.toolInputPreview || '').trim()
            const shortPreview = preview.length > 240 ? `${preview.slice(0, 240)}…` : preview

            return (
              <div key={m.id} className="agentMsgRow agentMsgRow-tool">
                <div className="agentToolCard">
                  <button
                    type="button"
                    className="agentToolHeader"
                    onClick={() => toggleToolExpanded(m.id)}
                    aria-expanded={expanded}
                    title="展开/收起"
                  >
                    <div className="agentToolTitle">
                      <span className="agentToolName">{m.toolName || 'tool'}</span>
                      <span className={`agentToolStatus agentToolStatus-${status}`}>{status}</span>
                      {time ? <span className="agentToolTime">{time}</span> : null}
                    </div>
                    <ChevronDown size={16} className="agentToolChevron" />
                  </button>

                  {expanded ? (
                    <div className="agentToolBody">
                      {m.toolInputPreview ? (
                        <div>
                          <div className="agentToolSectionHeader">
                            <div className="agentToolSectionTitle">输入</div>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleCopy(m.toolInputPreview || '')}>
                              <Copy size={14} />
                              <span>复制</span>
                            </button>
                          </div>
                          <pre className="agentToolPre">{m.toolInputPreview}</pre>
                        </div>
                      ) : null}

                      {m.toolResult ? (
                        <div>
                          <div className="agentToolSectionHeader">
                            <div className="agentToolSectionTitle">输出</div>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleCopy(m.toolResult || '')}>
                              <Copy size={14} />
                              <span>复制</span>
                            </button>
                          </div>
                          <pre className="agentToolPre">{m.toolResult}</pre>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    shortPreview ? <div className="agentToolPreview">{shortPreview}</div> : null
                  )}
                </div>
              </div>
            )
          }

          const isUser = m.type === 'user'
          const roleLabel = isUser ? '你' : '助手'

          return (
            <div key={m.id} className={`agentMsgRow ${isUser ? 'agentMsgRow-user' : 'agentMsgRow-assistant'}`}>
              <div className={`agentBubble ${isUser ? 'agentBubble-user' : 'agentBubble-assistant'}`}>
                <div className="agentBubbleHeader">
                  <span className="agentBubbleRole">{roleLabel}</span>
                  {time ? <span className="agentBubbleTime">{time}</span> : null}
                </div>

                <div className="agentBubbleBody">
                  <MarkdownView content={m.content} messageId={m.id} />
                </div>

                <button
                  type="button"
                  className="agentCopyButton"
                  onClick={() => handleCopy(m.content)}
                  aria-label="复制消息"
                  title="复制"
                >
                  <Copy size={14} />
                </button>

                {!isUser && m.isStreaming ? (
                  <div className="agentStreaming">
                    <span className="agentStreamingDot" />
                    <span>输出中…</span>
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {hasNewMessages ? (
        <div className="agentScrollToBottomWrap">
          <button type="button" className="agentScrollToBottomBtn" onClick={() => scrollToBottom('smooth')}>
            <ArrowDown size={14} />
            <span>新消息{newCount > 0 ? `（${newCount}）` : ''}</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
