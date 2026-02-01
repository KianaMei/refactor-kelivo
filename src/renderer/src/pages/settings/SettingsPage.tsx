import { useMemo, useState, useRef, useCallback } from 'react'

import type { AppConfig, SettingsMenuKey } from '../../../../shared/types'
import { BadgeInfo, Bot, Boxes, Database, Earth, Globe, Heart, Monitor, Terminal, Volume2, Zap } from 'lucide-react'
import { AboutPane } from './AboutPane'
import { AssistantPane } from './AssistantPane'
import { BackupPane } from './BackupPane'
import { DefaultModelPane } from './DefaultModelPane'
import { DisplayPane } from './DisplayPane'
import { McpPane } from './McpPane'
import { NetworkProxyPane } from './NetworkProxyPane'
import { ProvidersPane } from './ProvidersPane'
import { QuickPhrasesPane } from './QuickPhrasesPane'
import { SearchPane } from './SearchPane'
import { TtsPane } from './TtsPane'

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
        return <AssistantPane />
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
          <MenuItem active={menu === 'display'} icon={<Monitor className="settingsMenuItemIcon" />} onClick={() => void setMenuAndPersist('display')}>
            显示
          </MenuItem>
          <MenuItem active={menu === 'assistant'} icon={<Bot className="settingsMenuItemIcon" />} onClick={() => void setMenuAndPersist('assistant')}>
            助手
          </MenuItem>
          <MenuItem active={menu === 'providers'} icon={<Boxes className="settingsMenuItemIcon" />} onClick={() => void setMenuAndPersist('providers')}>
            供应商
          </MenuItem>
          <MenuItem active={menu === 'defaultModel'} icon={<Heart className="settingsMenuItemIcon" />} onClick={() => void setMenuAndPersist('defaultModel')}>
            默认模型
          </MenuItem>
          <MenuItem active={menu === 'search'} icon={<Earth className="settingsMenuItemIcon" />} onClick={() => void setMenuAndPersist('search')}>
            搜索
          </MenuItem>
          <MenuItem active={menu === 'mcp'} icon={<Terminal className="settingsMenuItemIcon" />} onClick={() => void setMenuAndPersist('mcp')}>
            MCP
          </MenuItem>
          <MenuItem active={menu === 'quickPhrases'} icon={<Zap className="settingsMenuItemIcon" />} onClick={() => void setMenuAndPersist('quickPhrases')}>
            快捷短语
          </MenuItem>
          <MenuItem active={menu === 'tts'} icon={<Volume2 className="settingsMenuItemIcon" />} onClick={() => void setMenuAndPersist('tts')}>
            TTS
          </MenuItem>
          <MenuItem active={menu === 'networkProxy'} icon={<Globe className="settingsMenuItemIcon" />} onClick={() => void setMenuAndPersist('networkProxy')}>
            网络代理
          </MenuItem>
          <MenuItem active={menu === 'backup'} icon={<Database className="settingsMenuItemIcon" />} onClick={() => void setMenuAndPersist('backup')}>
            备份
          </MenuItem>
          <MenuItem active={menu === 'about'} icon={<BadgeInfo className="settingsMenuItemIcon" />} onClick={() => void setMenuAndPersist('about')}>
            关于
          </MenuItem>
        </div>

        {/* 拖动调整宽度手柄 */}
        <div
          style={{
            width: 4,
            cursor: 'col-resize',
            background: 'transparent',
            flexShrink: 0,
          }}
          onMouseDown={handleMouseDown}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)' }}
          onMouseLeave={(e) => { if (!isDragging.current) e.currentTarget.style.background = 'transparent' }}
        />

        <div style={styles.content}>{body}</div>
      </div>
    </div>
  )
}

function MenuItem(props: { active: boolean; icon: any; onClick: () => void; children: string }) {
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
  content: { flex: 1, overflow: 'auto', background: 'var(--bg)' }
}
