import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Star } from 'lucide-react'

import type { AppConfig, AssistantConfig } from '../../../../../shared/types'
import { createDefaultAssistantConfig } from '../../../../../shared/types'
import type { AssistantUpdateInput, DbAssistant } from '../../../../../shared/db-types'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'
import { useConfirm } from '../../../hooks/useConfirm'
import { AssistantAvatar } from './AssistantAvatar'
import { AssistantEditorDialog } from './AssistantEditorDialog'
import { safeUuid } from '../../../../../shared/utils'

export function AssistantPane(props: { config: AppConfig; onSave: (next: AppConfig) => Promise<void> }) {
  const { config, onSave } = props
  const confirm = useConfirm()

  const [assistantList, setAssistantList] = useState<DbAssistant[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [tempOrder, setTempOrder] = useState<string[] | null>(null)

  const [addDialog, setAddDialog] = useState<{ open: boolean; name: string }>({ open: false, name: '' })
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null })

  const providers = useMemo(() => {
    const map = config.providerConfigs
    const order = config.providersOrder
    const list = order.map((k) => map[k]).filter(Boolean)
    for (const [k, v] of Object.entries(map)) {
      if (!order.includes(k)) list.push(v)
    }
    return list.filter((p) => p.enabled)
  }, [config.providerConfigs, config.providersOrder])

  const reloadAssistants = useCallback(async () => {
    const list = await window.api.db.assistants.list()
    setAssistantList(list)
    return list
  }, [])

  useEffect(() => {
    void reloadAssistants().catch((err) => console.error('[AssistantPane] load assistants failed:', err))
  }, [reloadAssistants])

  const assistants = useMemo(() => {
    const order = tempOrder ?? assistantList.map((a) => a.id)
    const map = new Map(assistantList.map((a) => [a.id, a]))
    const sorted = order.map((id) => map.get(id)).filter(Boolean) as DbAssistant[]
    for (const ast of assistantList) {
      if (!sorted.some((x) => x.id === ast.id)) sorted.push(ast)
    }
    return sorted
  }, [assistantList, tempOrder])

  useEffect(() => {
    if (!editingId) return
    if (!assistantList.some((a) => a.id === editingId)) setEditingId(null)
  }, [assistantList, editingId])

  const editingAssistant: AssistantConfig | null = editingId
    ? (assistantList.find((a) => a.id === editingId) ?? null)
    : null

  const handleDragStart = useCallback(
    (id: string, e: React.DragEvent) => {
      setDraggedId(id)
      setTempOrder(assistantList.map((a) => a.id))
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    },
    [assistantList]
  )

  const handleDragOver = useCallback(
    (id: string, e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (!draggedId || id === draggedId || !tempOrder) return

      const sourceIndex = tempOrder.indexOf(draggedId)
      const targetIndex = tempOrder.indexOf(id)
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return

      const next = [...tempOrder]
      next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, draggedId)
      setTempOrder(next)
      setDragOverId(id)
    },
    [draggedId, tempOrder]
  )

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
    setDragOverId(null)
    setTempOrder(null)
  }, [])

  const handleDrop = useCallback(
    async (_targetId: string, e: React.DragEvent) => {
      e.preventDefault()
      if (!draggedId || !tempOrder) {
        handleDragEnd()
        return
      }
      const next = await window.api.db.assistants.reorder(tempOrder)
      setAssistantList(next)
      handleDragEnd()
    },
    [draggedId, handleDragEnd, tempOrder]
  )

  async function addAssistant(name: string) {
    const id = safeUuid()
    const now = new Date().toISOString()
    const newAssistant = createDefaultAssistantConfig(id, name, { temperature: 0.6, topP: 1.0, createdAt: now, updatedAt: now })
    await window.api.db.assistants.create({
      ...newAssistant,
      sortIndex: 0
    })
    const next = await window.api.db.assistants.reorder([id, ...assistants.map((a) => a.id)])
    setAssistantList(next)
  }

  async function updateAssistant(id: string, patch: AssistantUpdateInput) {
    await window.api.db.assistants.update(id, patch)
    await reloadAssistants()
  }

  async function setDefault(id: string) {
    await window.api.db.assistants.setDefault(id)
    await reloadAssistants()
  }

  function requestDelete(id: string) {
    setDeleteDialog({ open: true, id })
  }

  async function deleteAssistant(id: string) {
    const current = assistantList.find((a) => a.id === id)
    if (!current) return
    if (assistantList.length <= 1) {
      await confirm({
        title: '无法删除',
        message: '至少保留一个助手。',
        confirmText: '知道了'
      })
      return
    }

    try {
      await window.api.avatar.delete(`assistant_${id}`)
    } catch {}
    try {
      await window.api.avatar.delete(`assistantBg_${id}`)
    } catch {}

    await window.api.db.assistants.delete(id)

    // 同步清理：助手专属快捷短语 / 记忆（快捷短语仍在 config）
    const nextQuickPhrases = (config.quickPhrases ?? []).filter((p) => p.isGlobal || p.assistantId !== id)
    const nextMemories = (config.assistantMemories ?? []).filter((m) => m.assistantId !== id)

    await onSave({
      ...config,
      quickPhrases: nextQuickPhrases,
      assistantMemories: nextMemories
    })

    await window.api.db.memories.deleteByAssistant(id)
    await reloadAssistants()
    if (editingId === id) setEditingId(null)
  }

  return (
    <div style={styles.root}>
      {/* 页面头部 */}
      <div style={styles.headerRow}>
        <div style={styles.header}>助手</div>
        <button
          type="button"
          style={styles.addBtn}
          onClick={() => setAddDialog({ open: true, name: '' })}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary-bg)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <Plus className="h-4 w-4" />
          <span>新建助手</span>
        </button>
      </div>

      {/* 卡片网格 */}
      <div style={styles.grid}>
        {assistants.map((ast) => {
          const dragOver = dragOverId === ast.id
          const dragging = draggedId === ast.id
          const promptPreview = (ast.systemPrompt ?? '').trim()

          return (
            <div
              key={ast.id}
              draggable
              onDragStart={(e) => handleDragStart(ast.id, e)}
              onDragOver={(e) => handleDragOver(ast.id, e)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => void handleDrop(ast.id, e)}
              className={cn(
                'group relative',
                'rounded-xl border bg-card p-3',
                'transition-all duration-150',
                'hover:bg-accent/50 hover:border-primary/30',
                'cursor-pointer',
                dragOver ? 'border-primary' : 'border-border',
                ast.isDefault && 'border-primary/50 bg-primary/5'
              )}
              style={{ opacity: dragging ? 0.5 : 1 }}
              onClick={() => setEditingId(ast.id)}
            >
              {/* 头像和删除按钮 */}
              <div className="flex items-start justify-between mb-2">
                <AssistantAvatar assistant={ast} className="h-11 w-11" size={44} />
                {ast.deletable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      requestDelete(ast.id)
                    }}
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {/* 名称 */}
              <div className="flex items-center gap-1.5 mb-1">
                <div className="text-sm font-medium truncate">{ast.name}</div>
                {ast.isDefault && <Star className="h-3 w-3 text-primary shrink-0" fill="currentColor" />}
              </div>

              {/* 标签 */}
              {!ast.deletable && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 mb-1">
                  内置
                </Badge>
              )}

              {/* 提示词预览 */}
              <div className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {promptPreview || <span className="italic opacity-50">无提示词</span>}
              </div>
            </div>
          )
        })}
      </div>

      <AssistantEditorDialog
        open={!!editingAssistant}
        assistant={editingAssistant}
        providers={providers}
        quickPhrases={config.quickPhrases ?? []}
        assistantMemories={config.assistantMemories ?? []}
        mcpServers={config.mcpServers ?? []}
        onPatch={(patch) => editingAssistant && void updateAssistant(editingAssistant.id, patch)}
        onSetDefault={() => editingAssistant && void setDefault(editingAssistant.id)}
        onDuplicate={() => {}}
        onDelete={() => editingAssistant && requestDelete(editingAssistant.id)}
        onSaveQuickPhrases={async (nextAll) => onSave({ ...config, quickPhrases: nextAll })}
        onSaveAssistantMemories={async (nextAll) => onSave({ ...config, assistantMemories: nextAll })}
        onClose={() => setEditingId(null)}
      />

      {/* 添加助手对话框 */}
      <Dialog
        open={addDialog.open}
        onOpenChange={(v) => {
          if (v) return
          setAddDialog({ open: false, name: '' })
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>新建助手</DialogTitle>
            <DialogDescription>输入助手名称</DialogDescription>
          </DialogHeader>
          <Input
            value={addDialog.name}
            onChange={(e) => setAddDialog((d) => ({ ...d, name: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const name = addDialog.name.trim()
                if (!name) return
                void addAssistant(name).then(() => setAddDialog({ open: false, name: '' }))
              }
            }}
            placeholder="如：代码助手、写作助手..."
            autoFocus
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setAddDialog({ open: false, name: '' })}>
              取消
            </Button>
            <Button
              disabled={!addDialog.name.trim()}
              onClick={() => {
                const name = addDialog.name.trim()
                if (!name) return
                void addAssistant(name).then(() => setAddDialog({ open: false, name: '' }))
              }}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog
        open={deleteDialog.open}
        onOpenChange={(v) => {
          if (v) return
          setDeleteDialog({ open: false, id: null })
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>删除助手</DialogTitle>
            <DialogDescription>确认删除？关联的快捷短语和记忆也将被清除。</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, id: null })}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const id = deleteDialog.id
                if (!id) return
                setDeleteDialog({ open: false, id: null })
                void deleteAssistant(id)
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ========== 样式 ==========
const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: '16px 16px 32px',
    maxWidth: 960,
    margin: '0 auto'
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  header: {
    fontSize: 16,
    fontWeight: 700
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: 'var(--primary)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.15s'
  },
  divider: {
    height: 1,
    background: 'var(--border)',
    marginBottom: 16
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12
  }
}
