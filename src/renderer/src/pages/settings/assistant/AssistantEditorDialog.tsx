import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import type { AssistantConfig, AssistantMemory, McpServerConfig, ProviderConfigV2, QuickPhrase } from '../../../../../shared/types'
import { Dialog, DialogContent } from '../../../components/ui/dialog'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { cn } from '../../../lib/utils'
import { BasicTab } from './tabs/BasicTab'
import { CustomRequestTab } from './tabs/CustomRequestTab'
import { McpTab } from './tabs/McpTab'
import { MemoryTab } from './tabs/MemoryTab'
import { PromptsTab } from './tabs/PromptsTab'
import { QuickPhrasesTab } from './tabs/QuickPhrasesTab'
import { RegexTab } from './tabs/RegexTab'

type MenuKey = 'basic' | 'prompts' | 'memory' | 'mcp' | 'quick' | 'custom' | 'regex'

const MENU: Array<{ key: MenuKey; label: string }> = [
  { key: 'basic', label: '基础' },
  { key: 'prompts', label: '提示词' },
  { key: 'memory', label: '记忆' },
  { key: 'mcp', label: 'MCP' },
  { key: 'quick', label: '快捷短语' },
  { key: 'custom', label: '请求' },
  { key: 'regex', label: '正则' }
]

const DIALOG_VIEWPORT_FIT_STYLE: CSSProperties = {
  width: 'calc(100vw - 48px)',
  maxWidth: 1060,
  height: 'calc(100vh - 48px)',
  maxHeight: 720
}

export function AssistantEditorDialog(props: {
  open: boolean
  assistant: AssistantConfig | null
  providers: ProviderConfigV2[]
  quickPhrases: QuickPhrase[]
  assistantMemories: AssistantMemory[]
  mcpServers: McpServerConfig[]
  onPatch: (patch: Partial<AssistantConfig>) => void
  onSetDefault: () => void
  onDuplicate: () => void
  onDelete: () => void
  onSaveQuickPhrases: (nextAll: QuickPhrase[]) => Promise<void>
  onSaveAssistantMemories: (nextAll: AssistantMemory[]) => Promise<void>
  onClose: () => void
}) {
  const {
    open,
    assistant,
    providers,
    quickPhrases,
    assistantMemories,
    mcpServers,
    onPatch,
    onSetDefault,
    onDuplicate,
    onDelete,
    onSaveQuickPhrases,
    onSaveAssistantMemories,
    onClose
  } = props

  const [menu, setMenu] = useState<MenuKey>('basic')

  useEffect(() => {
    if (!open) return
    setMenu('basic')
  }, [open, assistant?.id])

  const body = useMemo(() => {
    if (!assistant) return null
    switch (menu) {
      case 'basic':
        return (
          <BasicTab assistant={assistant} providers={providers} onPatch={onPatch} onSetDefault={onSetDefault} onDuplicate={onDuplicate} onDelete={onDelete} />
        )
      case 'prompts':
        return <PromptsTab assistant={assistant} onPatch={onPatch} />
      case 'memory':
        return <MemoryTab assistant={assistant} onPatch={onPatch} memories={assistantMemories} onSaveMemories={onSaveAssistantMemories} />
      case 'mcp':
        return <McpTab assistant={assistant} servers={mcpServers} onPatch={onPatch} />
      case 'quick':
        return <QuickPhrasesTab assistantId={assistant.id} quickPhrases={quickPhrases} onSaveQuickPhrases={onSaveQuickPhrases} />
      case 'custom':
        return <CustomRequestTab assistant={assistant} onPatch={onPatch} />
      case 'regex':
        return <RegexTab assistant={assistant} onPatch={onPatch} />
    }
  }, [assistant, assistantMemories, menu, mcpServers, onDelete, onDuplicate, onPatch, onSaveAssistantMemories, onSaveQuickPhrases, onSetDefault, providers, quickPhrases])

  return (
    <Dialog
      open={open && !!assistant}
      onOpenChange={(v) => {
        if (v) return
        onClose()
      }}
    >
      <DialogContent className="p-0 gap-0 max-w-none flex flex-col" style={DIALOG_VIEWPORT_FIT_STYLE}>
        <div className="h-full flex flex-col min-h-0">
          <div className="h-11 px-4 flex items-center border-b">
            <div className="text-[14px] font-semibold truncate">{assistant?.name ?? ''}</div>
          </div>

          <div className="flex-1 min-h-0 flex">
            <div className="w-56 min-h-0 border-r bg-background/40">
              <ScrollArea className="h-full min-h-0">
                <div className="p-3 space-y-1">
                  {MENU.map((it) => {
                    const active = menu === it.key
                    return (
                      <button
                        key={it.key}
                        type="button"
                        className={cn(
                          [
                            'relative w-full h-10 px-3 rounded-md border text-sm',
                            'flex items-center',
                            'transition-colors',
                            'hover:bg-accent hover:border-border',
                            active ? 'bg-accent border-border' : 'border-transparent'
                          ].join(' ')
                        )}
                        onClick={() => setMenu(it.key)}
                      >
                        {/* 用 inline style 强制颜色/文本填充色，彻底规避某些 CSS 覆盖导致的“文字消失”(例如 -webkit-text-fill-color) */}
                        <span
                          className="min-w-0 flex-1 text-left truncate"
                          style={{
                            color: active ? 'var(--text, #18181b)' : 'var(--text-2, #52525b)',
                            WebkitTextFillColor: active ? 'var(--text, #18181b)' : 'var(--text-2, #52525b)',
                            fontSize: '14px',
                            lineHeight: '20px',
                            opacity: 1,
                            visibility: 'visible'
                          }}
                        >
                          {it.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>

            <div className="flex-1 min-w-0 min-h-0">
              <ScrollArea className="h-full min-h-0">
                <div className="p-4">{body}</div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
