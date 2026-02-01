import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Languages, FileText, AlignLeft, RotateCcw } from 'lucide-react'

import type { AppConfig } from '../../../../shared/types'
import { DEFAULT_TITLE_PROMPT, DEFAULT_SUMMARY_PROMPT } from '../../../../shared/types'

export function DefaultModelPane(props: { config: AppConfig; onSave: (next: AppConfig) => Promise<void> }) {
  const providers = useMemo(() => {
    const map = props.config.providerConfigs
    const order = props.config.providersOrder
    return order.map((k) => map[k]).filter(Boolean)
  }, [props.config.providerConfigs, props.config.providersOrder])

  return (
    <div style={styles.root}>
      <div style={styles.header}>默认模型</div>
      <div style={styles.divider} />

      <ModelCard
        title="对话默认模型"
        icon={<MessageSquare size={15} />}
        providerId={props.config.currentModelProvider}
        modelId={props.config.currentModelId}
        providers={providers}
        onChange={async (nextProviderId, nextModelId) => {
          await props.onSave({
            ...props.config,
            currentModelProvider: nextProviderId,
            currentModelId: nextModelId
          })
        }}
      />

      <ModelCard
        title="翻译默认模型"
        icon={<Languages size={15} />}
        providerId={props.config.translateModelProvider}
        modelId={props.config.translateModelId}
        providers={providers}
        onChange={async (nextProviderId, nextModelId) => {
          await props.onSave({
            ...props.config,
            translateModelProvider: nextProviderId,
            translateModelId: nextModelId
          })
        }}
      />

      <ModelCardWithPrompt
        title="标题生成模型"
        icon={<FileText size={15} />}
        description="用于自动生成对话标题的模型"
        providerId={props.config.titleModelProvider}
        modelId={props.config.titleModelId}
        prompt={props.config.titlePrompt}
        defaultPrompt={DEFAULT_TITLE_PROMPT}
        providers={providers}
        onModelChange={async (nextProviderId, nextModelId) => {
          await props.onSave({
            ...props.config,
            titleModelProvider: nextProviderId,
            titleModelId: nextModelId
          })
        }}
        onPromptChange={async (nextPrompt) => {
          await props.onSave({
            ...props.config,
            titlePrompt: nextPrompt
          })
        }}
      />

      <ModelCardWithPrompt
        title="摘要生成模型"
        icon={<AlignLeft size={15} />}
        description="用于生成对话摘要的模型"
        providerId={props.config.summaryModelProvider}
        modelId={props.config.summaryModelId}
        prompt={props.config.summaryPrompt}
        defaultPrompt={DEFAULT_SUMMARY_PROMPT}
        providers={providers}
        onModelChange={async (nextProviderId, nextModelId) => {
          await props.onSave({
            ...props.config,
            summaryModelProvider: nextProviderId,
            summaryModelId: nextModelId
          })
        }}
        onPromptChange={async (nextPrompt) => {
          await props.onSave({
            ...props.config,
            summaryPrompt: nextPrompt
          })
        }}
      />

      <div className="settingsCard">
        <div style={styles.cardTitle}>说明</div>
        <div style={styles.hint}>
          <p>对话默认模型：新建对话时自动使用的模型。</p>
          <p>翻译默认模型：翻译消息时使用的模型。</p>
          <p>标题生成模型：自动生成对话标题时使用的模型，如不设置将使用对话默认模型。</p>
          <p>摘要生成模型：生成对话摘要时使用的模型，如不设置将使用对话默认模型。</p>
        </div>
      </div>
    </div>
  )
}

