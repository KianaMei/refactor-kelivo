import { Moon, Monitor, Sun, Languages, ChevronDown, RotateCw } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { AppConfig, DisplaySettings, ThemeMode, ThemePalette, ChatMessageBackgroundStyle, TopicPosition, AppLanguage } from '../../../../shared/types'
import { LANGUAGE_LABELS } from '../../../../shared/types'
import { ThemePalettes, paletteIds } from '../../../../shared/palettes'

// 常用应用字体列表
const APP_FONTS: { value: string; label: string }[] = [
  { value: '', label: '系统默认' },
  { value: 'Microsoft YaHei', label: '微软雅黑' },
  { value: 'PingFang SC', label: '苹方' },
  { value: 'SimHei', label: '黑体' },
  { value: 'SimSun', label: '宋体' },
  { value: 'Noto Sans SC', label: 'Noto Sans SC' },
  { value: 'Segoe UI', label: 'Segoe UI' },
  { value: 'SF Pro Text', label: 'SF Pro' },
  { value: 'Helvetica Neue', label: 'Helvetica Neue' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Roboto', label: 'Roboto' }
]

// 常用代码字体列表
const CODE_FONTS: { value: string; label: string }[] = [
  { value: '', label: '系统等宽' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono' },
  { value: 'Fira Code', label: 'Fira Code' },
  { value: 'Consolas', label: 'Consolas' },
  { value: 'Cascadia Code', label: 'Cascadia Code' },
  { value: 'Source Code Pro', label: 'Source Code Pro' },
  { value: 'Menlo', label: 'Menlo' },
  { value: 'Monaco', label: 'Monaco' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'monospace', label: 'Monospace' }
]

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
              { value: 'default', label: '默认' },
              { value: 'frosted', label: '毛玻璃' },
              { value: 'solid', label: '纯色' }
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
          <FontSelector
            value={display.appFontFamily}
            onChange={(v) => updateDisplay({ appFontFamily: v })}
            fonts={APP_FONTS}
            placeholder="系统默认"
          />
        </LabeledRow>
        <RowDivider />
        <LabeledRow label="代码字体">
          <FontSelector
            value={display.codeFontFamily}
            onChange={(v) => updateDisplay({ codeFontFamily: v })}
            fonts={CODE_FONTS}
            placeholder="系统等宽"
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
        <RowDivider />
        <ToggleRow label="显示表情包工具调用" value={display.showStickerToolUI} onChange={(v) => updateDisplay({ showStickerToolUI: v })} />
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
          min={2}
          max={64}
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
          max={200}
          suffix="%"
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

function PaletteSelector(props: { value: ThemePalette; onChange: (v: ThemePalette) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {paletteIds.map((id) => {
        const palette = ThemePalettes[id]
        return (
          <button
            key={id}
            type="button"
            onClick={() => props.onChange(id as ThemePalette)}
            title={palette.zhName}
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: props.value === id ? '2px solid var(--text)' : '2px solid transparent',
              background: palette.light.primary,
              cursor: 'pointer',
              padding: 0,
              transition: 'transform 0.1s',
              transform: props.value === id ? 'scale(1.1)' : 'scale(1)'
            }}
          />
        )
      })}
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

function FontSelector(props: {
  value: string
  onChange: (v: string) => void
  fonts: { value: string; label: string }[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const currentFont = props.fonts.find((f) => f.value === props.value)
  const displayText = currentFont?.label || (props.value || props.placeholder)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  function handleOpen() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
    setOpen(!open)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost"
        onClick={handleOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          minWidth: 160,
          justifyContent: 'space-between',
          fontFamily: props.value || undefined
        }}
      >
        <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayText}
        </span>
        <ChevronDown size={14} style={{ opacity: 0.5, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
      </button>

      {props.value && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => props.onChange('')}
          title="重置为默认"
          style={{ padding: 6 }}
        >
          <RotateCw size={14} style={{ opacity: 0.6 }} />
        </button>
      )}

      {open && createPortal(
        <div
          ref={ref}
          className="fontSelectorDropdown"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            minWidth: 180,
            maxHeight: 280,
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 9999,
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2
          }}
        >
          {props.fonts.map((font) => (
            <button
              key={font.value}
              type="button"
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                fontFamily: font.value || undefined,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
                background: props.value === font.value ? 'var(--primary-bg)' : 'transparent',
                color: props.value === font.value ? 'var(--primary)' : 'var(--text)'
              }}
              onMouseEnter={(e) => {
                if (props.value !== font.value) e.currentTarget.style.background = 'var(--hover-bg)'
              }}
              onMouseLeave={(e) => {
                if (props.value !== font.value) e.currentTarget.style.background = 'transparent'
              }}
              onClick={() => {
                props.onChange(font.value)
                setOpen(false)
              }}
            >
              {font.label}
            </button>
          ))}
        </div>,
        document.body
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
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    zIndex: 9999,
    padding: 4,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2
  }
}
