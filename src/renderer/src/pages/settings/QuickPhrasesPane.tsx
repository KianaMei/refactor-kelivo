import { useState } from 'react'
import { Plus, Trash2, GripVertical, Zap, ChevronUp, ChevronDown } from 'lucide-react'

interface QuickPhrase {
  id: string
  title: string
  content: string
}

const defaultPhrases: QuickPhrase[] = [
  { id: '1', title: '继续', content: '请继续' },
  { id: '2', title: '解释', content: '请详细解释一下' },
  { id: '3', title: '简化', content: '请用更简单的语言解释' },
  { id: '4', title: '代码', content: '请给出代码示例' },
  { id: '5', title: '总结', content: '请总结以上内容' },
]

export function QuickPhrasesPane() {
  const [phrases, setPhrases] = useState<QuickPhrase[]>(defaultPhrases)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  function addPhrase() {
    const id = `phrase_${Date.now()}`
    const newPhrase: QuickPhrase = { id, title: '新短语', content: '' }
    setPhrases((prev) => [...prev, newPhrase])
    setSelectedId(id)
  }

  function updatePhrase(id: string, patch: Partial<QuickPhrase>) {
    setPhrases((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  function deletePhrase(id: string) {
    setPhrases((prev) => prev.filter((p) => p.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function movePhrase(id: string, dir: -1 | 1) {
    setPhrases((prev) => {
      const idx = prev.findIndex((p) => p.id === id)
      if (idx < 0) return prev
      const target = idx + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const temp = next[idx]
      next[idx] = next[target]
      next[target] = temp
      return next
    })
  }

  const selected = phrases.find((p) => p.id === selectedId)

  return (
    <div style={s.root}>
      <div style={s.header}>快捷短语</div>

      {/* 短语列表 */}
      <div className="settingsCard">
        <div style={{ ...s.cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>短语列表</span>
          <button type="button" className="btn btn-sm" onClick={addPhrase} style={{ gap: 4 }}>
            <Plus size={13} />
            添加
          </button>
        </div>

        {phrases.length === 0 ? (
          <div style={s.empty}>
            <Zap size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div style={{ fontSize: 13 }}>暂无快捷短语</div>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>点击"添加"按钮创建</div>
          </div>
        ) : (
          <div style={s.phraseList}>
            {phrases.map((phrase) => (
              <button
                key={phrase.id}
                type="button"
                className={`btn btn-ghost ${selectedId === phrase.id ? 'segmentedItemActive' : ''}`}
                style={s.phraseItem}
                onClick={() => setSelectedId(selectedId === phrase.id ? null : phrase.id)}
              >
                <GripVertical size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: 'left', fontWeight: 500 }}>{phrase.title}</span>
                <span style={s.phrasePreview}>{phrase.content}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 编辑区域 */}
      {selected && (
        <div className="settingsCard">
          <div style={s.cardTitle}>编辑短语</div>

          <div style={s.labeledRow}>
            <span style={s.rowLabel}>标题</span>
            <input
              className="input"
              style={{ width: 200 }}
              value={selected.title}
              onChange={(e) => updatePhrase(selected.id, { title: e.target.value })}
            />
          </div>
          <div style={s.divider} />

          <div style={{ padding: '8px 0' }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>内容</div>
            <textarea
              className="input"
              style={{ width: '100%', height: 120, resize: 'vertical' }}
              value={selected.content}
              onChange={(e) => updatePhrase(selected.id, { content: e.target.value })}
              placeholder="输入快捷短语内容..."
            />
          </div>
          <div style={s.divider} />

          <div style={{ padding: '8px 0', display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => movePhrase(selected.id, -1)}
              disabled={phrases.findIndex((p) => p.id === selected.id) === 0}
              style={{ gap: 4 }}
            >
              <ChevronUp size={13} />
              上移
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => movePhrase(selected.id, 1)}
              disabled={phrases.findIndex((p) => p.id === selected.id) === phrases.length - 1}
              style={{ gap: 4 }}
            >
              <ChevronDown size={13} />
              下移
            </button>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => deletePhrase(selected.id)}
              style={{ gap: 4 }}
            >
              <Trash2 size={13} />
              删除
            </button>
          </div>
        </div>
      )}

      {/* 说明 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>说明</div>
        <div style={s.hint}>
          <p>快捷短语可在对话输入框快速插入常用内容。</p>
          <p>使用上移/下移按钮可调整顺序。</p>
          <p>支持多行文本和变量（后续版本）。</p>
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
  empty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '32px 20px',
    color: 'var(--text-secondary)',
  },
  phraseList: { display: 'flex', flexDirection: 'column' as const, gap: 3 },
  phraseItem: { justifyContent: 'flex-start', gap: 10, padding: '10px 12px' },
  phrasePreview: {
    fontSize: 12,
    opacity: 0.5,
    maxWidth: 200,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
}
