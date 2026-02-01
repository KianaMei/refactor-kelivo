/**
 * 会话侧边栏
 * 对齐旧版 Kelivo 的 side_drawer.dart
 * 包括：会话列表、搜索、新建、右键菜单（重命名/删除/置顶）
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Plus, Search, Pin, Edit2, Trash2, RotateCw, MoreHorizontal, MessageCircle, X } from 'lucide-react'
import { useDialogClose } from '../../hooks/useDialogClose'

export interface Conversation {
  id: string
  title: string
  updatedAt: number
  pinned?: boolean
  assistantId?: string
  messageCount?: number
}

interface Props {
  conversations: Conversation[]
  activeConvId: string
  loadingConversationIds?: Set<string>
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, newTitle: string) => void
  onDelete: (id: string) => void
  onTogglePin: (id: string) => void
  onRegenerateTitle?: (id: string) => void
}

interface MenuState {
  open: boolean
  x: number
  y: number
  convId: string | null
}

export function ConversationSidebar(props: Props) {
  const { conversations, activeConvId, loadingConversationIds = new Set() } = props
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<MenuState>({ open: false, x: 0, y: 0, convId: null })
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; convId: string; title: string }>({
    open: false,
    convId: '',
    title: ''
  })
  const menuRef = useRef<HTMLDivElement>(null)

  // 过滤和排序会话
  const filtered = useMemo(() => {
    let list = [...conversations]
    // 搜索过滤
    if (query.trim()) {
      const q = query.toLowerCase().trim()
      list = list.filter((c) => c.title.toLowerCase().includes(q))
    }
    // 置顶优先，然后按更新时间排序
    list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.updatedAt - a.updatedAt
    })
    return list
  }, [conversations, query])

  const closeMenuCb = useCallback(() => setMenu((m) => ({ ...m, open: false })), [])
  useDialogClose(menu.open, closeMenuCb)

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menu.open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu((m) => ({ ...m, open: false }))
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menu.open])

  const closeRenameCb = useCallback(() => setRenameDialog((d) => ({ ...d, open: false })), [])
  useDialogClose(renameDialog.open, closeRenameCb)

  function handleContextMenu(e: React.MouseEvent, conv: Conversation) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ open: true, x: e.clientX, y: e.clientY, convId: conv.id })
  }

  function closeMenu() {
    setMenu((m) => ({ ...m, open: false }))
  }

  function getConv(id: string | null) {
    if (!id) return null
    return conversations.find((c) => c.id === id) ?? null
  }

  function handleRenameClick() {
    const conv = getConv(menu.convId)
    if (!conv) return
    closeMenu()
    setRenameDialog({ open: true, convId: conv.id, title: conv.title })
  }

  function handleRenameConfirm() {
    if (renameDialog.title.trim()) {
      props.onRename(renameDialog.convId, renameDialog.title.trim())
    }
    setRenameDialog({ open: false, convId: '', title: '' })
  }

  function handleDeleteClick() {
    const id = menu.convId
    closeMenu()
    if (id) props.onDelete(id)
  }

  function handlePinClick() {
    const id = menu.convId
    closeMenu()
    if (id) props.onTogglePin(id)
  }

  function handleRegenerateTitleClick() {
    const id = menu.convId
    closeMenu()
    if (id && props.onRegenerateTitle) props.onRegenerateTitle(id)
  }

  return (
    <div className="chatSidebar frosted">
      {/* 头部：新建 + 搜索 */}
      <div className="chatSidebarHeader">
        <button type="button" className="btn btn-primary" onClick={props.onNew} title="新建对话">
          <Plus size={16} />
          <span>新建</span>
        </button>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
          <input
            className="input"
            style={{ paddingLeft: 32, width: '100%' }}
            placeholder="搜索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                opacity: 0.6,
                padding: 2
              }}
              onClick={() => setQuery('')}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 会话列表 */}
      <div className="chatConvList">
        {filtered.length === 0 ? (
          <div style={{ padding: 16, opacity: 0.6, fontSize: 13, textAlign: 'center' }}>
            {query ? '无匹配结果' : '暂无对话'}
          </div>
        ) : (
          filtered.map((c) => {
            const isLoading = loadingConversationIds.has(c.id)
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => props.onSelect(c.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') props.onSelect(c.id) }}
                onContextMenu={(e) => handleContextMenu(e, c)}
                className={`chatConvItem ${c.id === activeConvId ? 'chatConvItemActive' : ''}`}
              >
                <div className="chatConvItemContent">
                  {c.pinned && <Pin size={12} style={{ opacity: 0.6, flexShrink: 0 }} />}
                  <span className="chatConvTitle">{c.title}</span>
                  {isLoading && <span className="chatConvLoading" />}
                </div>
                <div className="chatConvMeta">
                  <span style={{ opacity: 0.6, fontSize: 11 }}>{formatTime(c.updatedAt)}</span>
                  {typeof c.messageCount === 'number' && c.messageCount > 0 && (
                    <span className="chatConvBadge">{c.messageCount}</span>
                  )}
                </div>
                {/* 更多按钮（hover 显示） */}
                <button
                  type="button"
                  className="chatConvMore"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleContextMenu(e, c)
                  }}
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* 右键菜单 */}
      {menu.open && (
        <div
          ref={menuRef}
          className="contextMenu frosted"
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 9999 }}
        >
          <button type="button" className="contextMenuItem" onClick={handleRenameClick}>
            <Edit2 size={14} />
            <span>重命名</span>
          </button>
          <button type="button" className="contextMenuItem" onClick={handlePinClick}>
            <Pin size={14} />
            <span>{getConv(menu.convId)?.pinned ? '取消置顶' : '置顶'}</span>
          </button>
          {props.onRegenerateTitle && (
            <button type="button" className="contextMenuItem" onClick={handleRegenerateTitleClick}>
              <RotateCw size={14} />
              <span>重新生成标题</span>
            </button>
          )}
          <div className="contextMenuDivider" />
          <button type="button" className="contextMenuItem contextMenuItemDanger" onClick={handleDeleteClick}>
            <Trash2 size={14} />
            <span>删除</span>
          </button>
        </div>
      )}

      {/* 重命名对话框 */}
      {renameDialog.open && (
        <div className="modalOverlay" onMouseDown={() => setRenameDialog((d) => ({ ...d, open: false }))}>
          <div className="modalSurface frosted" style={{ width: 360, padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>重命名对话</div>
            <input
              className="input"
              style={{ width: '100%', marginBottom: 16 }}
              value={renameDialog.title}
              onChange={(e) => setRenameDialog((d) => ({ ...d, title: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameConfirm()
                if (e.key === 'Escape') setRenameDialog((d) => ({ ...d, open: false }))
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setRenameDialog((d) => ({ ...d, open: false }))}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={handleRenameConfirm}>
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - ts

  // 今天
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  // 昨天
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) {
    return '昨天'
  }
  // 一周内
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return days[d.getDay()]
  }
  // 今年
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }
  // 更早
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}
