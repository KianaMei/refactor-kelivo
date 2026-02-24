import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { ModelOverride, ModelType, Modality, ModelAbility } from '../types'
import { useDialogClose } from '../../../../hooks/useDialogClose'

export function ModelDetailDialog({
  open,
  isNew,
  modelId: initialModelId,
  providerModels,
  modelOverrides,
  onSave,
  onClose
}: {
  open: boolean
  isNew: boolean
  modelId: string
  providerModels: string[]
  modelOverrides: Record<string, ModelOverride>
  onSave: (modelId: string, override: ModelOverride, oldModelId?: string) => Promise<void>
  onClose: () => void
}) {
  const [tab, setTab] = useState<'basic' | 'advanced'>('basic')
  const [modelId, setModelId] = useState(initialModelId)
  const [displayName, setDisplayName] = useState('')
  const [nameEdited, setNameEdited] = useState(false)
  const [modelType, setModelType] = useState<ModelType>('chat')
  const [inputModes, setInputModes] = useState<Set<Modality>>(new Set(['text']))
  const [outputModes, setOutputModes] = useState<Set<Modality>>(new Set(['text']))
  const [abilities, setAbilities] = useState<Set<ModelAbility>>(new Set())

  // 高级选项
  const [headers, setHeaders] = useState<Array<{ name: string; value: string }>>([])
  const [bodyParams, setBodyParams] = useState<Array<{ key: string; value: string }>>([])
  const [searchTool, setSearchTool] = useState(false)
  const [urlContextTool, setUrlContextTool] = useState(false)

  const [saving, setSaving] = useState(false)

  useDialogClose(open, onClose)

  // 初始化
  useEffect(() => {
    if (!open) return
    setModelId(initialModelId)
    setTab('basic')

    if (!isNew && modelOverrides[initialModelId]) {
      const ov = modelOverrides[initialModelId]
      setDisplayName(ov.name || initialModelId)
      setModelType(ov.type || 'chat')
      setInputModes(new Set(ov.input || ['text']))
      setOutputModes(new Set(ov.output || ['text']))
      setAbilities(new Set(ov.abilities || []))
      setHeaders(ov.headers || [])
      setBodyParams(ov.body || [])
      setSearchTool(ov.tools?.search || false)
      setUrlContextTool(ov.tools?.urlContext || false)
      setNameEdited(true)
    } else {
      setDisplayName(initialModelId)
      setModelType('chat')
      setInputModes(new Set(['text']))
      setOutputModes(new Set(['text']))
      setAbilities(new Set())
      setHeaders([])
      setBodyParams([])
      setSearchTool(false)
      setUrlContextTool(false)
      setNameEdited(false)
    }
  }, [open, initialModelId, isNew, modelOverrides])

  const handleSave = async () => {
    const id = modelId.trim()
    if (!id || id.length < 2) return

    // 检查重复
    if (providerModels.includes(id) && id !== initialModelId) {
      toast.error('模型 ID 已存在')
      return
    }

    setSaving(true)
    try {
      const override: ModelOverride = {
        name: displayName.trim(),
        type: modelType,
        input: Array.from(inputModes),
        output: Array.from(outputModes),
        abilities: Array.from(abilities),
        headers: headers.filter(h => h.name.trim()),
        body: bodyParams.filter(b => b.key.trim()),
        tools: { search: searchTool, urlContext: urlContextTool }
      }
      await onSave(id, override, isNew ? undefined : initialModelId)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const toggleInputMode = (mode: Modality) => {
    const next = new Set(inputModes)
    if (next.has(mode)) {
      next.delete(mode)
      if (next.size === 0) next.add('text')
    } else {
      next.add(mode)
    }
    setInputModes(next)
  }

  const toggleOutputMode = (mode: Modality) => {
    const next = new Set(outputModes)
    if (next.has(mode)) {
      next.delete(mode)
      if (next.size === 0) next.add('text')
    } else {
      next.add(mode)
    }
    setOutputModes(next)
  }

  const toggleAbility = (ab: ModelAbility) => {
    const next = new Set(abilities)
    if (next.has(ab)) next.delete(ab)
    else next.add(ab)
    setAbilities(next)
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-surface"
        style={{ width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)'
        }}>
          <button type="button" className="toolbar-icon-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
          <h4 style={{ flex: 1, textAlign: 'center', margin: 0, fontSize: 16, fontWeight: 600 }}>
            {isNew ? '添加模型' : '编辑模型'}
          </h4>
          <div style={{ width: 36 }} />
        </div>

        {/* Tab 切换 */}
        <div style={{ display: 'flex', gap: 0, padding: '12px 16px', background: 'var(--surface)' }}>
          <button
            type="button"
            className={`seg-tab ${tab === 'basic' ? 'active' : ''}`}
            onClick={() => setTab('basic')}
          >
            基本
          </button>
          <button
            type="button"
            className={`seg-tab ${tab === 'advanced' ? 'active' : ''}`}
            onClick={() => setTab('advanced')}
          >
            高级
          </button>
        </div>

        {/* 内容区域 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {tab === 'basic' ? (
            <>
              {/* 模型 ID */}
              <div style={{ marginBottom: 16 }}>
                <label className="input-label">模型 ID</label>
                <input
                  className="input-detail"
                  placeholder="例如: gpt-4o, claude-3-opus"
                  value={modelId}
                  onChange={(e) => {
                    setModelId(e.target.value)
                    if (!nameEdited) setDisplayName(e.target.value)
                  }}
                  autoFocus={isNew}
                />
              </div>

              {/* 显示名称 */}
              <div style={{ marginBottom: 16 }}>
                <label className="input-label">显示名称</label>
                <input
                  className="input-detail"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value)
                    setNameEdited(true)
                  }}
                />
              </div>

              {/* 模型类型 */}
              <div style={{ marginBottom: 16 }}>
                <label className="input-label">模型类型</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className={`seg-btn ${modelType === 'chat' ? 'active' : ''}`}
                    onClick={() => setModelType('chat')}
                  >
                    对话
                  </button>
                  <button
                    type="button"
                    className={`seg-btn ${modelType === 'embedding' ? 'active' : ''}`}
                    onClick={() => setModelType('embedding')}
                  >
                    嵌入
                  </button>
                </div>
              </div>

              {modelType === 'chat' && (
                <>
                  {/* 输入模式 */}
                  <div style={{ marginBottom: 16 }}>
                    <label className="input-label">输入模式</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className={`seg-btn ${inputModes.has('text') ? 'active' : ''}`}
                        onClick={() => toggleInputMode('text')}
                      >
                        文字
                      </button>
                      <button
                        type="button"
                        className={`seg-btn ${inputModes.has('image') ? 'active' : ''}`}
                        onClick={() => toggleInputMode('image')}
                      >
                        图片
                      </button>
                    </div>
                  </div>

                  {/* 输出模式 */}
                  <div style={{ marginBottom: 16 }}>
                    <label className="input-label">输出模式</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className={`seg-btn ${outputModes.has('text') ? 'active' : ''}`}
                        onClick={() => toggleOutputMode('text')}
                      >
                        文字
                      </button>
                      <button
                        type="button"
                        className={`seg-btn ${outputModes.has('image') ? 'active' : ''}`}
                        onClick={() => toggleOutputMode('image')}
                      >
                        图片
                      </button>
                    </div>
                  </div>

                  {/* 能力 */}
                  <div style={{ marginBottom: 16 }}>
                    <label className="input-label">能力</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className={`seg-btn ${abilities.has('tool') ? 'active' : ''}`}
                        onClick={() => toggleAbility('tool')}
                      >
                        工具调用
                      </button>
                      <button
                        type="button"
                        className={`seg-btn ${abilities.has('reasoning') ? 'active' : ''}`}
                        onClick={() => toggleAbility('reasoning')}
                      >
                        推理
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {/* 自定义请求头 */}
              <div style={{ marginBottom: 20 }}>
                <label className="input-label">自定义请求头</label>
                {headers.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                      className="input-detail"
                      placeholder="Header Name"
                      value={h.name}
                      onChange={(e) => {
                        const next = [...headers]
                        next[i] = { ...next[i], name: e.target.value }
                        setHeaders(next)
                      }}
                      style={{ flex: 1 }}
                    />
                    <input
                      className="input-detail"
                      placeholder="Value"
                      value={h.value}
                      onChange={(e) => {
                        const next = [...headers]
                        next[i] = { ...next[i], value: e.target.value }
                        setHeaders(next)
                      }}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="toolbar-icon-btn"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => setHeaders(headers.filter((_, j) => j !== i))}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6 6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="desk-button"
                  style={{ fontSize: 12 }}
                  onClick={() => setHeaders([...headers, { name: '', value: '' }])}
                >
                  + 添加请求头
                </button>
              </div>

              {/* 自定义请求体 */}
              <div style={{ marginBottom: 20 }}>
                <label className="input-label">自定义请求体参数</label>
                {bodyParams.map((b, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                      className="input-detail"
                      placeholder="Key"
                      value={b.key}
                      onChange={(e) => {
                        const next = [...bodyParams]
                        next[i] = { ...next[i], key: e.target.value }
                        setBodyParams(next)
                      }}
                      style={{ flex: 1 }}
                    />
                    <input
                      className="input-detail"
                      placeholder="Value (JSON)"
                      value={b.value}
                      onChange={(e) => {
                        const next = [...bodyParams]
                        next[i] = { ...next[i], value: e.target.value }
                        setBodyParams(next)
                      }}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="toolbar-icon-btn"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => setBodyParams(bodyParams.filter((_, j) => j !== i))}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6 6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="desk-button"
                  style={{ fontSize: 12 }}
                  onClick={() => setBodyParams([...bodyParams, { key: '', value: '' }])}
                >
                  + 添加参数
                </button>
              </div>

              {/* 内置工具 */}
              <div style={{ marginBottom: 16 }}>
                <label className="input-label">内置工具</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="tool-tile">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>搜索工具</div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>允许模型进行网络搜索</div>
                    </div>
                    <label className="ios-switch ios-switch-sm">
                      <input type="checkbox" checked={searchTool} onChange={(e) => setSearchTool(e.target.checked)} />
                      <span className="slider" />
                    </label>
                  </div>
                  <div className="tool-tile">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>URL 上下文</div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>允许模型读取 URL 内容</div>
                    </div>
                    <label className="ios-switch ios-switch-sm">
                      <input type="checkbox" checked={urlContextTool} onChange={(e) => setUrlContextTool(e.target.checked)} />
                      <span className="slider" />
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 底部按钮 */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8
        }}>
          <button className="desk-button" onClick={onClose}>取消</button>
          <button
            className="desk-button filled"
            disabled={!modelId.trim() || modelId.trim().length < 2 || saving}
            onClick={handleSave}
          >
            {saving ? '保存中...' : (isNew ? '添加' : '保存')}
          </button>
        </div>
      </div>
    </div>
  )
}
