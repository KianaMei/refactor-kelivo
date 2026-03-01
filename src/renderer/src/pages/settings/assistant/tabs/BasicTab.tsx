import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Copy,
  Hash,
  Image as ImageIcon,
  MessageCircle,
  MessagesSquare,
  Star,
  Thermometer,
  Trash2,
  User,
  Wand2,
  X,
  Zap
} from 'lucide-react'

import type { AssistantConfig, ProviderConfigV2 } from '../../../../../../shared/types'
import { ModelSelectPopover } from '../../../../components/ModelSelectPopover'
import { AssistantAvatar } from '../AssistantAvatar'

// Emoji 列表：复用 Provider 页风格（够用即可，避免引入大依赖）
const EMOJI_LIST = [
  '😺', '😄', '😊', '😉', '😍', '😘', '🤖', '🧠', '🛠️', '🚀',
  '💡', '🔥', '✨', '🌟', '🎯', '🎨', '📚', '💻', '🧑‍💻', '👨‍💻',
  '👩‍💻', '🧪', '🧩', '🧭', '🗂️', '📌', '✅', '⚡', '🌈', '🫶',
  '🦊', '🐼', '🐱', '🐶', '🐯', '🦁', '🐸', '🐙', '🐧', '🐳',
  '🍀', '🌸', '🌻', '🌊', '☀️', '🌙', '⭐', '🎁', '🎉', '🏆',
  '📎', '🔒', '🔓', '🧯', '🧱', '🛰️', '🎵', '🎬', '🎮', '📝'
]

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function isColorLike(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  if (t.startsWith('#')) return true
  if (t.startsWith('rgb(') || t.startsWith('rgba(')) return true
  if (t.startsWith('hsl(') || t.startsWith('hsla(')) return true
  return false
}

function isLocalRelativePath(p: string): boolean {
  const s = p.trim()
  if (!s) return false
  if (s.startsWith('http') || s.startsWith('data:')) return false
  return s.includes('/') || s.includes('\\')
}

function formatTokens(v: number | undefined): string {
  if (!v || v <= 0) return '自动'
  if (v >= 1000) {
    const k = v / 1000
    const fixed = v % 1000 === 0 ? 0 : 1
    return `${k.toFixed(fixed)}K`
  }
  return String(v)
}

