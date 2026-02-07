/**
 * 存储页面
 * 对齐旧版 Kelivo 的 storage_space_page.dart
 * 包括：存储统计、分类查看、清理功能
 */
import { useState, useEffect, useMemo } from 'react'
import {
  RefreshCw,
  Trash2,
  FolderOpen,
  Image,
  Paperclip,
  MessageSquare,
  Bot,
  Box,
  FileText,
  Boxes,
  ChevronRight,
  HardDrive,
  AlertTriangle,
  Check,
  CheckSquare,
  XCircle
} from 'lucide-react'
import type { StorageReport, StorageCategoryKey, StorageItemDetail } from '../../../shared/types'

// UI 专用的分类配置，包含图标和颜色
const CATEGORY_CONFIG: Record<StorageCategoryKey, { name: string; icon: React.ReactNode; color: string }> = {
  images: { name: '图片', icon: <Image size={16} />, color: '#6366F1' },
  files: { name: '文件', icon: <Paperclip size={16} />, color: '#A855F7' },
  chatData: { name: '聊天数据', icon: <MessageSquare size={16} />, color: '#22C55E' },
  assistantData: { name: '助手数据', icon: <Bot size={16} />, color: '#3B82F6' },
  cache: { name: '缓存', icon: <Boxes size={16} />, color: '#EF4444' },
  logs: { name: '日志', icon: <FileText size={16} />, color: '#EAB308' },
  other: { name: '其他', icon: <Box size={16} />, color: '#888888' }
}

function formatBytes(bytes: number): string {
  const kb = 1024
  const mb = kb * 1024
  const gb = mb * 1024

  if (bytes >= gb) return `${(bytes / gb).toFixed(2)} GB`
  if (bytes >= mb) return `${(bytes / mb).toFixed(2)} MB`
  if (bytes >= kb) return `${(bytes / kb).toFixed(1)} KB`
  return `${bytes} B`
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString()
}

interface Props {
  onOpenFolder?: (path: string) => void
}

