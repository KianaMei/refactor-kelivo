import { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeMode, UserConfig } from '../../../shared/types'
import { Bot, FlaskConical, HardDrive, Languages, MessageCircle, Monitor, Moon, Palette, Settings, Sun } from 'lucide-react'
import { UserProfileDialog } from '../components/UserProfileDialog'
import { UserAvatar } from '../components/UserAvatar'

export type NavKey = 'chat' | 'translate' | 'apiTest' | 'imageStudio' | 'storage' | 'settings' | 'agent'

type TabDef = { key: NavKey; label: string; icon: React.ReactNode }

const ALL_TABS: TabDef[] = [
  { key: 'chat', label: '对话', icon: <MessageCircle size={18} /> },
  { key: 'translate', label: '翻译', icon: <Languages size={18} /> },
  { key: 'apiTest', label: 'API 测试', icon: <FlaskConical size={18} /> },
  { key: 'imageStudio', label: '绘画', icon: <Palette size={18} /> },
  { key: 'storage', label: '存储', icon: <HardDrive size={18} /> },
  { key: 'agent', label: 'Agent', icon: <Bot size={18} /> },
]

const DEFAULT_ORDER: NavKey[] = ALL_TABS.map(t => t.key)
const ORDER_KEY = 'kelivo_nav_order'

function loadOrder(): NavKey[] {
  try {
    const s = localStorage.getItem(ORDER_KEY)
    if (s) {
      const arr = JSON.parse(s) as NavKey[]
      if (Array.isArray(arr) && arr.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every(k => arr.includes(k))) {
        return arr
      }
    }
  } catch {}
  return [...DEFAULT_ORDER]
}

export function NavRail(props: {
  active: NavKey
  onChange: (next: NavKey) => void
  themeMode: ThemeMode
  onCycleTheme: () => void
  user?: UserConfig
  onUserChange?: (user: UserConfig) => void
}) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [order, setOrder] = useState<NavKey[]>(loadOrder)
  const [reorderMode, setReorderMode] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)
  const tabsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!reorderMode) return
    const handleMouseDown = (e: MouseEvent) => {
      if (tabsRef.current && tabsRef.current.contains(e.target as Node)) return
      setReorderMode(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [reorderMode])

  const tabMap = Object.fromEntries(ALL_TABS.map(t => [t.key, t])) as Record<NavKey, TabDef>
  const orderedTabs = order.map(k => tabMap[k])

  const handleMouseDown = useCallback(() => {
    if (reorderMode) return
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      setReorderMode(true)
    }, 500)
  }, [reorderMode])

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleTabClick = useCallback((key: NavKey) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }
    if (reorderMode) {
      setReorderMode(false)
    }
    props.onChange(key)
  }, [reorderMode, props])

  const handleDragStart = useCallback((index: number, e: React.DragEvent) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIndex(index)
  }, [])

  const handleDrop = useCallback((dropIdx: number) => {
    setDragIndex(null)
    setDropIndex(null)
    if (dragIndex === null || dragIndex === dropIdx) return
    const newOrder = [...order]
    const [moved] = newOrder.splice(dragIndex, 1)
    newOrder.splice(dropIdx, 0, moved)
    setOrder(newOrder)
    localStorage.setItem(ORDER_KEY, JSON.stringify(newOrder))
  }, [dragIndex, order])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDropIndex(null)
  }, [])

  const handleUserSave = (user: UserConfig) => {
    props.onUserChange?.(user)
  }

  return (
    <>
      <div className={`navRail frosted${reorderMode ? ' navRailReorderMode' : ''}`}>
        <div className="navRailTopGap" />

        <UserAvatar
          user={props.user}
          size={36}
          onClick={() => setProfileOpen(true)}
          className="navRailAvatarBtn"
        />

        <div style={{ height: 12 }} />

        <div ref={tabsRef} style={{ display: 'contents' }}>
        {orderedTabs.map((tab, index) => (
          <div
            key={tab.key}
            draggable={reorderMode}
            onDragStart={reorderMode ? (e) => handleDragStart(index, e) : undefined}
            onDragOver={reorderMode ? (e) => handleDragOver(index, e) : undefined}
            onDrop={reorderMode ? () => handleDrop(index) : undefined}
            onDragEnd={reorderMode ? handleDragEnd : undefined}
            className={[
              'navRailDragItem',
              dragIndex === index ? 'navRailDragItem--dragging' : '',
              dropIndex === index && dragIndex !== index ? 'navRailDragItem--over' : '',
            ].filter(Boolean).join(' ')}
          >
            <button
              type="button"
              title={reorderMode ? `拖动排序 · ${tab.label}（点击导航并退出）` : tab.label}
              onMouseDown={handleMouseDown}
              onMouseUp={clearLongPress}
              onMouseLeave={clearLongPress}
              onClick={() => handleTabClick(tab.key)}
              className={[
                'navRailBtn',
                props.active === tab.key && !reorderMode ? 'navRailBtnActive' : '',
                reorderMode ? 'navRailBtnReorder' : '',
              ].filter(Boolean).join(' ')}
            >
              {tab.icon}
            </button>
          </div>
        ))}
        </div>

        <div className="navRailSpacer" />

        <RailButton
          active={false}
          label={`主题：${themeLabel(props.themeMode)}（点击切换）`}
          onClick={props.onCycleTheme}
        >
          {themeIcon(props.themeMode)}
        </RailButton>

        <RailButton active={props.active === 'settings'} label="设置" onClick={() => { setReorderMode(false); props.onChange('settings') }}>
          <Settings size={18} />
        </RailButton>

        <div style={{ height: 12 }} />
      </div>

      <UserProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={props.user ?? { name: 'Kelivo', avatarType: 'initial', avatarValue: '' }}
        onSave={handleUserSave}
      />
    </>
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
