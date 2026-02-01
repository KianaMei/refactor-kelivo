import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Settings2, Image, GripVertical, Bot, Sparkles, Copy,
  ChevronDown, RotateCcw, Sliders
} from 'lucide-react'

import type { AppConfig, AssistantConfig } from '../../../../shared/types'
import { createDefaultAssistantConfig } from '../../../../shared/types'

function safeUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'ast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
}

export function AssistantPane(props: { config: AppConfig; onSave: (next: AppConfig) => Promise<void> }) {
  const { config, onSave } = props

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [tempOrder, setTempOrder] = useState<string[] | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // 模型选择器状态
  const [pickerOpen, setPickerOpen] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [modelsProviderId, setModelsProviderId] = useState<string | null>(null)
  const [modelsBusy, setModelsBusy] = useState(false)
  const [modelsErr, setModelsErr] = useState<string | null>(null)
  const [modelQuery, setModelQuery] = useState('')

  const providers = useMemo(() => {
    const map = config.providerConfigs
    const order = config.providersOrder
    return order.map((k) => map[k]).filter(Boolean)
  }, [config.providerConfigs, config.providersOrder])

  const assistants = useMemo(() => {
    const order = tempOrder ?? config.assistantsOrder
    return order.map((id) => config.assistantConfigs[id]).filter(Boolean)
  }, [config.assistantConfigs, config.assistantsOrder, tempOrder])

  const selectedAssistant = selectedId ? config.assistantConfigs[selectedId] : null

  // 拖拽排序处理
  const handleDragStart = useCallback((id: string, e: React.DragEvent) => {
    setDraggedId(id)
    const currentOrder = [...config.assistantsOrder]
    for (const aid of Object.keys(config.assistantConfigs)) {
      if (!currentOrder.includes(aid)) {
        currentOrder.push(aid)
      }
    }
    setTempOrder(currentOrder)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }, [config.assistantsOrder, config.assistantConfigs])

  const handleDragOver = useCallback((id: string, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!draggedId || id === draggedId || !tempOrder) return

    const sourceIndex = tempOrder.indexOf(draggedId)
    const targetIndex = tempOrder.indexOf(id)
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return

    const newOrder = [...tempOrder]
    newOrder.splice(sourceIndex, 1)
    newOrder.splice(targetIndex, 0, draggedId)
    setTempOrder(newOrder)
    setDragOverId(id)
  }, [draggedId, tempOrder])

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
    setDragOverId(null)
    setTempOrder(null)
  }, [])

  const handleDrop = useCallback(async (_targetId: string, e: React.DragEvent) => {
    e.preventDefault()
    if (!draggedId || !tempOrder) {
      handleDragEnd()
      return
    }

    await onSave({
      ...config,
      assistantsOrder: tempOrder
    })

    handleDragEnd()
  }, [draggedId, tempOrder, config, onSave, handleDragEnd])

  async function addAssistant() {
    const id = safeUuid()
    const newAssistant = createDefaultAssistantConfig(id, '新助手')
    const nextConfigs = { ...config.assistantConfigs, [id]: newAssistant }
    const nextOrder = [id, ...config.assistantsOrder]
    await onSave({
      ...config,
      assistantConfigs: nextConfigs,
      assistantsOrder: nextOrder
    })
    setSelectedId(id)
  }

  async function updateAssistant(id: string, patch: Partial<AssistantConfig>) {
    const existing = config.assistantConfigs[id]
    if (!existing) return
    const updated: AssistantConfig = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString()
    }
    await onSave({
      ...config,
      assistantConfigs: { ...config.assistantConfigs, [id]: updated }
    })
  }

  async function deleteAssistant(id: string) {
    const { [id]: _, ...rest } = config.assistantConfigs
    const nextOrder = config.assistantsOrder.filter((i) => i !== id)
    await onSave({
      ...config,
      assistantConfigs: rest,
      assistantsOrder: nextOrder
    })
    if (selectedId === id) setSelectedId(null)
  }

  async function setDefault(id: string) {
    const nextConfigs = { ...config.assistantConfigs }
    for (const [key, ast] of Object.entries(nextConfigs)) {
      nextConfigs[key] = { ...ast, isDefault: key === id, updatedAt: new Date().toISOString() }
    }
    await onSave({ ...config, assistantConfigs: nextConfigs })
  }

  async function duplicateAssistant(id: string) {
    const source = config.assistantConfigs[id]
    if (!source) return
    const newId = safeUuid()
    const now = new Date().toISOString()
    const copy: AssistantConfig = {
      ...source,
      id: newId,
      name: `${source.name} (副本)`,
      isDefault: false,
      createdAt: now,
      updatedAt: now
    }
    const nextConfigs = { ...config.assistantConfigs, [newId]: copy }
    const idx = config.assistantsOrder.indexOf(id)
    const nextOrder = [...config.assistantsOrder]
    nextOrder.splice(idx + 1, 0, newId)
    await onSave({
      ...config,
      assistantConfigs: nextConfigs,
      assistantsOrder: nextOrder
    })
    setSelectedId(newId)
  }

  // 模型列表获取
  function humanizeErr(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e)
    const m1 = /Error invoking remote method 'models:list':\s*(.+)$/.exec(raw)
    if (m1?.[1]) return m1[1]
    const m2 = /TypeError:\s*(.+)$/.exec(raw)
    if (m2?.[1]) return m2[1]
    return raw
  }

  async function refreshModels(providerId: string) {
    setModelsErr(null)
    if (!providerId) {
      setModelsErr('请先选择供应商')
      return
    }
    setModelsBusy(true)
    try {
      const res = await window.api.models.list(providerId)
      setModels(res.models)
      setModelsProviderId(providerId)
      if (res.models.length === 0) setModelsErr('上游未返回可用模型列表')
    } catch (e) {
      const msg = humanizeErr(e)
      setModelsErr(msg)
    } finally {
      setModelsBusy(false)
    }
  }

  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => m.toLowerCase().includes(q))
  }, [models, modelQuery])

  useEffect(() => {
    if (!pickerOpen) return
    setModelQuery('')
    if (!selectedAssistant?.boundModelProvider) return
    const providerChanged = modelsProviderId !== selectedAssistant.boundModelProvider
    if (providerChanged) {
      setModels([])
      setModelsErr(null)
      setModelsProviderId(null)
    }
    if (providerChanged || models.length === 0) {
      void refreshModels(selectedAssistant.boundModelProvider)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen, selectedAssistant?.boundModelProvider])

  const getProviderName = (providerId: string | null) => {
    if (!providerId) return '（使用全局默认）'
    return config.providerConfigs[providerId]?.name ?? providerId
  }

  return (
    <div style={s.root}>
      <div style={s.header}>助手</div>
      <div style={s.divider} />

      <div className="settingsCard">
        <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Bot size={15} />
            助手列表
          </div>
          <button type="button" className="btn" style={{ padding: '6px 10px' }} onClick={addAssistant}>
            <Plus size={14} />
            添加
          </button>
        </div>

        <div style={s.hint}>
          拖拽可调整顺序，点击编辑助手详情
        </div>

        <div style={s.assistantList}>
          {assistants.map((ast) => (
            <button
              key={ast.id}
              type="button"
              draggable
              onDragStart={(e) => handleDragStart(ast.id, e)}
              onDragOver={(e) => handleDragOver(ast.id, e)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(ast.id, e)}
              className={`btn btn-ghost ${selectedId === ast.id ? 'segmentedItemActive' : ''}`}
              style={{
                ...s.assistantItem,
                opacity: draggedId === ast.id ? 0.5 : 1,
                borderColor: dragOverId === ast.id ? 'var(--primary)' : 'transparent'
              }}
              onClick={() => setSelectedId(ast.id)}
            >
              <GripVertical size={14} style={{ opacity: 0.4, cursor: 'grab' }} />
              <span style={{ fontSize: 22 }}>{ast.avatar}</span>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontWeight: 600 }}>{ast.name}</div>
                {ast.boundModelId && (
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                    {ast.boundModelId}
                  </div>
                )}
              </div>
              {ast.isDefault && (
                <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--primary-2)', color: 'var(--primary)', borderRadius: 6 }}>
                  默认
                </span>
              )}
            </button>
          ))}

          {assistants.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', opacity: 0.6 }}>
              暂无助手，点击"添加"创建一个
            </div>
          )}
        </div>
      </div>

      {selectedAssistant && (
        <div className="settingsCard">
          <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings2 size={15} />
            编辑助手
          </div>

          <LabeledRow label="名称">
            <input
              className="input"
              style={{ width: 200 }}
              value={selectedAssistant.name}
              onChange={(e) => updateAssistant(selectedAssistant.id, { name: e.target.value })}
            />
          </LabeledRow>

          <RowDivider />

          <LabeledRow label="头像">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28, width: 40, textAlign: 'center' }}>{selectedAssistant.avatar}</span>
              <input
                className="input"
                style={{ width: 80 }}
                value={selectedAssistant.avatar}
                onChange={(e) => updateAssistant(selectedAssistant.id, { avatar: e.target.value })}
                placeholder="emoji"
              />
              <button type="button" className="btn btn-ghost" style={{ padding: '6px 10px' }}>
                <Image size={14} />
                图片
              </button>
            </div>
          </LabeledRow>

          <RowDivider />

          <div style={{ padding: '8px 4px' }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>系统提示词</div>
            <textarea
              className="input"
              style={{ width: '100%', height: 120, resize: 'vertical' }}
              value={selectedAssistant.systemPrompt}
              onChange={(e) => updateAssistant(selectedAssistant.id, { systemPrompt: e.target.value })}
              placeholder="输入系统提示词，用于定义助手的角色和行为..."
            />
          </div>

          <RowDivider />

          {/* 模型绑定 */}
          <div style={{ ...s.cardTitle, marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} />
            模型绑定
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            为此助手指定专用模型，不设置则使用全局默认
          </div>

          <LabeledRow label="供应商">
            <select
              className="input"
              style={{ width: 200 }}
              value={selectedAssistant.boundModelProvider ?? ''}
              onChange={(e) => {
                const val = e.target.value || null
                updateAssistant(selectedAssistant.id, {
                  boundModelProvider: val,
                  boundModelId: null
                })
              }}
            >
              <option value="">（使用全局默认）</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </LabeledRow>

          <RowDivider />

          <LabeledRow label="模型">
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minWidth: 160, textAlign: 'left', justifyContent: 'flex-start' }}
              onClick={() => setPickerOpen(true)}
              disabled={!selectedAssistant.boundModelProvider}
            >
              {selectedAssistant.boundModelId ?? '选择模型'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '6px 10px' }}
              onClick={() => setPickerOpen(true)}
              disabled={!selectedAssistant.boundModelProvider}
            >
              获取
            </button>
          </LabeledRow>

          <RowDivider />

          {/* 高级设置折叠 */}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'space-between', padding: '10px 4px' }}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sliders size={14} />
              高级设置
            </div>
            <ChevronDown
              size={14}
              style={{ transform: showAdvanced ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }}
            />
          </button>

          {showAdvanced && (
            <div style={{ padding: '8px 4px', background: 'var(--surface)', borderRadius: 8, marginTop: 4 }}>
              <SliderRow
                label="温度 (Temperature)"
                value={selectedAssistant.temperature ?? 0.7}
                min={0}
                max={2}
                step={0.1}
                onChange={(v) => updateAssistant(selectedAssistant.id, { temperature: v })}
              />
              <RowDivider />
              <SliderRow
                label="Top P"
                value={selectedAssistant.topP ?? 1}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => updateAssistant(selectedAssistant.id, { topP: v })}
              />
              <RowDivider />
              <LabeledRow label="最大输出 Token">
                <input
                  type="number"
                  className="input"
                  style={{ width: 100 }}
                  value={selectedAssistant.maxTokens ?? ''}
                  placeholder="自动"
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : undefined
                    updateAssistant(selectedAssistant.id, { maxTokens: val })
                  }}
                />
              </LabeledRow>
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => updateAssistant(selectedAssistant.id, {
                    temperature: undefined,
                    topP: undefined,
                    maxTokens: undefined
                  })}
                  style={{ gap: 4 }}
                >
                  <RotateCcw size={12} />
                  重置为默认
                </button>
              </div>
            </div>
          )}

          <RowDivider />

          <LabeledRow label="设为默认">
            <button
              type="button"
              className={`toggle ${selectedAssistant.isDefault ? 'toggleOn' : ''}`}
              onClick={() => setDefault(selectedAssistant.id)}
            >
              <div className="toggleThumb" />
            </button>
          </LabeledRow>

          <RowDivider />

          <div style={{ display: 'flex', gap: 8, padding: '8px 4px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => duplicateAssistant(selectedAssistant.id)}
              style={{ gap: 4 }}
            >
              <Copy size={14} />
              复制
            </button>
            {!selectedAssistant.isDefault && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => deleteAssistant(selectedAssistant.id)}
                style={{ gap: 4 }}
              >
                <Trash2 size={14} />
                删除
              </button>
            )}
          </div>
        </div>
      )}

      {/* 模型选择弹窗 */}
      {pickerOpen && selectedAssistant && (
        <div style={s.modalOverlay} onMouseDown={() => setPickerOpen(false)}>
          <div style={s.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div style={{ fontWeight: 700 }}>选择模型</div>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => selectedAssistant.boundModelProvider && refreshModels(selectedAssistant.boundModelProvider)}
                disabled={modelsBusy}
              >
                {modelsBusy ? '获取中...' : '刷新'}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setPickerOpen(false)}>
                关闭
              </button>
            </div>

            <div style={s.modalToolbar}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="搜索模型"
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
              />
              <div style={{ fontSize: 12, opacity: 0.75 }}>{filteredModels.length}/{models.length}</div>
            </div>

            {modelsErr && <div style={s.errorBox}>{modelsErr}</div>}

            <div style={s.modelList}>
              {filteredModels.map((m) => (
                <button
                  key={m}
                  type="button"
                  style={{
                    ...s.modelItem,
                    ...(m === selectedAssistant.boundModelId ? s.modelItemActive : null)
                  }}
                  onClick={() => {
                    updateAssistant(selectedAssistant.id, { boundModelId: m })
                    setPickerOpen(false)
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="settingsCard">
        <div style={s.cardTitle}>说明</div>
        <div style={s.note}>
          <p>助手可以定义不同的角色、系统提示词和绑定模型。</p>
          <p>在对话中可以切换不同的助手，每个助手可绑定不同的模型。</p>
          <p>默认助手会在新建对话时自动使用。</p>
          <p>高级设置中的温度、Top P 等参数会覆盖全局设置。</p>
        </div>
      </div>
    </div>
  )
}

function RowDivider() {
  return <div style={s.rowDivider} />
}

function LabeledRow(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={s.labeledRow}>
      <div style={s.rowLabel}>{props.label}</div>
      <div style={s.rowTrailing}>{props.children}</div>
    </div>
  )
}

function SliderRow(props: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <LabeledRow label={props.label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step ?? 0.1}
          value={props.value}
          onChange={(e) => props.onChange(Number(e.target.value))}
          style={{ width: 100 }}
        />
        <span style={{ fontSize: 13, opacity: 0.85, minWidth: 40, textAlign: 'right' }}>
          {props.value.toFixed(2)}
        </span>
      </div>
    </LabeledRow>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: {
    padding: '16px 16px 32px',
    maxWidth: 800,
    margin: '0 auto'
  },
  header: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 8
  },
  divider: {
    height: 1,
    background: 'var(--border)',
    marginBottom: 12
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 8,
    padding: '0 4px'
  },
  hint: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    marginBottom: 8,
    padding: '0 4px'
  },
  rowDivider: {
    height: 1,
    background: 'var(--border)',
    margin: '4px 8px',
    opacity: 0.5
  },
  labeledRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 4px',
    gap: 12
  },
  rowLabel: {
    fontSize: 14,
    flex: 1
  },
  rowTrailing: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  note: {
    fontSize: 13,
    lineHeight: 1.8,
    opacity: 0.8,
    padding: '4px'
  },
  assistantList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  assistantItem: {
    justifyContent: 'flex-start',
    gap: 10,
    padding: '10px 12px',
    border: '1px solid transparent',
    transition: 'border-color 0.2s, opacity 0.2s'
  },
  // 模型选择弹窗
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    width: 600,
    maxWidth: 'calc(100vw - 48px)',
    height: 480,
    maxHeight: 'calc(100vh - 48px)',
    borderRadius: 14,
    border: '1px solid var(--border)',
    background: 'var(--modal-bg)',
    boxShadow: 'var(--shadow-md)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },
  modalHeader: {
    height: 44,
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 12px'
  },
  modalToolbar: {
    padding: 12,
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    gap: 10,
    alignItems: 'center'
  },
  modelList: {
    flex: 1,
    overflow: 'auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  modelItem: {
    textAlign: 'left',
    padding: '10px 10px',
    borderRadius: 10,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--text)',
    cursor: 'pointer'
  },
  modelItemActive: {
    background: 'var(--primary-2)',
    borderColor: 'var(--primary-3)'
  },
  errorBox: {
    margin: 12,
    padding: 12,
    borderRadius: 10,
    border: '1px solid rgba(255,80,80,0.35)',
    background: 'rgba(255,80,80,0.12)',
    color: '#ffb3b3'
  }
}
