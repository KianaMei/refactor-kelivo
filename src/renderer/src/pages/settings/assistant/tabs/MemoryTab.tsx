import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Library, Check, X } from 'lucide-react'

import type { AssistantConfig, AssistantMemory } from '../../../../../../shared/types'
import { useDeleteConfirm } from '../../../../hooks/useDeleteConfirm'

export function MemoryTab(props: {
  assistant: AssistantConfig
  onPatch: (patch: Partial<AssistantConfig>) => void
  memories: AssistantMemory[]
  onSaveMemories: (nextAll: AssistantMemory[]) => Promise<void>
}) {
  const { assistant, onPatch, memories, onSaveMemories } = props
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const memoryDeleteConfirm = useDeleteConfirm()

  const list = useMemo(
    () => memories.filter((m) => m.assistantId === assistant.id),
    [assistant.id, memories]
  )

  useEffect(() => {
    if (selectedId == null) return
    if (!list.some((m) => m.id === selectedId)) setSelectedId(null)
  }, [list, selectedId])

  const selected = list.find((m) => m.id === selectedId) ?? null

  async function addMemory() {
    const maxId = memories.reduce((max, m) => Math.max(max, m.id), 0)
    const id = maxId + 1
    const next: AssistantMemory = { id, assistantId: assistant.id, content: '' }
    await onSaveMemories([...memories, next])
    setSelectedId(id)
  }

  async function updateMemory(id: number, patch: Partial<AssistantMemory>) {
    const next = memories.map((m) => (m.id === id ? { ...m, ...patch } : m))
    await onSaveMemories(next)
  }

  async function deleteMemory(id: number) {
    await onSaveMemories(memories.filter((m) => m.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div className="assistantBasicRoot">
      <div className="assistantTabCard">
        <div className="assistantTabCardTitleRow">
          <Library size={18} className="assistantTabCardIcon" />
          <div className="assistantTabCardTitle">记忆</div>
        </div>
        <div className="assistantTabCardDesc">
          记忆会在发送消息时自动注入到系统提示词中（仅对当前助手生效）。
        </div>

        <div className="assistantParamList">
          <div className="assistantToggleRow">
            <div className="assistantToggleRowLeft">
              <div className="assistantRowLabel">启用记忆</div>
            </div>
            <button
              type="button"
              className={`toggle ${assistant.enableMemory ? 'toggleOn' : ''}`}
              onClick={() => onPatch({ enableMemory: !assistant.enableMemory })}
            >
              <div className="toggleThumb" />
            </button>
          </div>

          <div className="assistantRowDivider" />

          <div className="assistantToggleRow">
            <div className="assistantToggleRowLeft">
              <div className="assistantRowLabel">引用最近对话标题</div>
            </div>
            <button
              type="button"
              className={`toggle ${assistant.enableRecentChatsReference ? 'toggleOn' : ''}`}
              onClick={() => onPatch({ enableRecentChatsReference: !assistant.enableRecentChatsReference })}
            >
              <div className="toggleThumb" />
            </button>
          </div>
        </div>
      </div>

      <div className="settingsCard">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Library size={16} />
            记忆记录
          </div>
          <button type="button" className="btn btn-sm" onClick={() => void addMemory()} style={{ gap: 4 }}>
            <Plus size={13} />
            添加
          </button>
        </div>

        <div style={{ height: 10 }} />

        {list.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.7, padding: '10px 0' }}>暂无记忆记录</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`btn btn-ghost ${selectedId === m.id ? 'segmentedItemActive' : ''}`}
                style={{ justifyContent: 'flex-start', padding: '10px 12px', textAlign: 'left' }}
                onClick={() => setSelectedId(selectedId === m.id ? null : m.id)}
              >
                <span style={{ fontSize: 12, opacity: 0.6, marginRight: 8 }}>#{m.id}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.content || '（空）'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="settingsCard" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>编辑记忆 #{selected.id}</div>

          <textarea
            className="input"
            style={{ width: '100%', height: 140, resize: 'vertical' }}
            value={selected.content}
            onChange={(e) => void updateMemory(selected.id, { content: e.target.value })}
            placeholder="输入记忆内容..."
          />

          <div style={{ height: 10 }} />

          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1 }} />
            {memoryDeleteConfirm.isConfirming(String(selected.id)) ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => memoryDeleteConfirm.confirmDelete(String(selected.id), () => void deleteMemory(selected.id))}
                  style={{ gap: 4 }}
                >
                  <Check size={13} />
                  确认
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => memoryDeleteConfirm.cancelConfirm()}
                  style={{ gap: 4 }}
                >
                  <X size={13} />
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => memoryDeleteConfirm.startConfirm(String(selected.id))}
                style={{ gap: 4 }}
              >
                <Trash2 size={13} />
                删除
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
