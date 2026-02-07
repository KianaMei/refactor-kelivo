import { useState } from 'react'
import { Play, Square, Volume2, Plus, Trash2, Settings2, Check, X } from 'lucide-react'
import { useDeleteConfirm } from '../../hooks/useDeleteConfirm'
import { CustomSelect } from '../../components/ui/CustomSelect'

interface TtsService {
  id: string
  name: string
  type: 'azure' | 'openai' | 'edge' | 'custom'
  apiKey: string
  baseUrl?: string
  voice: string
  rate: number   // 0.5-2.0
  pitch: number  // 0.5-2.0
  enabled: boolean
}

const defaultServices: TtsService[] = [
  { id: 'edge', name: 'Edge TTS', type: 'edge', apiKey: '', voice: 'zh-CN-XiaoxiaoNeural', rate: 1.0, pitch: 1.0, enabled: true },
  { id: 'openai', name: 'OpenAI TTS', type: 'openai', apiKey: '', voice: 'alloy', rate: 1.0, pitch: 1.0, enabled: false },
]

const voiceOptions: Record<string, Array<{ value: string; label: string }>> = {
  edge: [
    { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓 (女)' },
    { value: 'zh-CN-YunxiNeural', label: '云希 (男)' },
    { value: 'zh-CN-YunyangNeural', label: '云扬 (男, 新闻)' },
    { value: 'en-US-JennyNeural', label: 'Jenny (Female)' },
    { value: 'en-US-GuyNeural', label: 'Guy (Male)' },
  ],
  openai: [
    { value: 'alloy', label: 'Alloy' },
    { value: 'echo', label: 'Echo' },
    { value: 'fable', label: 'Fable' },
    { value: 'onyx', label: 'Onyx' },
    { value: 'nova', label: 'Nova' },
    { value: 'shimmer', label: 'Shimmer' },
  ],
  azure: [
    { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓 (女)' },
    { value: 'zh-CN-YunxiNeural', label: '云希 (男)' },
    { value: 'en-US-JennyNeural', label: 'Jenny (Female)' },
  ],
  custom: [],
}

export function TtsPane() {
  const [services, setServices] = useState<TtsService[]>(defaultServices)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [testText, setTestText] = useState('你好，这是语音合成测试。Hello, this is a TTS test.')
  const ttsDeleteConfirm = useDeleteConfirm()
  const [playing, setPlaying] = useState(false)

  function updateService(id: string, patch: Partial<TtsService>) {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function setAsDefault(id: string) {
    setServices((prev) =>
      prev.map((s) => ({ ...s, enabled: s.id === id }))
    )
  }

  function addCustomService() {
    const id = `tts_${Date.now()}`
    setServices((prev) => [
      ...prev,
      { id, name: '自定义 TTS', type: 'custom' as const, apiKey: '', voice: '', rate: 1.0, pitch: 1.0, enabled: false },
    ])
    setSelectedId(id)
  }

  function deleteService(id: string) {
    setServices((prev) => prev.filter((s) => s.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  async function testPlay() {
    setPlaying(true)
    await new Promise((r) => setTimeout(r, 2000))
    setPlaying(false)
  }

  function stopPlay() {
    setPlaying(false)
  }

  const selected = services.find((s) => s.id === selectedId)
  const voices = selected ? (voiceOptions[selected.type] ?? []) : []

  return (
    <div style={s.root}>
      <div style={s.header}>语音合成</div>

      {/* 服务列表 */}
      <div className="settingsCard">
        <div style={{ ...s.cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>语音服务</span>
          <button type="button" className="btn btn-sm" onClick={addCustomService} style={{ gap: 4 }}>
            <Plus size={13} />
            添加
          </button>
        </div>

        <div style={s.serviceGrid}>
          {services.map((svc) => (
            <button
              key={svc.id}
              type="button"
              className={`btn btn-ghost ${selectedId === svc.id ? 'segmentedItemActive' : ''}`}
              style={s.serviceItem}
              onClick={() => setSelectedId(selectedId === svc.id ? null : svc.id)}
            >
              <Volume2 size={16} />
              <span style={{ flex: 1, textAlign: 'left' }}>{svc.name}</span>
              {svc.enabled && (
                <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>默认</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 服务配置 */}
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

          {selected.type !== 'edge' && (
            <>
              <div style={s.labeledRow}>
                <span style={s.rowLabel}>API Key</span>
                <input
                  className="input"
                  type="password"
                  style={{ width: 220 }}
                  placeholder="输入 API Key"
                  value={selected.apiKey}
                  onChange={(e) => updateService(selected.id, { apiKey: e.target.value })}
                />
              </div>
              <div style={s.divider} />
            </>
          )}

          {/* 语音选择 */}
          <div style={s.labeledRow}>
            <span style={s.rowLabel}>语音</span>
            <CustomSelect
              value={selected.voice}
              onChange={(val) => updateService(selected.id, { voice: val })}
              options={[
                ...voices.map((v) => ({ value: v.value, label: v.label })),
                ...(selected.type === 'custom' ? [{ value: selected.voice || 'custom', label: selected.voice || '自定义语音' }] : [])
              ]}
              className="select"
              width={200}
            />
          </div>
          <div style={s.divider} />

          {/* 语速滑块 */}
          <div style={s.labeledRow}>
            <span style={s.rowLabel}>语速</span>
            <div style={s.sliderWrap}>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={selected.rate}
                onChange={(e) => updateService(selected.id, { rate: Number(e.target.value) })}
                style={{ width: 120 }}
              />
              <span style={s.sliderValue}>{selected.rate.toFixed(1)}x</span>
            </div>
          </div>
          <div style={s.divider} />

          {/* 音调滑块 */}
          <div style={s.labeledRow}>
            <span style={s.rowLabel}>音调</span>
            <div style={s.sliderWrap}>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={selected.pitch}
                onChange={(e) => updateService(selected.id, { pitch: Number(e.target.value) })}
                style={{ width: 120 }}
              />
              <span style={s.sliderValue}>{selected.pitch.toFixed(1)}</span>
            </div>
          </div>
          <div style={s.divider} />

          {/* 设为默认 */}
          <div style={s.labeledRow}>
            <span style={s.rowLabel}>设为默认</span>
            <button
              type="button"
              className={`toggle ${selected.enabled ? 'toggleOn' : ''}`}
              onClick={() => setAsDefault(selected.id)}
            >
              <div className="toggleThumb" />
            </button>
          </div>

          {selected.type === 'custom' && (
            <>
              <div style={s.divider} />
              <div style={{ padding: '8px 0' }}>
                {ttsDeleteConfirm.isConfirming(selected.id) ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => ttsDeleteConfirm.confirmDelete(selected.id, () => deleteService(selected.id))} style={{ gap: 4 }}>
                      <Check size={13} />
                      确认删除
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => ttsDeleteConfirm.cancelConfirm()} style={{ gap: 4 }}>
                      <X size={13} />
                      取消
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => ttsDeleteConfirm.startConfirm(selected.id)} style={{ gap: 4 }}>
                    <Trash2 size={13} />
                    删除此服务
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 试听 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>试听</div>
        <div style={s.labeledRow}>
          <span style={s.rowLabel}>测试文本</span>
          <input
            className="input"
            style={{ width: 280 }}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
          />
        </div>
        <div style={s.divider} />
        <div style={{ padding: '8px 0', display: 'flex', gap: 8 }}>
          {!playing ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={testPlay} style={{ gap: 4 }}>
              <Play size={13} />
              播放
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-danger" onClick={stopPlay} style={{ gap: 4 }}>
              <Square size={13} />
              停止
            </button>
          )}
        </div>
      </div>

      {/* 说明 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>说明</div>
        <div style={s.hint}>
          <p>TTS (文字转语音) 可朗读 AI 回复内容。</p>
          <p>Edge TTS 免费使用，无需 API Key，推荐国内用户使用。</p>
          <p>OpenAI TTS 音质更好，需配置 API Key。</p>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { padding: '16px 16px 32px', maxWidth: 960, margin: '0 auto' },
  header: { fontSize: 16, fontWeight: 700, marginBottom: 8 },
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
  sliderWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  sliderValue: { fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: 'right' as const },
}
