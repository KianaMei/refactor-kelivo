/**
 * 会话侧边栏
 * 对齐 Flutter 版本 Kelivo：side_drawer.dart + ChatTile
 * - 置顶分组 + 日期分组（可选）
 * - 会话条目为单行卡片（标题 + 计数徽章 + 生成中圆点）
 * - 右键菜单为玻璃质感（带删除二次确认）
 * - 重命名使用对话框（不做列表内联编辑）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Edit2, History, Pin, RotateCw, Search, Trash2, X } from 'lucide-react'

import type { AssistantConfig } from '../../../../shared/types'
import { useDialogClose } from '../../hooks/useDialogClose'
import { MessageSearchDialog } from './MessageSearchDialog'

export interface Conversation {
  id: string
  title: string
  updatedAt: number
  pinned?: boolean
  assistantId?: string
  workspaceId?: string | null
  /** 对齐 Flutter：折叠版本后的 assistant 消息数（用于徽章显示） */
  assistantCount?: number
  /** 对齐 Flutter：清除上下文后的截断索引（-1 表示不截断） */
  truncateIndex?: number
  /** 对齐 Flutter：会话级推理预算（token 数或 effort level） */
  thinkingBudget?: number | null
}

interface Props {
  conversations: Conversation[]
  activeConvId: string
  /** 发消息时的 loading（显示波浪线） */
  loadingConversationIds?: Set<string>
  /** 生成标题时的 loading（显示转圈） */
  titleGeneratingIds?: Set<string>
  assistantConfigs?: Record<string, AssistantConfig>
  showChatListDate?: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, newTitle: string) => void
  onDelete: (id: string) => void
  onTogglePin: (id: string) => void
  onRegenerateTitle?: (id: string) => void
  onSearchSelect?: (conversationId: string, messageId: string) => void
}

interface MenuState {
  open: boolean
  // 鼠标触发点（用于计算 above/below）
  anchorX: number
  anchorY: number
  // 实际渲染位置（经过 gap + clamp）
  x: number
  y: number
  convId: string | null
}

interface RenameState {
  open: boolean
  id: string
  title: string
}

interface DateGroup {
  label: string
  key: string
  items: Conversation[]
}

const MENU_GAP = 8

function formatDateLabel(ts: number): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d = new Date(ts)
  const aDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.floor((today.getTime() - aDay.getTime()) / (24 * 60 * 60 * 1000))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'

  const sameYear = now.getFullYear() === d.getFullYear()
  if (sameYear) return `${d.getMonth() + 1}月${d.getDate()}日`
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function groupByDate(items: Conversation[]): DateGroup[] {
  const map = new Map<string, Conversation[]>()
  for (const c of items) {
    const d = new Date(c.updatedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const list = map.get(key) ?? []
    list.push(c)
    map.set(key, list)
  }

  const keys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : -1))
  return keys.map((key) => {
    const list = map.get(key) ?? []
    list.sort((a, b) => b.updatedAt - a.updatedAt)
    return { key, label: formatDateLabel(list[0]?.updatedAt ?? Date.now()), items: list }
  })
}

