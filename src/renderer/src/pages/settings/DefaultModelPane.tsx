import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, FileText, AlignLeft, Languages, ScanText, Settings, X } from 'lucide-react'

import type { AppConfig, ProviderConfigV2 } from '../../../../shared/types'
import { DEFAULT_TITLE_PROMPT, DEFAULT_SUMMARY_PROMPT, DEFAULT_TRANSLATE_PROMPT } from '../../../../shared/types'
import { ModelSelectPopover } from '../../components/ModelSelectPopover'
import { BrandAvatar } from './providers/components/BrandAvatar'

export function DefaultModelPane(props: { config: AppConfig; onSave: (next: AppConfig) => Promise<void> }) {
  const providers = useMemo(() => {
    const map = props.config.providerConfigs
    const order = props.config.providersOrder
    return order.map((k) => map[k]).filter((p) => p && p.enabled)
  }, [props.config.providerConfigs, props.config.providersOrder])

  const currentModelDisplay = props.config.currentModelId || '未设置'

  return (
    <div style={styles.root}>
      <div style={styles.header}>默认模型</div>

      <div style={styles.grid}>
        {/* 对话模型 */}
        <ModelCard
          icon={<MessageCircle size={18} />}
          title="对话默认模型"
          subtitle="新建对话时自动使用的模型"
          modelProvider={props.config.currentModelProvider}
          modelId={props.config.currentModelId}
          providers={providers}
          onSelect={async (providerId, modelId) => {
            await props.onSave({
              ...props.config,
              currentModelProvider: providerId,
              currentModelId: modelId
            })
          }}
        />

        {/* 标题生成模型 */}
        <ModelCard
          icon={<FileText size={18} />}
          title="标题生成模型"
          subtitle="自动生成对话标题时使用的模型"
          modelProvider={props.config.titleModelProvider}
          modelId={props.config.titleModelId}
          fallbackDisplay={`使用当前模型 (${currentModelDisplay})`}
          providers={providers}
          onSelect={async (providerId, modelId) => {
            await props.onSave({
              ...props.config,
              titleModelProvider: providerId,
              titleModelId: modelId
            })
          }}
          configButton={{
            title: '标题生成 Prompt',
            prompt: props.config.titlePrompt,
            defaultPrompt: DEFAULT_TITLE_PROMPT,
            hint: '可用变量: {content} - 对话内容, {locale} - 语言',
            onSave: async (prompt) => {
              await props.onSave({ ...props.config, titlePrompt: prompt })
            }
          }}
        />

        {/* 摘要生成模型 */}
        <ModelCard
          icon={<AlignLeft size={18} />}
          title="摘要生成模型"
          subtitle="生成对话摘要时使用的模型"
          modelProvider={props.config.summaryModelProvider}
          modelId={props.config.summaryModelId}
          fallbackDisplay={`使用当前模型 (${currentModelDisplay})`}
          providers={providers}
          onSelect={async (providerId, modelId) => {
            await props.onSave({
              ...props.config,
              summaryModelProvider: providerId,
              summaryModelId: modelId
            })
          }}
          configButton={{
            title: '摘要生成 Prompt',
            prompt: props.config.summaryPrompt,
            defaultPrompt: DEFAULT_SUMMARY_PROMPT,
            hint: '可用变量: {previous_summary} - 之前的摘要, {user_messages} - 用户消息',
            onSave: async (prompt) => {
              await props.onSave({ ...props.config, summaryPrompt: prompt })
            }
          }}
        />

        {/* 翻译模型 */}
        <ModelCard
          icon={<Languages size={18} />}
          title="翻译默认模型"
          subtitle="翻译消息时使用的模型"
          modelProvider={props.config.translateModelProvider}
          modelId={props.config.translateModelId}
          fallbackDisplay={`使用当前模型 (${currentModelDisplay})`}
          providers={providers}
          onSelect={async (providerId, modelId) => {
            await props.onSave({
              ...props.config,
              translateModelProvider: providerId,
              translateModelId: modelId
            })
          }}
          configButton={{
            title: '翻译 Prompt',
            prompt: props.config.translatePrompt ?? DEFAULT_TRANSLATE_PROMPT,
            defaultPrompt: DEFAULT_TRANSLATE_PROMPT,
            hint: '可用变量: {source_text} - 原文, {target_lang} - 目标语言',
            onSave: async (prompt) => {
              await props.onSave({ ...props.config, translatePrompt: prompt })
            }
          }}
        />

        {/* OCR 模型 */}
        <ModelCard
          icon={<ScanText size={18} />}
          title="OCR 模型"
          subtitle="图片文字识别时使用的模型"
          modelProvider={props.config.ocrModelProvider ?? null}
          modelId={props.config.ocrModelId ?? null}
          fallbackDisplay={`使用当前模型 (${currentModelDisplay})`}
          providers={providers}
          onSelect={async (providerId, modelId) => {
            await props.onSave({
              ...props.config,
              ocrModelProvider: providerId,
              ocrModelId: modelId
            })
          }}
          trailing={
            <ToggleSwitch
              value={props.config.ocrEnabled ?? false}
              disabled={!props.config.ocrModelProvider || !props.config.ocrModelId}
              onChange={async (v) => {
                await props.onSave({ ...props.config, ocrEnabled: v })
              }}
            />
          }
        />
      </div>
    </div>
  )
}

