import { useCallback, useEffect, useMemo, useState } from 'react'

import type { AppConfig, SettingsMenuKey } from '../../../../shared/types'
import { BadgeInfo, Bot, Boxes, Cpu, Database, Earth, Globe, Heart, Monitor, Terminal, Volume2, Zap } from 'lucide-react'

import { ScrollArea } from '../../components/ui/scroll-area'
import { cn } from '../../lib/utils'
import { SidebarResizeHandle } from '../../components/SidebarResizeHandle'
import { AboutPane } from './AboutPane'
import { AssistantPane } from './AssistantPane'
import { BackupPane } from './BackupPane'
import { DependenciesPane } from './DependenciesPane'
import { DataPane } from './DataPane'
import { DefaultModelPane } from './DefaultModelPane'
import { DisplayPane } from './DisplayPane'
import { McpPane } from './McpPane'
import { NetworkProxyPane } from './NetworkProxyPane'
import { ProvidersPane } from './ProvidersPane'
import { QuickPhrasesPane } from './QuickPhrasesPane'
import { SearchPane } from './SearchPane'
import { TtsPane } from './TtsPane'

const MENU_MIN_WIDTH = 200
const MENU_MAX_WIDTH = 480

const menuItems: Array<{ key: SettingsMenuKey; icon: React.ReactNode; label: string }> = [
  { key: 'display', icon: <Monitor className="h-4 w-4" />, label: '显示' },
  { key: 'assistant', icon: <Bot className="h-4 w-4" />, label: '助手' },
  { key: 'providers', icon: <Boxes className="h-4 w-4" />, label: '供应商' },
  { key: 'defaultModel', icon: <Heart className="h-4 w-4" />, label: '默认模型' },
  { key: 'search', icon: <Earth className="h-4 w-4" />, label: '搜索' },
  { key: 'mcp', icon: <Terminal className="h-4 w-4" />, label: 'MCP' },
  { key: 'quickPhrases', icon: <Zap className="h-4 w-4" />, label: '快捷短语' },
  { key: 'tts', icon: <Volume2 className="h-4 w-4" />, label: '语音合成' },
  { key: 'networkProxy', icon: <Globe className="h-4 w-4" />, label: '网络代理' },
  { key: 'backup', icon: <Database className="h-4 w-4" />, label: '备份' },
  { key: 'about', icon: <BadgeInfo className="h-4 w-4" />, label: '关于' }
  , { key: 'dependencies', icon: <Cpu className="h-4 w-4" />, label: 'Dependencies / SDK' }
]

export function SettingsPage(props: { config: AppConfig; onSave: (next: AppConfig) => Promise<void> }) {
  const initialMenu = (props.config.ui.desktop.selectedSettingsMenu === 'data'
    ? 'backup'
    : props.config.ui.desktop.selectedSettingsMenu) as SettingsMenuKey

  const [menu, setMenu] = useState<SettingsMenuKey>(initialMenu)
  const [menuWidth, setMenuWidth] = useState(() => {
    const w = props.config.ui.desktop.settingsSidebarWidth ?? 256
    return Math.max(MENU_MIN_WIDTH, Math.min(MENU_MAX_WIDTH, w))
  })

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

  useEffect(() => {
    const extMenu = props.config.ui.desktop.selectedSettingsMenu
    if (extMenu) {
      const targetMenu = extMenu === 'data' ? 'backup' : extMenu
      if (targetMenu !== menu) {
        setMenu(targetMenu as SettingsMenuKey)
      }
    }
  }, [props.config.ui.desktop.selectedSettingsMenu, menu])

  const handleMenuDrag = useCallback((dx: number) => {
    setMenuWidth((w) => Math.max(MENU_MIN_WIDTH, Math.min(MENU_MAX_WIDTH, w + dx)))
  }, [])

  const handleMenuDragEnd = useCallback(async () => {
    const current = props.config.ui.desktop.settingsSidebarWidth ?? 256
    if (Math.round(current) === Math.round(menuWidth)) return
    await props.onSave({
      ...props.config,
      ui: {
        ...props.config.ui,
        desktop: {
          ...props.config.ui.desktop,
          settingsSidebarWidth: Math.round(menuWidth)
        }
      }
    })
  }, [menuWidth, props.config, props.onSave])

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
        return <SearchPane config={props.config} onSave={props.onSave} />
      case 'mcp':
        return <McpPane config={props.config} onSave={props.onSave} />
      case 'quickPhrases':
        return <QuickPhrasesPane config={props.config} onSave={props.onSave} />
      case 'tts':
        return <TtsPane />
      case 'networkProxy':
        return <NetworkProxyPane config={props.config} onSave={props.onSave} />
      case 'backup':
        return <BackupPane config={props.config} onSave={props.onSave} />
      case 'dependencies':
        return <DependenciesPane config={props.config} onSave={props.onSave} />
      case 'data':
        return <DataPane />
      case 'about':
        return <AboutPane />
    }
  }, [menu, props.config, props.onSave])

  return (
    <div className="h-full w-full bg-background text-foreground">
      <div className="h-9 flex items-start px-4 pt-2">
        <div className="text-[15px] font-extrabold">设置</div>
      </div>

      <div className="h-[calc(100%-36px)] flex min-h-0">
        <div className="shrink-0 border-r bg-background/40" style={{ width: menuWidth }}>
          <ScrollArea className="h-full">
            <div className="p-3 space-y-1">
              {menuItems.map((item) => {
                const active = menu === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={cn(
                      [
                        'relative w-full h-10 px-3 rounded-md border text-sm',
                        'flex items-center gap-2',
                        'transition-colors',
                        'hover:bg-accent hover:border-border',
                        active ? 'bg-accent border-border' : 'border-transparent'
                      ].join(' ')
                    )}
                    onClick={() => void setMenuAndPersist(item.key)}
                  >
                    <span className={cn('opacity-80', active && 'text-primary opacity-100')}>{item.icon}</span>
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
                      {item.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        </div>

        <SidebarResizeHandle visible={true} onDrag={handleMenuDrag} onDragEnd={() => void handleMenuDragEnd()} side="left" />

        <div className="flex-1 min-w-0 overflow-auto">{body}</div>
      </div>
    </div>
  )
}
