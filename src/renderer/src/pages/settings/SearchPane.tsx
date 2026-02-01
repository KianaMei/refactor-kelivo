import { useState } from 'react'
import { Plus, Trash2, Settings2, Check, Wifi, WifiOff, Loader } from 'lucide-react'

interface SearchService {
  id: string
  name: string
  type: 'tavily' | 'serper' | 'bing' | 'google' | 'duckduckgo' | 'custom'
  apiKey: string
  enabled: boolean
  baseUrl?: string
}

const serviceIcons: Record<string, string> = {
  tavily: 'tavily-color.svg',
  serper: 'google-color.svg',
  bing: 'bing-color.svg',
  google: 'google-color.svg',
  duckduckgo: 'duckduckgo-color.svg',
}

const defaultServices: SearchService[] = [
  { id: 'tavily', name: 'Tavily', type: 'tavily', apiKey: '', enabled: false },
  { id: 'serper', name: 'Serper', type: 'serper', apiKey: '', enabled: false },
  { id: 'bing', name: 'Bing Search', type: 'bing', apiKey: '', enabled: false },
  { id: 'google', name: 'Google Custom Search', type: 'google', apiKey: '', enabled: false },
  { id: 'duckduckgo', name: 'DuckDuckGo', type: 'duckduckgo', apiKey: '', enabled: false },
]

export function SearchPane() {
  const [services, setServices] = useState<SearchService[]>(defaultServices)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchEnabled, setSearchEnabled] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  function updateService(id: string, patch: Partial<SearchService>) {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function addCustomService() {
    const id = `custom_${Date.now()}`
    setServices((prev) => [
      ...prev,
      { id, name: '自定义服务', type: 'custom', apiKey: '', enabled: false, baseUrl: '' },
    ])
    setSelectedId(id)
  }

  function deleteService(id: string) {
    setServices((prev) => prev.filter((s) => s.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    await new Promise((r) => setTimeout(r, 1500))
    setTesting(false)
    setTestResult({ ok: false, msg: '尚未实现连接测试 (需要 IPC)' })
  }

  const selected = services.find((s) => s.id === selectedId)

  return (
    <div style={s.root}>
      <div style={s.header}>搜索</div>

      {/* 全局开关 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>全局设置</div>
        <div style={s.labeledRow}>
          <span style={s.rowLabel}>启用联网搜索</span>
          <button
            type="button"
            className={`toggle ${searchEnabled ? 'toggleOn' : ''}`}
            onClick={() => setSearchEnabled(!searchEnabled)}
          >
            <div className="toggleThumb" />
          </button>
        </div>
        <div style={s.hint}>
          启用后，AI 可以在对话中调用搜索引擎获取实时信息。需要至少启用一个搜索服务。
        </div>
      </div>

      {/* 服务列表 */}
      <div className="settingsCard">
        <div style={{ ...s.cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>搜索服务</span>
          <button type="button" className="btn btn-sm" onClick={addCustomService} style={{ gap: 4 }}>
            <Plus size={13} />
            自定义
          </button>
        </div>

        <div style={s.serviceGrid}>
          {services.map((svc) => {
            const iconFile = serviceIcons[svc.type]
            return (
              <button
                key={svc.id}
                type="button"
                className={`btn btn-ghost ${selectedId === svc.id ? 'segmentedItemActive' : ''}`}
                style={s.serviceItem}
                onClick={() => setSelectedId(selectedId === svc.id ? null : svc.id)}
              >
                {iconFile
                  ? <img src={`icons/${iconFile}`} alt="" style={{ width: 18, height: 18 }} />
                  : <Settings2 size={16} style={{ opacity: 0.5 }} />
                }
                <span style={{ flex: 1, textAlign: 'left' }}>{svc.name}</span>
                {svc.enabled && <Check size={14} style={{ color: 'var(--primary)' }} />}
              </button>
            )
          })}
        </div>
      </div>

      {/* 选中服务的详情 */}
      {selected && (
        <div className="settingsCard">
          <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings2 size={15} />
            {selected.name}
          </div>

          <div style={s.labeledRow}>
            <span style={s.rowLabel}>名称</span>
            <input
              className="input"
              style={{ width: 180 }}
              value={selected.name}
              onChange={(e) => updateService(selected.id, { name: e.target.value })}
            />
          </div>
          <div style={s.divider} />

          <div style={s.labeledRow}>
            <span style={s.rowLabel}>API Key</span>
            <input
              className="input"
              type="password"
              style={{ width: 240 }}
              placeholder="输入 API Key"
              value={selected.apiKey}
              onChange={(e) => updateService(selected.id, { apiKey: e.target.value })}
            />
          </div>

          {selected.type === 'custom' && (
            <>
              <div style={s.divider} />
              <div style={s.labeledRow}>
                <span style={s.rowLabel}>Base URL</span>
                <input
                  className="input"
                  style={{ width: 280 }}
                  placeholder="https://api.example.com/search"
                  value={selected.baseUrl ?? ''}
                  onChange={(e) => updateService(selected.id, { baseUrl: e.target.value })}
                />
              </div>
            </>
          )}

          <div style={s.divider} />

          <div style={s.labeledRow}>
            <span style={s.rowLabel}>启用</span>
            <button
              type="button"
              className={`toggle ${selected.enabled ? 'toggleOn' : ''}`}
              onClick={() => updateService(selected.id, { enabled: !selected.enabled })}
            >
              <div className="toggleThumb" />
            </button>
          </div>

          <div style={s.divider} />

          {/* 连接测试 */}
          <div style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={testing || !selected.apiKey}
              onClick={testConnection}
              style={{ gap: 4 }}
            >
              {testing ? <Loader size={13} className="spin" /> : <Wifi size={13} />}
              {testing ? '测试中...' : '测试连接'}
            </button>

            {testResult && (
              <span style={{ fontSize: 12, color: testResult.ok ? '#22c55e' : '#ef4444' }}>
                {testResult.msg}
              </span>
            )}
          </div>

          {selected.type === 'custom' && (
            <>
              <div style={s.divider} />
              <div style={{ padding: '8px 0' }}>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteService(selected.id)} style={{ gap: 4 }}>
                  <Trash2 size={13} />
                  删除此服务
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 说明 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>说明</div>
        <div style={s.hint}>
          <p>Tavily 和 Serper 是为 AI 优化的搜索 API，推荐使用。</p>
          <p>DuckDuckGo 不需要 API Key，但搜索质量可能有限。</p>
          <p>你也可以添加自定义搜索服务。</p>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { padding: 20, maxWidth: 640, margin: '0 auto' },
  header: { fontSize: 16, fontWeight: 700, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: 700, marginBottom: 10 },
  labeledRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0',
    gap: 12,
  },
  rowLabel: { fontSize: 14, flex: 1 },
  divider: { height: 1, background: 'var(--border)', margin: '4px 0', opacity: 0.5 },
  hint: { fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)', marginTop: 8 },
  serviceGrid: { display: 'flex', flexDirection: 'column' as const, gap: 3 },
  serviceItem: { justifyContent: 'flex-start', gap: 10, padding: '10px 12px' },
}