// ========== ModelCard 组件 ==========

interface ModelCardProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  modelProvider: string | null
  modelId: string | null
  fallbackDisplay?: string
  providers: ProviderConfigV2[]
  onSelect: (providerId: string, modelId: string) => Promise<void>
  configButton?: {
    title: string
    prompt: string
    defaultPrompt: string
    hint: string
    onSave: (prompt: string) => Promise<void>
  }
  trailing?: React.ReactNode
}

function ModelCard(props: ModelCardProps) {
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [hover, setHover] = useState(false)

  const hasModel = props.modelProvider && props.modelId
  const displayText = hasModel ? props.modelId : (props.fallbackDisplay || '未设置')

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.cardIcon}>{props.icon}</span>
        <span style={styles.cardTitle}>{props.title}</span>
        <div style={{ flex: 1 }} />
        {props.configButton && (
          <IconButton icon={<Settings size={16} />} onClick={() => setPromptOpen((v) => !v)} />
        )}
        {props.trailing}
      </div>
      <div style={styles.cardSubtitle}>{props.subtitle}</div>
      <div
        style={{
          ...styles.modelRow,
          background: hover ? 'var(--hover-bg)' : 'var(--surface-2)'
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => setSelectorOpen((v) => !v)}
      >
        {/* 有具体模型时使用 BrandAvatar，否则使用首字母头像 */}
        {hasModel ? (
          <BrandAvatar name={props.modelId!} size={24} square />
        ) : (
          <ModelIcon name={displayText || '?'} />
        )}
        <span style={styles.modelName}>{displayText}</span>
      </div>

      {selectorOpen && (
        <ModelSelectorDialog
          providers={props.providers}
          currentProvider={props.modelProvider}
          currentModel={props.modelId}
          onSelect={async (providerId, modelId) => {
            await props.onSelect(providerId, modelId)
            setSelectorOpen(false)
          }}
          onClose={() => setSelectorOpen(false)}
        />
      )}

      {promptOpen && props.configButton && (
        <PromptEditorDialog
          title={props.configButton.title}
          prompt={props.configButton.prompt}
          defaultPrompt={props.configButton.defaultPrompt}
          hint={props.configButton.hint}
          onSave={async (prompt) => {
            await props.configButton!.onSave(prompt)
            setPromptOpen(false)
          }}
          onClose={() => setPromptOpen(false)}
        />
      )}
    </div>
  )
}

// ========== 模型选择对话框 ==========

function ModelSelectorDialog(props: {
  providers: ProviderConfigV2[]
  currentProvider: string | null
  currentModel: string | null
  onSelect: (providerId: string, modelId: string) => Promise<void>
  onClose: () => void
}) {
  return createPortal(
    <div style={styles.overlay} onMouseDown={props.onClose}>
      <div style={styles.dialog} onMouseDown={(e) => e.stopPropagation()}>
        <ModelSelectPopover
          providers={props.providers}
          currentProviderId={props.currentProvider ?? undefined}
          currentModelId={props.currentModel ?? undefined}
          onSelect={(providerId, modelId) => {
            void props.onSelect(providerId, modelId)
          }}
          onClose={props.onClose}
        />
      </div>
    </div>,
    document.body
  )
}

