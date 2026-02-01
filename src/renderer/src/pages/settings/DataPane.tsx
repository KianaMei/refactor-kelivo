import { useState } from 'react'
import {
  HardDrive, Image, FileText, MessageSquare, Bot, Database,
  ScrollText, Trash2, FolderOpen, RefreshCw, ChevronRight
} from 'lucide-react'

interface StorageCategory {
  id: string
  label: string
  icon: React.ReactNode
  size: string
  fileCount: number
  color: string
  clearable: boolean
}

const defaultCategories: StorageCategory[] = [
  { id: 'images', label: '图片', icon: <Image size={16} />, size: '0 B', fileCount: 0, color: '#3b82f6', clearable: false },
  { id: 'files', label: '附件', icon: <FileText size={16} />, size: '0 B', fileCount: 0, color: '#8b5cf6', clearable: false },
  { id: 'chats', label: '对话数据', icon: <MessageSquare size={16} />, size: '0 B', fileCount: 0, color: '#10b981', clearable: false },
  { id: 'assistants', label: '助手数据', icon: <Bot size={16} />, size: '0 B', fileCount: 0, color: '#f59e0b', clearable: false },
  { id: 'cache', label: '缓存', icon: <Database size={16} />, size: '0 B', fileCount: 0, color: '#6b7280', clearable: true },
  { id: 'logs', label: '日志', icon: <ScrollText size={16} />, size: '0 B', fileCount: 0, color: '#ef4444', clearable: true },
]

