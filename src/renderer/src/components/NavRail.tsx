/**
 * 左侧导航栏 - 对齐 Flutter Kelivo 的 DesktopNavRail
 * 包括：聊天、翻译、知识库、助手、设置等图标
 */
import { useState } from 'react'
import {
  MessageCircle,
  Languages,
  BookOpen,
  Bot,
  Settings,
  FolderClosed
} from 'lucide-react'

export type NavRailPage = 'chat' | 'translate' | 'knowledge' | 'assistant' | 'files' | 'settings'

interface NavRailItem {
  id: NavRailPage
  icon: React.ReactNode
  label: string
}

interface Props {
  activePage: NavRailPage
  onPageChange: (page: NavRailPage) => void
  onOpenSettings?: () => void
  appName?: string
}

export function NavRail(props: Props) {
  const { activePage, onPageChange, onOpenSettings, appName = 'K' } = props
  const [hovered, setHovered] = useState<NavRailPage | null>(null)

  const topItems: NavRailItem[] = [
    { id: 'chat', icon: <MessageCircle size={22} />, label: '聊天' },
    { id: 'translate', icon: <Languages size={22} />, label: '翻译' },
    { id: 'knowledge', icon: <BookOpen size={22} />, label: '知识库' },
    { id: 'assistant', icon: <Bot size={22} />, label: '助手' },
    { id: 'files', icon: <FolderClosed size={22} />, label: '文件' }
  ]

  return (
    <div className="navRail">
      {/* Logo */}
      <div className="navRailLogo">
        <span>{appName}</span>
      </div>

      {/* 导航项 */}
      <div className="navRailItems">
        {topItems.map((item) => {
          const isActive = activePage === item.id
          const isHovered = hovered === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={`navRailItem ${isActive ? 'navRailItemActive' : ''}`}
              onClick={() => onPageChange(item.id)}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              title={item.label}
            >
              <div className={`navRailItemIcon ${isActive ? 'navRailItemIconActive' : ''}`}>
                {item.icon}
              </div>
              {(isHovered || isActive) && (
                <span className="navRailItemLabel">{item.label}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* 底部设置 */}
      <div className="navRailBottom">
        <button
          type="button"
          className="navRailItem"
          onClick={onOpenSettings}
          title="设置"
        >
          <div className="navRailItemIcon">
            <Settings size={22} />
          </div>
        </button>
      </div>
    </div>
  )
}
