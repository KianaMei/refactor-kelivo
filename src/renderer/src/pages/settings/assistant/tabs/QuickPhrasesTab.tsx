import { useMemo, useState } from 'react'
import { Plus, Trash2, MessageSquare, ChevronRight } from 'lucide-react'

import type { QuickPhrase } from '../../../../../../shared/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { safeUuid } from '../../../../../../shared/utils'

interface Props {
  assistantId: string
  quickPhrases: QuickPhrase[]
  onSaveQuickPhrases: (nextAll: QuickPhrase[]) => Promise<void>
}

export function QuickPhrasesTab({ assistantId, quickPhrases, onSaveQuickPhrases }: Props) {
  const phrases = useMemo(
    () => quickPhrases.filter((p) => !p.isGlobal && p.assistantId === assistantId),
    [quickPhrases, assistantId]
  )

  const [editingPhrase, setEditingPhrase] = useState<QuickPhrase | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')

  function openAddDialog() {
    setEditTitle('')
    setEditContent('')
    setIsAddDialogOpen(true)
  }

  function openEditDialog(phrase: QuickPhrase) {
    setEditingPhrase(phrase)
    setEditTitle(phrase.title)
    setEditContent(phrase.content)
  }

  function closeDialog() {
    setIsAddDialogOpen(false)
    setEditingPhrase(null)
    setEditTitle('')
    setEditContent('')
  }

  function savePhrase() {
    const title = editTitle.trim()
    const content = editContent.trim()
    if (!title || !content) return

    if (editingPhrase) {
      const next = quickPhrases.map((p) =>
        p.id === editingPhrase.id ? { ...p, title, content } : p
      )
      void onSaveQuickPhrases(next)
    } else {
      const newPhrase: QuickPhrase = {
        id: safeUuid(),
        title,
        content,
        isGlobal: false,
        assistantId,
      }
      void onSaveQuickPhrases([...quickPhrases, newPhrase])
    }
    closeDialog()
  }

  function deletePhrase(id: string) {
    void onSaveQuickPhrases(quickPhrases.filter((p) => p.id !== id))
    if (editingPhrase?.id === id) closeDialog()
  }

  function movePhrase(id: string, dir: -1 | 1) {
    const idx = phrases.findIndex((p) => p.id === id)
    if (idx < 0) return
    const target = idx + dir
    if (target < 0 || target >= phrases.length) return

    const reordered = [...phrases]
    const [item] = reordered.splice(idx, 1)
    reordered.splice(target, 0, item)

    const nonAssistant = quickPhrases.filter((p) => !(!p.isGlobal && p.assistantId === assistantId))
    void onSaveQuickPhrases([...reordered, ...nonAssistant])
  }

  const isOpen = isAddDialogOpen || !!editingPhrase

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <h2 className="text-base font-bold text-foreground">助手短语</h2>
        <button
          onClick={openAddDialog}
          className="p-2 rounded-xl text-foreground/80 hover:bg-muted transition-colors"
          title="添加助手短语"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/60 mb-4" />

      {/* Empty state */}
      {phrases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <MessageSquare className="h-16 w-16 text-foreground/20 mb-4" />
          <p className="text-sm text-foreground/50">
            暂无助手短语
          </p>
        </div>
      ) : (
        /* Phrases list */
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {phrases.map((phrase) => (
            <div
              key={phrase.id}
              onClick={() => openEditDialog(phrase)}
              className="group relative rounded-[14px] border border-border/60 bg-card hover:border-primary/30 cursor-pointer transition-all overflow-hidden"
            >
              <div className="p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-[18px] w-[18px] text-primary flex-shrink-0" />
                  <span className="font-semibold text-[15px] text-foreground truncate flex-1">
                    {phrase.title}
                  </span>
                  <ChevronRight className="h-4 w-4 text-foreground/40 flex-shrink-0" />
                </div>
                <p className="text-[13px] text-foreground/60 line-clamp-2 pl-[26px]">
                  {phrase.content}
                </p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deletePhrase(phrase.id)
                }}
                className="absolute right-0 top-0 bottom-0 w-14 flex items-center justify-center bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl p-6 gap-0">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-center text-lg font-semibold">
              {editingPhrase ? '编辑短语' : '添加快捷短语'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">标题</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="输入标题"
                className="h-12 rounded-xl bg-muted border-0 focus-visible:ring-primary/30"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">内容</Label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="输入内容"
                className="min-h-[140px] rounded-xl bg-muted border-0 resize-none focus-visible:ring-primary/30"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              {editingPhrase ? (
                <>
                  <button
                    onClick={() => deletePhrase(editingPhrase.id)}
                    className="h-11 w-11 rounded-xl border border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => movePhrase(editingPhrase.id, -1)}
                      disabled={phrases.findIndex((p) => p.id === editingPhrase.id) === 0}
                      className="h-11 w-11 rounded-xl border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => movePhrase(editingPhrase.id, 1)}
                      disabled={phrases.findIndex((p) => p.id === editingPhrase.id) === phrases.length - 1}
                      className="h-11 w-11 rounded-xl border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </>
              ) : null}
              
              <div className="flex-1" />
              
              <button
                onClick={closeDialog}
                className="h-11 px-5 rounded-xl border border-border hover:bg-muted font-medium text-sm transition-colors"
              >
                取消
              </button>
              <button
                onClick={savePhrase}
                disabled={!editTitle.trim() || !editContent.trim()}
                className="h-11 px-5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
