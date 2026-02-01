/**
 * 聊天输入栏组件
 * 对齐旧版 Kelivo 的 chat_input_bar.dart
 * 底部工具按钮行：模型选择、@提及、搜索、推理预算、MCP、清除上下文
 * 可展开额外：图片、文件、最大tokens、工具循环
 */
import { useState, useRef, useEffect } from 'react'
import {
  Send, Paperclip, Image, AtSign, Square, X,
  Globe, Brain, Hammer, Eraser, ChevronRight,
  FileText, RefreshCw, Boxes, ArrowUp
} from 'lucide-react'
import type { ProviderConfigV2 } from '../../../../shared/types'
import { DesktopPopover } from '../../components/DesktopPopover'
import { ReasoningBudgetPopover, type EffortValue } from '../../components/ReasoningBudgetPopover'
import { MaxTokensPopover } from '../../components/MaxTokensPopover'
import { McpServersPopover, type McpServerInfo } from '../../components/McpServersPopover'

export interface Attachment {
  id: string
  type: 'image' | 'file'
  name: string
  url: string
  file?: File
}

export interface MentionedModel {
  providerId: string
  providerName: string
  modelId: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop?: () => void
  isGenerating?: boolean
  disabled?: boolean
  placeholder?: string
  // 附件
  attachments?: Attachment[]
  onAddAttachment?: (files: FileList) => void
  onRemoveAttachment?: (id: string) => void
  // @ 提及模型
  mentionedModels?: MentionedModel[]
  onAddMention?: (model: MentionedModel) => void
  onRemoveMention?: (model: MentionedModel) => void
  availableProviders?: ProviderConfigV2[]
  // 快捷短语
  quickPhrases?: Array<{ id: string; title: string; content: string }>
  onQuickPhrase?: (content: string) => void
  // 工具设置
  onOpenModelPicker?: () => void
  reasoningEffort?: EffortValue
  onReasoningEffortChange?: (v: EffortValue) => void
  maxTokens?: number
  maxTokensLimit?: number
  onMaxTokensChange?: (v: number) => void
  searchEnabled?: boolean
  onSearchToggle?: () => void
  mcpServers?: McpServerInfo[]
  onToggleMcpServer?: (id: string) => void
  mcpToolCallMode?: 'native' | 'prompt'
  onMcpToolCallModeChange?: (mode: 'native' | 'prompt') => void
  onClearContext?: () => void
}

