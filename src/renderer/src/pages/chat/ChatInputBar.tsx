/**
 * 聊天输入栏组件
 * 对齐旧版 Kelivo 的 chat_input_bar.dart
 * 底部工具按钮行：模型选择、@提及、搜索、推理预算、MCP、清除上下文
 * 可展开额外：图片、文件、最大tokens、工具循环
 */
/**
 * 聊天输入栏组件
 * 对齐旧版 Kelivo 的 chat_input_bar.dart
 * 底部工具按钮行：模型选择、@提及、搜索、推理预算、MCP、清除上下文
 * 可展开额外：图片、文件、最大tokens、工具循环
 */
import { useState, useRef, useEffect } from 'react'
import {
  Paperclip, Image, AtSign, Square, X,
  Globe, Brain, Hammer, Eraser, ChevronRight,
  FileText, RefreshCw, Boxes, ArrowUp, Zap
} from 'lucide-react'
import type { ProviderConfigV2, QuickPhrase, SearchConfig } from '../../../../shared/types'
import { DesktopPopover } from '../../components/DesktopPopover'
import { ReasoningBudgetPopover, type EffortValue } from '../../components/ReasoningBudgetPopover'
import { MaxTokensPopover } from '../../components/MaxTokensPopover'
import { McpServersPopover, type McpServerInfo } from '../../components/McpServersPopover'
import { QuickPhraseMenu } from '../../components/QuickPhraseMenu'
import { ModelSelectPopover } from '../../components/ModelSelectPopover'
import { SearchSelectPopover } from '../../components/SearchSelectPopover'
import { ToolLoopPopover } from '../../components/ToolLoopPopover'

export interface Attachment {
  id: string
  type: 'image' | 'file'
  name: string
  url: string
  /** Electron 环境下 file input 会附带 path（用于主进程读取/传给模型） */
  path?: string
  mime?: string
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
  quickPhrases?: QuickPhrase[]
  onQuickPhrase?: (content: string) => void
  onManageQuickPhrases?: () => void
  // 工具设置
  onOpenModelPicker?: () => void
  reasoningEffort?: EffortValue
  onReasoningEffortChange?: (v: EffortValue) => void
  maxTokens?: number
  maxTokensLimit?: number
  onMaxTokensChange?: (v: number) => void

  // Search
  searchConfig?: SearchConfig
  onSearchConfigChange?: (config: SearchConfig) => void