// ========== Prompt 编辑对话框 ==========

function PromptEditorDialog(props: {
  title: string
  prompt: string
  defaultPrompt: string
  hint: string
  onSave: (prompt: string) => Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState(props.prompt)

  return createPortal(
    <div style={styles.overlay} onMouseDown={props.onClose}>
      <div style={{ ...styles.dialog, width: 600 }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.dialogHeader}>
          <span style={{ fontWeight: 700 }}>{props.title}</span>
          <div style={{ flex: 1 }} />
          <IconButton icon={<X size={16} />} onClick={props.onClose} />
        </div>

        <div style={{ padding: 16 }}>
          <textarea
            className="input"
            style={{ width: '100%', height: 160, resize: 'vertical', fontSize: 14 }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="输入 Prompt..."
          />

          <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              className="btn"
              onClick={() => setValue(props.defaultPrompt)}
              disabled={value === props.defaultPrompt}
            >
              重置默认
            </button>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => props.onSave(value.trim())}
            >
              保存
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-2)' }}>
            {props.hint}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ========== 辅助组件 ==========

function IconButton(props: { icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        border: 'none',
        background: hover && !props.disabled ? 'var(--hover-bg)' : 'transparent',
        color: 'var(--text)',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: props.disabled ? 0.5 : 1
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.icon}
    </button>
  )
}

function ModelIcon(props: { name: string }) {
  const initial = props.name.charAt(0).toUpperCase()
  return (
    <div style={styles.modelIcon}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>{initial}</span>
    </div>
  )
}

function ToggleSwitch(props: { value: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`toggle ${props.value ? 'toggleOn' : ''}`}
      onClick={() => !props.disabled && props.onChange(!props.value)}
      disabled={props.disabled}
      style={{ opacity: props.disabled ? 0.5 : 1 }}
    >
      <div className="toggleThumb" />
    </button>
  )
}

// ========== 样式 ==========

const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: '16px 16px 32px',
    maxWidth: 1240,
    margin: '0 auto'
  },
  header: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 8
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: 12,
    alignItems: 'start'
  },
  divider: {
    height: 1,
    background: 'var(--border)',
    marginBottom: 12
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 0,
    minWidth: 0
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6
  },
  cardIcon: {
    display: 'flex',
    alignItems: 'center'
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 600
  },
  cardSubtitle: {
    fontSize: 12,
    color: 'var(--text-2)',
    marginBottom: 8
  },
  modelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'background 0.15s'
  },
  modelIcon: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'var(--primary-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modelName: {
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  dialog: {
    width: 580,
    height: 560,
    borderRadius: 14,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },
  dialogHeader: {
    height: 48,
    padding: '0 12px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  dialogBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0
  },
  providerTabs: {
    display: 'flex',
    gap: 4,
    padding: '12px 12px 8px',
    overflowX: 'auto',
    flexWrap: 'wrap'
  },
  providerTab: {
    padding: '6px 12px',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-2)',
    fontSize: 13,
    cursor: 'pointer'
  },
  providerTabActive: {
    background: 'var(--primary-bg)',
    color: 'var(--primary)',
    fontWeight: 600
  },
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 12px 12px',
    borderBottom: '1px solid var(--border)'
  },
  searchInput: {
    flex: 1,
    padding: '8px 0',
    border: 'none',
    background: 'transparent',
    color: 'var(--text)',
    outline: 'none',
    fontSize: 14
  },
  errorBox: {
    margin: 12,
    padding: 12,
    borderRadius: 10,
    background: 'var(--danger-bg)',
    color: 'var(--danger)',
    fontSize: 13
  },
  modelList: {
    flex: 1,
    overflow: 'auto',
    padding: 8
  },
  modelListItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 14
  }
}
