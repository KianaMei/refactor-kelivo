import { useState, useCallback, useRef, useEffect } from 'react'
import type { ProviderConfigV2, OAuthProvider, ProviderKind } from '../../../../../shared/types'
import { LOAD_BALANCE_STRATEGIES, type ModelOverride } from './types'
import { AbilityCapsule } from './components/AbilityCapsule'
import { BrandAvatar } from './components/BrandAvatar'
import { ConnectionTestDialog } from './dialogs/ConnectionTestDialog'
import { ProviderSettingsDialog } from './dialogs/ProviderSettingsDialog'
import { ShareProviderDialog } from './dialogs/ShareProviderDialog'
import { ModelDetailDialog } from './dialogs/ModelDetailDialog'
import { MultiKeyManagerDialog } from './dialogs/MultiKeyManagerDialog'
import { ModelFetchDialog } from './dialogs/ModelFetchDialog'

const OAUTH_KIND_MAP: Partial<Record<ProviderKind, OAuthProvider>> = {
  claude_oauth: 'claude',
  codex_oauth: 'codex',
  gemini_cli_oauth: 'gemini_cli',
  antigravity_oauth: 'antigravity',
  kimi_oauth: 'kimi',
  qwen_oauth: 'qwen'
}

const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  claude: 'Claude',
  codex: 'Codex / OpenAI',
  gemini_cli: 'Gemini CLI',
  antigravity: 'Antigravity',
  kimi: 'Kimi',
  qwen: 'Qwen'
}

// Emoji 列表
const EMOJI_LIST = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
  '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
  '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
  '🥳', '😏', '😒', '🤖', '👻', '👽', '💩', '😺', '🐱', '🐶',
  '🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐮', '🐷', '🐸', '🐵',
  '🚀', '🎨', '💡', '🔥', '⚡', '💎', '🎯', '🎮', '🎲', '🎭',
]

// 分组模型
function groupModels(models: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const m of models) {
    let g = m
    const lower = m.toLowerCase()
    if (lower.includes('gemini-3')) g = 'Gemini 3'
    else if (lower.includes('gemini-2.5') || lower.includes('gemini-2-5')) g = 'Gemini 2.5'
    else if (lower.includes('gemini')) g = 'Gemini'
    else if (m.includes('/')) g = m.split('/')[0]
    else if (m.includes(':')) g = m.split(':')[0]
    else if (m.includes('-')) g = m.split('-')[0]
    const arr = map.get(g) || []
    arr.push(m)
    map.set(g, arr)
  }
  return map
}

