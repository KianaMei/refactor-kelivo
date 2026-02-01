import { Moon, Monitor, Sun, Languages, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import type { AppConfig, DisplaySettings, ThemeMode, ThemePalette, ChatMessageBackgroundStyle, TopicPosition, AppLanguage } from '../../../../shared/types'
import { LANGUAGE_LABELS } from '../../../../shared/types'

export function DisplayPane(props: { config: AppConfig; onSave: (next: AppConfig) => Promise<void> }) {
  const { config, onSave } = props
  const display = config.display

  async function updateDisplay(patch: Partial<DisplaySettings>) {
    await onSave({
      ...config,
      display: { ...display, ...patch }
    })
  }

  async function setThemeMode(mode: ThemeMode) {
    await onSave({ ...config, themeMode: mode })
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>显示</div>
      <div style={styles.divider} />

      <SettingsCard title="语言" icon={<Languages size={15} />}>
        <LabeledRow label="应用语言">
          <LanguageSelector value={display.language} onChange={(v) => updateDisplay({ language: v })} />
        </LabeledRow>
        <div style={{ padding: '4px 8px', fontSize: 12, color: 'var(--text-secondary)' }}>
          修改语言后需要重启应用才能完全生效
        </div>
      </SettingsCard>

      <SettingsCard title="显示">
        <LabeledRow label="颜色模式">
          <ThemeModeSegmented value={config.themeMode} onChange={setThemeMode} />
        </LabeledRow>
        <RowDivider />
        <LabeledRow label="主题色">
          <PaletteSelector value={display.themePalette} onChange={(v) => updateDisplay({ themePalette: v })} />
        </LabeledRow>
        <RowDivider />
        <ToggleRow
          label="纯净背景"
          value={display.usePureBackground}
          onChange={(v) => updateDisplay({ usePureBackground: v })}
        />
        <RowDivider />
        <LabeledRow label="消息背景样式">
          <SegmentedSelect
            options={[
              { value: 'none', label: '无' },
              { value: 'bubble', label: '气泡' },
              { value: 'card', label: '卡片' }
            ]}
            value={display.chatMessageBackgroundStyle}
            onChange={(v) => updateDisplay({ chatMessageBackgroundStyle: v as ChatMessageBackgroundStyle })}
          />
        </LabeledRow>
        <RowDivider />
        <SliderRow
          label="气泡透明度"
          value={display.chatBubbleOpacity}
          min={0}
          max={100}
          onChange={(v) => updateDisplay({ chatBubbleOpacity: v })}
        />
        <RowDivider />
        <LabeledRow label="话题列表位置">
          <SegmentedSelect
            options={[
              { value: 'left', label: '左侧' },
              { value: 'right', label: '右侧' }
            ]}
            value={display.topicPosition}
            onChange={(v) => updateDisplay({ topicPosition: v as TopicPosition })}
          />
        </LabeledRow>
        <RowDivider />
        <LabeledRow label="桌面内容宽度">
          <SegmentedSelect
            options={[
              { value: 'narrow', label: '窄' },
              { value: 'wide', label: '宽' }
            ]}
            value={display.desktopContentWidth}
            onChange={(v) => updateDisplay({ desktopContentWidth: v as 'narrow' | 'wide' })}
          />
        </LabeledRow>
      </SettingsCard>

      <SettingsCard title="字体">
        <LabeledRow label="应用字体">
          <input
            className="input"
            style={{ width: 200, textAlign: 'right' }}
            value={display.appFontFamily}
            placeholder="系统默认"
            onChange={(e) => updateDisplay({ appFontFamily: e.target.value })}
          />
        </LabeledRow>
        <RowDivider />
        <LabeledRow label="代码字体">
          <input
            className="input"
            style={{ width: 200, textAlign: 'right' }}
            value={display.codeFontFamily}
            placeholder="系统等宽"
            onChange={(e) => updateDisplay({ codeFontFamily: e.target.value })}
          />
        </LabeledRow>
        <RowDivider />
        <SliderRow
          label="全局缩放"
          value={Math.round(display.globalFontScale * 100)}
          min={80}
          max={150}
          suffix="%"
          onChange={(v) => updateDisplay({ globalFontScale: v / 100 })}
        />
        <RowDivider />
        <SliderRow
          label="对话字号"
          value={display.chatFontSize}
          min={12}
          max={24}
          suffix="px"
          onChange={(v) => updateDisplay({ chatFontSize: v })}
        />
      </SettingsCard>

      <SettingsCard title="消息项显示">
        <ToggleRow label="显示用户头像" value={display.showUserAvatar} onChange={(v) => updateDisplay({ showUserAvatar: v })} />
        <RowDivider />
        <ToggleRow label="显示用户名与时间" value={display.showUserNameTimestamp} onChange={(v) => updateDisplay({ showUserNameTimestamp: v })} />
        <RowDivider />
        <ToggleRow label="显示用户消息操作" value={display.showUserMessageActions} onChange={(v) => updateDisplay({ showUserMessageActions: v })} />
        <RowDivider />
        <ToggleRow label="显示模型图标" value={display.showModelIcon} onChange={(v) => updateDisplay({ showModelIcon: v })} />
        <RowDivider />
        <ToggleRow label="显示模型名与时间" value={display.showModelNameTimestamp} onChange={(v) => updateDisplay({ showModelNameTimestamp: v })} />
        <RowDivider />
        <ToggleRow label="显示 Token 统计" value={display.showTokenStats} onChange={(v) => updateDisplay({ showTokenStats: v })} />
      </SettingsCard>

      <SettingsCard title="渲染设置">
        <ToggleRow label="启用 $ LaTeX" value={display.enableDollarLatex} onChange={(v) => updateDisplay({ enableDollarLatex: v })} />
        <RowDivider />
        <ToggleRow label="启用数学渲染" value={display.enableMathRendering} onChange={(v) => updateDisplay({ enableMathRendering: v })} />
        <RowDivider />
        <ToggleRow label="渲染用户消息 Markdown" value={display.enableUserMarkdown} onChange={(v) => updateDisplay({ enableUserMarkdown: v })} />
        <RowDivider />
        <ToggleRow label="渲染推理过程 Markdown" value={display.enableReasoningMarkdown} onChange={(v) => updateDisplay({ enableReasoningMarkdown: v })} />
      </SettingsCard>

      <SettingsCard title="行为与启动">
        <ToggleRow label="自动折叠思考过程" value={display.autoCollapseThinking} onChange={(v) => updateDisplay({ autoCollapseThinking: v })} />
        <RowDivider />
        <ToggleRow label="显示更新提示" value={display.showAppUpdates} onChange={(v) => updateDisplay({ showAppUpdates: v })} />
        <RowDivider />
        <ToggleRow label="显示消息导航按钮" value={display.showMessageNav} onChange={(v) => updateDisplay({ showMessageNav: v })} />
        <RowDivider />
        <ToggleRow label="显示对话列表日期" value={display.showChatListDate} onChange={(v) => updateDisplay({ showChatListDate: v })} />
        <RowDivider />
        <ToggleRow label="启动时新建对话" value={display.newChatOnLaunch} onChange={(v) => updateDisplay({ newChatOnLaunch: v })} />
        <RowDivider />
        <ToggleRow label="关闭时最小化到托盘" value={display.closeToTray} onChange={(v) => updateDisplay({ closeToTray: v })} />
      </SettingsCard>

      <SettingsCard title="其他设置">
        <SliderRow
          label="自动滚动等待秒数"
          value={display.autoScrollIdleSeconds}
          min={1}
          max={30}
          suffix="秒"
          onChange={(v) => updateDisplay({ autoScrollIdleSeconds: v })}
        />
        <RowDivider />
        <ToggleRow label="禁用自动滚动" value={display.disableAutoScroll} onChange={(v) => updateDisplay({ disableAutoScroll: v })} />
        <RowDivider />
        <SliderRow
          label="背景遮罩强度"
          value={display.chatBackgroundMaskStrength}
          min={0}
          max={100}
          onChange={(v) => updateDisplay({ chatBackgroundMaskStrength: v })}
        />
      </SettingsCard>
    </div>
  )
}

// ========== 子组件 ==========

function SettingsCard(props: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="settingsCard">
      <div style={styles.cardTitle}>
        {props.icon && <span style={{ marginRight: 6, display: 'inline-flex', verticalAlign: 'middle' }}>{props.icon}</span>}
        {props.title}
      </div>
      {props.children}
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

function ToggleRow(props: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <LabeledRow label={props.label}>
      <button
        type="button"
        className={`toggle ${props.value ? 'toggleOn' : ''}`}
        onClick={() => props.onChange(!props.value)}
      >
        <div className="toggleThumb" />
      </button>
    </LabeledRow>
  )
}

function SliderRow(props: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <LabeledRow label={props.label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range"
          min={props.min}
          max={props.max}
          value={props.value}
          onChange={(e) => props.onChange(Number(e.target.value))}
          style={{ width: 120 }}
        />
        <span style={{ fontSize: 13, opacity: 0.85, minWidth: 40, textAlign: 'right' }}>
          {props.value}{props.suffix ?? ''}
        </span>
      </div>
    </LabeledRow>
  )
}

function ThemeModeSegmented(props: { value: ThemeMode; onChange: (v: ThemeMode) => void }) {
  const items: { mode: ThemeMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'light', icon: <Sun size={14} />, label: '浅色' },
    { mode: 'dark', icon: <Moon size={14} />, label: '深色' },
    { mode: 'system', icon: <Monitor size={14} />, label: '跟随系统' }
  ]
  return (
    <div style={styles.segmented}>
      {items.map((it) => (
        <button
          key={it.mode}
          type="button"
          className={`segmentedItem ${props.value === it.mode ? 'segmentedItemActive' : ''}`}
          onClick={() => props.onChange(it.mode)}
        >
          {it.icon}
          <span style={{ marginLeft: 4 }}>{it.label}</span>
        </button>
      ))}
    </div>
  )
}

