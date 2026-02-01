import type { ThemeMode } from '../../../shared/types'
import { Bot, FlaskConical, HardDrive, Languages, MessageCircle, Monitor, Moon, Settings, Sun } from 'lucide-react'

export type NavKey = 'chat' | 'translate' | 'apiTest' | 'storage' | 'settings' | 'agent'

export function NavRail(props: {
  active: NavKey
  onChange: (next: NavKey) => void
  themeMode: ThemeMode
  onCycleTheme: () => void
}) {
  return (
    <div className="navRail frosted">
      <div className="navRailTopGap" />

      <AvatarButton />

      <div style={{ height: 12 }} />

      <RailButton active={props.active === 'chat'} label="对话" onClick={() => props.onChange('chat')}>
        <MessageCircle size={18} />
      </RailButton>
      <RailButton active={props.active === 'translate'} label="翻译" onClick={() => props.onChange('translate')}>
        <Languages size={18} />
      </RailButton>
      <RailButton active={props.active === 'apiTest'} label="API 测试" onClick={() => props.onChange('apiTest')}>
        <FlaskConical size={18} />
      </RailButton>
      <RailButton active={props.active === 'storage'} label="存储" onClick={() => props.onChange('storage')}>
        <HardDrive size={18} />
      </RailButton>
      <RailButton active={props.active === 'agent'} label="Agent" onClick={() => props.onChange('agent')}>
        <Bot size={18} />
      </RailButton>

      <div className="navRailSpacer" />

      <RailButton
        active={false}
        label={`主题：${themeLabel(props.themeMode)}（点击切换）`}
        onClick={props.onCycleTheme}
      >
        {themeIcon(props.themeMode)}
      </RailButton>

      <RailButton active={props.active === 'settings'} label="设置" onClick={() => props.onChange('settings')}>
        <Settings size={18} />
      </RailButton>

      <div style={{ height: 12 }} />
    </div>
  )
}

function AvatarButton() {
  return (
    <button type="button" className="navRailAvatarBtn" title="用户">
      <div className="navRailAvatarCircle">K</div>
    </button>
  )
}

function RailButton(props: {
  active: boolean
  label: string
  onClick: () => void
  children: any
}) {
  return (
    <button
      type="button"
      title={props.label}
      onClick={props.onClick}
      className={`navRailBtn ${props.active ? 'navRailBtnActive' : ''}`}
    >
      {props.children}
    </button>
  )
}

function themeLabel(mode: ThemeMode): string {
  if (mode === 'system') return '跟随系统'
  if (mode === 'light') return '浅色'
  return '深色'
}

function themeIcon(mode: ThemeMode) {
  if (mode === 'light') return <Sun size={18} />
  if (mode === 'dark') return <Moon size={18} />
  return <Monitor size={18} />
}
