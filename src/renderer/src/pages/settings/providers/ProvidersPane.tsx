import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { createDefaultProviderConfig, type AppConfig, type ProviderConfigV2 } from '../../../../../shared/types'
import type { ImportedProvider } from '../../../../../shared/providerCodec'
import { ProviderCard } from './ProviderCard'
import { ConfirmDialog } from './dialogs/ConfirmDialog'
import { useConfirm } from '../../../hooks/useConfirm'
import { ImportProviderDialog } from './dialogs/ImportProviderDialog'
import { ProviderDetailPane } from './ProviderDetailPane'
import { ExportProviderDialog } from './dialogs/ExportProviderDialog'

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

import { safeUuid } from '../../../../../shared/utils'

// DragHandle 组件 - 6点拖拽手柄
function DragHandle({ size = 12 }: { size?: number }) {
  const dotSize = 3
  const gap = 4
  return (
    <div
      className="drag-handle"
      style={{
        width: 28,
        height: size,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignContent: 'center',
        gap: `${gap}px 6px`,
        opacity: 0.4,
        cursor: 'grab'
      }}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            background: 'currentColor'
          }}
        />
      ))}
    </div>
  )
}

export function ProvidersPane(props: {
  config: AppConfig
  onSave: (next: AppConfig) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()

  // 详情页状态
  const [detailProviderId, setDetailProviderId] = useState<string | null>(null)

  // 编辑弹窗（仅用于新增）
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formBaseUrl, setFormBaseUrl] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // 删除确认弹窗
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleteTargetName, setDeleteTargetName] = useState('')
  const [deletePosition, setDeletePosition] = useState<{ x: number; y: number } | undefined>()

  // 选择模式状态
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 搜索
  const [searchQuery, setSearchQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 导入弹窗
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  // 导出弹窗
  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  // 下拉菜单状态
  const [importMenuOpen, setImportMenuOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [selectionExportMenuOpen, setSelectionExportMenuOpen] = useState(false)
  const importMenuRef = useRef<HTMLDivElement>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const selectionExportMenuRef = useRef<HTMLDivElement>(null)

  // 拖拽排序状态
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [tempOrder, setTempOrder] = useState<string[] | null>(null)

  const providers = useMemo(() => {
    const map = props.config.providerConfigs
    const order = tempOrder ?? props.config.providersOrder
    const seen = new Set<string>()
    const list: ProviderConfigV2[] = []
    for (const k of order) {
      const p = map[k]
      if (!p) continue
      seen.add(k)
      list.push(p)
    }
    for (const [k, p] of Object.entries(map)) {
      if (seen.has(k)) continue
      list.push(p)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return list.filter(p => p.name.toLowerCase().includes(q))
    }
    return list
  }, [props.config.providerConfigs, props.config.providersOrder, searchQuery, tempOrder])

  // 选择操作
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(providers.map(p => p.id)))
  }, [providers])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // 拖拽排序处理
  const handleDragStart = useCallback((id: string, e: React.DragEvent) => {
    setDraggedId(id)
    const allIds = Object.keys(props.config.providerConfigs)
    const currentOrder = [...props.config.providersOrder]
    for (const pid of allIds) {
      if (!currentOrder.includes(pid)) {
        currentOrder.push(pid)
      }
    }
    setTempOrder(currentOrder)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }, [props.config.providerConfigs, props.config.providersOrder])

  const handleDragOver = useCallback((id: string, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!draggedId || id === draggedId || !tempOrder) return

    const sourceIndex = tempOrder.indexOf(draggedId)
    const targetIndex = tempOrder.indexOf(id)
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return

    const newOrder = [...tempOrder]
    newOrder.splice(sourceIndex, 1)
    newOrder.splice(targetIndex, 0, draggedId)
    setTempOrder(newOrder)
    setDragOverId(id)
  }, [draggedId, tempOrder])

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
    setDragOverId(null)
    setTempOrder(null)
  }, [])

  const handleDrop = useCallback(async (_targetId: string, e: React.DragEvent) => {
    e.preventDefault()
    if (!draggedId || !tempOrder) {
      handleDragEnd()
      return
    }

    await props.onSave({
      ...props.config,
      providersOrder: tempOrder
    })

    handleDragEnd()
  }, [draggedId, tempOrder, props, handleDragEnd])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  function openAddModal() {
    setEditingId(null)
    setFormName('')
    setFormBaseUrl('')
    setFormApiKey('')
    setFormError(null)
    setEditModalOpen(true)
  }

  async function handleSave() {
    setFormError(null)
    const name = formName.trim()
    const baseUrl = formBaseUrl.trim()
    const apiKey = formApiKey.trim()
    if (!name) { setFormError('名称不能为空'); return }
    if (!isHttpUrl(baseUrl)) { setFormError('请输入有效的 http(s) 地址'); return }

    setBusy(true)
    try {
      const key = editingId ?? safeUuid()
      const now = new Date().toISOString()
      const existing = props.config.providerConfigs[key]
      const base = existing ?? createDefaultProviderConfig(key, name)
      const provider: ProviderConfigV2 = {
        ...base,
        id: key,
        name,
        baseUrl,
        apiKey,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      }
      const nextConfigs = { ...props.config.providerConfigs, [key]: provider }
      const nextOrder = existing
        ? props.config.providersOrder
        : [key, ...props.config.providersOrder.filter((k) => k !== key)]
      await props.onSave({
        ...props.config,
        providerConfigs: nextConfigs,
        providersOrder: nextOrder,
        currentModelProvider: props.config.currentModelProvider ?? provider.id
      })
      setEditModalOpen(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 执行删除
  async function executeDelete() {
    if (busy || !deleteTargetId) return
    setDeleteConfirmOpen(false)
    setBusy(true)
    try {
      const nextConfigs = { ...props.config.providerConfigs }
      delete nextConfigs[deleteTargetId]
      const nextOrder = props.config.providersOrder.filter((k) => k !== deleteTargetId)
      const nextDefault = props.config.currentModelProvider === deleteTargetId
        ? (nextOrder[0] ?? Object.keys(nextConfigs)[0] ?? null)
        : props.config.currentModelProvider
      await props.onSave({
        ...props.config,
        providerConfigs: nextConfigs,
        providersOrder: nextOrder,
        currentModelProvider: nextDefault
      })
    } finally {
      setBusy(false)
      setDeleteTargetId(null)
      setDeleteTargetName('')
    }
  }

  async function handleToggleEnabled(id: string) {
    if (busy) return
    const provider = props.config.providerConfigs[id]
    if (!provider) return
    const nextConfigs = {
      ...props.config.providerConfigs,
      [id]: { ...provider, enabled: !provider.enabled }
    }
    await props.onSave({ ...props.config, providerConfigs: nextConfigs })
  }

  // 导入供应商
  const handleImport = useCallback(async (items: ImportedProvider[]) => {
    const nextConfigs = { ...props.config.providerConfigs }
    const nextOrder = [...props.config.providersOrder]

    for (const item of items) {
      const id = item.config.id
      if (nextConfigs[id]) {
        nextConfigs[id] = { ...item.config, id, updatedAt: new Date().toISOString() }
      } else {
        nextConfigs[id] = item.config
        nextOrder.unshift(id)
      }
    }

    await props.onSave({
      ...props.config,
      providerConfigs: nextConfigs,
      providersOrder: nextOrder
    })
  }, [props])

  // 从 .kelivo 文件导入
  const handleImportFromFile = useCallback(async () => {
    try {
      const result = await window.api.dialog.openFile({
        filters: [{ name: 'Kelivo 供应商包', extensions: ['kelivo'] }]
      })
      if (result.canceled || !result.buffer) return

      const { providers: imported } = await window.api.providerBundle.import(result.buffer)
      if (!imported.length) return

      const nextConfigs = { ...props.config.providerConfigs }
      const nextOrder = [...props.config.providersOrder]

      const newIds: string[] = []
      for (const p of imported) {
        const id = p.id
        nextConfigs[id] = { ...p, updatedAt: new Date().toISOString() }
        if (!nextOrder.includes(id)) {
          newIds.push(id)
        }
      }
      // 新导入的供应商保持原始顺序，整体插到列表头部
      nextOrder.unshift(...newIds)

      await props.onSave({
        ...props.config,
        providerConfigs: nextConfigs,
        providersOrder: nextOrder
      })
    } catch (e) {
      void confirm({
        title: '导入失败',
        message: e instanceof Error ? e.message : String(e),
        confirmText: '知道了'
      })
    }
  }, [props, confirm])

  const existingProviderIds = useMemo(
    () => new Set(Object.keys(props.config.providerConfigs)),
    [props.config.providerConfigs]
  )

  // ESC 退出选择模式
  useEffect(() => {
    if (!selectionMode) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitSelectionMode()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectionMode, exitSelectionMode])

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const anyMenuOpen = importMenuOpen || exportMenuOpen || selectionExportMenuOpen
    if (!anyMenuOpen) return

    const handleClick = (e: MouseEvent) => {
      if (importMenuOpen && importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setImportMenuOpen(false)
      }
      if (exportMenuOpen && exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
      if (selectionExportMenuOpen && selectionExportMenuRef.current && !selectionExportMenuRef.current.contains(e.target as Node)) {
        setSelectionExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [importMenuOpen, exportMenuOpen, selectionExportMenuOpen])

  // 如果有打开详情页的供应商，显示详情页
  const detailProvider = detailProviderId ? props.config.providerConfigs[detailProviderId] : null
  if (detailProvider) {
    return (
      <ProviderDetailPane
        provider={detailProvider}
        onBack={() => setDetailProviderId(null)}
        onSave={async (updated) => {
          const nextConfigs = { ...props.config.providerConfigs, [updated.id]: updated }
          await props.onSave({ ...props.config, providerConfigs: nextConfigs })
        }}
        onDelete={() => {
          const id = detailProviderId
          const name = detailProvider.name
          setDetailProviderId(null)
          setDeleteTargetId(id)
          setDeleteTargetName(name)
          setDeleteConfirmOpen(true)
        }}
      />
    )
  }

  return (
    <div className="providers-page">
      {/* 工具栏 */}
      <div className="providers-toolbar">
        {selectionMode ? (
          <>
            <span className="toolbar-title">已选择 {selectedIds.size} 项</span>
            <div style={{ flex: 1 }} />
            <button type="button" className="toolbar-text-btn" onClick={selectAll}>全选</button>
            {selectedIds.size > 0 && (
              <button type="button" className="toolbar-text-btn" onClick={deselectAll}>取消全选</button>
            )}
            {selectedIds.size > 0 && (
              <>
                {/* 导出下拉菜单 */}
                <div className="toolbar-dropdown" ref={selectionExportMenuRef}>
                  <button
                    type="button"
                    className="toolbar-text-btn"
                    onClick={() => setSelectionExportMenuOpen(!selectionExportMenuOpen)}
                  >
                    导出
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 4 }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {selectionExportMenuOpen && (
                    <div className="toolbar-dropdown-menu">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectionExportMenuOpen(false)
                          setExportDialogOpen(true)
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="17 8 12 3 7 8"/>
                          <line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        导出为文件
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectionExportMenuOpen(false)
                          void confirm({
                            title: '功能开发中',
                            message: '二维码导出功能正在开发中，敬请期待。',
                            confirmText: '知道了'
                          })
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="7" height="7"/>
                          <rect x="14" y="3" width="7" height="7"/>
                          <rect x="3" y="14" width="7" height="7"/>
                          <rect x="14" y="14" width="3" height="3"/>
                          <rect x="18" y="14" width="3" height="3"/>
                          <rect x="14" y="18" width="3" height="3"/>
                          <rect x="18" y="18" width="3" height="3"/>
                        </svg>
                        导出为二维码
                      </button>
                    </div>
                  )}
                </div>
                {/* 删除按钮 */}
                <button
                  type="button"
                  className="toolbar-text-btn danger"
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: '删除供应商',
                        message: `确定删除选中的 ${selectedIds.size} 个供应商吗？此操作不可撤销。`,
                        confirmText: '删除',
                        danger: true
                      })
                      if (!ok) return
                      const nextConfigs = { ...props.config.providerConfigs }
                      for (const id of selectedIds) {
                        delete nextConfigs[id]
                      }
                      const nextOrder = props.config.providersOrder.filter(k => !selectedIds.has(k))
                      const nextDefault = selectedIds.has(props.config.currentModelProvider ?? '')
                        ? (nextOrder[0] ?? Object.keys(nextConfigs)[0] ?? null)
                        : props.config.currentModelProvider
                      await props.onSave({
                        ...props.config,
                        providerConfigs: nextConfigs,
                        providersOrder: nextOrder,
                        currentModelProvider: nextDefault
                      })
                      exitSelectionMode()
                    })()
                  }}
                >
                  删除
                </button>
              </>
            )}
            <button type="button" className="toolbar-text-btn" onClick={exitSelectionMode}>取消</button>
          </>
        ) : (
          <>
            <span className="toolbar-title">供应商</span>
            <div style={{ flex: 1 }} />
            {/* 多选模式 */}
            <button type="button" className="toolbar-icon-btn" onClick={() => setSelectionMode(true)} title="多选模式">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </button>
            {/* 搜索 - 图标自身展开为搜索框 */}
            <div
              className={`search-morph ${searchExpanded ? 'expanded' : ''}`}
              onClick={() => {
                if (!searchExpanded) {
                  setSearchExpanded(true)
                  setTimeout(() => searchInputRef.current?.focus(), 50)
                }
              }}
            >
              <svg className="search-morph-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                className="search-morph-input"
                placeholder="搜索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => {
                  if (!searchQuery.trim()) {
                    setSearchExpanded(false)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchQuery('')
                    setSearchExpanded(false)
                    searchInputRef.current?.blur()
                  }
                }}
              />
              {searchExpanded && (
                <button
                  type="button"
                  className="search-morph-close"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSearchQuery('')
                    setSearchExpanded(false)
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {/* 导出下拉菜单 */}
            <div className="toolbar-dropdown" ref={exportMenuRef}>
              <button
                type="button"
                className="toolbar-icon-btn"
                title="导出"
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </button>
              {exportMenuOpen && (
                <div className="toolbar-dropdown-menu">
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false)
                      setExportDialogOpen(true)
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    导出为文件
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false)
                      void confirm({
                        title: '功能开发中',
                        message: '二维码导出功能正在开发中，敬请期待。',
                        confirmText: '知道了'
                      })
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7"/>
                      <rect x="14" y="3" width="7" height="7"/>
                      <rect x="3" y="14" width="7" height="7"/>
                      <rect x="14" y="14" width="3" height="3"/>
                      <rect x="18" y="14" width="3" height="3"/>
                      <rect x="14" y="18" width="3" height="3"/>
                      <rect x="18" y="18" width="3" height="3"/>
                    </svg>
                    导出为二维码
                  </button>
                </div>
              )}
            </div>
            {/* 导入下拉菜单 */}
            <div className="toolbar-dropdown" ref={importMenuRef}>
              <button
                type="button"
                className="toolbar-icon-btn"
                title="导入"
                onClick={() => setImportMenuOpen(!importMenuOpen)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
              {importMenuOpen && (
                <div className="toolbar-dropdown-menu">
                  <button
                    type="button"
                    onClick={() => {
                      setImportMenuOpen(false)
                      void handleImportFromFile()
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    从文件导入
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportMenuOpen(false)
                      void confirm({
                        title: '功能开发中',
                        message: '二维码导入功能正在开发中，敬请期待。',
                        confirmText: '知道了'
                      })
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7"/>
                      <rect x="14" y="3" width="7" height="7"/>
                      <rect x="3" y="14" width="7" height="7"/>
                      <rect x="14" y="14" width="3" height="3"/>
                      <rect x="18" y="14" width="3" height="3"/>
                      <rect x="14" y="18" width="3" height="3"/>
                      <rect x="18" y="18" width="3" height="3"/>
                    </svg>
                    从二维码导入
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportMenuOpen(false)
                      setImportDialogOpen(true)
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="16 18 22 12 16 6"/>
                      <polyline points="8 6 2 12 8 18"/>
                    </svg>
                    导入编码
                  </button>
                </div>
              )}
            </div>
            {/* 添加 */}
            <button type="button" className="toolbar-icon-btn" onClick={openAddModal} title="添加供应商">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </>
        )}
      </div>


      {/* 网格卡片 */}
      {providers.length === 0 ? (
        <div className="providers-empty">
          {searchQuery ? '没有匹配的供应商' : '暂无供应商，点击"添加"创建'}
        </div>
      ) : (
        <div className="providers-grid">
          {providers.map((p) => {
            const isEnabled = p.enabled !== false
            const isSelected = selectedIds.has(p.id)
            return (
              <ProviderCard
                key={p.id}
                provider={p}
                isEnabled={isEnabled}
                isSelected={isSelected}
                selectionMode={selectionMode}
                onToggleSelect={() => toggleSelect(p.id)}
                onClick={() => {
                  if (selectionMode) {
                    toggleSelect(p.id)
                  } else {
                    setDetailProviderId(p.id)
                  }
                }}
                onToggleEnabled={() => void handleToggleEnabled(p.id)}
                onDragStart={(e) => handleDragStart(p.id, e)}
                onDragOver={(e) => handleDragOver(p.id, e)}
                onDragEnd={handleDragEnd}
                onDrop={(e) => void handleDrop(p.id, e)}
                isDragging={draggedId === p.id}
              />
            )
          })}
        </div>
      )}

      {/* 编辑/新增弹窗 */}
      {editModalOpen && (
        <div className="modal-overlay" onMouseDown={() => setEditModalOpen(false)}>
          <div className="modal-surface provider-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>{editingId ? '编辑供应商' : '添加供应商'}</h4>
              <button type="button" className="modal-close" onClick={() => setEditModalOpen(false)}>✕</button>
            </div>

            <div className="modal-body">
              {formError && <div className="form-error">{formError}</div>}

              <div className="form-group">
                <label>名称</label>
                <input className="input" placeholder="OpenAI" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>

              <div className="form-group">
                <label>Base URL</label>
                <input className="input" placeholder="https://api.openai.com/v1" value={formBaseUrl} onChange={(e) => setFormBaseUrl(e.target.value)} />
              </div>

              <div className="form-group">
                <label>API Key</label>
                <input className="input" type="password" placeholder="sk-..." value={formApiKey} onChange={(e) => setFormApiKey(e.target.value)} />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setEditModalOpen(false)}>取消</button>
              <button type="button" className="btn btn-primary" disabled={busy || !formName.trim() || !formBaseUrl.trim()} onClick={() => void handleSave()}>
                {busy ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="删除供应商"
        message={`确定要删除 "${deleteTargetName}" 吗？此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        danger
        position={deletePosition}
        onConfirm={executeDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      {/* 导入对话框 */}
      <ImportProviderDialog
        open={importDialogOpen}
        existingIds={existingProviderIds}
        onImport={(items) => void handleImport(items)}
        onClose={() => setImportDialogOpen(false)}
      />

      {/* 导出到文件对话框 */}
      <ExportProviderDialog
        open={exportDialogOpen}
        providers={props.config.providerConfigs}
        providersOrder={props.config.providersOrder}
        onClose={() => setExportDialogOpen(false)}
      />
    </div>
  )
}