  mcpServers?: McpServerInfo[]
  onToggleMcpServer?: (id: string) => void
  mcpToolCallMode?: 'native' | 'prompt'
  onMcpToolCallModeChange?: (mode: 'native' | 'prompt') => void
  onClearContext?: () => void
  toolLoopIterations?: number
  onToolLoopIterationsChange?: (v: number) => void
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
    onAddMention,
    onRemoveMention,
    availableProviders = [],
    onOpenModelPicker,
    reasoningEffort = -1,
    onReasoningEffortChange,
    maxTokens = 0,
    maxTokensLimit = 128000,
    onMaxTokensChange,
    searchConfig,
    onSearchConfigChange,
    mcpServers = [],
    onToggleMcpServer,
    mcpToolCallMode = 'native',
    onMcpToolCallModeChange,
    onClearContext,
    toolLoopIterations = 10,
    onToolLoopIterationsChange
  } = props

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const reasoningBtnRef = useRef<HTMLButtonElement>(null)
  const maxTokensBtnRef = useRef<HTMLButtonElement>(null)
  const mcpBtnRef = useRef<HTMLButtonElement>(null)
  const mentionBtnRef = useRef<HTMLButtonElement>(null)
  const toolLoopBtnRef = useRef<HTMLButtonElement>(null)
  const searchBtnRef = useRef<HTMLButtonElement>(null) // New Ref

  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [maxTokensOpen, setMaxTokensOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [toolLoopOpen, setToolLoopOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false) // New State
  const [extrasExpanded, setExtrasExpanded] = useState(false)

  // 快捷短语菜单
  const quickPhraseBtnRef = useRef<HTMLButtonElement>(null)
  const [quickPhraseOpen, setQuickPhraseOpen] = useState(false)

  const mcpToolCount = mcpServers.filter((s) => s.enabled).reduce((a, s) => a + s.toolCount, 0)
  const reasoningActive = reasoningEffort !== -1 && reasoningEffort !== 0
  const mentionActive = mentionedModels.length > 0
  const canMention = !disabled && availableProviders.length > 0 && !!onAddMention

  const searchEnabled = searchConfig?.global?.enabled === true

  // 自动调整高度：最小72px（3行），最大200px，超出滚动
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const scrollHeight = textareaRef.current.scrollHeight
      // 最小72px（3行），最大200px
      const minH = 72
      const maxH = 200
      textareaRef.current.style.height = Math.max(minH, Math.min(scrollHeight, maxH)) + 'px'
    }
  }, [value])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isGenerating && (value.trim() || attachments.length > 0)) onSend()
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
        rows={3}
      />

      {/* 底部工具按钮行 - 对齐 Flutter _CompactIconButton 布局 */}
      <div className="chatInputToolbar">
        <div className="chatInputToolGroup">
          <button type="button" className="btn-compact" onClick={onOpenModelPicker} disabled={disabled} title="切换模型">
            <Boxes size={20} />
          </button>
          <button
            ref={mentionBtnRef}
            type="button"
            className={`btn-compact ${mentionActive ? 'btn-active' : ''}`}
            onClick={() => {
              if (!canMention) return
              setMentionOpen((v) => !v)
            }}
            disabled={disabled || !canMention}
            title="@ 提及模型"
          >
            <AtSign size={20} />
          </button>
          <button
            ref={searchBtnRef}
            type="button"
            className={`btn-compact ${searchEnabled ? 'btn-active' : ''}`}
            onClick={() => setSearchOpen(!searchOpen)}
            disabled={disabled}
            title="联网搜索"
          >
            <Globe size={20} />
          </button>
          <button ref={reasoningBtnRef} type="button" className={`btn-compact ${reasoningActive ? 'btn-active' : ''}`} onClick={() => setReasoningOpen(!reasoningOpen)} disabled={disabled} title="推理预算">
            <Brain size={20} />
          </button>
          {/* MCP: icon + tool count text, matching Flutter Row layout */}
          <button ref={mcpBtnRef} type="button" className={`btn-compact ${mcpToolCount > 0 ? 'btn-active' : ''}`} onClick={() => setMcpOpen(!mcpOpen)} disabled={disabled} title="MCP 服务器" style={{ width: 'auto', gap: 4, paddingRight: mcpToolCount > 0 ? 4 : undefined }}>
            <Hammer size={20} />
            {mcpToolCount > 0 && <span style={{ fontSize: 12, fontWeight: 500 }}>{mcpToolCount}</span>}
          </button>
          <button type="button" className="btn-compact" onClick={onClearContext} disabled={disabled} title="清除上下文">
            <Eraser size={20} />
          </button>
          <button ref={quickPhraseBtnRef} type="button" className="btn-compact" onClick={() => setQuickPhraseOpen(!quickPhraseOpen)} disabled={disabled} title="快捷短语">
            <Zap size={20} />
          </button>
          <button type="button" className="btn-compact" onClick={() => setExtrasExpanded(!extrasExpanded)} title={extrasExpanded ? '收起' : '展开更多'} style={{ transition: 'transform 0.2s', transform: extrasExpanded ? 'rotate(90deg)' : 'none' }}>
            <ChevronRight size={20} />
          </button>

          {extrasExpanded && (
            <>
              <button type="button" className="btn-compact" onClick={() => imageInputRef.current?.click()} disabled={disabled} title="添加图片">
                <Image size={20} />
              </button>
              <button type="button" className="btn-compact" onClick={() => fileInputRef.current?.click()} disabled={disabled} title="添加文件">
                <Paperclip size={20} />
              </button>
              <button ref={maxTokensBtnRef} type="button" className={`btn-compact ${maxTokens > 0 ? 'btn-active' : ''}`} onClick={() => setMaxTokensOpen(!maxTokensOpen)} disabled={disabled} title="最大 Tokens">
                <FileText size={20} />
              </button>
              <button
                ref={toolLoopBtnRef}
                type="button"
                className={`btn-compact ${toolLoopIterations !== 10 ? 'btn-active' : ''}`}
                onClick={() => setToolLoopOpen(!toolLoopOpen)}
                disabled={disabled}
                title="工具循环"
              >
                <RefreshCw size={20} />
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
            <button type="button" className="btn btn-primary chatInputSend" onClick={onSend} disabled={disabled || (!value.trim() && attachments.length === 0)} title="发送 (Enter)">
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

      {/* @ 提及模型 */}
      <DesktopPopover anchorRef={mentionBtnRef} open={mentionOpen} onClose={() => setMentionOpen(false)} minWidth={580} maxHeight={600} placement="above">
        <ModelSelectPopover
          providers={availableProviders}
          onSelect={(providerId, modelId) => {
            const providerName = availableProviders.find((p) => p.id === providerId)?.name ?? providerId
            onAddMention?.({ providerId, providerName, modelId })
            setMentionOpen(false)
            textareaRef.current?.focus()
          }}
          onClose={() => {
            setMentionOpen(false)
            textareaRef.current?.focus()
          }}
        />
      </DesktopPopover>

      <DesktopPopover anchorRef={toolLoopBtnRef} open={toolLoopOpen} onClose={() => setToolLoopOpen(false)} minWidth={320} placement="above">
        <ToolLoopPopover
          value={toolLoopIterations}
          onChange={(v) => onToolLoopIterationsChange?.(v)}
        />
      </DesktopPopover>

      {/* Search Popover */}
      {searchConfig && (
        <DesktopPopover anchorRef={searchBtnRef} open={searchOpen} onClose={() => setSearchOpen(false)} minWidth={320}>
          <SearchSelectPopover
            config={searchConfig}
            onToggleGlobal={() => {
              onSearchConfigChange?.({
                ...searchConfig,
                global: { ...searchConfig.global, enabled: !searchConfig.global.enabled }
              })
            }}
            onSelectService={(id) => {
              onSearchConfigChange?.({
                ...searchConfig,
                global: {
                  ...searchConfig.global,
                  enabled: true, // Auto enable if selecting a service
                  defaultServiceId: id
                }
              })
              setSearchOpen(false)
            }}
            onClose={() => setSearchOpen(false)}
          />
        </DesktopPopover>
      )}



      {/* 快捷短语菜单 */}
      <DesktopPopover anchorRef={quickPhraseBtnRef} open={quickPhraseOpen} onClose={() => setQuickPhraseOpen(false)} minWidth={320}>
        <QuickPhraseMenu
          phrases={props.quickPhrases ?? []}
          onSelect={(phrase) => {
            props.onQuickPhrase?.(phrase.content)
            setQuickPhraseOpen(false)
          }}
          onManage={props.onManageQuickPhrases}
        />
      </DesktopPopover>
    </div>
  )
}
