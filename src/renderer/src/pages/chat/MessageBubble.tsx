/**
 * 聊天消息气泡组件
 * 对齐旧版 Kelivo 的 chat_message_widget.dart
 * 包括：消息内容、操作菜单（编辑/复制/导出/删除）、版本选择等
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
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
  VolumeX,
  Check,
  Bot,
  Languages,
  Loader2,
  AtSign,
  TextSelect,
  Globe,
  Share2,
  GitBranch
} from 'lucide-react'
import { MarkdownView } from '../../components/MarkdownView'
import { MessageOutline } from '../../components/MessageOutline'
import type { DisplaySettings, UserConfig } from '../../../../shared/types'
import { BrandAvatar } from '../settings/providers/components/BrandAvatar'
import { UserAvatar } from '../../components/UserAvatar'
import { SelectCopyDialog, ShareDialog, EditBottomSheet, WebViewDialog } from './MessageDialogs'
import { StreamingDots, PureLoadingAnimation } from '../../components/LoadingIndicators'
import { ThinkingBlock } from './components/ThinkingBlock'
import { groupMessageParts } from './utils/groupMessageParts'

const GEMINI_THOUGHT_SIG_COMMENT = /\n?<!--\s*gemini_thought_signatures:[\s\S]*?-->/g

function stripGeminiThoughtSignatures(raw: string): string {
  if (!raw) return raw
  // Also strip any trailing whitespace after removing the comment
  return raw.replace(GEMINI_THOUGHT_SIG_COMMENT, '').replace(/\s+$/, '')
}

function extractInlineThink(raw: string): { content: string; reasoning: string } {
  const r = (raw ?? '').replace(/\r/g, '')
  const re = /<think>([\s\S]*?)(?:<\/think>|$)/g
  const reasoning = [...r.matchAll(re)]
    .map((m) => (m[1] ?? '').trim())
    .filter((s) => s)
    .join('\n\n')
  if (!reasoning) return { content: r, reasoning: '' }
  return { content: r.replace(re, '').trim(), reasoning }
}

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
    arguments?: Record<string, unknown>
    status: 'pending' | 'running' | 'done' | 'error'
    result?: string
  }>
  // 推理过程
  reasoning?: string
  reasoningDuration?: number // 推理时间（秒）
  // 翻译
  translation?: string
  translationExpanded?: boolean
  // Token 使用
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  // 交替渲染块（工具卡片在实际调用位置显示）
  blocks?: Array<
    | { type: 'text'; content: string }
    | { type: 'tool'; toolCallId: string }
  >
  // 模型信息 (用于展示和重试)
  providerId?: string
  modelId?: string
}

interface Props {
  message: ChatMessage
  // 仅影响渲染显示，不修改 message.content
  displayContent?: string
  // 助手身份覆盖（用于“助手头像/名称”）
  assistantName?: string
  assistantAvatar?: string
  useAssistantAvatar?: boolean
  isLoading?: boolean
  displaySettings?: DisplaySettings
  onEdit?: (msg: ChatMessage, newContent: string) => void
  onDelete?: (msg: ChatMessage) => void
  onRegenerate?: (msg: ChatMessage) => void
  onCopy?: (msg: ChatMessage) => void
  onExport?: (msg: ChatMessage) => void
  onSpeak?: (msg: ChatMessage) => void
  onVersionChange?: (msg: ChatMessage, version: number) => void
  onTranslate?: (msg: ChatMessage) => void
  onTranslationExpandChange?: (msg: ChatMessage, expanded: boolean) => void
  onResend?: (msg: ChatMessage) => void
  onMentionReAnswer?: (msg: ChatMessage) => void
  onFork?: (msg: ChatMessage) => void
  isTranslating?: boolean
  isSpeaking?: boolean
  user?: UserConfig
  // 新增：用于展示底部的 "模型 | 供应商"
  providerName?: string
}

export function MessageBubble(props: Props) {
  const { message, isLoading = false, displaySettings, isTranslating = false, isSpeaking = false } = props
  const isUser = message.role === 'user'
  const rawDisplayContent = props.displayContent ?? message.content
  const safeContent = isUser ? rawDisplayContent : stripGeminiThoughtSignatures(rawDisplayContent)
  const { content: contentWithoutThink, reasoning: extractedThinking } = extractInlineThink(safeContent)
  const displayContent = contentWithoutThink
  const effectiveReasoning = message.reasoning && message.reasoning.trim() ? message.reasoning : extractedThinking
  const assistantLabel = props.assistantName || '助手'
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [copied, setCopied] = useState(false)
  const [devTip, setDevTip] = useState<string | null>(null)
  const [showTranslation, setShowTranslation] = useState(() => message.translationExpanded !== false)
  const [selectCopyOpen, setSelectCopyOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [webViewOpen, setWebViewOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [menuDeleteConfirm, setMenuDeleteConfirm] = useState(false)
  const [avatarLightbox, setAvatarLightbox] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const deleteConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 显示设置的解构
  const showAvatar = isUser
    ? displaySettings?.showUserAvatar !== false
    : displaySettings?.showModelIcon !== false
  const showTimestamp = isUser
    ? displaySettings?.showUserNameTimestamp !== false
    : displaySettings?.showModelNameTimestamp !== false
  const showActions = isUser
    ? displaySettings?.showUserMessageActions !== false
    : true
  const showTokenStats = displaySettings?.showTokenStats !== false
  const showStickerToolUI = displaySettings?.showStickerToolUI !== false
  const bgStyle = displaySettings?.chatMessageBackgroundStyle ?? 'default'
  const bubbleOpacity = displaySettings?.chatBubbleOpacity ?? 100

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

  useEffect(() => {
    if (!message.translation) return
    setShowTranslation(message.translationExpanded !== false)
  }, [message.id, message.translation, message.translationExpanded])

  // 菜单渲染后修正位置，确保不超出可视区域
  const clampMenuRef = useCallback((node: HTMLDivElement | null) => {
    // 同时赋值给 menuRef 以保留外部点击检测
    ; (menuRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    if (!node) return
    requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const pad = 8
      let x = rect.left
      let y = rect.top

      // 右边超出
      if (rect.right > vw - pad) {
        x = vw - rect.width - pad
      }
      // 左边超出
      if (x < pad) {
        x = pad
      }
      // 底部超出 → 向上弹出
      if (rect.bottom > vh - pad) {
        y = vh - rect.height - pad
      }
      // 顶部超出
      if (y < pad) {
        y = pad
      }

      if (x !== rect.left || y !== rect.top) {
        setMenuPos({ x, y })
      }
    })
  }, [])

  // 清理删除确认计时器
  useEffect(() => {
    return () => {
      if (deleteConfirmTimerRef.current) {
        clearTimeout(deleteConfirmTimerRef.current)
      }
      if (menuDeleteTimerRef.current) {
        clearTimeout(menuDeleteTimerRef.current)
      }
    }
  }, [])

  // 菜单关闭时重置菜单内的删除确认状态
  useEffect(() => {
    if (!menuOpen) {
      setMenuDeleteConfirm(false)
      if (menuDeleteTimerRef.current) {
        clearTimeout(menuDeleteTimerRef.current)
      }
    }
  }, [menuOpen])

  // 处理删除按钮点击（带二次确认）
  function handleDeleteClick() {
    if (deleteConfirm) {
      // 已经在确认状态，执行删除
      if (deleteConfirmTimerRef.current) {
        clearTimeout(deleteConfirmTimerRef.current)
      }
      setDeleteConfirm(false)
      props.onDelete?.(message)
    } else {
      // 第一次点击，进入确认状态
      setDeleteConfirm(true)
      // 3秒后自动取消确认状态
      deleteConfirmTimerRef.current = setTimeout(() => {
        setDeleteConfirm(false)
      }, 3000)
    }
  }

  // 取消删除确认
  function handleCancelDelete() {
    if (deleteConfirmTimerRef.current) {
      clearTimeout(deleteConfirmTimerRef.current)
    }
    setDeleteConfirm(false)
  }

  // 处理菜单内删除点击
  function handleMenuDeleteClick() {
    if (menuDeleteConfirm) {
      // 已经在确认状态，执行删除
      if (menuDeleteTimerRef.current) {
        clearTimeout(menuDeleteTimerRef.current)
      }
      setMenuDeleteConfirm(false)
      setMenuOpen(false)
      props.onDelete?.(message)
    } else {
      // 第一次点击，进入确认状态
      setMenuDeleteConfirm(true)
      menuDeleteTimerRef.current = setTimeout(() => {
        setMenuDeleteConfirm(false)
      }, 3000)
    }
  }

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

  function setTranslationExpanded(expanded: boolean) {
    setShowTranslation(expanded)
    props.onTranslationExpandChange?.(message, expanded)
  }

  function toggleTranslationExpanded() {
    setTranslationExpanded(!showTranslation)
  }

  const hasVersions = message.totalVersions !== undefined && message.totalVersions > 1
  const currentVersion = message.version ?? 0
  const totalVersions = message.totalVersions ?? 1

  // 格式化时间戳
  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  // 计算气泡背景样式 - 根据 kelivo 的实现
  const opacity = (bubbleOpacity ?? 100) / 100
  const isDark = document.documentElement.dataset.theme === 'dark'

  // 根据背景样式和透明度计算实际样式
  const getBubbleStyle = (): React.CSSProperties => {
    if (opacity <= 0.001) return {}

    if (isUser) {
      // 用户消息使用主色调
      return {
        backgroundColor: `rgba(var(--primary-rgb, 59, 130, 246), ${opacity})`,
        backdropFilter: bgStyle === 'frosted' ? `blur(${6 + 10 * opacity}px)` : undefined,
        WebkitBackdropFilter: bgStyle === 'frosted' ? `blur(${6 + 10 * opacity}px)` : undefined
      }
    }

    switch (bgStyle) {
      case 'frosted':
        return {
          backgroundColor: isDark
            ? `rgba(255, 255, 255, ${opacity * 0.12})`
            : `rgba(255, 255, 255, ${opacity * 0.70})`,
          backdropFilter: `blur(${6 + 10 * opacity}px)`,
          WebkitBackdropFilter: `blur(${6 + 10 * opacity}px)`,
          border: `1px solid rgba(${isDark ? '255,255,255' : '0,0,0'}, ${opacity * 0.15})`
        }
      case 'solid':
        return {
          backgroundColor: isDark
            ? `rgba(39, 39, 42, ${opacity})`
            : `rgba(244, 244, 245, ${opacity})`,
          border: 'none',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }
      default:
        return {
          backgroundColor: isDark
            ? `rgba(31, 31, 35, ${opacity * 0.8})`
            : `rgba(244, 244, 245, ${opacity * 0.9})`,
          border: `1px solid rgba(${isDark ? '255,255,255' : '0,0,0'}, ${opacity * 0.1})`
        }
    }
  }

  // 加载中且没有任何内容时，只显示纯净的加载动画
  const isPureLoading = isLoading && !message.content && !effectiveReasoning && !(message.toolCalls && message.toolCalls.length > 0)
  const enableReasoningMarkdown = displaySettings?.enableReasoningMarkdown !== false
  const autoCollapseThinking = displaySettings?.autoCollapseThinking !== false

  // 使用 groupMessageParts 分组消息块
  const messageParts = useMemo(
    () => !isUser && showStickerToolUI
      ? groupMessageParts(message, effectiveReasoning, displayContent)
      : [],
    [message.id, message.content, message.reasoning, message.toolCalls, message.blocks, effectiveReasoning, displayContent, isUser, showStickerToolUI]
  )
  const hasThinkingBlocks = messageParts.some((p) => p.type === 'thinking')

  // 纯加载状态 - 只显示动画
  if (isPureLoading && !isUser) {
    return (
      <div id={`msg-${message.id}`} className="msgRow">
        {/* 头像 */}
        {showAvatar && (
          <div className="msgAvatar">
            {props.useAssistantAvatar ? (
              <BrandAvatar name={assistantLabel} size={36} customAvatarPath={props.assistantAvatar} />
            ) : (
              <Bot size={20} />
            )}
          </div>
        )}
        {/* 纯动画 - 没有气泡框 */}
        <div className={`msgBubbleWrapper ${!showAvatar ? 'msgBubbleNoAvatar' : ''}`}>
          <PureLoadingAnimation text="思考中..." />
        </div>
      </div>
    )
  }

  return (
    <div id={`msg-${message.id}`} className={`msgRow ${isUser ? 'msgRowUser' : ''}`}>
      {/* 头像 */}
      {showAvatar && (
        <div className={`msgAvatar ${isUser ? 'msgAvatarUser' : ''}`} onClick={() => setAvatarLightbox(true)} style={{ cursor: 'pointer' }}>
          {isUser ? (
            <UserAvatar user={props.user} size={36} />
          ) : props.useAssistantAvatar ? (
            <BrandAvatar name={assistantLabel} size={36} customAvatarPath={props.assistantAvatar} />
          ) : (
            <Bot size={20} />
          )}
        </div>
      )}

      {/* 消息主体 */}
      <div className={`msgBubbleWrapper ${isUser ? 'msgBubbleWrapperUser' : ''} ${!showAvatar ? 'msgBubbleNoAvatar' : ''}`}>
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

        {/* 时间戳 */}
        {showTimestamp && (
          <div className="msgTimestamp">
            <span>{isUser ? '你' : assistantLabel}</span>
            <span className="msgTimestampTime">{formatTime(message.ts)}</span>
          </div>
        )}

        {/* 助手消息：使用 groupMessageParts 分块渲染 */}
        {!isUser && hasThinkingBlocks ? (
          messageParts.map((part, idx) =>
            part.type === 'thinking' ? (
              <ThinkingBlock
                key={`think-${idx}`}
                steps={part.steps}
                isLoading={isLoading}
                autoCollapseThinking={autoCollapseThinking}
                enableReasoningMarkdown={enableReasoningMarkdown}
              />
            ) : (
              <div key={`content-${idx}`} className="chatBubble" style={{ position: 'relative' }}>
                <MessageOutline content={part.text} messageId={`${message.id}-p${idx}`} />
                <MarkdownView content={part.text} messageId={`${message.id}-p${idx}`} />
                {isLoading && idx === messageParts.length - 1 && message.content && (
                  <StreamingDots />
                )}
              </div>
            )
          )
        ) : (
          /* 用户消息 或 无 thinking 块的助手消息：使用独立气泡 */
          <div className={`chatBubble ${isUser ? 'chatBubbleUser' : ''}`} style={{ ...getBubbleStyle(), position: 'relative' }}>
            {!isUser && <MessageOutline content={displayContent} messageId={message.id} />}
            <MarkdownView content={displayContent} messageId={message.id} />
            {isLoading && message.content && (
              <StreamingDots />
            )}
          </div>
        )}

        {/* 翻译显示 */}
        {message.translation && (
          <div className="msgTranslation">
            <button
              type="button"
              className="msgTranslationToggle"
              onClick={toggleTranslationExpanded}
            >
              <Languages size={14} />
              <span>翻译</span>
              <ChevronRight
                size={14}
                style={{ transform: showTranslation ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', marginLeft: 'auto' }}
              />
            </button>
            {showTranslation && (
              <div className="msgTranslationContent">
                <MarkdownView content={message.translation} />
              </div>
            )}
          </div>
        )}

        {/* 底部工具栏 - 对齐旧版 Kelivo */}
        {showActions && (
          <div className="msgActions">
            {/* 复制 */}
            <button type="button" className="msgActionBtn" onClick={handleCopy} title="复制">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>

            {/* 重新生成 - 仅助手消息 */}
            {!isUser && (
              <button type="button" className="msgActionBtn" onClick={() => props.onRegenerate?.(message)} title="重新生成">
                <RefreshCw size={16} />
              </button>
            )}

            {/* 重发 - 仅用户消息 */}
            {isUser && (
              <button type="button" className="msgActionBtn" onClick={() => props.onResend?.(message)} title="重发">
                <RefreshCw size={16} />
              </button>
            )}

            {/* @提及回答 - 仅助手消息 */}
            {!isUser && (
              <button type="button" className="msgActionBtn" onClick={() => props.onMentionReAnswer?.(message)} title="@回答">
                <AtSign size={16} />
              </button>
            )}

            {/* 朗读 - 仅助手消息 */}
            {!isUser && (
              <button
                type="button"
                className={`msgActionBtn ${isSpeaking ? 'msgActionBtnActive' : ''}`}
                onClick={() => props.onSpeak?.(message)}
                title={isSpeaking ? '停止朗读' : '朗读'}
              >
                {isSpeaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            )}

            {/* 翻译 - 仅助手消息 */}
            {!isUser && (
              <button
                type="button"
                className="msgActionBtn"
                onClick={() => props.onTranslate?.(message)}
                disabled={isTranslating}
                title="翻译"
              >
                {isTranslating ? <Loader2 size={16} className="msgToolCallSpin" /> : <Languages size={16} />}
              </button>
            )}

            {/* 删除 - 仅助手消息，带二次确认 */}
            {!isUser && (
              deleteConfirm ? (
                <div className="msgDeleteConfirm">
                  <button
                    type="button"
                    className="msgActionBtn msgActionBtnDanger"
                    onClick={handleDeleteClick}
                    title="确认删除"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    className="msgActionBtn"
                    onClick={handleCancelDelete}
                    title="取消"
                  >
                    <ChevronLeft size={16} />
                  </button>
                </div>
              ) : (
                <button type="button" className="msgActionBtn" onClick={handleDeleteClick} title="删除">
                  <Trash2 size={16} />
                </button>
              )
            )}

            {/* 更多菜单 */}
            <button
              ref={moreBtnRef}
              type="button"
              className="msgActionBtn"
              onClick={() => {
                if (!menuOpen && moreBtnRef.current) {
                  const rect = moreBtnRef.current.getBoundingClientRect()
                  // 先设置初始位置，渲染后由 clampMenuPosition 修正
                  setMenuPos({ x: rect.right, y: rect.bottom + 4 })
                }
                setMenuOpen(!menuOpen)
              }}
              title="更多"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && createPortal(
              <div
                ref={clampMenuRef}
                className="contextMenu"
                style={{ position: 'fixed', left: menuPos.x, top: menuPos.y, zIndex: 9999 }}
              >
                {/* 选择复制 */}
                <button
                  type="button"
                  className="contextMenuItem"
                  onClick={() => {
                    setMenuOpen(false)
                    setSelectCopyOpen(true)
                  }}
                >
                  <TextSelect size={14} />
                  <span>选择复制</span>
                </button>
                {/* 网页视图渲染 */}
                <button
                  type="button"
                  className="contextMenuItem"
                  onClick={() => {
                    setMenuOpen(false)
                    setWebViewOpen(true)
                  }}
                >
                  <Globe size={14} />
                  <span>网页视图渲染</span>
                </button>
                {/* 编辑 */}
                <button
                  type="button"
                  className="contextMenuItem"
                  onClick={() => {
                    setMenuOpen(false)
                    setEditSheetOpen(true)
                  }}
                >
                  <Edit2 size={14} />
                  <span>编辑</span>
                </button>
                {/* 分享 */}
                <button
                  type="button"
                  className="contextMenuItem"
                  onClick={() => {
                    setMenuOpen(false)
                    setShareDialogOpen(true)
                  }}
                >
                  <Share2 size={14} />
                  <span>分享</span>
                </button>
                {/* 创建分支 */}
                <button
                  type="button"
                  className="contextMenuItem"
                  onClick={() => {
                    setMenuOpen(false)
                    props.onFork?.(message)
                  }}
                >
                  <GitBranch size={14} />
                  <span>创建分支</span>
                </button>
                {/* 删除 - 菜单内原地二次确认 */}
                <div className="contextMenuDivider" />
                {menuDeleteConfirm ? (
                  <div className="contextMenuDeleteConfirm">
                    <button
                      type="button"
                      className="contextMenuItem contextMenuItemDanger"
                      onClick={handleMenuDeleteClick}
                    >
                      <Check size={14} />
                      <span>确认删除</span>
                    </button>
                    <button
                      type="button"
                      className="contextMenuItem"
                      onClick={() => setMenuDeleteConfirm(false)}
                    >
                      <ChevronLeft size={14} />
                      <span>取消</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="contextMenuItem contextMenuItemDanger"
                    onClick={handleMenuDeleteClick}
                  >
                    <Trash2 size={14} />
                    <span>删除</span>
                  </button>
                )}
              </div>,
              document.body
            )}

            {/* 版本切换 */}
            {hasVersions && (
              <div className="msgVersionNav">
                <button
                  type="button"
                  className="msgActionBtn"
                  disabled={currentVersion === 0}
                  onClick={handleVersionPrev}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="msgVersionText">
                  {currentVersion + 1}/{totalVersions}
                </span>
                <button
                  type="button"
                  className="msgActionBtn"
                  disabled={currentVersion >= totalVersions - 1}
                  onClick={handleVersionNext}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            {/* 模型信息展示 - 放在版本切换右侧 */}
            {!isUser && message.modelId && props.providerName && (
              <div className="msgModelInfo" style={{
                marginLeft: 12,
                fontSize: 12,
                opacity: 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                <span>{message.modelId}</span>
                <span>|</span>
                <span>{props.providerName}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 对话框 */}
      <SelectCopyDialog
        open={selectCopyOpen}
        onClose={() => setSelectCopyOpen(false)}
        message={message}
      />
      <ShareDialog
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        message={message}
      />
      <EditBottomSheet
        open={editSheetOpen}
        onClose={() => setEditSheetOpen(false)}
        message={message}
        onSave={(newContent) => props.onEdit?.(message, newContent)}
      />
      <WebViewDialog
        open={webViewOpen}
        onClose={() => setWebViewOpen(false)}
        message={message}
      />

      {/* 头像大图浮层 */}
      {avatarLightbox && createPortal(
        <div className="avatarLightboxOverlay" onClick={() => setAvatarLightbox(false)}>
          <div className="avatarLightboxContent" onClick={e => e.stopPropagation()}>
            {isUser ? (
              <UserAvatar user={props.user} size={200} />
            ) : props.useAssistantAvatar ? (
              <BrandAvatar name={assistantLabel} size={200} customAvatarPath={props.assistantAvatar} />
            ) : (
              <Bot size={120} />
            )}
            <div className="avatarLightboxName">
              {isUser ? (props.user?.name || '你') : assistantLabel}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 开发中提示浮层 */}
      {devTip && createPortal(
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-surface-elevated, #333)',
            color: 'var(--color-text-primary, #fff)',
            padding: '10px 20px',
            borderRadius: 8,
            fontSize: 14,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 10000,
            animation: 'fadeInUp 0.2s ease-out'
          }}
        >
          {devTip}
        </div>,
        document.body
      )}
    </div>
  )
}