export function ChatInputBar(props: Props) {
  const {
    value,
    onChange,
    onSend,
    onStop,
    isGenerating = false,
    disabled = false,
    placeholder = '输入消息...',
    attachments = [],
    onAddAttachment,
    onRemoveAttachment,
    mentionedModels = [],
    onRemoveMention,
    onOpenModelPicker,
    reasoningEffort = -1,
    onReasoningEffortChange,
    maxTokens = 0,
    maxTokensLimit = 128000,
    onMaxTokensChange,
    searchEnabled = false,
    onSearchToggle,
    mcpServers = [],
    onToggleMcpServer,
    mcpToolCallMode = 'native',
    onMcpToolCallModeChange,
    onClearContext
  } = props

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const reasoningBtnRef = useRef<HTMLButtonElement>(null)
  const maxTokensBtnRef = useRef<HTMLButtonElement>(null)
  const mcpBtnRef = useRef<HTMLButtonElement>(null)

  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [maxTokensOpen, setMaxTokensOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const [extrasExpanded, setExtrasExpanded] = useState(false)

  const mcpToolCount = mcpServers.filter((s) => s.enabled).reduce((a, s) => a + s.toolCount, 0)
  const reasoningActive = reasoningEffort !== -1 && reasoningEffort !== 0

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const scrollHeight = textareaRef.current.scrollHeight
      textareaRef.current.style.height = Math.min(scrollHeight, 200) + 'px'
    }
  }, [value])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isGenerating && value.trim()) onSend()
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      onAddAttachment?.(e.target.files)
    }
    e.target.value = ''
  }

  return (
    <div className="chatInputContainer frosted">
      {/* @ 提及标签 */}
      {mentionedModels.length > 0 && (
        <div className="chatInputMentions">
          {mentionedModels.map((m) => (
            <span key={`${m.providerId}-${m.modelId}`} className="mentionTag">
              <AtSign size={12} />
              <span>{m.providerName}: {m.modelId}</span>
              <button type="button" className="mentionTagRemove" onClick={() => onRemoveMention?.(m)}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 附件预览 */}
      {attachments.length > 0 && (
        <div className="chatInputAttachments">
          {attachments.map((att) => (
            <div key={att.id} className="attachmentPreview">
              {att.type === 'image' ? (
                <img src={att.url} alt={att.name} className="attachmentPreviewImage" />
              ) : (
                <div className="attachmentPreviewFile">
                  <Paperclip size={16} />
                  <span>{att.name}</span>
                </div>
              )}
              <button type="button" className="attachmentPreviewRemove" onClick={() => onRemoveAttachment?.(att.id)}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 文本输入 */}
      <textarea
        ref={textareaRef}
        className="chatInputTextarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
      />

      {/* 底部工具按钮行 */}
      <div className="chatInputToolbar">
        <div className="chatInputToolGroup">
          <button type="button" className="btn btn-icon btn-compact" onClick={onOpenModelPicker} disabled={disabled} title="切换模型">
            <Boxes size={16} />
          </button>
          <button type="button" className="btn btn-icon btn-compact" disabled={disabled} title="@ 提及模型">
            <AtSign size={16} />
          </button>
          <button
            type="button"
            className={`btn btn-icon btn-compact ${searchEnabled ? 'btn-active' : ''}`}
            onClick={onSearchToggle}
            disabled={disabled}
            title="联网搜索"
          >
            <Globe size={16} />
          </button>
          <button
            ref={reasoningBtnRef}
            type="button"
            className={`btn btn-icon btn-compact ${reasoningActive ? 'btn-active' : ''}`}
            onClick={() => setReasoningOpen(!reasoningOpen)}
            disabled={disabled}
            title="推理预算"
          >
            <Brain size={16} />
          </button>
          <button
            ref={mcpBtnRef}
            type="button"
            className={`btn btn-icon btn-compact ${mcpToolCount > 0 ? 'btn-active' : ''}`}
            onClick={() => setMcpOpen(!mcpOpen)}
            disabled={disabled}
            title="MCP 服务器"
            style={{ position: 'relative' }}
          >
            <Hammer size={16} />
            {mcpToolCount > 0 && <span className="toolBadge">{mcpToolCount}</span>}
          </button>
          <button type="button" className="btn btn-icon btn-compact" onClick={onClearContext} disabled={disabled} title="清除上下文">
            <Eraser size={16} />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-compact"
            onClick={() => setExtrasExpanded(!extrasExpanded)}
            title={extrasExpanded ? '收起' : '展开更多'}
            style={{ transition: 'transform 0.2s', transform: extrasExpanded ? 'rotate(90deg)' : 'none' }}
          >
            <ChevronRight size={16} />
          </button>

          {extrasExpanded && (
            <>
              <button type="button" className="btn btn-icon btn-compact" onClick={() => imageInputRef.current?.click()} disabled={disabled} title="添加图片">
                <Image size={16} />
              </button>
              <button type="button" className="btn btn-icon btn-compact" onClick={() => fileInputRef.current?.click()} disabled={disabled} title="添加文件">
                <Paperclip size={16} />
              </button>
              <button
                ref={maxTokensBtnRef}
                type="button"
                className={`btn btn-icon btn-compact ${maxTokens > 0 ? 'btn-active' : ''}`}
                onClick={() => setMaxTokensOpen(!maxTokensOpen)}
                disabled={disabled}
                title="最大 Tokens"
              >
                <FileText size={16} />
              </button>
              <button type="button" className="btn btn-icon btn-compact" disabled={disabled} title="工具循环">
                <RefreshCw size={16} />
              </button>
            </>
          )}
        </div>

        <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileChange} />

        <div className="chatInputToolGroup">
          {isGenerating ? (
            <button type="button" className="btn btn-primary chatInputSend" onClick={onStop} title="停止生成">
              <Square size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary chatInputSend"
              onClick={onSend}
              disabled={disabled || !value.trim()}
              title="发送 (Enter)"
            >
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Popovers */}
      <DesktopPopover anchorRef={reasoningBtnRef} open={reasoningOpen} onClose={() => setReasoningOpen(false)} minWidth={380}>
        <ReasoningBudgetPopover value={reasoningEffort} onChange={(v) => { onReasoningEffortChange?.(v); setReasoningOpen(false) }} />
      </DesktopPopover>

      <DesktopPopover anchorRef={maxTokensBtnRef} open={maxTokensOpen} onClose={() => setMaxTokensOpen(false)} minWidth={320}>
        <MaxTokensPopover value={maxTokens} maxLimit={maxTokensLimit} onChange={(v) => onMaxTokensChange?.(v)} />
      </DesktopPopover>

      <DesktopPopover anchorRef={mcpBtnRef} open={mcpOpen} onClose={() => setMcpOpen(false)} minWidth={320}>
        <McpServersPopover
          servers={mcpServers}
          onToggleServer={(id) => onToggleMcpServer?.(id)}
          toolCallMode={mcpToolCallMode}
          onToolCallModeChange={(m) => onMcpToolCallModeChange?.(m)}
        />
      </DesktopPopover>
    </div>
  )
}
