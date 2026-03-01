/**
 * 聊天顶部栏
 * 对齐 Flutter Kelivo 的 home_app_bar_builder.dart
 * 包括：对话标题、模型胶囊、新建对话按钮
 */
import { memo, useRef, useState } from 'react'
import { MessageCirclePlus, Boxes, Edit3, Check, X } from 'lucide-react'
import { getBrandIcon, getBrandColor } from '../utils/brandAssets'
import { BrandAvatar } from '../pages/settings/providers/components/BrandAvatar'

interface Props {
  title: string
  assistantName?: string
  assistantAvatar?: string
  assistantCapsuleRef?: React.RefObject<HTMLButtonElement | null>
  providerName?: string
  modelId?: string
  modelCapsuleRef?: React.RefObject<HTMLButtonElement | null>
  onRenameConversation?: (newTitle: string) => void
  onShowAssistantSelect?: () => void
  onShowModelSelect?: () => void
  onNewConversation?: () => void
}

function ChatTopBarInner(props: Props) {
  const {
    title,
    assistantName,
    assistantAvatar,
    assistantCapsuleRef,
    providerName,
    modelId,
    modelCapsuleRef,
    onRenameConversation,
    onShowAssistantSelect,
    onShowModelSelect,
    onNewConversation
  } = props

  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setEditValue(title)
    setIsEditing(true)
    setTimeout(() => inputRef.current?.select(), 10)
  }

  function confirmEdit() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== title) {
      onRenameConversation?.(trimmed)
    }
    setIsEditing(false)
  }

  function cancelEdit() {
    setEditValue(title)
    setIsEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  const hasModel = providerName && modelId

  return (
    <div className="chatTopBar frosted">
      {/* 对话标题 */}
      <div className="chatTopBarTitle">
        {isEditing ? (
          <div className="chatTopBarTitleEdit">
            <input
              ref={inputRef}
              type="text"
              className="chatTopBarTitleInput"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={confirmEdit}
            />
            <button type="button" className="btn-compact" onClick={confirmEdit} title="确认">
              <Check size={16} />
            </button>
            <button type="button" className="btn-compact" onClick={cancelEdit} title="取消">
              <X size={16} />
            </button>
          </div>
        ) : (
          <button type="button" className="chatTopBarTitleBtn" onClick={startEdit}>
            <span className="chatTopBarTitleText">{title}</span>
            <Edit3 size={12} className="chatTopBarTitleIcon" />
          </button>
        )}
      </div>

      {/* 模型胶囊 */}
      {assistantName && (
        <button
          ref={assistantCapsuleRef}
          type="button"
          className="chatTopBarModelCapsule"
          onClick={onShowAssistantSelect}
          title="选择助手"
        >
          <BrandAvatar name={assistantName} size={18} customAvatarPath={assistantAvatar} />
          <span className="chatTopBarModelText">{assistantName}</span>
        </button>
      )}

      {hasModel && (() => {
        const iconPath = getBrandIcon(modelId || '') || getBrandIcon(providerName || '')
        return (
          <button
            ref={modelCapsuleRef}
            type="button"
            className="chatTopBarModelCapsule"
            onClick={onShowModelSelect}
          >
            {iconPath ? (
              <img src={iconPath} alt="" className="chatTopBarModelIcon" style={{ width: 16, height: 16, objectFit: 'contain' }} />
            ) : (
              <Boxes size={16} className="chatTopBarModelIcon" />
            )}
            <span className="chatTopBarModelText">
              {modelId}{providerName ? <span className="chatTopBarModelProvider"> | {providerName}</span> : null}
            </span>
          </button>
        )
      })()}

      <div style={{ flex: 1 }} />

      {/* 右侧操作按钮 */}
      <div className="chatTopBarActions">
        {onNewConversation && (
          <button type="button" className="btn-compact" onClick={onNewConversation} title="新建对话">
            <MessageCirclePlus size={20} />
          </button>
        )}
      </div>
    </div>
  )
}

export const ChatTopBar = memo(ChatTopBarInner)