export function StoragePage(props: Props) {
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState<string | null>(null) // categoryKey or itemId
  const [report, setReport] = useState<StorageReport | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<StorageCategoryKey>('images')
  const [confirmClear, setConfirmClear] = useState<{ open: boolean; categoryKey: StorageCategoryKey | null; itemId: string | null; isBulk?: boolean }>({
    open: false,
    categoryKey: null,
    itemId: null,
    isBulk: false
  })

  // 详情列表数据 (Images/Logs)
  const [detailItems, setDetailItems] = useState<StorageItemDetail[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [selection, setSelection] = useState<Set<string>>(new Set())

  // Tab state for Images category
  const [activeTab, setActiveTab] = useState<'all' | 'avatar' | 'chat' | 'other'>('all')

  const filteredItems = useMemo(() => {
    if (!selectedCategory || selectedCategory !== 'images') return detailItems
    if (activeTab === 'all') return detailItems
    return detailItems.filter((i) => i.kind === activeTab)
  }, [detailItems, selectedCategory, activeTab])

  // 模拟加载存储报告
  useEffect(() => {
    loadReport()
  }, [])

  // 切换分类时加载详情
  useEffect(() => {
    setSelection(new Set())
    setDetailItems([])
    if (selectedCategory === 'images' || selectedCategory === 'logs') {
      loadCategoryDetails(selectedCategory)
    }
  }, [selectedCategory])

  async function loadReport() {
    setLoading(true)
    try {
      const report = await window.api.storage.getReport()
      setReport(report)
    } catch (err) {
      console.error('Failed to load storage report:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadCategoryDetails(key: string) {
    setDetailLoading(true)
    try {
      const items = await window.api.storage.getCategoryItems(key)
      setDetailItems(items)
    } catch (err) {
      console.error('Failed to load detail items:', err)
    } finally {
      setDetailLoading(false)
    }
  }

  const selectedCategoryData = useMemo(() => {
    const raw = report?.categories.find((c) => c.key === selectedCategory) ?? null
    if (!raw) return null
    // Merge generic config (icon/color) with real data
    const config = CATEGORY_CONFIG[raw.key as StorageCategoryKey]
    return {
      ...raw,
      ...config
    }
  }, [report, selectedCategory])

  async function handleClear(categoryKey: StorageCategoryKey, itemId: string | null) {
    setClearing(itemId ?? categoryKey)
    setConfirmClear({ open: false, categoryKey: null, itemId: null })

    try {
      const report = await window.api.storage.clear(categoryKey, itemId)
      setReport(report)
      // 如果清理的是当前查看的分类，刷新详情
      if (categoryKey === selectedCategory) {
        if (categoryKey === 'images' || categoryKey === 'logs') {
          loadCategoryDetails(categoryKey)
        }
      }
    } catch (err) {
      console.error('Failed to clear storage:', err)
    } finally {
      setClearing(null)
    }
  }

  function handleOpenFolder() {
    window.api.storage.openDataFolder()
  }

  // --- Selection Logic ---
  function toggleSelect(path: string) {
    const next = new Set(selection)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setSelection(next)
  }

  function selectAll() {
    if (selection.size === detailItems.length) {
      setSelection(new Set())
    } else {
      setSelection(new Set(detailItems.map((i) => i.path)))
    }
  }

  async function handleDeleteSelected() {
    setConfirmClear({ open: false, categoryKey: null, itemId: null, isBulk: false })
    const paths = Array.from(selection)
    if (paths.length === 0) return

    setDetailLoading(true)
    try {
      await window.api.storage.deleteItems(paths)
      setSelection(new Set())
      await loadCategoryDetails(selectedCategory)
      await loadReport() // 刷新总统计
    } catch (err) {
      console.error('Failed to delete items:', err)
    } finally {
      setDetailLoading(false)
    }
  }

  const renderContent = () => {
    // 1. Grid View for Images
    if (selectedCategory === 'images') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-token-border-light bg-token-surface-primary/50 backdrop-blur-sm sticky top-0 z-10">
            {(['all', 'avatar', 'chat', 'other'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  px-3 py-1.5 text-xs font-medium rounded-full transition-all
                  ${activeTab === tab
                    ? 'bg-token-main-primary text-white shadow-sm'
                    : 'text-token-text-secondary hover:bg-token-surface-hover hover:text-token-text-primary'
                  }
                `}
              >
                {tab === 'all' && '全部'}
                {tab === 'avatar' && '头像'}
                {tab === 'chat' && '聊天图片'}
                {tab === 'other' && '其他'}
                <span className="ml-1.5 opacity-60 text-[10px]">
                  {tab === 'all' ? detailItems.length : detailItems.filter(i => i.kind === tab).length}
                </span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-token-text-tertiary">
                <div className="text-sm">该分类下暂无图片</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredItems.map((item) => {
                  const isSelected = selection.has(item.path)
                  return (
                    <div
                      key={item.path}
                      className={`
                      group relative aspect-square rounded-xl overflow-hidden border cursor-pointer transition-all duration-200
                      ${isSelected ? 'border-token-main-primary ring-2 ring-token-main-primary/20 bg-token-main-primary/5' : 'border-token-border-light hover:border-token-border-medium bg-token-surface-primary'}
                    `}
                      onClick={() => toggleSelect(item.path)}
                    >
                      {/* Selection Overlay */}
                      <div className={`absolute inset-0 bg-black/40 z-10 transition-opacity duration-200 flex items-center justify-center ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        {isSelected ? (
                          <div className="w-8 h-8 rounded-full bg-token-main-primary text-white flex items-center justify-center shadow-lg transform scale-100 transition-transform">
                            <Check className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm border border-white/40 flex items-center justify-center hover:bg-white/30 transition-colors">
                            <div className="w-4 h-4 rounded-full border-2 border-white/80" />
                          </div>
                        )}
                      </div>

                      {/* Image */}
                      <img
                        src={`kelivo-file:///${item.path.replace(/\\/g, '/')}`}
                        alt={item.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />

                      {/* Info Badge (Type) */}
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/50 text-white backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity z-20">
                        {item.kind === 'avatar' ? '头像' : item.kind === 'chat' ? '聊天' : '其他'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )
    }

    // 2. Log List View
    if (selectedCategory === 'logs') {
      return (
        <div className="h-full overflow-y-auto p-2 custom-scrollbar">
          {detailLoading ? (
            <div className="storageLoadingState">
              <RefreshCw size={24} className="spinning" />
              <span>加载日志中...</span>
            </div>
          ) : detailItems.length === 0 ? (
            <div className="storageEmptyState">
              <FileText size={48} />
              <span>暂无日志</span>
            </div>
          ) : (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center px-4 py-2 text-xs font-medium text-token-text-tertiary border-b border-token-border-light mb-2">
                <div className="w-8 shrink-0"></div>
                <div className="flex-1">名称</div>
                <div className="w-24 text-right">大小</div>
                <div className="w-32 text-right">修改时间</div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1">
                {detailItems.map((item) => {
                  const isSelected = selection.has(item.path)
                  return (
                    <div
                      key={item.path}
                      className={`
                          group flex items-center px-4 py-3 rounded-lg cursor-pointer border transition-all duration-200
                          ${isSelected
                          ? 'bg-token-main-primary/5 border-token-main-primary/30'
                          : 'bg-token-surface-primary border-transparent hover:bg-token-surface-hover hover:border-token-border-light'
                        }
                        `}
                      onClick={() => toggleSelect(item.path)}
                    >
                      {/* Checkbox */}
                      <div className="w-8 shrink-0 flex items-center justify-center mr-2">
                        <div className={`
                              w-4 h-4 rounded border flex items-center justify-center transition-colors
                              ${isSelected ? 'bg-token-main-primary border-token-main-primary text-white' : 'border-token-border-medium group-hover:border-token-text-secondary text-transparent'}
                            `}>
                          <Check className="w-3 h-3" strokeWidth={3} />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 flex items-center gap-3">
                        <FileText className="w-4 h-4 text-token-text-tertiary group-hover:text-token-main-primary transition-colors" />
                        <div className="truncate text-sm font-medium text-token-text-primary">{item.name}</div>
                      </div>

                      <div className="w-24 text-right text-xs text-token-text-secondary font-mono">
                        {formatBytes(item.size)}
                      </div>
                      <div className="w-32 text-right text-xs text-token-text-tertiary">
                        {formatTime(item.modifiedAt)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )
    }

    // 3. Default List View
    return (
      <div className="storageDetailList">
        {loading ? (
          <div className="storageLoadingState">
            <RefreshCw size={32} className="spinning" />
            <span>加载中...</span>
          </div>
        ) : selectedCategoryData?.items.length === 0 ? (
          <div className="storageEmptyState">
            <Box size={48} />
            <span>此分类暂无数据</span>
          </div>
        ) : (
          selectedCategoryData?.items.map((item) => (
            <div key={item.id} className="storageItemCard">
              <div className="storageItemIconBox" style={{ color: selectedCategoryData.color }}>
                {selectedCategoryData.icon}
              </div>
              <div className="storageItemInfo">
                <div className="storageItemName">{item.name}</div>
                <div className="storageItemMeta">
                  <span>{formatBytes(item.size)}</span>
                  {item.count !== undefined && (
                    <>
                      <span>·</span>
                      <span>{item.count} 项</span>
                    </>
                  )}
                </div>
              </div>
              {item.clearable && (
                <button
                  type="button"
                  className="storageItemActionBtn storageItemCleanBtn"
                  onClick={() => setConfirmClear({ open: true, categoryKey: selectedCategoryData.key, itemId: item.id })}
                  disabled={clearing !== null}
                  title="清理此项"
                >
                  {clearing === item.id ? (
                    <RefreshCw size={14} className="spinning" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  <span>清理</span>
                </button>
              )}
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 左侧概览 */}
      <div className="storageSidebar frosted">
        <div className="storageSidebarHeader">
          <HardDrive size={20} />
          <span style={{ fontWeight: 700 }}>存储空间</span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-icon"
            onClick={loadReport}
            disabled={loading}
            title="刷新"
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          </button>
        </div>

        {/* 总体统计 */}
        {report && (
          <div className="storageTotalCard">
            <div style={{ fontSize: 28, fontWeight: 700 }}>{formatBytes(report.total)}</div>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>总占用</div>

            {/* 分段进度条 */}
            <div className="storageBar">
              {report.categories.map((cat) => {
                const conf = CATEGORY_CONFIG[cat.key as StorageCategoryKey] || CATEGORY_CONFIG.other
                return (
                  <div
                    key={cat.key}
                    className="storageBarSegment"
                    style={{
                      width: `${(cat.size / report.total) * 100}%`,
                      background: conf.color
                    }}
                    title={`${conf.name}: ${formatBytes(cat.size)}`}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* 分类列表 */}
        <div className="storageCategoryList">
          {report?.categories.map((cat) => {
            const conf = CATEGORY_CONFIG[cat.key as StorageCategoryKey] || CATEGORY_CONFIG.other
            return (
              <button
                key={cat.key}
                type="button"
                className={`storageCategoryItem ${selectedCategory === cat.key ? 'storageCategoryItemActive' : ''}`}
                onClick={() => setSelectedCategory(cat.key as StorageCategoryKey)}
              >
                <span className="storageCategoryIcon" style={{ color: conf.color }}>
                  {conf.icon}
                </span>
                <span className="storageCategoryName">{conf.name}</span>
                <span className="storageCategorySize">{formatBytes(cat.size)}</span>
                <ChevronRight size={14} style={{ opacity: 0.4 }} />
              </button>
            )
          })}
        </div>

        {/* 打开数据目录 */}
        <button type="button" className="btn btn-ghost" style={{ marginTop: 'auto' }} onClick={handleOpenFolder}>
          <FolderOpen size={14} />
          <span>打开数据目录</span>
        </button>
      </div>

      {/* 右侧详情 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* 头部 */}
        <div className="storageDetailHeader frosted">
          {selectedCategoryData && (
            <>
              <span style={{ color: selectedCategoryData.color }}>{selectedCategoryData.icon}</span>
              <span style={{ fontWeight: 700 }}>{selectedCategoryData.name}</span>
              <span style={{ opacity: 0.6, marginLeft: 8 }}>{formatBytes(selectedCategoryData.size)}</span>
              <div style={{ flex: 1 }} />

              {/* 仅在详情模式下显示批量操作 */}
              {(selectedCategory === 'images' || selectedCategory === 'logs') && detailItems.length > 0 && (
                <>
                  <button type="button" className="btn" onClick={selectAll}>
                    {selection.size === detailItems.length ? <XCircle size={14} /> : <CheckSquare size={14} />}
                    <span>{selection.size === detailItems.length ? '取消全选' : '全选'}</span>
                  </button>
                  {selection.size > 0 && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setConfirmClear({ open: true, categoryKey: null, itemId: null, isBulk: true })}
                    >
                      <Trash2 size={14} />
                      <span>删除 ({selection.size})</span>
                    </button>
                  )}
                  <div style={{ width: 1, height: 20, background: 'var(--outline)', opacity: 0.2, margin: '0 8px' }} />
                </>
              )}


              {selectedCategoryData.items.some((i) => i.clearable) && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setConfirmClear({ open: true, categoryKey: selectedCategoryData.key, itemId: null })}
                  disabled={clearing !== null}
                >
                  <Trash2 size={14} />
                  <span>清理全部</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* 内容区域：根据分类渲染不同视图 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {renderContent()}
        </div>
      </div>

      {/* 确认清理对话框 */}
      {confirmClear.open && (
        <div className="modalOverlay" onMouseDown={() => setConfirmClear({ open: false, categoryKey: null, itemId: null })}>
          <div className="modalSurface frosted" style={{ width: 400, padding: 20 }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <AlertTriangle size={24} style={{ color: 'var(--warning)' }} />
              <div style={{ fontWeight: 700, fontSize: 16 }}>{confirmClear.isBulk ? '确认删除' : '确认清理'}</div>
            </div>
            <div style={{ opacity: 0.8, marginBottom: 20 }}>
              {confirmClear.isBulk
                ? `确定要删除选中的 ${selection.size} 个文件吗？此操作不可撤销。`
                : confirmClear.itemId
                  ? `确定要清理 "${selectedCategoryData?.items.find((i) => i.id === confirmClear.itemId)?.name ?? ''}" 吗？此操作不可撤销。`
                  : `确定要清理 "${CATEGORY_CONFIG[confirmClear.categoryKey!]?.name ?? ''}" 分类下的所有可清理数据吗？此操作不可撤销。`}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setConfirmClear({ open: false, categoryKey: null, itemId: null })}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (confirmClear.isBulk) {
                    handleDeleteSelected()
                  } else {
                    handleClear(confirmClear.categoryKey!, confirmClear.itemId)
                  }
                }}
              >
                {confirmClear.isBulk ? '确认删除' : '确认清理'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
