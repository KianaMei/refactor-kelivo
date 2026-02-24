import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, X } from 'lucide-react'

function humanizeErr(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

export function ModelPickerModal(props: {
  open: boolean
  providerId: string | null
  activeModelId: string | null
  onClose: () => void
  onSelect: (modelId: string) => void
}) {
  const { open, providerId, activeModelId, onClose, onSelect } = props

  const [models, setModels] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const refresh = useCallback(async () => {
    if (!providerId) {
      setErr('请先选择供应商')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const res = await window.api.models.list(providerId)
      setModels(res.models)
      if (res.models.length === 0) setErr('上游未返回可用模型列表')
    } catch (e) {
      setErr(humanizeErr(e))
    } finally {
      setBusy(false)
    }
  }, [providerId])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setModels([])
    setErr(null)
    void refresh()
  }, [open, providerId, refresh])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => m.toLowerCase().includes(q))
  }, [models, query])

  if (!open) return null

  return (
    <div className="modalOverlay" onMouseDown={onClose}>
      <div className="modalSurface frosted" style={s.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={{ fontWeight: 800 }}>选择模型</div>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm" onClick={refresh} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            {busy ? '获取中...' : '刷新'}
          </button>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            <X size={14} />
            关闭
          </button>
        </div>

        <div style={s.toolbar}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="搜索模型"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div style={{ fontSize: 12, opacity: 0.75 }}>{filtered.length}/{models.length}</div>
        </div>

        {err && (
          <div style={s.errorBox}>{err}</div>
        )}

        <div style={s.list}>
          {filtered.map((m) => (
            <button
              key={m}
              type="button"
              className="btn btn-ghost"
              style={{
                justifyContent: 'flex-start',
                textAlign: 'left',
                padding: '10px 10px',
                borderRadius: 10,
                border: m === activeModelId ? '1px solid var(--primary-3)' : '1px solid transparent',
                background: m === activeModelId ? 'var(--primary-2)' : 'transparent'
              }}
              onClick={() => {
                onSelect(m)
                onClose()
              }}
            >
              {m}
            </button>
          ))}
          {filtered.length === 0 && !busy && (
            <div style={{ padding: 12, opacity: 0.6, textAlign: 'center' }}>暂无可选模型</div>
          )}
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  modal: {
    width: 600,
    maxWidth: 'calc(100vw - 48px)',
    height: 520,
    maxHeight: 'calc(100vh - 48px)',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    height: 48,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 12px',
    borderBottom: '1px solid var(--border)'
  },
  toolbar: {
    padding: 12,
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    gap: 10,
    alignItems: 'center'
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6
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

