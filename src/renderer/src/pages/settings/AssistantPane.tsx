import { useState } from 'react'
import { Plus, Trash2, Bot, Settings2, Image } from 'lucide-react'

interface Assistant {
  id: string
  name: string
  avatar: string
  systemPrompt: string
  isDefault: boolean
}

const defaultAssistants: Assistant[] = [
  {
    id: 'default',
    name: '默认助手',
    avatar: '🤖',
    systemPrompt: 'You are a helpful assistant.',
    isDefault: true
  }
]

export function AssistantPane() {
  const [assistants, setAssistants] = useState<Assistant[]>(defaultAssistants)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  function addAssistant() {
    const id = `assistant_${Date.now()}`
    const newAssistant: Assistant = {
      id,
      name: '新助手',
      avatar: '🤖',
      systemPrompt: '',
      isDefault: false
    }
    setAssistants((prev) => [...prev, newAssistant])
    setSelectedId(id)
  }

  function updateAssistant(id: string, patch: Partial<Assistant>) {
    setAssistants((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  function deleteAssistant(id: string) {
    setAssistants((prev) => prev.filter((a) => a.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function setDefault(id: string) {
    setAssistants((prev) =>
      prev.map((a) => ({
        ...a,
        isDefault: a.id === id
      }))
    )
  }

  const selectedAssistant = assistants.find((a) => a.id === selectedId)

  return (
    <div style={styles.root}>
      <div style={styles.header}>助手</div>
      <div style={styles.divider} />

      <div className="settingsCard">
        <div style={{ ...styles.cardTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>助手列表</span>
          <button type="button" className="btn" style={{ padding: '6px 10px' }} onClick={addAssistant}>
            <Plus size={14} />
            添加
          </button>
        </div>

        <div style={styles.assistantList}>
          {assistants.map((ast) => (
            <button
              key={ast.id}
              type="button"
              className={`btn btn-ghost ${selectedId === ast.id ? 'segmentedItemActive' : ''}`}
              style={styles.assistantItem}
              onClick={() => setSelectedId(ast.id)}
            >
              <span style={{ fontSize: 20 }}>{ast.avatar}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{ast.name}</span>
              {ast.isDefault && <span style={{ fontSize: 11, color: 'var(--primary)' }}>默认</span>}
            </button>
          ))}
        </div>
      </div>

      {selectedAssistant && (
        <div className="settingsCard">
          <div style={{ ...styles.cardTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings2 size={16} />
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
                placeholder="🤖"
              />
              <button type="button" className="btn" style={{ padding: '6px 10px' }}>
                <Image size={14} />
                选择图片
              </button>
            </div>
          </LabeledRow>

          <RowDivider />

          <div style={{ padding: '8px 4px' }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>系统提示词</div>
            <textarea
              className="input"
              style={{ width: '100%', height: 160, resize: 'vertical' }}
              value={selectedAssistant.systemPrompt}
              onChange={(e) => updateAssistant(selectedAssistant.id, { systemPrompt: e.target.value })}
              placeholder="输入系统提示词，用于定义助手的角色和行为..."
            />
          </div>

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

          {!selectedAssistant.isDefault && (
            <>
              <RowDivider />
              <div style={{ padding: '8px 4px' }}>
                <button type="button" className="btn btn-danger" onClick={() => deleteAssistant(selectedAssistant.id)}>
                  <Trash2 size={14} />
                  删除此助手
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="settingsCard">
        <div style={styles.cardTitle}>说明</div>
        <div style={styles.note}>
          <p>• 助手可以定义不同的角色和系统提示词。</p>
          <p>• 在对话中可以切换不同的助手。</p>
          <p>• 默认助手会在新建对话时自动使用。</p>
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
  assistantList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  assistantItem: {
    justifyContent: 'flex-start',
    gap: 10,
    padding: '10px 12px'
  }
}
