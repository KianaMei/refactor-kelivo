import { useMemo, useState, useRef, useCallback } from 'react'

import type { AppConfig, SettingsMenuKey } from '../../../../shared/types'
import {
  BadgeInfo, Bot, Boxes, Database, Earth, Globe, Heart,
  Monitor, Terminal, Volume2, Zap, HardDrive, FolderOpen
} from 'lucide-react'
import { AboutPane } from './AboutPane'
import { AssistantPane } from './AssistantPane'
import { BackupPane } from './BackupPane'
import { DataPane } from './DataPane'
import { DefaultModelPane } from './DefaultModelPane'
import { DisplayPane } from './DisplayPane'
import { McpPane } from './McpPane'
import { NetworkProxyPane } from './NetworkProxyPane'
import { ProvidersPane } from './ProvidersPane'
import { QuickPhrasesPane } from './QuickPhrasesPane'
import { SearchPane } from './SearchPane'
import { TtsPane } from './TtsPane'

interface MenuSection {
  label: string
  items: Array<{ key: SettingsMenuKey; icon: React.ReactNode; label: string }>
}

const menuSections: MenuSection[] = [
  {
    label: '通用',
    items: [
      { key: 'display', icon: <Monitor className="settingsMenuItemIcon" />, label: '显示' },
      { key: 'assistant', icon: <Bot className="settingsMenuItemIcon" />, label: '助手' },
    ],
  },
  {
    label: '模型与服务',
    items: [
      { key: 'defaultModel', icon: <Heart className="settingsMenuItemIcon" />, label: '默认模型' },
      { key: 'providers', icon: <Boxes className="settingsMenuItemIcon" />, label: '供应商' },
      { key: 'search', icon: <Earth className="settingsMenuItemIcon" />, label: '搜索' },
      { key: 'tts', icon: <Volume2 className="settingsMenuItemIcon" />, label: '语音合成' },
      { key: 'mcp', icon: <Terminal className="settingsMenuItemIcon" />, label: 'MCP' },
      { key: 'quickPhrases', icon: <Zap className="settingsMenuItemIcon" />, label: '快捷短语' },
    ],
  },
  {
    label: '网络与数据',
    items: [
      { key: 'networkProxy', icon: <Globe className="settingsMenuItemIcon" />, label: '网络代理' },
      { key: 'backup', icon: <Database className="settingsMenuItemIcon" />, label: '备份' },
      { key: 'data', icon: <HardDrive className="settingsMenuItemIcon" />, label: '数据管理' },
    ],
  },
  {
    label: '其他',
    items: [
      { key: 'about', icon: <BadgeInfo className="settingsMenuItemIcon" />, label: '关于' },
    ],
  },
]

export function SettingsPage(props: { config: AppConfig; onSave: (next: AppConfig) => Promise<void> }) {
  const [menu, setMenu] = useState<SettingsMenuKey>(() => props.config.ui.desktop.selectedSettingsMenu)
  const [menuWidth, setMenuWidth] = useState(180)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = menuWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = e.clientX - startX.current
      setMenuWidth(startWidth.current + delta)
    }

    const handleMouseUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [menuWidth])

  async function setMenuAndPersist(next: SettingsMenuKey) {
    setMenu(next)
    await props.onSave({
      ...props.config,
      ui: {
        ...props.config.ui,
        desktop: {
          ...props.config.ui.desktop,
          selectedSettingsMenu: next
        }
      }
    })
  }

  const body = useMemo(() => {
    switch (menu) {
      case 'providers':
        return <ProvidersPane config={props.config} onSave={props.onSave} />
      case 'display':
        return <DisplayPane config={props.config} onSave={props.onSave} />
      case 'assistant':
        return <AssistantPane config={props.config} onSave={props.onSave} />
      case 'defaultModel':
        return <DefaultModelPane config={props.config} onSave={props.onSave} />
      case 'search':
        return <SearchPane />
      case 'mcp':
        return <McpPane />
      case 'quickPhrases':
        return <QuickPhrasesPane />
      case 'tts':
        return <TtsPane />
      case 'networkProxy':
        return <NetworkProxyPane config={props.config} onSave={props.onSave} />
      case 'backup':
        return <BackupPane />
      case 'data':
        return <DataPane />
      case 'about':
        return <AboutPane />
    }
  }, [menu, props.config, props.onSave])

  return (
    <div style={styles.root}>
      <div className="settingsTopBar frosted">
        <div style={{ fontWeight: 700 }}>设置</div>
      </div>

      <div style={styles.bodyRow}>
        <div style={{ width: menuWidth, flexShrink: 0 }} className="settingsMenu frosted">
          {menuSections.map((section, si) => (
            <div key={section.label}>
              {si > 0 && <div style={styles.menuDivider} />}
              <div style={styles.sectionLabel}>{section.label}</div>
              {section.items.map((item) => (
                <MenuItem
                  key={item.key}
                  active={menu === item.key}
                  icon={item.icon}
                  onClick={() => void setMenuAndPersist(item.key)}
                >
                  {item.label}
                </MenuItem>
              ))}
            </div>
          ))}
        </div>

        {/* 拖动调整宽度手柄 */}
        <div
          style={styles.resizeHandle}
          onMouseDown={handleMouseDown}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)' }}
          onMouseLeave={(e) => { if (!isDragging.current) e.currentTarget.style.background = 'transparent' }}
        />

        <div style={styles.content}>{body}</div>
      </div>
    </div>
  )
}

function MenuItem(props: { active: boolean; icon: React.ReactNode; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`settingsMenuItem ${props.active ? 'settingsMenuItemActive' : ''}`}
    >
      {props.icon}
      {props.children}
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column' },
  bodyRow: { flex: 1, display: 'flex', minHeight: 0 },
  content: { flex: 1, overflow: 'auto', background: 'var(--bg)' },
  menuDivider: {
    height: 1,
    background: 'var(--border)',
    margin: '6px 12px',
    opacity: 0.5,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    padding: '6px 14px 2px',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    userSelect: 'none' as const,
  },
  resizeHandle: {
    width: 4,
    cursor: 'col-resize',
    background: 'transparent',
    flexShrink: 0,
  },
}