export function DataPane() {
  const [categories] = useState<StorageCategory[]>(defaultCategories)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loggingEnabled, setLoggingEnabled] = useState(false)
  const [clearing, setClearing] = useState<string | null>(null)

  const selected = categories.find((c) => c.id === selectedId)
  const totalSize = '0 B'

  return (
    <div style={s.root}>
      <div style={s.header}>数据管理</div>

      {/* 总览卡片 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>
          <HardDrive size={15} style={{ marginRight: 6 }} />
          存储概览
        </div>

        <div style={s.overviewRow}>
          <span style={s.totalLabel}>总占用</span>
          <span style={s.totalValue}>{totalSize}</span>
        </div>

        {/* 使用量条 */}
        <div style={s.usageBar}>
          {categories.map((cat) => (
            <div
              key={cat.id}
              style={{
                flex: 1,
                height: '100%',
                background: cat.color,
                opacity: 0.8,
              }}
            />
          ))}
        </div>

        {/* 图例 */}
        <div style={s.legendGrid}>
          {categories.map((cat) => (
            <div key={cat.id} style={s.legendItem}>
              <div style={{ ...s.legendDot, background: cat.color }} />
              <span style={s.legendLabel}>{cat.label}</span>
              <span style={s.legendSize}>{cat.size}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-sm btn-ghost" style={{ gap: 4 }}>
            <RefreshCw size={13} />
            刷新
          </button>
          <button type="button" className="btn btn-sm btn-ghost" style={{ gap: 4 }}>
            <FolderOpen size={13} />
            打开数据目录
          </button>
        </div>
      </div>

      {/* 分类列表 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>存储分类</div>

        {categories.map((cat) => (
          <div key={cat.id}>
            <button
              type="button"
              onClick={() => setSelectedId(selectedId === cat.id ? null : cat.id)}
              style={{
                ...s.categoryRow,
                background: selectedId === cat.id ? 'var(--primary-light, rgba(var(--primary-rgb), 0.08))' : 'transparent',
              }}
            >
              <div style={{ ...s.categoryIcon, color: cat.color }}>{cat.icon}</div>
              <span style={s.categoryLabel}>{cat.label}</span>
              <span style={s.categoryMeta}>{cat.fileCount} 个文件</span>
              <span style={s.categorySize}>{cat.size}</span>
              <ChevronRight size={14} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
            </button>
            {cat.id !== categories[categories.length - 1].id && <div style={s.divider} />}
          </div>
        ))}
      </div>

      {/* 选中分类的详情 */}
      {selected && (
        <div className="settingsCard">
          <div style={s.cardTitle}>
            <span style={{ color: selected.color }}>{selected.icon}</span>
            <span style={{ marginLeft: 6 }}>{selected.label}</span>
          </div>

          <div style={s.detailMeta}>
            <span>{selected.size}</span>
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <span>{selected.fileCount} 个文件</span>
          </div>

          {selected.clearable && (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={clearing === selected.id}
                style={{ gap: 4 }}
              >
                <Trash2 size={13} />
                {clearing === selected.id ? '清理中...' : `清除${selected.label}`}
              </button>
            </div>
          )}

          {!selected.clearable && (
            <div style={s.hint}>
              此分类的数据属于用户内容，不建议自动清理。如需管理，请使用导出/备份功能。
            </div>
          )}
        </div>
      )}

      {/* 请求日志 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>
          <ScrollText size={15} style={{ marginRight: 6 }} />
          请求日志
        </div>

        <div style={s.labeledRow}>
          <span style={s.rowLabel}>启用请求日志记录</span>
          <button
            type="button"
            className={`toggle ${loggingEnabled ? 'toggleOn' : ''}`}
            onClick={() => setLoggingEnabled(!loggingEnabled)}
          >
            <div className="toggleThumb" />
          </button>
        </div>
        <div style={s.divider} />

        <div style={s.hint}>
          开启后将记录所有 API 请求和响应的详细日志，用于调试和排查问题。日志文件可能会占用较多磁盘空间。
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-sm btn-ghost" style={{ gap: 4 }}>
            <ScrollText size={13} />
            查看日志
          </button>
          <button type="button" className="btn btn-sm btn-danger" style={{ gap: 4 }}>
            <Trash2 size={13} />
            清除日志
          </button>
        </div>
      </div>

      {/* 代码预览缓存 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>
          <Database size={15} style={{ marginRight: 6 }} />
          代码预览缓存
        </div>

        <div style={s.hint}>
          代码高亮渲染的缓存数据。清除后下次查看代码块时会重新渲染。
        </div>

        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-sm btn-ghost" style={{ gap: 4 }}>
            <Trash2 size={13} />
            清除代码缓存
          </button>
        </div>
      </div>

      {/* 头像缓存 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>
          <Image size={15} style={{ marginRight: 6 }} />
          头像缓存
        </div>

        <div style={s.hint}>
          供应商和模型品牌图标的本地缓存。清除后将从网络重新加载。
        </div>

        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-sm btn-ghost" style={{ gap: 4 }}>
            <Trash2 size={13} />
            清除头像缓存
          </button>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { padding: 20, maxWidth: 640, margin: '0 auto' },
  header: { fontSize: 16, fontWeight: 700, marginBottom: 16 },
  cardTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
  },
  overviewRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalLabel: { fontSize: 13, color: 'var(--text-secondary)' },
  totalValue: { fontSize: 18, fontWeight: 700 },
  usageBar: {
    display: 'flex',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 2,
  },
  legendGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '6px 12px',
    marginTop: 10,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  legendLabel: { color: 'var(--text-secondary)', flex: 1 },
  legendSize: { fontWeight: 500, fontSize: 11 },
  categoryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 8px',
    border: 'none',
    background: 'transparent',
    width: '100%',
    cursor: 'pointer',
    borderRadius: 6,
    fontSize: 13,
    textAlign: 'left' as const,
  },
  categoryIcon: { flexShrink: 0 },
  categoryLabel: { flex: 1, fontWeight: 500 },
  categoryMeta: { fontSize: 12, color: 'var(--text-secondary)' },
  categorySize: { fontSize: 12, fontWeight: 600, minWidth: 50, textAlign: 'right' as const },
  divider: {
    height: 1,
    background: 'var(--border)',
    margin: '0 8px',
    opacity: 0.5,
  },
  detailMeta: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    marginTop: 8,
  },
  labeledRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
  },
  rowLabel: { fontSize: 14, flex: 1 },
}