function ModelCard(props: {
  title: string
  icon?: React.ReactNode
  providerId: string | null
  modelId: string | null
  providers: Array<{ id: string; name: string }>
  onChange: (providerId: string | null, modelId: string | null) => Promise<void>
}) {
  const providerId = props.providerId ?? ''
  const modelId = props.modelId ?? ''

  const [pickerOpen, setPickerOpen] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [modelsProviderId, setModelsProviderId] = useState<string | null>(null)
  const [modelsBusy, setModelsBusy] = useState(false)
  const [modelsErr, setModelsErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => m.toLowerCase().includes(q))
  }, [models, query])

  const hasCachedModels = models.length > 0 && modelsProviderId === props.providerId

  function humanizeErr(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e)
    const m1 = /Error invoking remote method 'models:list':\\s*(.+)$/.exec(raw)
    if (m1?.[1]) return m1[1]
    const m2 = /TypeError:\\s*(.+)$/.exec(raw)
    if (m2?.[1]) return m2[1]
    return raw
  }

  async function refreshModels() {
    setModelsErr(null)
    if (!props.providerId) {
      setModelsErr('请先选择供应商')
      return
    }
    setModelsBusy(true)
    try {
      const res = await window.api.models.list(props.providerId)
      setModels(res.models)
      setModelsProviderId(props.providerId)
      if (res.models.length === 0) setModelsErr('上游未返回可用模型列表')
    } catch (e) {
      const msg = humanizeErr(e)
      if (hasCachedModels) setModelsErr(`刷新失败：${msg}（已显示上次获取的模型列表）`)
      else setModelsErr(msg)
    } finally {
      setModelsBusy(false)
    }
  }

  useEffect(() => {
    if (!pickerOpen) return
    setQuery('')
    // 有缓存时不强制自动刷新，避免"列表已出现但弹出报错"的体验；
    // 需要刷新时用户可手动点"刷新"。
    if (!props.providerId) return
    const providerChanged = modelsProviderId !== props.providerId
    if (providerChanged) {
      setModels([])
      setModelsErr(null)
      setModelsProviderId(null)
    }
    if (providerChanged || models.length === 0) {
      void refreshModels()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen, props.providerId])

  return (
    <div className="settingsCard">
      <div style={styles.cardTitle}>
        {props.icon && <span style={{ marginRight: 6 }}>{props.icon}</span>}
        {props.title}
      </div>
      <div style={styles.row}>
        <label style={styles.label}>供应商</label>
        <select
          style={styles.select}
          value={providerId}
          onChange={(e) => void props.onChange(e.target.value ? e.target.value : null, props.modelId)}
        >
          <option value="">（未设置）</option>
          {props.providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div style={styles.row}>
        <label style={styles.label}>模型</label>
        <button type="button" style={styles.modelButton} onClick={() => setPickerOpen(true)} disabled={!props.providerId}>
          {modelId ? modelId : '选择模型'}
        </button>
        <button type="button" style={styles.smallButton} onClick={() => setPickerOpen(true)} disabled={!props.providerId}>
          获取
        </button>
      </div>

      {pickerOpen ? (
        <div style={styles.modalOverlay} onMouseDown={() => setPickerOpen(false)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ fontWeight: 700 }}>选择模型</div>
              <div style={{ flex: 1 }} />
              <button type="button" style={styles.smallButton} onClick={() => void refreshModels()} disabled={modelsBusy}>
                {modelsBusy ? '获取中...' : '刷新'}
              </button>
              <button type="button" style={styles.smallButton} onClick={() => setPickerOpen(false)}>
                关闭
              </button>
            </div>

            <div style={styles.modalToolbar}>
              <input
                style={styles.searchInput}
                placeholder="搜索模型"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div style={{ fontSize: 12, opacity: 0.75 }}>{filtered.length}/{models.length}</div>
            </div>

            {modelsErr ? <div style={hasCachedModels ? styles.noticeBox : styles.errorBox}>{modelsErr}</div> : null}

            <div style={styles.modelList}>
              {filtered.map((m) => (
                <button
                  key={m}
                  type="button"
                  style={{
                    ...styles.modelItem,
                    ...(m === modelId ? styles.modelItemActive : null)
                  }}
                  onClick={() => {
                    void props.onChange(props.providerId, m)
                    setPickerOpen(false)
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ModelCardWithPrompt(props: {
  title: string
  icon?: React.ReactNode
  description?: string
  providerId: string | null
  modelId: string | null
  prompt: string
  defaultPrompt: string
  providers: Array<{ id: string; name: string }>
  onModelChange: (providerId: string | null, modelId: string | null) => Promise<void>
  onPromptChange: (prompt: string) => Promise<void>
}) {
  const providerId = props.providerId ?? ''
  const modelId = props.modelId ?? ''

  const [pickerOpen, setPickerOpen] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [modelsProviderId, setModelsProviderId] = useState<string | null>(null)
  const [modelsBusy, setModelsBusy] = useState(false)
  const [modelsErr, setModelsErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => m.toLowerCase().includes(q))
  }, [models, query])

  const hasCachedModels = models.length > 0 && modelsProviderId === props.providerId

  function humanizeErr(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e)
    const m1 = /Error invoking remote method 'models:list':\\s*(.+)$/.exec(raw)
    if (m1?.[1]) return m1[1]
    const m2 = /TypeError:\\s*(.+)$/.exec(raw)
    if (m2?.[1]) return m2[1]
    return raw
  }

  async function refreshModels() {
    setModelsErr(null)
    if (!props.providerId) {
      setModelsErr('请先选择供应商')
      return
    }
    setModelsBusy(true)
    try {
      const res = await window.api.models.list(props.providerId)
      setModels(res.models)
      setModelsProviderId(props.providerId)
      if (res.models.length === 0) setModelsErr('上游未返回可用模型列表')
    } catch (e) {
      const msg = humanizeErr(e)
      if (hasCachedModels) setModelsErr(`刷新失败：${msg}（已显示上次获取的模型列表）`)
      else setModelsErr(msg)
    } finally {
      setModelsBusy(false)
    }
  }

  useEffect(() => {
    if (!pickerOpen) return
    setQuery('')
    if (!props.providerId) return
    const providerChanged = modelsProviderId !== props.providerId
    if (providerChanged) {
      setModels([])
      setModelsErr(null)
      setModelsProviderId(null)
    }
    if (providerChanged || models.length === 0) {
      void refreshModels()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen, props.providerId])

  return (
    <div className="settingsCard">
      <div style={styles.cardTitle}>
        {props.icon && <span style={{ marginRight: 6 }}>{props.icon}</span>}
        {props.title}
      </div>
      {props.description && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
          {props.description}
        </div>
      )}
      <div style={styles.row}>
        <label style={styles.label}>供应商</label>
        <select
          style={styles.select}
          value={providerId}
          onChange={(e) => void props.onModelChange(e.target.value ? e.target.value : null, props.modelId)}
        >
          <option value="">（未设置）</option>
          {props.providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div style={styles.row}>
        <label style={styles.label}>模型</label>
        <button type="button" style={styles.modelButton} onClick={() => setPickerOpen(true)} disabled={!props.providerId}>
          {modelId ? modelId : '选择模型'}
        </button>
        <button type="button" style={styles.smallButton} onClick={() => setPickerOpen(true)} disabled={!props.providerId}>
          获取
        </button>
      </div>

      <div style={{ ...styles.rowDivider, margin: '8px 0' }} />

      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.75 }}>Prompt</label>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => void props.onPromptChange(props.defaultPrompt)}
            disabled={props.prompt === props.defaultPrompt}
            style={{ padding: '4px 8px', gap: 4 }}
          >
            <RotateCcw size={12} />
            重置
          </button>
        </div>
        <textarea
          className="input"
          style={{ width: '100%', height: 80, resize: 'vertical', fontSize: 13 }}
          value={props.prompt}
          onChange={(e) => void props.onPromptChange(e.target.value)}
          placeholder="输入 Prompt..."
        />
      </div>

      {pickerOpen ? (
        <div style={styles.modalOverlay} onMouseDown={() => setPickerOpen(false)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ fontWeight: 700 }}>选择模型</div>
              <div style={{ flex: 1 }} />
              <button type="button" style={styles.smallButton} onClick={() => void refreshModels()} disabled={modelsBusy}>
                {modelsBusy ? '获取中...' : '刷新'}
              </button>
              <button type="button" style={styles.smallButton} onClick={() => setPickerOpen(false)}>
                关闭
              </button>
            </div>

            <div style={styles.modalToolbar}>
              <input
                style={styles.searchInput}
                placeholder="搜索模型"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div style={{ fontSize: 12, opacity: 0.75 }}>{filtered.length}/{models.length}</div>
            </div>

            {modelsErr ? <div style={hasCachedModels ? styles.noticeBox : styles.errorBox}>{modelsErr}</div> : null}

            <div style={styles.modelList}>
              {filtered.map((m) => (
                <button
                  key={m}
                  type="button"
                  style={{
                    ...styles.modelItem,
                    ...(m === modelId ? styles.modelItemActive : null)
                  }}
                  onClick={() => {
                    void props.onModelChange(props.providerId, m)
                    setPickerOpen(false)
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const styles: Record<string, any> = {
  root: {
    padding: '16px 16px 32px',
    maxWidth: 960,
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
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center'
  },
  hint: {
    fontSize: 12,
    lineHeight: 1.7,
    color: 'var(--text-secondary)'
  },
  rowDivider: {
    height: 1,
    background: 'var(--border)',
    opacity: 0.5
  },
  row: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  label: { width: 72, fontSize: 12, opacity: 0.75 },
  select: {
    flex: 1,
    padding: '9px 10px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text)',
    outline: 'none'
  },
  modelButton: {
    flex: 1,
    textAlign: 'left',
    padding: '9px 10px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text)',
    cursor: 'pointer'
  },
  smallButton: {
    padding: '9px 10px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--panel-2)',
    color: 'var(--text)',
    cursor: 'pointer'
  },
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
    width: 720,
    maxWidth: 'calc(100vw - 48px)',
    height: 560,
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
  searchInput: {
    flex: 1,
    padding: '9px 10px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text)',
    outline: 'none'
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
  noticeBox: {
    margin: 12,
    padding: 12,
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--panel)',
    color: 'var(--text)',
    opacity: 0.9
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
