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
  AlertTriangle
} from 'lucide-react'

type CategoryKey = 'images' | 'files' | 'chatData' | 'assistantData' | 'cache' | 'logs' | 'other'

interface StorageItem {
  id: string
  name: string
  size: number
  count?: number
  clearable?: boolean
}

interface StorageCategory {
  key: CategoryKey
  name: string
  icon: React.ReactNode
  color: string
  size: number
  items: StorageItem[]
}

interface StorageReport {
  total: number
  categories: StorageCategory[]
}

const CATEGORY_CONFIG: Record<CategoryKey, { name: string; icon: React.ReactNode; color: string }> = {
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

interface Props {
  onOpenFolder?: (path: string) => void
}

export function StoragePage(props: Props) {
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState<string | null>(null)
  const [report, setReport] = useState<StorageReport | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('images')
  const [confirmClear, setConfirmClear] = useState<{ open: boolean; categoryKey: CategoryKey | null; itemId: string | null }>({
    open: false,
    categoryKey: null,
    itemId: null
  })

  // 模拟加载存储报告
  useEffect(() => {
    loadReport()
  }, [])

  async function loadReport() {
    setLoading(true)
    // 模拟 API 调用
    await new Promise((resolve) => setTimeout(resolve, 800))

    // 模拟数据
    const mockReport: StorageReport = {
      total: 256 * 1024 * 1024, // 256 MB
      categories: [
        {
          key: 'images',
          ...CATEGORY_CONFIG.images,
          size: 120 * 1024 * 1024,
          items: [
            { id: 'chat_images', name: '聊天图片', size: 80 * 1024 * 1024, count: 234, clearable: true },
            { id: 'assistant_images', name: '助手头像', size: 40 * 1024 * 1024, count: 12 }
          ]
        },
        {
          key: 'files',
          ...CATEGORY_CONFIG.files,
          size: 45 * 1024 * 1024,
          items: [
            { id: 'attachments', name: '附件', size: 45 * 1024 * 1024, count: 56, clearable: true }
          ]
        },
        {
          key: 'chatData',
          ...CATEGORY_CONFIG.chatData,
          size: 35 * 1024 * 1024,
          items: [
            { id: 'messages', name: '消息', size: 28 * 1024 * 1024, count: 12456 },
            { id: 'conversations', name: '对话', size: 5 * 1024 * 1024, count: 89 },
            { id: 'tool_events', name: '工具调用', size: 2 * 1024 * 1024, count: 1234, clearable: true }
          ]
        },
        {
          key: 'assistantData',
          ...CATEGORY_CONFIG.assistantData,
          size: 8 * 1024 * 1024,
          items: [
            { id: 'assistants', name: '助手配置', size: 2 * 1024 * 1024, count: 5 },
            { id: 'memories', name: '记忆数据', size: 6 * 1024 * 1024, count: 45 }
          ]
        },
        {
          key: 'cache',
          ...CATEGORY_CONFIG.cache,
          size: 38 * 1024 * 1024,
          items: [
            { id: 'avatar_cache', name: '头像缓存', size: 15 * 1024 * 1024, clearable: true },
            { id: 'model_cache', name: '模型缓存', size: 18 * 1024 * 1024, clearable: true },
            { id: 'other_cache', name: '其他缓存', size: 5 * 1024 * 1024, clearable: true }
          ]
        },
        {
          key: 'logs',
          ...CATEGORY_CONFIG.logs,
          size: 8 * 1024 * 1024,
          items: [
            { id: 'app_logs', name: '应用日志', size: 5 * 1024 * 1024, clearable: true },
            { id: 'request_logs', name: '请求日志', size: 3 * 1024 * 1024, clearable: true }
          ]
        },
        {
          key: 'other',
          ...CATEGORY_CONFIG.other,
          size: 2 * 1024 * 1024,
          items: [
            { id: 'other_data', name: '其他数据', size: 2 * 1024 * 1024 }
          ]
        }
      ]
    }

    setReport(mockReport)
    setLoading(false)
  }

  const selectedCategoryData = useMemo(() => {
    return report?.categories.find((c) => c.key === selectedCategory) ?? null
  }, [report, selectedCategory])

  async function handleClear(categoryKey: CategoryKey, itemId: string | null) {
    setClearing(itemId ?? categoryKey)
    setConfirmClear({ open: false, categoryKey: null, itemId: null })

    // 模拟清理操作
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // 刷新报告
    await loadReport()
    setClearing(null)
  }

  function handleOpenFolder() {
    // 实际实现中调用 IPC 打开数据目录
    console.log('Open data folder')
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
              {report.categories.map((cat) => (
                <div
                  key={cat.key}
                  className="storageBarSegment"
                  style={{
                    width: `${(cat.size / report.total) * 100}%`,
                    background: cat.color
                  }}
                  title={`${cat.name}: ${formatBytes(cat.size)}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* 分类列表 */}
        <div className="storageCategoryList">
          {report?.categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              className={`storageCategoryItem ${selectedCategory === cat.key ? 'storageCategoryItemActive' : ''}`}
              onClick={() => setSelectedCategory(cat.key)}
            >
              <span className="storageCategoryIcon" style={{ color: cat.color }}>
                {cat.icon}
              </span>
              <span className="storageCategoryName">{cat.name}</span>
              <span className="storageCategorySize">{formatBytes(cat.size)}</span>
              <ChevronRight size={14} style={{ opacity: 0.4 }} />
            </button>
          ))}
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

        {/* 详情列表 */}
        <div className="storageDetailList">
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', opacity: 0.5 }}>
              <RefreshCw size={32} className="spinning" style={{ marginBottom: 12 }} />
              <div>加载中...</div>
            </div>
          ) : selectedCategoryData?.items.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', opacity: 0.5 }}>
              <Box size={32} style={{ marginBottom: 12 }} />
              <div>此分类暂无数据</div>
            </div>
          ) : (
            selectedCategoryData?.items.map((item) => (
              <div key={item.id} className="storageDetailItem">
                <div className="storageDetailItemInfo">
                  <div style={{ fontWeight: 500 }}>{item.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    {formatBytes(item.size)}
                    {item.count !== undefined && ` · ${item.count} 项`}
                  </div>
                </div>
                {item.clearable && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setConfirmClear({ open: true, categoryKey: selectedCategoryData.key, itemId: item.id })}
                    disabled={clearing !== null}
                  >
                    {clearing === item.id ? (
                      <RefreshCw size={12} className="spinning" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    <span>清理</span>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 确认清理对话框 */}
      {confirmClear.open && (
        <div className="modalOverlay" onMouseDown={() => setConfirmClear({ open: false, categoryKey: null, itemId: null })}>
          <div className="modalSurface frosted" style={{ width: 400, padding: 20 }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <AlertTriangle size={24} style={{ color: 'var(--warning)' }} />
              <div style={{ fontWeight: 700, fontSize: 16 }}>确认清理</div>
            </div>
            <div style={{ opacity: 0.8, marginBottom: 20 }}>
              {confirmClear.itemId
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
                onClick={() => handleClear(confirmClear.categoryKey!, confirmClear.itemId)}
              >
                确认清理
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
