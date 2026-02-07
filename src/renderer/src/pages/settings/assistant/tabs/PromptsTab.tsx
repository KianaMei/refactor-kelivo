import { useMemo, useState } from 'react'
import { Bot, Plus, Settings2, Trash2, User } from 'lucide-react'

import type { AssistantConfig, AssistantPresetMessage, AssistantPresetRole } from '../../../../../../shared/types'

function safeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function PromptsTab(props: {
  assistant: AssistantConfig
  onPatch: (patch: Partial<AssistantConfig>) => void
}) {
  const { assistant, onPatch } = props

  const [editing, setEditing] = useState<{ open: boolean; id: string | null; role: AssistantPresetRole; content: string }>({
    open: false,
    id: null,
    role: 'user',
    content: ''
  })

  const preset = assistant.presetMessages ?? []

  const canSaveEdit = useMemo(() => editing.content.trim().length > 0, [editing.content])

  const openAdd = (role: AssistantPresetRole) => {
    setEditing({ open: true, id: null, role, content: '' })
  }

  const openEdit = (m: AssistantPresetMessage) => {
    setEditing({ open: true, id: m.id, role: m.role, content: m.content })
  }

  const saveEdit = () => {
    if (!canSaveEdit) return
    const next = [...preset]
    if (editing.id) {
      const idx = next.findIndex((x) => x.id === editing.id)
      if (idx >= 0) next[idx] = { ...next[idx], role: editing.role, content: editing.content }
    } else {
      next.push({ id: safeId('preset'), role: editing.role, content: editing.content })
    }
    onPatch({ presetMessages: next })
    setEditing({ open: false, id: null, role: 'user', content: '' })
  }

  const removePreset = (id: string) => {
    onPatch({ presetMessages: preset.filter((x) => x.id !== id) })
  }

  const movePreset = (id: string, dir: -1 | 1) => {
    const idx = preset.findIndex((x) => x.id === id)
    if (idx < 0) return
    const to = idx + dir
    if (to < 0 || to >= preset.length) return
    const next = [...preset]
    const tmp = next[idx]
    next[idx] = next[to]
    next[to] = tmp
    onPatch({ presetMessages: next })
  }

  return (
    <div className="assistantBasicRoot">
      <div className="assistantTabCard">
        <div className="assistantTabCardTitleRow">
          <Settings2 size={18} className="assistantTabCardIcon" />
          <div className="assistantTabCardTitle">系统提示词</div>
        </div>
        <div className="assistantTabCardDesc">用于定义助手的角色与行为；会在每次对话时注入</div>
        <textarea
          className="input"
          style={{ width: '100%', height: 160, resize: 'vertical' }}
          value={assistant.systemPrompt}
          onChange={(e) => onPatch({ systemPrompt: e.target.value })}
          placeholder="输入系统提示词，用于定义助手的角色和行为..."
        />
      </div>

      <div className="assistantTabCard">
        <div className="assistantTabCardTitleRow">
          <User size={18} className="assistantTabCardIcon" />
          <div className="assistantTabCardTitle">用户消息模板</div>
        </div>
        <div className="assistantTabCardDesc">建议包含 <code>{'{{ message }}'}</code> 占位符，用于注入用户输入</div>
        <input
          className="input"
          style={{ width: '100%' }}
          value={assistant.messageTemplate}
          onChange={(e) => onPatch({ messageTemplate: e.target.value })}
          placeholder="{{ message }}"
        />
      </div>

      <div className="assistantTabCard">
        <div className="assistantTabCardTitleRow" style={{ marginBottom: 10 }}>
          <Settings2 size={18} className="assistantTabCardIcon" />
          <div className="assistantTabCardTitle">预置对话</div>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => openAdd('user')} style={{ gap: 6 }}>
            <Plus size={14} />
            <User size={14} />
            添加用户
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => openAdd('assistant')} style={{ gap: 6 }}>
            <Plus size={14} />
            <Bot size={14} />
            添加助手
          </button>
        </div>
        <div className="assistantTabCardDesc">新建对话时会自动插入这些消息（按顺序）</div>

        {preset.length === 0 ? (
          <div style={{ padding: 12, opacity: 0.7 }}>暂无预置消息</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {preset.map((m, idx) => (
              <div key={m.id} className="assistantItemCard">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {m.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
                  <div style={{ fontWeight: 700, fontSize: 13, opacity: 0.9 }}>
                    {m.role === 'assistant' ? '助手' : '用户'} · {idx + 1}/{preset.length}
                  </div>
                  <div style={{ flex: 1 }} />
                  <button type="button" className="btn btn-sm btn-ghost" disabled={idx === 0} onClick={() => movePreset(m.id, -1)}>上移</button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={idx === preset.length - 1} onClick={() => movePreset(m.id, 1)}>下移</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => openEdit(m)}>编辑</button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => removePreset(m.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 13, opacity: 0.85 }}>
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing.open && (
        <div className="modalOverlay" onMouseDown={() => setEditing({ open: false, id: null, role: 'user', content: '' })}>
          <div className="modalSurface frosted" style={{ width: 560, padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>{editing.id ? '编辑预置消息' : '添加预置消息'}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                className={`seg-btn ${editing.role === 'user' ? 'active' : ''}`}
                onClick={() => setEditing((s) => ({ ...s, role: 'user' }))}
              >
                用户
              </button>
              <button
                type="button"
                className={`seg-btn ${editing.role === 'assistant' ? 'active' : ''}`}
                onClick={() => setEditing((s) => ({ ...s, role: 'assistant' }))}
              >
                助手
              </button>
            </div>
            <textarea
              className="input"
              style={{ width: '100%', height: 180, resize: 'vertical' }}
              value={editing.content}
              onChange={(e) => setEditing((s) => ({ ...s, content: e.target.value }))}
              placeholder="输入预置消息内容..."
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setEditing({ open: false, id: null, role: 'user', content: '' })}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={!canSaveEdit}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
