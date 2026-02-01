import { useState, useEffect } from 'react'
import type { ProviderConfigV2 } from '../../../../../../shared/types'
import type { ModelInfo } from '../../../../../../shared/models'
import { AbilityCapsule } from '../components/AbilityCapsule'
import { BrandAvatar } from '../components/BrandAvatar'
import { useDialogClose } from '../../../../hooks/useDialogClose'

type FetchState = 'loading' | 'success' | 'error'

// 根据模型ID推断分组
function inferModelGroup(modelId: string): string {
  const id = modelId.toLowerCase()
  if (id.includes('embedding') || id.includes('embed')) return 'Embeddings'
  if (id.includes('gpt') || /(?:^|[^a-z])o[134]/.test(id)) return 'GPT'
  if (id.includes('gemini-2.0')) return 'Gemini 2.0'
  if (id.includes('gemini-2.5')) return 'Gemini 2.5'
  if (id.includes('gemini-1.5')) return 'Gemini 1.5'
  if (id.includes('gemini')) return 'Gemini'
  if (id.includes('claude-3.5')) return 'Claude 3.5'
  if (id.includes('claude-3')) return 'Claude 3'
  if (id.includes('claude-4')) return 'Claude 4'
  if (id.includes('claude-sonnet')) return 'Claude Sonnet'
  if (id.includes('claude-opus')) return 'Claude Opus'
  if (id.includes('claude')) return 'Claude'
  if (id.includes('deepseek')) return 'DeepSeek'
  if (/qwen|qwq|qvq|dashscope/.test(id)) return 'Qwen'
  if (/doubao|ark|volc/.test(id)) return 'Doubao'
  if (id.includes('glm') || id.includes('zhipu')) return 'GLM'
  if (id.includes('mistral')) return 'Mistral'
  if (id.includes('grok') || id.includes('xai')) return 'Grok'
  return '其他'
}