function SegmentedSelect<T extends string>(props: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={styles.segmented}>
      {props.options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`segmentedItem ${props.value === opt.value ? 'segmentedItemActive' : ''}`}
          onClick={() => props.onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

const paletteColors: Record<ThemePalette, string> = {
  blue: '#3b82f6',
  purple: '#8b5cf6',
  green: '#22c55e',
  orange: '#f97316',
  pink: '#ec4899',
  teal: '#14b8a6',
  red: '#ef4444',
  yellow: '#eab308'
}

function PaletteSelector(props: { value: ThemePalette; onChange: (v: ThemePalette) => void }) {
  const palettes: ThemePalette[] = ['blue', 'purple', 'green', 'orange', 'pink', 'teal', 'red', 'yellow']
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {palettes.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => props.onChange(p)}
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: props.value === p ? '2px solid var(--text)' : '2px solid transparent',
            background: paletteColors[p],
            cursor: 'pointer',
            padding: 0
          }}
        />
      ))}
    </div>
  )
}

function LanguageSelector(props: { value: AppLanguage; onChange: (v: AppLanguage) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const languages: AppLanguage[] = ['system', 'zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR', 'ru-RU']

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }}
      >
        <span>{LANGUAGE_LABELS[props.value]}</span>
        <ChevronDown size={14} style={{ opacity: 0.5, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div style={styles.dropdown}>
          {languages.map((lang) => (
            <button
              key={lang}
              type="button"
              className={`btn btn-ghost ${props.value === lang ? 'segmentedItemActive' : ''}`}
              style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 12px' }}
              onClick={() => {
                props.onChange(lang)
                setOpen(false)
              }}
            >
              {LANGUAGE_LABELS[lang]}
            </button>
          ))}
        </div>
      )}
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
    padding: '8px',
    gap: 12
  },
  rowLabel: {
    fontSize: 14,
    flex: 1
  },
  rowTrailing: {
    flexShrink: 0
  },
  segmented: {
    display: 'flex',
    gap: 4,
    background: 'var(--panel-2)',
    borderRadius: 10,
    padding: 3
  },
  dropdown: {
    position: 'absolute' as const,
    top: '100%',
    right: 0,
    marginTop: 4,
    minWidth: 160,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    zIndex: 100,
    padding: 4,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2
  }
}
