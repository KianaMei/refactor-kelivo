/**
 * 聊天消息气泡组件
 * 对齐旧版 Kelivo 的 chat_message_widget.dart
 * 包括：消息内容、操作菜单（编辑/复制/导出/删除）、版本选择等
 */
import { useState, useRef, useEffect } from 'react'
import {
  Copy,
  Edit2,
  Trash2,
  MoreHorizontal,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Volume2,
  Check,
  User,
  Bot
} from 'lucide-react'
import { MarkdownView } from '../../components/MarkdownView'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  ts: number
  // 版本支持
  groupId?: string
  version?: number
  totalVersions?: number
  // 附件
  attachments?: Array<{
    type: 'image' | 'file'
    url: string
    name: string
  }>
  // 工具调用
  toolCalls?: Array<{
    id: string
    name: string
    status: 'pending' | 'running' | 'done' | 'error'
    result?: string
  }>
  // 推理过程
  reasoning?: string
  // Token 使用
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

interface Props {
  message: ChatMessage
  isLoading?: boolean
  onEdit?: (msg: ChatMessage, newContent: string) => void
  onDelete?: (msg: ChatMessage) => void
  onRegenerate?: (msg: ChatMessage) => void
  onCopy?: (msg: ChatMessage) => void
  onExport?: (msg: ChatMessage) => void
  onSpeak?: (msg: ChatMessage) => void
  onVersionChange?: (msg: ChatMessage, version: number) => void
}

export function MessageBubble(props: Props) {
  const { message, isLoading = false } = props
  const isUser = message.role === 'user'
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showReasoning, setShowReasoning] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  function handleCopy() {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    props.onCopy?.(message)
  }

  function handleVersionPrev() {
    if (message.version !== undefined && message.version > 0) {
      props.onVersionChange?.(message, message.version - 1)
    }
  }

  function handleVersionNext() {
    if (message.version !== undefined && message.totalVersions !== undefined && message.version < message.totalVersions - 1) {
      props.onVersionChange?.(message, message.version + 1)
    }
  }

  const hasVersions = message.totalVersions !== undefined && message.totalVersions > 1
  const currentVersion = message.version ?? 0
  const totalVersions = message.totalVersions ?? 1

  return (
    <div className={`msgRow ${isUser ? 'msgRowUser' : ''}`}>
      {/* 头像 */}
      <div className={`msgAvatar ${isUser ? 'msgAvatarUser' : ''}`}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* 消息主体 */}
      <div className={`msgBubbleWrapper ${isUser ? 'msgBubbleWrapperUser' : ''}`}>
        {/* 附件（图片等） */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="msgAttachments">
            {message.attachments.map((att, i) => (
              <div key={i} className="msgAttachment">
                {att.type === 'image' ? (
                  <img src={att.url} alt={att.name} className="msgAttachmentImage" />
                ) : (
                  <div className="msgAttachmentFile">
                    <Download size={14} />
                    <span>{att.name}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 推理过程（可折叠） */}
        {message.reasoning && (
          <div className="msgReasoning">
            <button
              type="button"
              className="msgReasoningToggle"
              onClick={() => setShowReasoning(!showReasoning)}
            >
              <span>💭 推理过程</span>
              <ChevronRight
                size={14}
                style={{ transform: showReasoning ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              />
            </button>
            {showReasoning && (
              <div className="msgReasoningContent">
                <MarkdownView content={message.reasoning} />
              </div>
            )}
          </div>
        )}

        {/* 消息内容 */}
        <div className={`chatBubble ${isUser ? 'chatBubbleUser' : ''}`}>
          {isLoading && !message.content ? (
            <div className="msgTyping">
              <span className="msgTypingDot" />
              <span className="msgTypingDot" />
              <span className="msgTypingDot" />
            </div>
          ) : (
            <MarkdownView content={message.content} />
          )}
        </div>

        {/* 工具调用状态 */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="msgToolCalls">
            {message.toolCalls.map((tc) => (
              <div key={tc.id} className={`msgToolCall msgToolCall-${tc.status}`}>
                <RefreshCw size={12} className={tc.status === 'running' ? 'msgToolCallSpin' : ''} />
                <span>{tc.name}</span>
                <span className="msgToolCallStatus">
                  {tc.status === 'pending' && '等待中'}
                  {tc.status === 'running' && '执行中'}
                  {tc.status === 'done' && '完成'}
                  {tc.status === 'error' && '错误'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 底部工具栏 */}
        <div className="msgToolbar">
          {/* 版本切换 */}
          {hasVersions && (
            <div className="msgVersionNav">
              <button
                type="button"
                className="btn btn-icon"
                disabled={currentVersion === 0}
                onClick={handleVersionPrev}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                {currentVersion + 1}/{totalVersions}
              </span>
              <button
                type="button"
                className="btn btn-icon"
                disabled={currentVersion >= totalVersions - 1}
                onClick={handleVersionNext}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Token 使用 */}
          {message.usage && (
            <span className="msgUsage">
              {message.usage.totalTokens} tokens
            </span>
          )}

          <div style={{ flex: 1 }} />

          {/* 操作按钮 */}
          <button type="button" className="btn btn-icon" onClick={handleCopy} title="复制">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>

          {!isUser && props.onSpeak && (
            <button type="button" className="btn btn-icon" onClick={() => props.onSpeak?.(message)} title="朗读">
              <Volume2 size={14} />
            </button>
          )}

          {!isUser && props.onRegenerate && (
            <button type="button" className="btn btn-icon" onClick={() => props.onRegenerate?.(message)} title="重新生成">
              <RefreshCw size={14} />
            </button>
          )}

          {/* 更多菜单 */}
          <div style={{ position: 'relative' }}>
            <button type="button" className="btn btn-icon" onClick={() => setMenuOpen(!menuOpen)} title="更多">
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div ref={menuRef} className="contextMenu frosted msgContextMenu">
                {props.onEdit && (
                  <button
                    type="button"
                    className="contextMenuItem"
                    onClick={() => {
                      setMenuOpen(false)
                      const newContent = prompt('编辑消息', message.content)
                      if (newContent !== null) {
                        props.onEdit?.(message, newContent)
                      }
                    }}
                  >
                    <Edit2 size={14} />
                    <span>编辑</span>
                  </button>
                )}
                {props.onExport && (
                  <button
                    type="button"
                    className="contextMenuItem"
                    onClick={() => {
                      setMenuOpen(false)
                      props.onExport?.(message)
                    }}
                  >
                    <Download size={14} />
                    <span>导出</span>
                  </button>
                )}
                <div className="contextMenuDivider" />
                {props.onDelete && (
                  <button
                    type="button"
                    className="contextMenuItem contextMenuItemDanger"
                    onClick={() => {
                      setMenuOpen(false)
                      props.onDelete?.(message)
                    }}
                  >
                    <Trash2 size={14} />
                    <span>删除</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