export function ModelFetchDialog({
  open,
  provider,
  onSave,
  onClose
}: {
  open: boolean
  provider: ProviderConfigV2

  onSave: (updated: ProviderConfigV2) => Promise<void>
  onClose: () => void
}) {
  const [fetchState, setFetchState] = useState<FetchState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [modelInfos, setModelInfos] = useState<ModelInfo[]>([])
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  useDialogClose(open, onClose)

  // 加载模型列表
  useEffect(() => {
    if (!open) return

    // 重置状态
    setFetchState('loading')
    setErrorMessage('')
    setSearchQuery('')
    setCollapsedGroups(new Set())
    // 初始化已选模型为当前配置的模型
    setSelectedModels(new Set(provider.models || []))

    // 获取模型列表
    const fetchModels = async () => {
      try {
        const result = await window.api.models.list(provider.id)
        // 使用带能力信息的 modelInfos
        const infos = result.modelInfos || result.models.map(id => ({
          id,
          displayName: id,
          type: 'chat' as const,
          input: ['text' as const],
          output: ['text' as const],
          abilities: []
        }))
        setModelInfos(infos)
        setFetchState('success')
      } catch (e) {
        setFetchState('error')
        const errStr = e instanceof Error ? e.message : String(e)
        // 友好错误提示
        if (errStr.includes('HandshakeException') || errStr.includes('CERTIFICATE_VERIFY_FAILED')) {
          setErrorMessage('连接被拒绝 (可能是 Cloudflare 防护)\n\n建议：在浏览器中访问该站点完成验证')
        } else if (errStr.includes('403') || errStr.includes('Forbidden')) {
          setErrorMessage('访问被拒绝 (403)\n\n可能是 API 密钥无效')
        } else if (errStr.includes('SocketException') || errStr.includes('Connection refused')) {
          setErrorMessage('无法连接到服务器\n\n请检查网络连接和服务器地址')
        } else {
          setErrorMessage(errStr)
        }
      }
    }

    fetchModels()
  }, [open, provider.id, provider.models])

  // 切换单个模型选择
  const toggleModel = (modelId: string) => {
    setSelectedModels(prev => {
      const next = new Set(prev)
      if (next.has(modelId)) {
        next.delete(modelId)
      } else {
        next.add(modelId)
      }
      return next
    })
  }

  // 切换整组模型选择
  const toggleGroup = (models: string[], allSelected: boolean) => {
    setSelectedModels(prev => {
      const next = new Set(prev)
      if (allSelected) {
        // 移除该组所有模型
        models.forEach(m => next.delete(m))
      } else {
        // 添加该组所有模型
        models.forEach(m => next.add(m))
      }
      return next
    })
  }

  // 保存选择
  const handleSave = async () => {
    await onSave({
      ...provider,
      models: Array.from(selectedModels),
      updatedAt: new Date().toISOString()
    })
    onClose()
  }

  if (!open) return null

  // 过滤模型
  const query = searchQuery.trim().toLowerCase()
  const filteredModels = modelInfos.filter(m =>
    !query || m.id.toLowerCase().includes(query) || m.displayName.toLowerCase().includes(query)
  )

  // 找出不可用的模型（在配置中但不在 API 返回的列表中）
  const availableIds = new Set(modelInfos.map(m => m.id))
  const unavailableModels: ModelInfo[] = (provider.models || [])
    .filter(m => !availableIds.has(m) && (!query || m.toLowerCase().includes(query)))
    .map(id => ({
      id,
      displayName: id,
      type: 'chat' as const,
      input: ['text' as const],
      output: ['text' as const],
      abilities: []
    }))

  // 分组
  const groups: Record<string, ModelInfo[]> = {}
  filteredModels.forEach(m => {
    const g = inferModelGroup(m.id)
    if (!groups[g]) groups[g] = []
    groups[g].push(m)
  })

  // 添加不可用模型组
  if (unavailableModels.length > 0) {
    groups['⚠️ 不可用'] = unavailableModels
  }

  const groupKeys = Object.keys(groups).sort((a, b) => {
    // 不可用组放最后
    if (a.startsWith('⚠️')) return 1
    if (b.startsWith('⚠️')) return -1
    return a.localeCompare(b)
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-surface"
        style={{ width: 600, maxHeight: '80vh', padding: 0, display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0
        }}>
          <h4 style={{ flex: 1, margin: 0, fontSize: 16, fontWeight: 600 }}>
            {provider.name} 模型
          </h4>
          <button type="button" className="toolbar-icon-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* 搜索栏 */}
        {fetchState === 'success' && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <input
              type="text"
              className="input-detail"
              placeholder="搜索模型..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* 内容 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {fetchState === 'loading' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '40px',
              color: 'var(--text-2)'
            }}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2"
                className="spinning"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <span>正在获取模型列表...</span>
            </div>
          )}

          {fetchState === 'error' && (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--danger)'
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 16, opacity: 0.7 }}>
                <circle cx="12" cy="12" r="10"/>
                <path d="m15 9-6 6M9 9l6 6"/>
              </svg>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{errorMessage}</div>
            </div>
          )}

          {fetchState === 'success' && groupKeys.length === 0 && (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--text-3)'
            }}>
              {searchQuery ? '没有匹配的模型' : '没有可用的模型'}
            </div>
          )}

          {fetchState === 'success' && groupKeys.map(groupName => {
            const models = groups[groupName]
            const isCollapsed = collapsedGroups.has(groupName)
            const allSelected = models.every(m => selectedModels.has(m.id))
            const isUnavailableGroup = groupName.startsWith('⚠️')

            return (
              <div key={groupName} style={{ marginBottom: 4 }}>
                {/* 组头 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    background: 'var(--surface-2)',
                    margin: '0 8px',
                    borderRadius: 10
                  }}
                  onClick={() => {
                    setCollapsedGroups(prev => {
                      const next = new Set(prev)
                      if (next.has(groupName)) {
                        next.delete(groupName)
                      } else {
                        next.add(groupName)
                      }
                      return next
                    })
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                      transition: 'transform 0.2s',
                      marginRight: 8
                    }}
                  >
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{groupName}</span>
                  <span style={{ color: 'var(--text-3)', fontSize: 12, marginRight: 8 }}>{models.length}</span>
                  {!isUnavailableGroup && (
                    <button
                      type="button"
                      className="toolbar-icon-btn"
                      title={allSelected ? '移除全部' : '添加全部'}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleGroup(models.map(m => m.id), allSelected)
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {allSelected ? (
                          <path d="M5 12h14"/>
                        ) : (
                          <path d="M12 5v14M5 12h14"/>
                        )}
                      </svg>
                    </button>
                  )}
                </div>

                {/* 模型列表 */}
                {!isCollapsed && (
                  <div style={{ padding: '4px 8px' }}>
                    {models.map(model => {
                      const isSelected = selectedModels.has(model.id)
                      const isUnavailable = isUnavailableGroup
                      const hasVision = model.input.includes('image')
                      const hasImageOutput = model.output.includes('image')
                      const hasTool = model.abilities.includes('tool')
                      const hasReasoning = model.abilities.includes('reasoning')

                      return (
                        <div
                          key={model.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '6px 12px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            background: isUnavailable ? 'var(--danger-bg)' : undefined
                          }}
                          onClick={() => toggleModel(model.id)}
                        >
                          {/* 品牌头像 */}
                          <div style={{ marginRight: 10 }}>
                            {isUnavailable ? (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="orange" strokeWidth="2" style={{ opacity: 0.8 }}>
                                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                                <path d="M12 9v4M12 17h.01"/>
                              </svg>
                            ) : (
                              <BrandAvatar name={model.id} size={24} />
                            )}
                          </div>

                          {/* 模型名称 */}
                          <span style={{
                            flex: 1,
                            fontSize: 13,
                            color: isUnavailable ? 'var(--text-3)' : undefined,
                            textDecoration: isUnavailable ? 'line-through' : undefined
                          }}>
                            {model.displayName}
                          </span>

                          {/* 能力徽章 */}
                          {!isUnavailable && (hasVision || hasImageOutput || hasTool || hasReasoning) && (
                            <div style={{ display: 'flex', gap: 4, marginRight: 8 }}>
                              {hasVision && <AbilityCapsule type="vision" color="#8b5cf6" />}
                              {hasImageOutput && <AbilityCapsule type="image" color="#06b6d4" />}
                              {hasTool && <AbilityCapsule type="tool" color="#3b82f6" />}
                              {hasReasoning && <AbilityCapsule type="reasoning" color="#f59e0b" />}
                            </div>
                          )}

                          {/* 添加/移除按钮 */}
                          <button
                            type="button"
                            className="toolbar-icon-btn"
                            style={{
                              color: isSelected ? 'var(--primary)' : 'var(--text-3)'
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleModel(model.id)
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              {isSelected ? (
                                <path d="M5 12h14"/>
                              ) : (
                                <path d="M12 5v14M5 12h14"/>
                              )}
                            </svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 底部 */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0
        }}>
          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
            已选择 {selectedModels.size} 个模型
          </span>
          <div style={{ flex: 1 }} />
          <button className="desk-button" onClick={onClose}>取消</button>
          <button
            className="desk-button filled"
            onClick={handleSave}
            disabled={fetchState !== 'success'}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