export function BasicTab(props: {
  assistant: AssistantConfig
  providers?: ProviderConfigV2[]
  onPatch: (patch: Partial<AssistantConfig>) => void
  onSetDefault: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { assistant, providers = [], onPatch, onSetDefault, onDuplicate, onDelete } = props
  const contextMessageLimit = clamp(assistant.contextMessageSize ?? 64, 0, 512)

  // ========== 头像菜单 ==========
  const avatarBtnRef = useRef<HTMLButtonElement>(null)
  const [avatarMenuPos, setAvatarMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [emojiPickerPos, setEmojiPickerPos] = useState<{ x: number; y: number } | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [avatarUrlOpen, setAvatarUrlOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState('')

  // ========== 模型选择 ==========
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false)

  // ========== 背景预览 ==========
  const rawBackground = (assistant.background ?? '').trim()
  const backgroundIsColor = useMemo(() => isColorLike(rawBackground), [rawBackground])
  const [bgPreviewSrc, setBgPreviewSrc] = useState<string | null>(null)
  const [bgPreviewFailed, setBgPreviewFailed] = useState(false)

  useEffect(() => {
    setBgPreviewFailed(false)
    if (!rawBackground || backgroundIsColor) {
      setBgPreviewSrc(null)
      return
    }
    if (rawBackground.startsWith('http') || rawBackground.startsWith('data:')) {
      setBgPreviewSrc(rawBackground)
      return
    }
    if (!isLocalRelativePath(rawBackground)) {
      setBgPreviewSrc(null)
      return
    }

    let cancelled = false
    window.api.avatar.resolve(rawBackground)
      .then((dataUrl) => {
        if (!cancelled) setBgPreviewSrc(dataUrl ?? null)
      })
      .catch(() => {
        if (!cancelled) setBgPreviewSrc(null)
      })

    return () => { cancelled = true }
  }, [backgroundIsColor, rawBackground])

  const boundModelDisplay = useMemo(() => {
    if (!assistant.boundModelProvider || !assistant.boundModelId) return '使用全局默认'
    const p = providers.find((x) => x.id === assistant.boundModelProvider)
    const providerName = p?.name ?? assistant.boundModelProvider
    return `${assistant.boundModelId} · ${providerName}`
  }, [assistant.boundModelId, assistant.boundModelProvider, providers])

  // ========== Actions ==========
  const handlePickAvatarImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = reader.result as string
        try {
          const relativePath = await window.api.avatar.save(`assistant_${assistant.id}`, base64)
          onPatch({ avatarType: 'image', avatar: relativePath })
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Failed to save assistant avatar:', err)
        }
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const handleSetEmoji = async (emoji: string) => {
    try { await window.api.avatar.delete(`assistant_${assistant.id}`) } catch {}
    onPatch({ avatarType: 'emoji', avatar: emoji })
    setShowEmojiPicker(false)
    setEmojiPickerPos(null)
  }

  const handleResetAvatar = async () => {
    try { await window.api.avatar.delete(`assistant_${assistant.id}`) } catch {}
    onPatch({ avatarType: 'emoji', avatar: '😎' })
  }

  const handleSetAvatarUrl = async () => {
    const url = avatarUrl.trim()
    if (!url) return
    try { await window.api.avatar.delete(`assistant_${assistant.id}`) } catch {}
    onPatch({ avatarType: 'image', avatar: url })
    setAvatarUrl('')
    setAvatarUrlOpen(false)
  }

  const handlePickBackgroundImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = reader.result as string
        try {
          const relativePath = await window.api.avatar.save(`assistantBg_${assistant.id}`, base64)
          onPatch({ background: relativePath })
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Failed to save assistant background:', err)
        }
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const handleClearBackground = async () => {
    try { await window.api.avatar.delete(`assistantBg_${assistant.id}`) } catch {}
    onPatch({ background: null })
  }

  return (
    <div className="assistantBasicRoot">
      {/* Identity card (avatar + name) */}
      <div className="assistantTabCard assistantIdentityCard">
        <div className="assistantIdentityRow">
          <button
            ref={avatarBtnRef}
            type="button"
            className="assistantAvatarBtn"
            onClick={(e) => setAvatarMenuPos({ x: e.clientX, y: e.clientY })}
            title="设置头像"
          >
            <AssistantAvatar assistant={assistant} size={64} />
          </button>

          <div className="assistantIdentityNameCol">
            <div className="assistantFieldLabel">助手名称</div>
            <input
              className="input assistantTextInput"
              value={assistant.name}
              onChange={(e) => onPatch({ name: e.target.value })}
              placeholder="输入助手名称"
            />
          </div>
        </div>
      </div>

      {/* Parameters card */}
      <div className="assistantTabCard">
        <div className="assistantTabCardTitleRow">
          <Thermometer size={18} className="assistantTabCardIcon" />
          <div className="assistantTabCardTitle">参数</div>
        </div>

        <div className="assistantParamList">
          <InlineSliderSetting
            icon={<Thermometer size={18} className="assistantRowIcon" />}
            label="Temperature"
            enabled={assistant.temperature !== undefined}
            valueText={assistant.temperature !== undefined ? (assistant.temperature ?? 1).toFixed(2) : '已禁用'}
            onToggle={(v) => onPatch({ temperature: v ? 1.0 : undefined })}
          >
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={clamp(assistant.temperature ?? 1.0, 0, 2)}
              onChange={(e) => onPatch({ temperature: Number(e.target.value) })}
              className="assistantRange"
            />
          </InlineSliderSetting>

          <div className="assistantRowDivider" />

          <InlineSliderSetting
            icon={<Wand2 size={18} className="assistantRowIcon" />}
            label="Top P"
            enabled={assistant.topP !== undefined}
            valueText={assistant.topP !== undefined ? (assistant.topP ?? 1).toFixed(2) : '已禁用'}
            onToggle={(v) => onPatch({ topP: v ? 1.0 : undefined })}
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={clamp(assistant.topP ?? 1.0, 0, 1)}
              onChange={(e) => onPatch({ topP: Number(e.target.value) })}
              className="assistantRange"
            />
          </InlineSliderSetting>

          <div className="assistantRowDivider" />

          <InlineSliderSetting
            icon={<MessagesSquare size={18} className="assistantRowIcon" />}
            label="上下文消息数"
            enabled={assistant.limitContextMessages}
            valueText={assistant.limitContextMessages ? (contextMessageLimit <= 0 ? '不限' : String(contextMessageLimit)) : '不限'}
            onToggle={(v) => onPatch({ limitContextMessages: v })}
          >
            <input
              type="range"
              min={0}
              max={512}
              step={1}
              value={contextMessageLimit}
              onChange={(e) => onPatch({ contextMessageSize: clamp(parseInt(e.target.value || '0', 10), 0, 512) })}
              className="assistantRange"
            />
          </InlineSliderSetting>

          <div className="assistantRowDivider" />

          <div className="assistantMaxTokensBlock">
            <div className="assistantRowHeader">
              <div className="assistantRowHeaderLeft">
                <Hash size={18} className="assistantRowIcon" />
                <div className="assistantRowLabel">最大输出 Tokens</div>
              </div>
              <div className="assistantRowHeaderRight">
                <div className="assistantRowValue">{formatTokens(assistant.maxTokens)}</div>
              </div>
            </div>

            <div className="assistantMaxTokensControls">
              <input
                type="range"
                min={0}
                max={128000}
                step={1000}
                value={clamp(assistant.maxTokens ?? 0, 0, 128000)}
                onChange={(e) => {
                  const v = parseInt(e.target.value || '0', 10)
                  onPatch({ maxTokens: v <= 0 ? undefined : v })
                }}
                className="assistantRange"
              />

              <div className="assistantTokenPresets">
                {[
                  { label: '自动', value: 0 },
                  { label: '4K', value: 4000 },
                  { label: '8K', value: 8000 },
                  { label: '16K', value: 16000 },
                  { label: '32K', value: 32000 },
                  { label: '64K', value: 64000 },
                ].map((p) => {
                  const selected = (assistant.maxTokens ?? 0) === p.value || (p.value === 0 && !assistant.maxTokens)
                  return (
                    <button
                      key={p.label}
                      type="button"
                      className={`assistantPresetChip ${selected ? 'assistantPresetChipActive' : ''}`}
                      onClick={() => onPatch({ maxTokens: p.value <= 0 ? undefined : p.value })}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="assistantRowDivider" />

          <ToggleSettingRow
            icon={<User size={18} className="assistantRowIcon" />}
            label="使用助手头像"
            value={assistant.useAssistantAvatar}
            onChange={(v) => onPatch({ useAssistantAvatar: v })}
          />

          <div className="assistantRowDivider" />

          <ToggleSettingRow
            icon={<Zap size={18} className="assistantRowIcon" />}
            label="流式输出"
            value={assistant.streamOutput}
            onChange={(v) => onPatch({ streamOutput: v })}
          />
        </div>
      </div>

      {/* Chat model card */}
      <div className="assistantTabCard">
        <div className="assistantTabCardTitleRow">
          <MessageCircle size={18} className="assistantTabCardIcon" />
          <div className="assistantTabCardTitle">聊天模型</div>
        </div>
        <div className="assistantTabCardDesc">为此助手指定专用模型；不设置则使用全局默认</div>

        <button
          type="button"
          className="assistantModelRow"
          onClick={() => providers.length > 0 && setModelSelectorOpen((v) => !v)}
          disabled={providers.length === 0}
          title={providers.length === 0 ? "请先在「提供商」中配置模型" : "选择模型"}
        >
          <div className="assistantModelRowLeft">
            <div className="assistantModelIcon">{assistant.boundModelId ? assistant.boundModelId.slice(0, 1).toUpperCase() : 'G'}</div>
            <div className="assistantModelRowText">{boundModelDisplay}</div>
          </div>
          {assistant.boundModelProvider && assistant.boundModelId ? (
            <button
              type="button"
              className="assistantIconBtn"
              onClick={(e) => {
                e.stopPropagation()
                onPatch({ boundModelProvider: null, boundModelId: null })
              }}
              title="清除绑定"
            >
              <X size={16} />
            </button>
          ) : null}
        </button>
      </div>

      {/* Background card */}
      <div className="assistantTabCard">
        <div className="assistantTabCardTitleRow">
          <ImageIcon size={18} className="assistantTabCardIcon" />
          <div className="assistantTabCardTitle">聊天背景</div>
        </div>
        <div className="assistantTabCardDesc">为该助手设置对话背景（可选）</div>

        {!rawBackground ? (
          <button type="button" className="assistantWideBtn" onClick={handlePickBackgroundImage}>
            <ImageIcon size={16} />
            选择图片
          </button>
        ) : (
          <div className="assistantBgBtnRow">
            <button type="button" className="assistantWideBtn" onClick={handlePickBackgroundImage}>
              <ImageIcon size={16} />
              更换图片
            </button>
            <button type="button" className="assistantWideBtn assistantWideBtnDanger" onClick={handleClearBackground}>
              <X size={16} />
              清除
            </button>
          </div>
        )}

        {rawBackground ? (
          <div className="assistantBgPreviewWrap">
            {backgroundIsColor ? (
              <div className="assistantBgColorPreview" style={{ background: rawBackground }} />
            ) : bgPreviewSrc && !bgPreviewFailed ? (
              <img
                src={bgPreviewSrc}
                className="assistantBgPreviewImg"
                alt="背景预览"
                onError={() => setBgPreviewFailed(true)}
              />
            ) : (
              <div className="assistantBgPreviewFallback">
                无法预览（{rawBackground}）
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Actions card */}
      <div className="assistantTabCard">
        <div className="assistantActionRow">
          <button type="button" className="assistantActionBtn" onClick={onSetDefault} disabled={assistant.isDefault} title={assistant.isDefault ? "已是默认助手" : "设为默认助手"}>
            <Star size={16} />
            设为默认
          </button>
          <button type="button" className="assistantActionBtn" onClick={onDuplicate} title="复制助手">
            <Copy size={16} />
            复制
          </button>
          <button
            type="button"
            className="assistantActionBtn assistantActionBtnDanger"
            onClick={onDelete}
            disabled={!assistant.deletable}
            title={assistant.deletable ? "删除助手" : "内置助手不可删除"}
          >
            <Trash2 size={16} />
            删除
          </button>
        </div>
      </div>

      {/* ========== Avatar Menu / Emoji Picker / URL Dialog ========== */}
      {avatarMenuPos && (
        <>
          <div className="assistantPopupScrim" onMouseDown={() => setAvatarMenuPos(null)} />
          <div className="assistantPopupMenu" style={{ left: avatarMenuPos.x, top: avatarMenuPos.y }}>
            <button
              type="button"
              className="assistantPopupMenuItem"
              onClick={() => {
                setShowEmojiPicker(true)
                setEmojiPickerPos({ x: avatarMenuPos.x, y: avatarMenuPos.y })
                setAvatarMenuPos(null)
              }}
            >
              使用 Emoji
            </button>
            <button type="button" className="assistantPopupMenuItem" onClick={() => { handlePickAvatarImage(); setAvatarMenuPos(null) }}>
              从图片选择
            </button>
            <button type="button" className="assistantPopupMenuItem" onClick={() => { setAvatarUrlOpen(true); setAvatarMenuPos(null) }}>
              输入图片链接
            </button>
            <div className="assistantPopupMenuDivider" />
            <button type="button" className="assistantPopupMenuItem assistantPopupMenuItemDanger" onClick={() => { void handleResetAvatar(); setAvatarMenuPos(null) }}>
              重置头像
            </button>
          </div>
        </>
      )}

      {showEmojiPicker && emojiPickerPos && (
        <>
          <div className="assistantPopupScrim" onMouseDown={() => { setShowEmojiPicker(false); setEmojiPickerPos(null) }} />
          <div className="assistantPopupMenu" style={{ left: emojiPickerPos.x, top: emojiPickerPos.y, width: 300, padding: 12 }}>
            <div className="assistantPopupTitle">选择 Emoji</div>
            <div className="assistantEmojiGrid">
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="assistantEmojiBtn"
                  onClick={() => void handleSetEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {avatarUrlOpen && (
        <div className="assistantSubDialogOverlay" onMouseDown={() => setAvatarUrlOpen(false)}>
          <div className="assistantSubDialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className="assistantSubDialogHeader">
              <div className="assistantSubDialogTitle">输入图片链接</div>
              <button type="button" className="assistantIconBtn" onClick={() => setAvatarUrlOpen(false)} title="关闭">
                <X size={16} />
              </button>
            </div>
            <div className="assistantSubDialogBody">
              <input
                className="input assistantTextInput"
                placeholder="https://example.com/avatar.png"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setAvatarUrlOpen(false)
                  if (e.key === 'Enter') void handleSetAvatarUrl()
                }}
                autoFocus
              />
              <div className="assistantSubDialogActions">
                <button type="button" className="btn" onClick={() => setAvatarUrlOpen(false)}>取消</button>
                <button type="button" className="btn btn-primary" disabled={!avatarUrl.trim()} onClick={() => void handleSetAvatarUrl()}>确定</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== Model Selector ========== */}
      {modelSelectorOpen && providers.length > 0 && createPortal(
        <div className="assistantSubDialogOverlay" onMouseDown={() => setModelSelectorOpen(false)}>
          <div className="assistantModelDialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className="assistantModelDialogHeader">
              <div className="assistantSubDialogTitle">选择模型</div>
              <button type="button" className="assistantIconBtn" onClick={() => setModelSelectorOpen(false)} title="关闭">
                <X size={16} />
              </button>
            </div>

            <button
              type="button"
              className="assistantUseGlobalBtn"
              onClick={() => {
                onPatch({ boundModelProvider: null, boundModelId: null })
                setModelSelectorOpen(false)
              }}
            >
              使用全局默认
            </button>

            <div className="assistantModelDialogBody">
              <ModelSelectPopover
                providers={providers}
                currentProviderId={assistant.boundModelProvider ?? undefined}
                currentModelId={assistant.boundModelId ?? undefined}
                onSelect={(providerId, modelId) => {
                  onPatch({ boundModelProvider: providerId, boundModelId: modelId })
                  setModelSelectorOpen(false)
                }}
                onClose={() => setModelSelectorOpen(false)}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function ToggleSettingRow(props: {
  icon: React.ReactNode
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="assistantToggleRow">
      <div className="assistantToggleRowLeft">
        {props.icon}
        <div className="assistantRowLabel">{props.label}</div>
      </div>
      <button
        type="button"
        className={`toggle ${props.value ? 'toggleOn' : ''}`}
        onClick={() => props.onChange(!props.value)}
      >
        <div className="toggleThumb" />
      </button>
    </div>
  )
}

function InlineSliderSetting(props: {
  icon: React.ReactNode
  label: string
  enabled: boolean
  valueText: string
  onToggle: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className="assistantSliderBlock">
      <div className="assistantRowHeader">
        <div className="assistantRowHeaderLeft">
          {props.icon}
          <div className="assistantRowLabel">{props.label}</div>
        </div>
        <div className="assistantRowHeaderRight">
          <div className={`assistantRowValue ${props.enabled ? 'assistantRowValueActive' : ''}`}>{props.valueText}</div>
          <button
            type="button"
            className={`toggle ${props.enabled ? 'toggleOn' : ''}`}
            onClick={() => props.onToggle(!props.enabled)}
          >
            <div className="toggleThumb" />
          </button>
        </div>
      </div>
      {props.enabled ? <div className="assistantSliderBody">{props.children}</div> : null}
    </div>
  )
}

