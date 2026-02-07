/**
 * 工作区选择器
 * 显示在侧边栏顶部，允许切换工作区
 */
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Folder, Plus, Edit2, Trash2, Check, X } from 'lucide-react'
import type { DbWorkspace } from '../../../../shared/db-types'

interface Props {
  workspaces: DbWorkspace[]
  activeWorkspaceId: string | null
  onSelect: (id: string | null) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function WorkspaceSelector(props: Props) {
  const { workspaces, activeWorkspaceId, onSelect, onCreate, onRename, onDelete } = props
  const [open, setOpen] = useState(false)
  const [menuWorkspaceId, setMenuWorkspaceId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [wsDeleteConfirm, setWsDeleteConfirm] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const wsDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // 关闭右键菜单
  useEffect(() => {
    if (!menuWorkspaceId) return
    // 菜单关闭时重置删除确认
    setWsDeleteConfirm(false)
    if (wsDeleteTimerRef.current) clearTimeout(wsDeleteTimerRef.current)
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuWorkspaceId(null)
        setWsDeleteConfirm(false)
        if (wsDeleteTimerRef.current) clearTimeout(wsDeleteTimerRef.current)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuWorkspaceId])

  // 清理 timer
  useEffect(() => {
    return () => {
      if (wsDeleteTimerRef.current) clearTimeout(wsDeleteTimerRef.current)
    }
  }, [])

  // 编辑时聚焦
  useEffect(() => {
    if ((editingId || isCreating) && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId, isCreating])

  function handleContextMenu(e: React.MouseEvent, wsId: string) {
    e.preventDefault()
    e.stopPropagation()
    // 不允许操作默认工作区
    if (wsId === 'default') return
    setMenuWorkspaceId(wsId)
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  function handleRenameClick() {
    const ws = workspaces.find((w) => w.id === menuWorkspaceId)
    if (!ws) return
    setMenuWorkspaceId(null)
    setEditingId(ws.id)
    setEditingName(ws.name)
  }

  function handleRenameConfirm() {
    if (editingId && editingName.trim()) {
      onRename(editingId, editingName.trim())
    }
    setEditingId(null)
    setEditingName('')
  }

  function handleDeleteClick() {
    const id = menuWorkspaceId
    if (!id || id === 'default') return

    if (wsDeleteConfirm) {
      if (wsDeleteTimerRef.current) clearTimeout(wsDeleteTimerRef.current)
      setWsDeleteConfirm(false)
      setMenuWorkspaceId(null)
      onDelete(id)
    } else {
      setWsDeleteConfirm(true)
      wsDeleteTimerRef.current = setTimeout(() => setWsDeleteConfirm(false), 3000)
    }
  }

  function handleCreateConfirm() {
    if (newName.trim()) {
      onCreate(newName.trim())
    }
    setIsCreating(false)
    setNewName('')
  }

  return (
    <div className="workspaceSelector">
      <button
        ref={triggerRef}
        type="button"
        className="workspaceSelectorTrigger"
        onClick={() => setOpen(!open)}
      >
        <Folder size={14} />
        <span className="workspaceSelectorName">{activeWorkspace?.name ?? '全部对话'}</span>
        <ChevronDown size={14} className={`workspaceSelectorArrow ${open ? 'open' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="workspaceDropdown frosted"
          style={{
            position: 'fixed',
            left: triggerRef.current?.getBoundingClientRect().left ?? 0,
            top: (triggerRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
            minWidth: triggerRef.current?.offsetWidth ?? 180,
            zIndex: 9999
          }}
        >
          {/* 全部对话选项 */}
          <button
            type="button"
            className={`workspaceDropdownItem ${activeWorkspaceId === null ? 'active' : ''}`}
            onClick={() => { onSelect(null); setOpen(false) }}
          >
            <Folder size={14} />
            <span>全部对话</span>
          </button>

          <div className="workspaceDropdownDivider" />

          {/* 工作区列表 */}
          {workspaces.map((ws) => (
            <div key={ws.id} onContextMenu={(e) => handleContextMenu(e, ws.id)}>
              {editingId === ws.id ? (
                <input
                  ref={inputRef}
                  className="workspaceDropdownInput"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameConfirm()
                    if (e.key === 'Escape') { setEditingId(null); setEditingName('') }
                  }}
                  onBlur={handleRenameConfirm}
                />
              ) : (
                <button
                  type="button"
                  className={`workspaceDropdownItem ${ws.id === activeWorkspaceId ? 'active' : ''}`}
                  onClick={() => { onSelect(ws.id); setOpen(false) }}
                >
                  {ws.icon ? <span>{ws.icon}</span> : <Folder size={14} />}
                  <span>{ws.name}</span>
                </button>
              )}
            </div>
          ))}

          <div className="workspaceDropdownDivider" />

          {/* 新建工作区 */}
          {isCreating ? (
            <input
              ref={inputRef}
              className="workspaceDropdownInput"
              placeholder="工作区名称..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateConfirm()
                if (e.key === 'Escape') { setIsCreating(false); setNewName('') }
              }}
              onBlur={handleCreateConfirm}
            />
          ) : (
            <button
              type="button"
              className="workspaceDropdownItem workspaceDropdownAdd"
              onClick={() => setIsCreating(true)}
            >
              <Plus size={14} />
              <span>新建工作区</span>
            </button>
          )}
        </div>,
        document.body
      )}

      {/* 右键菜单 */}
      {menuWorkspaceId && createPortal(
        <div
          ref={menuRef}
          className="contextMenu"
          style={{ position: 'fixed', left: menuPos.x, top: menuPos.y, zIndex: 9999 }}
        >
          <button type="button" className="contextMenuItem" onClick={handleRenameClick}>
            <Edit2 size={14} />
            <span>重命名</span>
          </button>
          <div className="contextMenuDivider" />
          {wsDeleteConfirm ? (
            <div className="contextMenuDeleteConfirm">
              <button type="button" className="contextMenuItem contextMenuItemDanger" onClick={handleDeleteClick}>
                <Check size={14} />
                <span>确认删除</span>
              </button>
              <button type="button" className="contextMenuItem" onClick={() => setWsDeleteConfirm(false)}>
                <X size={14} />
                <span>取消</span>
              </button>
            </div>
          ) : (
            <button type="button" className="contextMenuItem contextMenuItemDanger" onClick={handleDeleteClick}>
              <Trash2 size={14} />
              <span>删除</span>
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
