import { useState } from 'react'
import { Plus, Trash2, GripVertical, Zap } from 'lucide-react'

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
  { id: '5', title: '总结', content: '请总结以上内容' }
]

export function QuickPhrasesPane() {
  const [phrases, setPhrases] = useState<QuickPhrase[]>(defaultPhrases)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  function addPhrase() {
    const id = `phrase_${Date.now()}`
    const newPhrase: QuickPhrase = {
      id,
      title: '新短语',
      content: ''
    }
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

  const selectedPhrase = phrases.find((p) => p.id === selectedId)

  return (
    <div style={styles.root}>
      <div style={styles.header}>快捷短语</div>
      <div style={styles.divider} />

      <div className="settingsCard">
        <div style={{ ...styles.cardTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>短语列表</span>
          <button type="button" className="btn" style={{ padding: '6px 10px' }} onClick={addPhrase}>
            <Plus size={14} />
            添加
          </button>
        </div>

        {phrases.length === 0 ? (
          <div style={styles.empty}>
            <Zap size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
            <div>暂无快捷短语</div>
          </div>
        ) : (
          <div style={styles.phraseList}>
            {phrases.map((phrase) => (
              <button
                key={phrase.id}
                type="button"
                className={`btn btn-ghost ${selectedId === phrase.id ? 'segmentedItemActive' : ''}`}
                style={styles.phraseItem}
                onClick={() => setSelectedId(phrase.id)}
              >
                <GripVertical size={14} style={{ opacity: 0.4 }} />
                <span style={{ flex: 1, textAlign: 'left' }}>{phrase.title}</span>
                <span style={{ fontSize: 12, opacity: 0.5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {phrase.content}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedPhrase && (
        <div className="settingsCard">
          <div style={styles.cardTitle}>编辑短语</div>

          <LabeledRow label="标题">
            <input
              className="input"
              style={{ width: 200 }}
              value={selectedPhrase.title}
              onChange={(e) => updatePhrase(selectedPhrase.id, { title: e.target.value })}
            />
          </LabeledRow>

          <RowDivider />

          <div style={{ padding: '8px 4px' }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>内容</div>
            <textarea
              className="input"
              style={{ width: '100%', height: 120, resize: 'vertical' }}
              value={selectedPhrase.content}
              onChange={(e) => updatePhrase(selectedPhrase.id, { content: e.target.value })}
              placeholder="输入快捷短语内容..."
            />
          </div>

          <RowDivider />

          <div style={{ padding: '8px 4px' }}>
            <button type="button" className="btn btn-danger" onClick={() => deletePhrase(selectedPhrase.id)}>
              <Trash2 size={14} />
              删除此短语
            </button>
          </div>
        </div>
      )}

      <div className="settingsCard">
        <div style={styles.cardTitle}>说明</div>
        <div style={styles.note}>
          <p>• 快捷短语可在对话输入框快速插入常用内容。</p>
          <p>• 拖动左侧手柄可调整顺序。</p>
          <p>• 支持多行文本和变量（后续版本）。</p>
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
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    opacity: 0.7
  },
  phraseList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  phraseItem: {
    justifyContent: 'flex-start',
    gap: 10,
    padding: '10px 12px'
  }
}
