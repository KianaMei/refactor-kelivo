import { useState } from 'react'
import { Play, Volume2, Plus, Trash2, Settings2 } from 'lucide-react'

interface TtsService {
  id: string
  name: string
  type: 'azure' | 'openai' | 'edge' | 'custom'
  apiKey: string
  baseUrl?: string
  voice: string
  enabled: boolean
}

const defaultServices: TtsService[] = [
  { id: 'edge', name: 'Edge TTS', type: 'edge', apiKey: '', voice: 'zh-CN-XiaoxiaoNeural', enabled: true },
  { id: 'openai', name: 'OpenAI TTS', type: 'openai', apiKey: '', voice: 'alloy', enabled: false }
]

const voiceOptions: Record<string, string[]> = {
  edge: ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural', 'zh-CN-YunyangNeural', 'en-US-JennyNeural', 'en-US-GuyNeural'],
  openai: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
  azure: ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural', 'en-US-JennyNeural'],
  custom: []
}

export function TtsPane() {
  const [services, setServices] = useState<TtsService[]>(defaultServices)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [testText, setTestText] = useState('你好，这是语音合成测试。')
  const [playing, setPlaying] = useState(false)

  function updateService(id: string, patch: Partial<TtsService>) {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function addCustomService() {
    const id = `tts_${Date.now()}`
    setServices((prev) => [
      ...prev,
      { id, name: '自定义服务', type: 'custom', apiKey: '', voice: '', enabled: false }
    ])
    setSelectedId(id)
  }

  function deleteService(id: string) {
    setServices((prev) => prev.filter((s) => s.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  async function testTts() {
    setPlaying(true)
    // TODO: 通过 IPC 调用主进程播放 TTS
    await new Promise((r) => setTimeout(r, 2000))
    setPlaying(false)
  }

  const selectedService = services.find((s) => s.id === selectedId)

  return (
    <div style={styles.root}>
      <div style={styles.header}>TTS</div>
      <div style={styles.divider} />

      <div className="settingsCard">
        <div style={{ ...styles.cardTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>语音服务</span>
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
              <Volume2 size={16} />
              <span style={{ flex: 1, textAlign: 'left' }}>{svc.name}</span>
              {svc.enabled && <span style={{ fontSize: 11, color: 'var(--primary)' }}>默认</span>}
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

          {selectedService.type !== 'edge' && (
            <>
              <LabeledRow label="API Key">
                <input
                  className="input"
                  type="password"
                  style={{ width: 220 }}
                  placeholder="输入 API Key"
                  value={selectedService.apiKey}
                  onChange={(e) => updateService(selectedService.id, { apiKey: e.target.value })}
                />
              </LabeledRow>
              <RowDivider />
            </>
          )}

          <LabeledRow label="语音">
            <select
              className="select"
              style={{ width: 200 }}
              value={selectedService.voice}
              onChange={(e) => updateService(selectedService.id, { voice: e.target.value })}
            >
              {(voiceOptions[selectedService.type] || []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
              {selectedService.type === 'custom' && (
                <option value={selectedService.voice}>{selectedService.voice || '自定义语音'}</option>
              )}
            </select>
          </LabeledRow>

          <RowDivider />

          <LabeledRow label="设为默认">
            <button
              type="button"
              className={`toggle ${selectedService.enabled ? 'toggleOn' : ''}`}
              onClick={() => {
                // 只允许一个服务为默认
                setServices((prev) =>
                  prev.map((s) => ({
                    ...s,
                    enabled: s.id === selectedService.id ? !s.enabled : false
                  }))
                )
              }}
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
        <div style={styles.cardTitle}>测试</div>
        <LabeledRow label="测试文本">
          <input
            className="input"
            style={{ width: 280 }}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
          />
        </LabeledRow>
        <RowDivider />
        <div style={{ padding: '8px 4px' }}>
          <button type="button" className="btn btn-primary" onClick={testTts} disabled={playing}>
            <Play size={14} />
            {playing ? '播放中...' : '播放测试'}
          </button>
        </div>
      </div>

      <div className="settingsCard">
        <div style={styles.cardTitle}>说明</div>
        <div style={styles.note}>
          <p>• TTS（文字转语音）可朗读 AI 回复内容。</p>
          <p>• Edge TTS 免费使用，无需 API Key。</p>
          <p>• OpenAI TTS 需要配置 API Key。</p>
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
