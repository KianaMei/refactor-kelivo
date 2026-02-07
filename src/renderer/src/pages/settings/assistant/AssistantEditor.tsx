import { useMemo, useState } from 'react'

import type { AssistantConfig, AssistantMemory, McpServerConfig, ProviderConfigV2, QuickPhrase } from '../../../../../shared/types'
import { BasicTab } from './tabs/BasicTab'
import { CustomRequestTab } from './tabs/CustomRequestTab'
import { McpTab } from './tabs/McpTab'
import { MemoryTab } from './tabs/MemoryTab'
import { ModelTab } from './tabs/ModelTab'
import { PromptsTab } from './tabs/PromptsTab'
import { QuickPhrasesTab } from './tabs/QuickPhrasesTab'
import { RegexTab } from './tabs/RegexTab'

type TabKey = 'basic' | 'model' | 'prompts' | 'memory' | 'quickPhrases' | 'mcp' | 'custom' | 'regex'

const TAB_LABELS: Array<{ key: TabKey; label: string }> = [
  { key: 'basic', label: '基础' },
  { key: 'model', label: '模型' },
  { key: 'prompts', label: '提示词' },
  { key: 'memory', label: '记忆' },
  { key: 'quickPhrases', label: '短语' },
  { key: 'mcp', label: 'MCP' },
  { key: 'custom', label: '请求' },
  { key: 'regex', label: '正则' },
]

export function AssistantEditor(props: {
  assistant: AssistantConfig
  providers: ProviderConfigV2[]
  quickPhrases: QuickPhrase[]
  assistantMemories: AssistantMemory[]
  mcpServers: McpServerConfig[]
  onSaveQuickPhrases: (nextAll: QuickPhrase[]) => Promise<void>
  onSaveAssistantMemories: (nextAll: AssistantMemory[]) => Promise<void>
  onPatch: (patch: Partial<AssistantConfig>) => void
  onSetDefault: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { assistant, providers, quickPhrases, assistantMemories, mcpServers, onSaveQuickPhrases, onSaveAssistantMemories, onPatch, onSetDefault, onDuplicate, onDelete } = props
  const [tab, setTab] = useState<TabKey>('basic')

  const body = useMemo(() => {
    switch (tab) {
      case 'basic':
        return (
          <BasicTab
            assistant={assistant}
            onPatch={onPatch}
            onSetDefault={onSetDefault}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        )
      case 'model':
        return (
          <ModelTab
            assistant={assistant}
            providers={providers}
            onPatch={onPatch}
          />
        )
      case 'prompts':
        return (
          <PromptsTab
            assistant={assistant}
            onPatch={onPatch}
          />
        )
      case 'memory':
        return (
          <MemoryTab
            assistant={assistant}
            onPatch={onPatch}
            memories={assistantMemories}
            onSaveMemories={onSaveAssistantMemories}
          />
        )
      case 'quickPhrases':
        return (
          <QuickPhrasesTab
            assistantId={assistant.id}
            quickPhrases={quickPhrases}
            onSaveQuickPhrases={onSaveQuickPhrases}
          />
        )
      case 'mcp':
        return (
          <McpTab
            assistant={assistant}
            onPatch={onPatch}
            servers={mcpServers}
          />
        )
      case 'custom':
        return (
          <CustomRequestTab
            assistant={assistant}
            onPatch={onPatch}
          />
        )
      case 'regex':
        return (
          <RegexTab
            assistant={assistant}
            onPatch={onPatch}
          />
        )
    }
  }, [assistant, assistantMemories, mcpServers, onDelete, onDuplicate, onPatch, onSaveAssistantMemories, onSaveQuickPhrases, onSetDefault, providers, quickPhrases, tab])

  return (
    <div className="settingsCard">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ fontWeight: 800 }}>编辑助手</div>
        {!assistant.deletable && (
          <span className="primary-capsule">内置</span>
        )}
        {assistant.isDefault && (
          <span className="primary-capsule">默认</span>
        )}
      </div>

      <div style={s.tabRow}>
        {TAB_LABELS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`seg-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ height: 10 }} />

      {body}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  tabRow: {
    display: 'flex',
    gap: 6,
    padding: 6,
    background: 'var(--surface-2)',
    borderRadius: 12,
    border: '1px solid var(--border)',
    overflowX: 'auto',
  },
}
