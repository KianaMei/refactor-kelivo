/**
 * 聊天输入栏组件
 * 对齐旧版 Kelivo 的 chat_input_bar.dart
 * 包括：文本输入、附件上传、@ 提及模型、快捷短语等
 */
import { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, Image, AtSign, Zap, Square, Mic, Smile, X } from 'lucide-react'
import type { ProviderConfigV2 } from '../../../../shared/types'

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
    quickPhrases = []
  } = props

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [showQuickPhrases, setShowQuickPhrases] = useState(false)
  const [showMentionPicker, setShowMentionPicker] = useState(false)

  // 自动调整文本框高度
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
      if (!isGenerating && value.trim()) {
        onSend()
      }
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      onAddAttachment?.(e.target.files)
    }
    e.target.value = ''
  }

  function handleQuickPhrase(content: string) {
    setShowQuickPhrases(false)
    props.onQuickPhrase?.(content)
  }

  return (
    <div className="chatInputContainer frosted">
      {/* @ 提及的模型标签 */}
      {mentionedModels.length > 0 && (
        <div className="chatInputMentions">
          {mentionedModels.map((m) => (
            <span key={`${m.providerId}-${m.modelId}`} className="mentionTag">
              <AtSign size={12} />
              <span>{m.providerName}: {m.modelId}</span>
              <button
                type="button"
                className="mentionTagRemove"
                onClick={() => onRemoveMention?.(m)}
              >
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
              <button
                type="button"
                className="attachmentPreviewRemove"
                onClick={() => onRemoveAttachment?.(att.id)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 主输入区 */}
      <div className="chatInputMain">
        {/* 左侧工具按钮 */}
        <div className="chatInputTools">
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => imageInputRef.current?.click()}
            title="添加图片"
            disabled={disabled}
          >
            <Image size={18} />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <button
            type="button"
            className="btn btn-icon"
            onClick={() => fileInputRef.current?.click()}
            title="添加文件"
            disabled={disabled}
          >
            <Paperclip size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {/* @ 提及模型 */}
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setShowMentionPicker(!showMentionPicker)}
            title="@ 提及模型"
            disabled={disabled}
          >
            <AtSign size={18} />
          </button>

          {/* 快捷短语 */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => setShowQuickPhrases(!showQuickPhrases)}
              title="快捷短语"
              disabled={disabled}
            >
              <Zap size={18} />
            </button>
            {showQuickPhrases && quickPhrases.length > 0 && (
              <div className="quickPhrasePopup frosted">
                {quickPhrases.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="quickPhraseItem"
                    onClick={() => handleQuickPhrase(p.content)}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

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

        {/* 右侧按钮 */}
        <div className="chatInputActions">
          {isGenerating ? (
            <button
              type="button"
              className="btn btn-primary chatInputSend"
              onClick={onStop}
              title="停止生成"
            >
              <Square size={18} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary chatInputSend"
              onClick={onSend}
              disabled={disabled || !value.trim()}
              title="发送 (Enter)"
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </div>

      {/* @ 提及模型选择器（简化版） */}
      {showMentionPicker && (
        <div className="mentionPicker frosted">
          <div style={{ padding: '8px 12px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
            选择模型
          </div>
          <div style={{ padding: 8, opacity: 0.7, fontSize: 13 }}>
            （后续接入模型选择）
          </div>
        </div>
      )}
    </div>
  )
}