export function ProviderDetailPane({
  provider,
  onBack,
  onSave,
  onDelete
}: {
  provider: ProviderConfigV2
  onBack: () => void
  onSave: (updated: ProviderConfigV2) => Promise<void>
  onDelete: () => void
}) {
  const [name, setName] = useState(provider.name)
  const [apiKey, setApiKey] = useState(provider.apiKey)
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl)
  const [chatPath, setChatPath] = useState(provider.chatPath || '/chat/completions')
  const [showApiKey, setShowApiKey] = useState(false)
  const [enabled, setEnabled] = useState(provider.enabled !== false)
  const [saving, setSaving] = useState(false)

  const providerApiKeys = provider.apiKeys ?? []
  const isMultiKeyMode = !!provider.multiKeyEnabled
  const enabledMultiKeyCount = providerApiKeys.filter((k) => k.isEnabled && k.key.trim()).length
  const multiKeyStrategy = provider.keyManagement?.strategy ?? 'roundRobin'
  const multiKeyStrategyLabel = LOAD_BALANCE_STRATEGIES.find((s) => s.value === multiKeyStrategy)?.label ?? multiKeyStrategy

  const providerType = provider.providerType ?? 'openai'
  const useResponseApi =
    (providerType === 'openai' || providerType === 'openai_response') && provider.useResponseApi === true

  // 模型列表状态
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [modelSearch, setModelSearch] = useState('')
  const [showModelSearch, setShowModelSearch] = useState(false)
  const [copiedModelId, setCopiedModelId] = useState<string | null>(null)

  // 头像菜单
  const [avatarMenuPos, setAvatarMenuPos] = useState<{ x: number; y: number } | null>(null)
  const avatarRef = useRef<HTMLDivElement>(null)

  // Emoji 选择器
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [emojiPickerPos, setEmojiPickerPos] = useState<{ x: number; y: number } | null>(null)

  // 图片 URL 输入对话框
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState('')

  // 模型详情对话框
  const [modelDetailOpen, setModelDetailOpen] = useState(false)
  const [modelDetailIsNew, setModelDetailIsNew] = useState(true)
  const [modelDetailId, setModelDetailId] = useState('')

  // 多Key管理对话框
  const [multiKeyDialogOpen, setMultiKeyDialogOpen] = useState(false)

  // 名称编辑状态
  const [editingName, setEditingName] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // OAuth 状态（仅 OAuth 类型供应商使用）
  const oauthProvider = OAUTH_KIND_MAP[provider.providerType ?? 'openai'] ?? null
  const isOAuthKind = !!oauthProvider
  const [oauthLoading, setOauthLoading] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)

  // codex_oauth 双模式 tab（OAuth ↔ API Key）
  const isCodexOAuth = provider.providerType === 'codex_oauth'
  const [authTab, setAuthTab] = useState<'oauth' | 'apikey'>(() => {
    if (!isCodexOAuth) return 'oauth'
    return provider.oauthEnabled && provider.oauthData ? 'oauth'
      : provider.apiKey ? 'apikey'
      : 'oauth'
  })

  const handleOAuthLogin = useCallback(async () => {
    if (!oauthProvider) return
    setOauthLoading(true)
    setOauthError(null)
    try {
      const tokenData = await window.api.oauth.login(oauthProvider)
      await onSave({
        ...provider,
        oauthEnabled: true,
        oauthData: tokenData,
        updatedAt: new Date().toISOString()
      })
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : String(err))
    } finally {
      setOauthLoading(false)
    }
  }, [oauthProvider, provider, onSave])

  const handleOAuthLogout = useCallback(async () => {
    await onSave({
      ...provider,
      oauthEnabled: false,
      oauthData: null,
      updatedAt: new Date().toISOString()
    })
  }, [provider, onSave])

  // 对话框状态
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false)
  const [connectionTestDialogOpen, setConnectionTestDialogOpen] = useState(false)
  const [modelFetchDialogOpen, setModelFetchDialogOpen] = useState(false)

  // ESC + 鼠标侧键返回（仅在没有对话框打开时）
  useEffect(() => {
    const anyDialogOpen = shareDialogOpen || advancedSettingsOpen || connectionTestDialogOpen || modelFetchDialogOpen || modelDetailOpen || multiKeyDialogOpen || showUrlInput || showEmojiPicker || avatarMenuPos !== null || editingName

    if (anyDialogOpen) return // 有对话框打开时，由对话框自己处理

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onBack()
      }
    }

    const handleMouse = (e: MouseEvent) => {
      // button 3 = 鼠标后退侧键 (XButton1)
      if (e.button === 3) {
        e.preventDefault()
        e.stopPropagation()
        onBack()
      }
    }

    document.addEventListener('keydown', handleKey, true)
    document.addEventListener('mouseup', handleMouse, true)

    return () => {
      document.removeEventListener('keydown', handleKey, true)
      document.removeEventListener('mouseup', handleMouse, true)
    }
  }, [onBack, shareDialogOpen, advancedSettingsOpen, connectionTestDialogOpen, modelFetchDialogOpen, modelDetailOpen, multiKeyDialogOpen, showUrlInput, showEmojiPicker, avatarMenuPos, editingName])

  // 保存变更（防抖）
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const saveChanges = useCallback((updates: Partial<ProviderConfigV2>) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        await onSave({
          ...provider,
          ...updates,
          updatedAt: new Date().toISOString()
        })
      } finally {
        setSaving(false)
      }
    }, 500)
  }, [provider, onSave])

  // 添加新模型
  const handleAddModel = async (modelId: string) => {
    const trimmed = modelId.trim()
    if (!trimmed) return
    const currentModels = provider.models || []
    if (currentModels.includes(trimmed)) return
    await onSave({
      ...provider,
      models: [...currentModels, trimmed],
      updatedAt: new Date().toISOString()
    })
  }

  // 删除模型
  const handleDeleteModel = async (modelId: string) => {
    const currentModels = provider.models || []
    const currentOverrides = provider.modelOverrides || {}
    const newOverrides = { ...currentOverrides }
    delete newOverrides[modelId]
    await onSave({
      ...provider,
      models: currentModels.filter(m => m !== modelId),
      modelOverrides: newOverrides,
      updatedAt: new Date().toISOString()
    })
  }

  // 保存模型详情
  const handleSaveModelDetail = async (
    modelId: string,
    override: ModelOverride,
    oldModelId?: string
  ) => {
    const currentModels = provider.models || []
    const currentOverrides = provider.modelOverrides || {}

    let newModels = [...currentModels]
    const newOverrides = { ...currentOverrides }

    if (oldModelId && oldModelId !== modelId) {
      // 重命名
      newModels = newModels.map(m => m === oldModelId ? modelId : m)
      delete newOverrides[oldModelId]
    } else if (!currentModels.includes(modelId)) {
      // 新增
      newModels.push(modelId)
    }

    newOverrides[modelId] = override

    await onSave({
      ...provider,
      models: newModels,
      modelOverrides: newOverrides,
      updatedAt: new Date().toISOString()
    })
  }

  // 设置 Emoji 头像
  const handleSetEmoji = async (emoji: string) => {
    await onSave({
      ...provider,
      customAvatarPath: emoji,
      updatedAt: new Date().toISOString()
    })
    setShowEmojiPicker(false)
    setEmojiPickerPos(null)
    setAvatarMenuPos(null)
  }

  // 设置 URL 头像
  const handleSetAvatarUrl = async () => {
    const url = avatarUrl.trim()
    if (!url) return
    await onSave({
      ...provider,
      customAvatarPath: url,
      updatedAt: new Date().toISOString()
    })
    setAvatarUrl('')
    setShowUrlInput(false)
    setAvatarMenuPos(null)
  }

  // 重置头像（同时清理磁盘文件）
  const handleResetAvatar = async () => {
    try {
      await window.api.avatar.delete(provider.id)
    } catch {
      // 文件不存在也无所谓
    }
    await onSave({
      ...provider,
      customAvatarPath: undefined,
      updatedAt: new Date().toISOString()
    })
    setAvatarMenuPos(null)
  }

  // 从本地图片选择 → 存文件到磁盘，config 只记相对路径
  const handlePickLocalImage = () => {
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
          const relativePath = await window.api.avatar.save(provider.id, base64)
          await onSave({
            ...provider,
            customAvatarPath: relativePath,
            updatedAt: new Date().toISOString()
          })
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Failed to save avatar:', err)
        }
        setAvatarMenuPos(null)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const models = provider.models || []
  const grouped = groupModels(models)
  const groupKeys = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b))

  // 过滤模型
  const filterModels = (list: string[]) => {
    if (!modelSearch.trim()) return list
    const q = modelSearch.toLowerCase()
    return list.filter(m => m.toLowerCase().includes(q))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* 顶部栏 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        {/* 关闭按钮 */}
        <button type="button" className="toolbar-icon-btn" onClick={onBack} title="关闭">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>

        {/* 右侧操作按钮 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* 启用/禁用开关 */}
          <label className="ios-switch ios-switch-std">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked)
                saveChanges({ enabled: e.target.checked })
              }}
            />
            <span className="ios-slider" />
          </label>

          {/* 测试连接 */}
          <button type="button" className="toolbar-icon-btn" title="测试连接" onClick={() => { setConnectionTestDialogOpen(true) }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
              <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>
            </svg>
          </button>

          {/* 分享 */}
          <button type="button" className="toolbar-icon-btn" title="分享配置" onClick={() => { setShareDialogOpen(true) }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>

          {/* 设置 */}
          <button type="button" className="toolbar-icon-btn" title="高级设置" onClick={() => { setAdvancedSettingsOpen(true) }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>

          {/* 删除 */}
          <button type="button" className="toolbar-icon-btn" title="删除供应商" style={{ color: 'var(--danger)' }} onClick={onDelete}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* 主内容区域 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {/* 头像 + 名称区域 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          {/* 头像 */}
          <div
            ref={avatarRef}
            style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden', flexShrink: 0, cursor: 'pointer', position: 'relative' }}
            onClick={(e) => {
              if (avatarMenuPos) {
                setAvatarMenuPos(null)
              } else {
                setAvatarMenuPos({ x: e.clientX, y: e.clientY })
              }
            }}
            title="点击更换头像"
          >
            <BrandAvatar name={name} size={56} customAvatarPath={provider.customAvatarPath} square />
            <div className="avatar-overlay">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
          </div>

          {/* 名称 */}
          {editingName ? (
            <input
              ref={nameInputRef}
              className="input-detail"
              style={{ fontSize: 18, fontWeight: 600, padding: '4px 8px', width: 200 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                setEditingName(false)
                if (name.trim() && name !== provider.name) {
                  saveChanges({ name: name.trim() })
                } else if (!name.trim()) {
                  setName(provider.name)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                else if (e.key === 'Escape') {
                  setName(provider.name)
                  setEditingName(false)
                }
              }}
              autoFocus
            />
          ) : (
            <span
              style={{ fontSize: 18, fontWeight: 600, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'background 0.15s' }}
              className="name-editable"
              onClick={() => {
                setEditingName(true)
                setTimeout(() => nameInputRef.current?.select(), 0)
              }}
              title="点击编辑名称"
            >
              {name}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 6, opacity: 0.4, verticalAlign: 'middle' }}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </span>
          )}
        </div>

        {/* 头像菜单 */}
        {avatarMenuPos && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setAvatarMenuPos(null)} />
            <div className="dropdown-menu" style={{ position: 'fixed', left: avatarMenuPos.x, top: avatarMenuPos.y, zIndex: 1000 }}>
              <button type="button" className="dropdown-item" onClick={() => { setShowEmojiPicker(true); setEmojiPickerPos({ x: avatarMenuPos.x, y: avatarMenuPos.y }); setAvatarMenuPos(null) }}>
                使用 Emoji
              </button>
              <button type="button" className="dropdown-item" onClick={handlePickLocalImage}>
                从图片选择
              </button>
              <button type="button" className="dropdown-item" onClick={() => { setShowUrlInput(true); setAvatarMenuPos(null) }}>
                输入图片链接
              </button>
              <button type="button" className="dropdown-item" onClick={handleResetAvatar}>
                重置头像
              </button>
            </div>
          </>
        )}

        {/* Emoji 选择器 */}
        {showEmojiPicker && emojiPickerPos && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => { setShowEmojiPicker(false); setEmojiPickerPos(null) }} />
            <div className="dropdown-menu" style={{ position: 'fixed', left: emojiPickerPos.x, top: emojiPickerPos.y, zIndex: 1000, width: 280, padding: 12 }}>
              <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>选择 Emoji</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
                {EMOJI_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    style={{ fontSize: 20, padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 4, transition: 'background 0.15s' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-bg)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    onClick={() => handleSetEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 图片 URL 输入对话框 */}
        {showUrlInput && (
          <div className="modal-overlay" onClick={() => setShowUrlInput(false)}>
            <div className="modal-surface" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>输入图片链接</h4>
              </div>
              <div style={{ padding: '16px 20px' }}>
                <input
                  className="input-detail"
                  placeholder="https://example.com/avatar.png"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && avatarUrl.trim()) handleSetAvatarUrl() }}
                />
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)' }}>
                <button className="desk-button" onClick={() => setShowUrlInput(false)}>取消</button>
                <button className="desk-button filled" disabled={!avatarUrl.trim()} onClick={handleSetAvatarUrl}>确定</button>
              </div>
            </div>
          </div>
        )}

        {/* ── 认证区域 ── */}
        {isOAuthKind ? (
          isCodexOAuth ? (
            /* Codex OAuth：左右 Tab 切换，要么 OAuth 要么 API Key */
            <div style={{ marginBottom: 20 }}>
              {/* Tab 切换器 */}
              <div style={{
                display: 'flex',
                background: 'var(--surface-2)',
                borderRadius: 8,
                padding: 3,
                marginBottom: 14,
                gap: 2,
              }}>
                {([['oauth', '账号登录'], ['apikey', 'API Key']] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setAuthTab(tab)}
                    style={{
                      flex: 1,
                      padding: '5px 0',
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 500,
                      transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
                      background: authTab === tab ? 'var(--surface)' : 'transparent',
                      color: authTab === tab ? 'var(--text)' : 'var(--text-3)',
                      boxShadow: authTab === tab ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* OAuth Tab 内容 */}
              {authTab === 'oauth' && (
                provider.oauthEnabled && provider.oauthData ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8,
                    background: 'var(--success-bg, rgba(34,197,94,0.1))',
                    border: '1px solid var(--success-border, rgba(34,197,94,0.2))'
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success, #22c55e)" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <span style={{ flex: 1, fontSize: 13 }}>
                      {provider.oauthData.userEmail || `已登录 ${OAUTH_PROVIDER_LABELS[oauthProvider!]}`}
                    </span>
                    <button type="button" className="desk-button" style={{ padding: '4px 10px', fontSize: 12 }} onClick={handleOAuthLogout}>
                      登出
                    </button>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      className="desk-button filled"
                      style={{ padding: '6px 16px', fontSize: 13 }}
                      disabled={oauthLoading}
                      onClick={handleOAuthLogin}
                    >
                      {oauthLoading ? '登录中...' : `登录 ${OAUTH_PROVIDER_LABELS[oauthProvider!]}`}
                    </button>
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-3)' }}>使用订阅账号登录，无需 API Key</div>
                    {oauthError && (
                      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--danger, #ef4444)' }}>{oauthError}</div>
                    )}
                  </div>
                )
              )}

              {/* API Key Tab 内容 */}
              {authTab === 'apikey' && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600, marginBottom: 6, display: 'block', paddingLeft: 2 }}>API Key</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="input-detail"
                        style={{ paddingRight: 40 }}
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => { setApiKey(e.target.value); saveChanges({ apiKey: e.target.value }) }}
                        placeholder="输入第三方 Codex API Key"
                      />
                      <button type="button" className="eye-toggle-btn" onClick={() => setShowApiKey(!showApiKey)} title={showApiKey ? '隐藏' : '显示'}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          {showApiKey ? (
                            <>
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                              <line x1="1" y1="1" x2="23" y2="23"/>
                            </>
                          ) : (
                            <>
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </>
                          )}
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600, marginBottom: 6, display: 'block', paddingLeft: 2 }}>API Base URL</label>
                    <input
                      className="input-detail"
                      value={baseUrl}
                      onChange={(e) => { setBaseUrl(e.target.value); saveChanges({ baseUrl: e.target.value }) }}
                      placeholder="https://your-cpa-proxy.com/v1"
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            /* 其他 OAuth 类型（Claude、Gemini 等）：仅显示账号登录 */
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600, marginBottom: 6, display: 'block', paddingLeft: 2 }}>
                账号
              </label>
              {provider.oauthEnabled && provider.oauthData ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 8,
                  background: 'var(--success-bg, rgba(34,197,94,0.1))',
                  border: '1px solid var(--success-border, rgba(34,197,94,0.2))'
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success, #22c55e)" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <span style={{ flex: 1, fontSize: 13 }}>
                    {provider.oauthData.userEmail || `已登录 ${OAUTH_PROVIDER_LABELS[oauthProvider!]}`}
                  </span>
                  <button type="button" className="desk-button" style={{ padding: '4px 10px', fontSize: 12 }} onClick={handleOAuthLogout}>
                    登出
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    className="desk-button filled"
                    style={{ padding: '6px 16px', fontSize: 13 }}
                    disabled={oauthLoading}
                    onClick={handleOAuthLogin}
                  >
                    {oauthLoading ? '登录中...' : `登录 ${OAUTH_PROVIDER_LABELS[oauthProvider!]}`}
                  </button>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-3)' }}>使用订阅账号登录，无需 API Key</div>
                  {oauthError && (
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--danger, #ef4444)' }}>{oauthError}</div>
                  )}
                </div>
              )}
            </div>
          )
        ) : (
          /* 传统供应商：Key / URL / Path */
          <>
            {/* API Key */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingLeft: 2 }}>
                <label style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>
                  {isMultiKeyMode ? '多 Key' : 'API Key'}
                </label>
                <button type="button" className="desk-button" style={{ padding: '4px 10px', fontSize: 12 }} title="管理多个 API Key" onClick={() => setMultiKeyDialogOpen(true)}>
                  多Key管理
                </button>
              </div>
              {isMultiKeyMode ? (
                <div style={{ fontSize: 12, color: 'var(--text-3)', paddingLeft: 2, lineHeight: 1.4, marginBottom: 10 }}>
                  已启用多 Key：{enabledMultiKeyCount}/{providerApiKeys.length}；策略：{multiKeyStrategyLabel}
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input
                    className="input-detail"
                    style={{ paddingRight: 40 }}
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); saveChanges({ apiKey: e.target.value }) }}
                    placeholder="请输入 API Key"
                  />
                  <button type="button" className="eye-toggle-btn" onClick={() => setShowApiKey(!showApiKey)} title={showApiKey ? '隐藏' : '显示'}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {showApiKey ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* API Base URL */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600, marginBottom: 6, display: 'block', paddingLeft: 2 }}>API Base URL</label>
              <input
                className="input-detail"
                value={baseUrl}
                onChange={(e) => { setBaseUrl(e.target.value); saveChanges({ baseUrl: e.target.value }) }}
                placeholder="https://api.openai.com/v1"
              />
            </div>

            {/* API 路径 */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600, marginBottom: 6, display: 'block', paddingLeft: 2 }}>API 路径</label>
              {useResponseApi ? (
                <input className="input-detail" value="/responses" disabled />
              ) : (
                <input
                  className="input-detail"
                  value={chatPath}
                  onChange={(e) => { setChatPath(e.target.value); saveChanges({ chatPath: e.target.value }) }}
                  placeholder="/chat/completions"
                />
              )}
            </div>
          </>
        )}

        {/* 模型区域 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>模型</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>
              {models.length}
            </span>

            {/* 获取按钮 */}
            <button type="button" className="text-icon-btn" title="从服务器获取模型列表" onClick={() => setModelFetchDialogOpen(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
              </svg>
              获取
            </button>

            {/* 添加新模型 */}
            <button type="button" className="text-icon-btn" title="手动添加新模型" onClick={() => { setModelDetailId(''); setModelDetailIsNew(true); setModelDetailOpen(true) }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              添加新模型
            </button>

            <div style={{ flex: 1 }} />

            {/* 搜索图标 */}
            <button type="button" className="toolbar-icon-btn" onClick={() => setShowModelSearch(!showModelSearch)} style={{ opacity: showModelSearch ? 1 : 0.6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
          </div>

          {/* 搜索框 */}
          {showModelSearch && (
            <div style={{ marginBottom: 12 }}>
              <input className="input-detail" style={{ fontSize: 13 }} placeholder="搜索模型..." value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} autoFocus />
            </div>
          )}

          {/* 模型分组列表 */}
          {models.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 15, marginBottom: 6 }}>暂无模型</div>
              <div style={{ fontSize: 13 }}>点击"获取"从服务器拉取，或"添加新模型"手动添加</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {groupKeys.map((groupName) => {
                const gModels = grouped.get(groupName) || []
                const filteredList = filterModels(gModels)
                if (filteredList.length === 0) return null
                const isCollapsed = collapsedGroups.has(groupName)

                return (
                  <div key={groupName}>
                    {/* 分组标题 */}
                    <button
                      type="button"
                      className="model-group-header"
                      onClick={() => {
                        const next = new Set(collapsedGroups)
                        if (isCollapsed) next.delete(groupName)
                        else next.add(groupName)
                        setCollapsedGroups(next)
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <path d="m6 9 6 6 6-6"/>
                      </svg>
                      <span>{groupName}</span>
                      <span className="model-group-count">{filteredList.length}</span>
                    </button>

                    {/* 分组内的模型 */}
                    {!isCollapsed && (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {filteredList.map((modelId) => {
                          const override = (provider.modelOverrides || {})[modelId] as ModelOverride | undefined
                          const hasVision = override?.input?.includes('image') ?? false
                          const hasImageOutput = override?.output?.includes('image') ?? false
                          const hasTool = override?.abilities?.includes('tool') ?? false
                          const hasReasoning = override?.abilities?.includes('reasoning') ?? false
                          const hasAnyCapability = hasVision || hasImageOutput || hasTool || hasReasoning

                          return (
                            <div
                              key={modelId}
                              className="model-row"
                              style={{ display: 'flex', alignItems: 'center', padding: '10px 8px 10px 28px', borderBottom: '1px solid var(--border)', gap: 8, cursor: 'pointer' }}
                              onClick={() => {
                                navigator.clipboard.writeText(modelId)
                                setCopiedModelId(modelId)
                                setTimeout(() => setCopiedModelId(null), 1500)
                              }}
                              title={`点击复制: ${modelId}`}
                            >
                              <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>
                                {modelId}
                                {copiedModelId === modelId && (
                                  <span style={{ marginLeft: 8, fontSize: 11, color: '#22c55e', fontWeight: 500 }}>已复制</span>
                                )}
                              </span>

                              {/* 能力徽章 */}
                              {hasAnyCapability && (
                                <div style={{ display: 'flex', gap: 4, marginRight: 8 }}>
                                  {hasVision && <AbilityCapsule type="vision" color="#8b5cf6" />}
                                  {hasImageOutput && <AbilityCapsule type="image" color="#06b6d4" />}
                                  {hasTool && <AbilityCapsule type="tool" color="#3b82f6" />}
                                  {hasReasoning && <AbilityCapsule type="reasoning" color="#f59e0b" />}
                                </div>
                              )}

                              {/* 操作按钮 */}
                              <div className="model-actions" style={{ display: 'flex', gap: 4, opacity: 0.4 }}>
                                <button
                                  type="button"
                                  className="toolbar-icon-btn"
                                  title="模型设置"
                                  onClick={(e) => { e.stopPropagation(); setModelDetailId(modelId); setModelDetailIsNew(false); setModelDetailOpen(true) }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                                    <circle cx="12" cy="12" r="3"/>
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  className="toolbar-icon-btn"
                                  title="删除模型"
                                  style={{ color: 'var(--danger)' }}
                                  onClick={(e) => { e.stopPropagation(); handleDeleteModel(modelId) }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                  </svg>
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 保存状态指示 */}
      {saving && (
        <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'var(--surface-2)', padding: '6px 12px', borderRadius: 6, fontSize: 12, color: 'var(--text-2)' }}>
          保存中...
        </div>
      )}

      {/* 对话框 */}
      <ModelDetailDialog
        open={modelDetailOpen}
        isNew={modelDetailIsNew}
        modelId={modelDetailId}
        providerModels={provider.models || []}
        modelOverrides={(provider.modelOverrides || {}) as Record<string, ModelOverride>}
        onSave={handleSaveModelDetail}
        onClose={() => setModelDetailOpen(false)}
      />

      <MultiKeyManagerDialog
        open={multiKeyDialogOpen}
        provider={provider}
        onSave={onSave}
        onClose={() => setMultiKeyDialogOpen(false)}
      />

      <ShareProviderDialog
        open={shareDialogOpen}
        provider={provider}
        onClose={() => setShareDialogOpen(false)}
      />

      <ProviderSettingsDialog
        open={advancedSettingsOpen}
        provider={provider}
        onSave={onSave}
        onClose={() => setAdvancedSettingsOpen(false)}
      />

      <ConnectionTestDialog
        open={connectionTestDialogOpen}
        provider={provider}
        onClose={() => setConnectionTestDialogOpen(false)}
      />

      <ModelFetchDialog
        open={modelFetchDialogOpen}
        provider={provider}
        onSave={onSave}
        onClose={() => setModelFetchDialogOpen(false)}
      />
    </div>
  )
}