export function ConversationSidebar(props: Props) {
  const {
    conversations,
    activeConvId,
    loadingConversationIds = new Set(),
    titleGeneratingIds = new Set(),
    onSearchSelect,
    showChatListDate = true
  } = props

  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const [menu, setMenu] = useState<MenuState>({
    open: false,
    anchorX: 0,
    anchorY: 0,
    x: 0,
    y: 0,
    convId: null
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const [renameDialog, setRenameDialog] = useState<RenameState>({ open: false, id: '', title: '' })
  const renameInputRef = useRef<HTMLInputElement>(null)

  const closeMenu = useCallback(() => {
    setMenu((m) => ({ ...m, open: false }))
    setConfirmDelete(false)
  }, [])
  useDialogClose(menu.open, closeMenu)

  const closeRename = useCallback(() => {
    setRenameDialog({ open: false, id: '', title: '' })
  }, [])
  useDialogClose(renameDialog.open, closeRename)

  useEffect(() => {
    if (!renameDialog.open) return
    const t = setTimeout(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }, 0)
    return () => clearTimeout(t)
  }, [renameDialog.open])

  // 过滤（搜索）后再分组：对齐 Flutter 逻辑
  const { pinnedList, groups } = useMemo(() => {
    let list = [...conversations]
    if (query.trim()) {
      const q = query.toLowerCase().trim()
      list = list.filter((c) => c.title.toLowerCase().includes(q))
    }

    const pinned = list.filter((c) => !!c.pinned).sort((a, b) => b.updatedAt - a.updatedAt)
    const rest = list.filter((c) => !c.pinned)

    return { pinnedList: pinned, groups: groupByDate(rest) }
  }, [conversations, query])

  function getConv(id: string | null): Conversation | null {
    if (!id) return null
    return conversations.find((c) => c.id === id) ?? null
  }

  function openMenuAt(e: React.MouseEvent, convId: string) {
    e.preventDefault()
    e.stopPropagation()
    const ax = e.clientX
    const ay = e.clientY
    setMenu({ open: true, anchorX: ax, anchorY: ay, x: ax, y: ay, convId })
    setConfirmDelete(false)
  }

  // 菜单定位：对齐 Flutter desktop_context_menu.dart 的 gap + clamp + above/below 策略
  useEffect(() => {
    if (!menu.open) return
    const raf = requestAnimationFrame(() => {
      const el = menuRef.current
      if (!el) return

      const w = el.offsetWidth
      const h = el.offsetHeight
      const screenW = window.innerWidth
      const screenH = window.innerHeight
      const padding = 8

      const minX = padding
      const maxX = Math.max(minX, screenW - w - padding)
      const minY = padding
      const maxY = Math.max(minY, screenH - h - padding)

      const availableBelow = screenH - padding - menu.anchorY
      const availableAbove = menu.anchorY - padding
      const placeAbove = availableBelow < h && availableAbove > availableBelow

      let x = Math.max(minX, Math.min(menu.anchorX + MENU_GAP, maxX))
      let y = placeAbove ? (menu.anchorY - MENU_GAP - h) : (menu.anchorY + MENU_GAP)
      y = Math.max(minY, Math.min(y, maxY))

      if (x !== menu.x || y !== menu.y) {
        setMenu((m) => ({ ...m, x, y }))
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [menu.open, menu.anchorX, menu.anchorY, menu.x, menu.y, confirmDelete])

  function handleRenameClick() {
    const conv = getConv(menu.convId)
    if (!conv) return
    closeMenu()
    setRenameDialog({ open: true, id: conv.id, title: conv.title })
  }

  function handleRenameConfirm() {
    const title = renameDialog.title.trim()
    if (renameDialog.id && title) {
      props.onRename(renameDialog.id, title)
    }
    closeRename()
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

  function handleDeleteClick() {
    const id = menu.convId
    if (!id) return

    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    closeMenu()
    props.onDelete(id)
  }

  return (
    <div className="chatSidebar frosted">
      {/* 顶部：搜索框 + 历史按钮（对齐 Flutter） */}
      <div className="chatSidebarHeader">
        <div className="chatSidebarSearchBox">
          <Search size={16} className="chatSidebarSearchIcon" />
          <input
            className="chatSidebarSearchInput"
            placeholder="搜索对话..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button type="button" className="chatSidebarSearchClear" onClick={() => setQuery('')}>
              <X size={16} />
            </button>
          ) : (
            <button type="button" className="chatSidebarHistoryBtn" title="历史" onClick={() => setSearchOpen(true)}>
              <History size={16} />
            </button>
          )}
        </div>
      </div>

      {/* 会话列表（置顶 + 日期分组） */}
      <div className="chatConvList">
        {pinnedList.length === 0 && groups.every((g) => g.items.length === 0) ? (
          <div style={{ padding: 16, opacity: 0.6, fontSize: 13, textAlign: 'center' }}>
            {query ? '无匹配结果' : '暂无对话'}
          </div>
        ) : (
          <>
            {pinnedList.length > 0 && (
              <>
                <div className="chatConvSectionLabel">置顶</div>
                <div className="chatConvSection">
                  {pinnedList.map((c) => {
                    const isStreaming = loadingConversationIds.has(c.id)
                    const isTitleGenerating = titleGeneratingIds.has(c.id)
                    const count = c.assistantCount ?? 0
                    return (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        className={`chatConvItem ${c.id === activeConvId ? 'chatConvItemActive' : ''}`}
                        onClick={() => props.onSelect(c.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') props.onSelect(c.id) }}
                        onContextMenu={(e) => openMenuAt(e, c.id)}
                      >
                        <div className="chatConvItemContent">
                          <Pin size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
                          <span className="chatConvTitle">{c.title}</span>
                          {isStreaming && (
                            <span className="chatConvWave">
                              <span /><span /><span />
                            </span>
                          )}
                          {isTitleGenerating && <span className="chatConvSpinner" />}
                        </div>
                        <div className="chatConvMeta">
                          <span className="chatConvMetaTime">{formatTime(c.updatedAt)}</span>
                          {count > 0 && <span className="chatConvMetaCount">{count} 条消息</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ height: 8 }} />
              </>
            )}

            {groups.map((group) => (
              <div key={group.key}>
                {showChatListDate && <div className="chatConvSectionLabel">{group.label}</div>}
                <div className="chatConvSection">
                  {group.items.map((c) => {
                    const isStreaming = loadingConversationIds.has(c.id)
                    const isTitleGenerating = titleGeneratingIds.has(c.id)
                    const count = c.assistantCount ?? 0
                    return (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        className={`chatConvItem ${c.id === activeConvId ? 'chatConvItemActive' : ''}`}
                        onClick={() => props.onSelect(c.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') props.onSelect(c.id) }}
                        onContextMenu={(e) => openMenuAt(e, c.id)}
                      >
                        <div className="chatConvItemContent">
                          {c.pinned && <Pin size={12} style={{ opacity: 0.6, flexShrink: 0 }} />}
                          <span className="chatConvTitle">{c.title}</span>
                          {isStreaming && (
                            <span className="chatConvWave">
                              <span /><span /><span />
                            </span>
                          )}
                          {isTitleGenerating && <span className="chatConvSpinner" />}
                        </div>
                        <div className="chatConvMeta">
                          <span className="chatConvMetaTime">{formatTime(c.updatedAt)}</span>
                          {count > 0 && <span className="chatConvMetaCount">{count} 条消息</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {showChatListDate && <div style={{ height: 8 }} />}
              </div>
            ))}
          </>
        )}
      </div>

      {/* 右键菜单（玻璃） */}
      {menu.open && createPortal(
        <div
          className="contextMenuOverlay"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            closeMenu()
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            closeMenu()
          }}
        >
          <div
            ref={menuRef}
            className="contextMenu"
            style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 10001 }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button type="button" className="contextMenuItem" onClick={handleRenameClick}>
              <Edit2 size={18} />
              <span>重命名</span>
            </button>
            <button type="button" className="contextMenuItem" onClick={handlePinClick}>
              <Pin size={18} />
              <span>{getConv(menu.convId)?.pinned ? '取消置顶' : '置顶'}</span>
            </button>
            {props.onRegenerateTitle && (
              <button type="button" className="contextMenuItem" onClick={handleRegenerateTitleClick}>
                <RotateCw size={18} />
                <span>重新生成标题</span>
              </button>
            )}

            {confirmDelete ? (
              <div className="contextMenuConfirmRow">
                <span className="contextMenuConfirmLabel">删除？</span>
                <button
                  type="button"
                  className="contextMenuConfirmBtn contextMenuConfirmBtnCancel"
                  onClick={() => setConfirmDelete(false)}
                  title="取消"
                >
                  <X size={18} />
                </button>
                <button
                  type="button"
                  className="contextMenuConfirmBtn contextMenuConfirmBtnConfirm"
                  onClick={handleDeleteClick}
                  title="确认"
                >
                  <Check size={18} />
                </button>
              </div>
            ) : (
              <button type="button" className="contextMenuItem contextMenuItemDanger" onClick={handleDeleteClick}>
                <Trash2 size={18} />
                <span>删除</span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* 重命名对话框 */}
      {renameDialog.open && createPortal(
        <div className="dialogOverlay" onMouseDown={closeRename}>
          <div
            className="dialogContent"
            style={{ width: 420 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="dialogHeader">
              <span className="dialogTitle">重命名</span>
              <button type="button" className="dialogCloseBtn" onClick={closeRename}>
                <X size={18} />
              </button>
            </div>
            <div className="dialogBody">
              <input
                ref={renameInputRef}
                className="input"
                value={renameDialog.title}
                onChange={(e) => setRenameDialog((s) => ({ ...s, title: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameConfirm()
                  if (e.key === 'Escape') closeRename()
                }}
                placeholder="输入新标题"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button type="button" className="btn" onClick={closeRename}>取消</button>
                <button type="button" className="btn btn-primary" onClick={handleRenameConfirm}>确定</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 全文搜索对话框（历史） */}
      <MessageSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectConversation={(convId, msgId) => {
          props.onSelect(convId)
          onSearchSelect?.(convId, msgId)
        }}
      />
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
