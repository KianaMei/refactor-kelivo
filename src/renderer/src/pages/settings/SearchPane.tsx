import { useState } from 'react'
import { Plus, Search, Trash2, Settings2, Check, X } from 'lucide-react'

// 搜索服务类型
interface SearchService {
  id: string
  name: string
  type: 'tavily' | 'serper' | 'bing' | 'google' | 'duckduckgo' | 'custom'
  apiKey: string
  enabled: boolean
  baseUrl?: string
}

const defaultServices: SearchService[] = [
  { id: 'tavily', name: 'Tavily', type: 'tavily', apiKey: '', enabled: false },
  { id: 'serper', name: 'Serper', type: 'serper', apiKey: '', enabled: false },
  { id: 'bing', name: 'Bing Search', type: 'bing', apiKey: '', enabled: false },
  { id: 'google', name: 'Google Custom Search', type: 'google', apiKey: '', enabled: false }
]

export function SearchPane() {
  const [services, setServices] = useState<SearchService[]>(defaultServices)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchEnabled, setSearchEnabled] = useState(false)

  function updateService(id: string, patch: Partial<SearchService>) {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function addCustomService() {
    const id = `custom_${Date.now()}`
    setServices((prev) => [
      ...prev,
      { id, name: '自定义服务', type: 'custom', apiKey: '', enabled: false, baseUrl: '' }
    ])
    setSelectedId(id)
  }

  function deleteService(id: string) {
    setServices((prev) => prev.filter((s) => s.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const selectedService = services.find((s) => s.id === selectedId)

  return (
    <div style={styles.root}>
      <div style={styles.header}>搜索</div>
      <div style={styles.divider} />

      <div className="settingsCard">
        <div style={styles.cardTitle}>全局设置</div>
        <LabeledRow label="启用联网搜索">
          <button
            type="button"
            className={`toggle ${searchEnabled ? 'toggleOn' : ''}`}
            onClick={() => setSearchEnabled(!searchEnabled)}
          >
            <div className="toggleThumb" />
          </button>
        </LabeledRow>
        <div style={styles.note}>
          启用后，AI 可以在对话中使用搜索工具获取实时信息。
        </div>
      </div>

      <div className="settingsCard">
        <div style={{ ...styles.cardTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>搜索服务</span>
          <button type="button" className="btn" style={{ padding: '6px 10px' }} onClick={addCustomService}>
            <Plus size={14} />
            添加
          </button>
        </div>

        <div style={styles.serviceList}>
          {services.map((svc) => (
            <button
              key={svc.id}
              type="button"
              className={`btn btn-ghost ${selectedId === svc.id ? 'segmentedItemActive' : ''}`}
              style={styles.serviceItem}
              onClick={() => setSelectedId(svc.id)}
            >
              <Search size={16} />
              <span style={{ flex: 1, textAlign: 'left' }}>{svc.name}</span>
              {svc.enabled && <Check size={14} style={{ color: 'var(--primary)', opacity: 0.8 }} />}
            </button>
          ))}
        </div>
      </div>

      {selectedService && (
        <div className="settingsCard">
          <div style={{ ...styles.cardTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings2 size={16} />
            {selectedService.name}
          </div>

          <LabeledRow label="名称">
            <input
              className="input"
              style={{ width: 180 }}
              value={selectedService.name}
              onChange={(e) => updateService(selectedService.id, { name: e.target.value })}
            />
          </LabeledRow>

          <RowDivider />

          <LabeledRow label="API Key">
            <input
              className="input"
              type="password"
              style={{ width: 240 }}
              placeholder="输入 API Key"
              value={selectedService.apiKey}
              onChange={(e) => updateService(selectedService.id, { apiKey: e.target.value })}
            />
          </LabeledRow>

          {selectedService.type === 'custom' && (
            <>
              <RowDivider />
              <LabeledRow label="Base URL">
                <input
                  className="input"
                  style={{ width: 280 }}
                  placeholder="https://api.example.com/search"
                  value={selectedService.baseUrl ?? ''}
                  onChange={(e) => updateService(selectedService.id, { baseUrl: e.target.value })}
                />
              </LabeledRow>
            </>
          )}

          <RowDivider />

          <LabeledRow label="启用">
            <button
              type="button"
              className={`toggle ${selectedService.enabled ? 'toggleOn' : ''}`}
              onClick={() => updateService(selectedService.id, { enabled: !selectedService.enabled })}
            >
              <div className="toggleThumb" />
            </button>
          </LabeledRow>

          {selectedService.type === 'custom' && (
            <>
              <RowDivider />
              <div style={{ padding: '8px 4px' }}>
                <button type="button" className="btn btn-danger" onClick={() => deleteService(selectedService.id)}>
                  <Trash2 size={14} />
                  删除此服务
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="settingsCard">
        <div style={styles.cardTitle}>说明</div>
        <div style={styles.note}>
          <p>• 支持多种搜索服务，可同时配置多个。</p>
          <p>• Tavily 和 Serper 是推荐的 AI 优化搜索服务。</p>
          <p>• 你也可以添加自定义搜索 API。</p>
        </div>
      </div>
    </div>
  )
}

function RowDivider() {
  return <div style={styles.rowDivider} />
}

function LabeledRow(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.labeledRow}>
      <div style={styles.rowLabel}>{props.label}</div>
      <div style={styles.rowTrailing}>{props.children}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
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
    flexShrink: 0
  },
  note: {
    fontSize: 13,
    lineHeight: 1.8,
    opacity: 0.8,
    padding: '4px'
  },
  serviceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  serviceItem: {
    justifyContent: 'flex-start',
    gap: 10,
    padding: '10px 12px'
  }
}
