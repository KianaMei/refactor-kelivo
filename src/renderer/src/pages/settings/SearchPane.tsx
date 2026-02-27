import { useState, useCallback, useEffect } from 'react'
import {
  Plus,
  Trash2,
  ListOrdered,
  Clock,
  Eye,
  EyeOff,
  Globe,
  ExternalLink,
  Copy,
  Zap,
  Shield,
  Key,
  RefreshCw,
  AlertCircle,
  Pencil,
  GripVertical
} from 'lucide-react'

import type {
  AppConfig,
  SearchConfig,
  SearchServiceConfig,
  SearchApiKeyConfig,
  SearchServiceType,
  SearchLoadBalanceStrategy,
  SearchConnectionStatus,
  SearchGlobalConfig
} from '../../../../shared/types'
import { CustomSelect } from '../../components/ui/CustomSelect'

// ============================================================================
// 常量
// ============================================================================
const SERVICE_BRANDS: Record<SearchServiceType, { icon: string; color: string; needsKey: boolean; description: string }> = {
  tavily: { icon: 'tavily-color.svg', color: '#FF6B35', needsKey: true, description: 'AI 优化搜索 API' },
  exa: { icon: 'exa-color.svg', color: '#6366F1', needsKey: true, description: '语义搜索引擎' },
  brave: { icon: 'brave-color.svg', color: '#FB542B', needsKey: true, description: '隐私优先搜索' },
  duckduckgo: { icon: 'duckduckgo-color.svg', color: '#DE5833', needsKey: false, description: '免费，无需 Key' },
  serper: { icon: 'google-color.svg', color: '#4285F4', needsKey: true, description: 'Google 结果 API' },
  bing: { icon: 'bing-color.svg', color: '#008373', needsKey: false, description: '本地 Bing' },
  searxng: { icon: 'searxng-color.svg', color: '#3050FF', needsKey: false, description: '自托管元搜索' },
  custom: { icon: '', color: '#6B7280', needsKey: true, description: '自定义服务' }
}

const SERVICE_DISPLAY_NAMES: Record<SearchServiceType, string> = {
  tavily: 'Tavily',
  exa: 'Exa',
  brave: 'Brave Search',
  duckduckgo: 'DuckDuckGo',
  serper: 'Serper',
  bing: 'Bing Local',
  searxng: 'SearXNG',
  custom: '自定义服务'
}

const STRATEGY_OPTIONS: { value: SearchLoadBalanceStrategy; label: string; icon: typeof Zap }[] = [
  { value: 'roundRobin', label: '轮询', icon: RefreshCw },
  { value: 'priority', label: '优先级', icon: ListOrdered },
  { value: 'leastUsed', label: '最少使用', icon: Shield },
  { value: 'random', label: '随机', icon: Zap }
]

function generateKeyId(): string {
  return `key_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

function createApiKey(key: string, name?: string): SearchApiKeyConfig {
  const now = Date.now()
  return { id: generateKeyId(), key, name, isEnabled: true, priority: 5, sortIndex: now, createdAt: now, status: 'active', totalRequests: 0 }
}

// ============================================================================
// 工具函数
// ============================================================================
function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 4)}••••${key.slice(-4)}`
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
}

// ============================================================================
// 服务徽章
// ============================================================================
function ServiceBadge({ type, size = 36 }: { type: SearchServiceType; size?: number }) {
  const brand = SERVICE_BRANDS[type]
  const iconSize = size * 0.55

  if (type === 'custom' || !brand.icon) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 8,
        background: `${brand.color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: brand.color, fontSize: size * 0.4, fontWeight: 700
      }}>
        C
      </div>
    )
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: 8,
      background: 'var(--surface-2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
    }}>
      <img
        src={`/icons/${brand.icon}`}
        alt={type}
        style={{ width: iconSize, height: iconSize, objectFit: 'contain' }}
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
    </div>
  )
}

// ============================================================================
// 启用状态点
// ============================================================================
function EnabledDot({ enabled }: { enabled: boolean }) {
  return (
    <div style={{
      width: 8, height: 8, borderRadius: 4,
      background: enabled ? '#22C55E' : '#9CA3AF',
      boxShadow: enabled ? '0 0 6px #22C55E' : 'none'
    }} />
  )
}

// ============================================================================
// 连接状态点
// ============================================================================
const CONNECTION_STATUS_COLORS: Record<SearchConnectionStatus, { color: string; glow?: string }> = {
  connected: { color: '#22C55E', glow: '#22C55E' },
  testing: { color: '#3B82F6', glow: '#3B82F6' },
  failed: { color: '#EF4444', glow: '#EF4444' },
  untested: { color: '#9CA3AF' },
  rateLimited: { color: '#F97316', glow: '#F97316' }
}

function StatusDot({ status }: { status: SearchConnectionStatus }) {
  const c = CONNECTION_STATUS_COLORS[status] ?? CONNECTION_STATUS_COLORS.untested
  return (
    <div
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        background: c.color,
        boxShadow: c.glow ? `0 0 10px ${c.glow}80` : 'none',
        flexShrink: 0
      }}
    />
  )
}

// ============================================================================
// 服务列表项
// ============================================================================
function ServiceListItem({ service, isSelected, onClick }: {
  service: SearchServiceConfig
  isSelected: boolean
  onClick: () => void
}) {
  const brand = SERVICE_BRANDS[service.type]
  const keyCount = service.apiKeys.length
  const activeKeyCount = service.apiKeys.filter(k => k.isEnabled && k.status !== 'error').length

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        background: isSelected ? 'var(--primary-alpha)' : 'transparent',
        borderRadius: 8,
        margin: '2px 8px',
        cursor: 'pointer',
        transition: 'background 100ms ease'
      }}
      className="hover-surface"
    >
      <ServiceBadge type={service.type} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{service.name}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
          {!brand.needsKey ? '免费' : keyCount > 0 ? `${activeKeyCount}/${keyCount} Key` : '未配置'}
        </div>
      </div>
      <EnabledDot enabled={service.enabled} />
    </div>
  )
}

// ============================================================================
// Key 行 (支持拖拽)
// ============================================================================
function KeyRow({ keyConfig, index, strategy, onUpdate, onDelete, onDragStart, onDragOver, onDrop, isDragging, isDragOver }: {
  keyConfig: SearchApiKeyConfig
  index: number
  strategy: SearchLoadBalanceStrategy
  onUpdate: (updates: Partial<SearchApiKeyConfig>) => void
  onDelete: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  isDragging: boolean
  isDragOver: boolean
}) {
  const [isHidden, setIsHidden] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editName, setEditName] = useState(keyConfig.name || '')
  const [editPriority, setEditPriority] = useState(keyConfig.priority)

  // 自动取消删除确认
  useEffect(() => {
    if (confirmingDelete) {
      const timer = setTimeout(() => setConfirmingDelete(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [confirmingDelete])

  const handleSaveEdit = () => {
    onUpdate({ name: editName.trim() || undefined, priority: editPriority })
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        background: 'var(--surface-2)',
        borderRadius: 8,
        border: '1px dashed var(--primary)'
      }}>
        <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="input"
            style={{ flex: 1, fontSize: 13 }}
            placeholder="名称 (可选)"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            autoFocus
          />
          {strategy === 'priority' && (
            <CustomSelect
              value={String(editPriority)}
              onChange={(val) => setEditPriority(Number(val))}
              options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(p => ({ value: String(p), label: `P${p}` }))}
              className="input"
              width={70}
              style={{ fontSize: 13 }}
            />
          )}
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setIsEditing(false)}>取消</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={handleSaveEdit}>保存</button>
      </div>
    )
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={e => e.currentTarget.style.opacity = '1'}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px',
        background: isDragOver ? 'var(--primary-alpha)' : 'var(--surface)',
        borderRadius: 8,
        border: isDragOver ? '1.5px dashed var(--primary)' : '1px solid var(--border)',
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
        transition: 'all 100ms ease'
      }}
    >
      <GripVertical size={14} style={{ color: 'var(--text-3)', flexShrink: 0, cursor: 'grab' }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: keyConfig.name ? 'var(--text)' : 'var(--text-3)' }}>
            {keyConfig.name || `Key ${index + 1}`}
          </span>
          {strategy === 'priority' && (
            <span style={{
              padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: 'var(--primary-alpha)', color: 'var(--primary)'
            }}>
              P{keyConfig.priority}
            </span>
          )}
        </div>
        <div
          style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-3)', cursor: 'pointer', marginTop: 2 }}
          onClick={() => copyToClipboard(keyConfig.key)}
          title="点击复制"
        >
          {isHidden ? maskKey(keyConfig.key) : keyConfig.key}
        </div>
      </div>

      <button type="button" className="btn btn-ghost" style={{ width: 26, height: 26, padding: 0 }} onClick={() => setIsHidden(!isHidden)} title={isHidden ? '显示' : '隐藏'}>
        {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
      <button type="button" className="btn btn-ghost" style={{ width: 26, height: 26, padding: 0 }} onClick={() => copyToClipboard(keyConfig.key)} title="复制">
        <Copy size={13} />
      </button>
      <button type="button" className="btn btn-ghost" style={{ width: 26, height: 26, padding: 0 }} onClick={() => { setEditName(keyConfig.name || ''); setEditPriority(keyConfig.priority); setIsEditing(true) }} title="编辑">
        <Pencil size={13} />
      </button>
      {confirmingDelete ? (
        <button
          type="button"
          style={{
            height: 26,
            padding: '0 10px',
            fontSize: 11,
            fontWeight: 500,
            background: 'var(--danger)',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer'
          }}
          onClick={onDelete}
        >
          确认?
        </button>
      ) : (
        <button type="button" className="btn btn-ghost" style={{ width: 26, height: 26, padding: 0, color: 'var(--danger)' }} onClick={() => setConfirmingDelete(true)} title="删除">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}

// ============================================================================
// 添加 Key 表单
// ============================================================================
function AddKeyForm({ onAdd, onCancel }: {
  onAdd: (key: string, name?: string, priority?: number) => void
  onCancel: () => void
}) {
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [priority, setPriority] = useState(5)

  return (
    <div style={{ padding: 14, borderRadius: 8, background: 'var(--surface-2)', border: '1px dashed var(--primary)', marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 2 }}>
          <label style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, display: 'block' }}>API Key *</label>
          <input className="input" style={{ width: '100%', fontSize: 13 }} placeholder="sk-..." value={key} onChange={e => setKey(e.target.value)} autoFocus />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, display: 'block' }}>名称</label>
          <input className="input" style={{ width: '100%', fontSize: 13 }} placeholder="可选" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ width: 70 }}>
          <label style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, display: 'block' }}>优先级</label>
          <CustomSelect
            value={String(priority)}
            onChange={(val) => setPriority(Number(val))}
            options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(p => ({ value: String(p), label: `P${p}` }))}
            className="input"
            width="100%"
            style={{ fontSize: 13 }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sm" onClick={onCancel}>取消</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => key.trim() && onAdd(key.trim(), name.trim() || undefined, priority)} disabled={!key.trim()}>添加</button>
      </div>
    </div>
  )
}

// ============================================================================
// 服务详情 - 需要 Key
// ============================================================================
function ServiceDetailWithKeys({ service, onUpdate }: {
  service: SearchServiceConfig
  onUpdate: (updates: Partial<SearchServiceConfig>) => void
}) {
  const [showAddKey, setShowAddKey] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const brand = SERVICE_BRANDS[service.type]
  const sc = service.serviceConfig ?? {}

  const updateServiceConfig = (key: string, value: unknown) => {
    onUpdate({ serviceConfig: { ...sc, [key]: value } })
  }

  const getApiUrl = () => {
    const urls: Record<string, string> = {
      tavily: 'https://tavily.com',
      exa: 'https://exa.ai',
      brave: 'https://brave.com/search/api/',
      serper: 'https://serper.dev'
    }
    return urls[service.type] || '#'
  }

  const handleAddKey = (key: string, name?: string, priority = 5) => {
    const newKey = createApiKey(key, name)
    newKey.priority = priority
    onUpdate({ apiKeys: [...service.apiKeys, newKey] })
    setShowAddKey(false)
  }

  const handleUpdateKey = (keyId: string, updates: Partial<SearchApiKeyConfig>) => {
    onUpdate({
      apiKeys: service.apiKeys.map(k => k.id === keyId ? { ...k, ...updates } : k)
    })
  }

  const handleDeleteKey = (keyId: string) => {
    onUpdate({ apiKeys: service.apiKeys.filter(k => k.id !== keyId) })
  }

  const handleDragStart = (index: number, e: React.DragEvent) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (index: number, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDrop = (targetIndex: number, e: React.DragEvent) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    const newKeys = [...service.apiKeys]
    const [draggedKey] = newKeys.splice(draggedIndex, 1)
    newKeys.splice(targetIndex, 0, draggedKey)

    const now = Date.now()
    newKeys.forEach((k, i) => { k.sortIndex = now + i })

    onUpdate({ apiKeys: newKeys })
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const strategyHint = {
    roundRobin: '轮询：按顺序依次使用每个 Key',
    priority: '优先级：优先使用 P 值小的 Key',
    leastUsed: '最少使用：优先用请求次数少的',
    random: '随机：随机选择一个 Key'
  }

  return (
    <div style={{ padding: 20, maxWidth: 640 }}>
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <ServiceBadge type={service.type} size={44} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>{service.name}</span>
            <a href={getApiUrl()} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--primary)', fontSize: 12, textDecoration: 'none' }}>
              获取 Key <ExternalLink size={11} />
            </a>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{brand.description}</div>
        </div>
        <button
          type="button"
          className={`toggle ${service.enabled ? 'toggleOn' : ''}`}
          onClick={() => onUpdate({ enabled: !service.enabled })}
          disabled={service.apiKeys.length === 0}
          title={service.apiKeys.length === 0 ? '请先添加 API Key' : (service.enabled ? '禁用' : '启用')}
        >
          <div className="toggleThumb" />
        </button>
      </div>

      {/* 自定义 URL (仅部分服务) */}
      {(service.type === 'exa' || service.type === 'custom' || service.type === 'searxng') && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, display: 'block' }}>自定义地址</label>
          <input className="input" style={{ width: '100%', fontSize: 13 }} placeholder="留空使用官方地址" value={service.baseUrl || ''} onChange={e => onUpdate({ baseUrl: e.target.value || undefined })} />
        </div>
      )}

      {/* Tavily 搜索深度 */}
      {service.type === 'tavily' && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, display: 'block' }}>搜索深度</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {([['advanced', '深度搜索'], ['basic', '快速搜索']] as const).map(([val, label]) => {
              const isActive = (sc.depth ?? 'advanced') === val
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => updateServiceConfig('depth', val)}
                  style={{
                    flex: 1, padding: '6px 0', fontSize: 13,
                    fontWeight: isActive ? 600 : 400, borderRadius: 6,
                    border: isActive ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                    background: isActive ? 'var(--primary-alpha)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 100ms ease'
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
            {(sc.depth ?? 'advanced') === 'advanced' ? '更深入的搜索结果，消耗更多 credits' : '更快速，消耗更少 credits'}
          </div>
        </div>
      )}

      {/* API Keys 区域 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Key size={14} style={{ color: 'var(--text-3)' }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>API Keys</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>({service.apiKeys.length})</span>
        </div>

        {/* 负载均衡 + 添加按钮 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {STRATEGY_OPTIONS.map(opt => {
            const Icon = opt.icon
            const isActive = service.strategy === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                title={opt.label}
                onClick={() => onUpdate({ strategy: opt.value })}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28,
                  borderRadius: 6,
                  border: isActive ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                  background: isActive ? 'var(--primary-alpha)' : 'transparent',
                  color: isActive ? 'var(--primary)' : 'var(--text-3)',
                  cursor: 'pointer',
                  transition: 'all 100ms ease'
                }}
              >
                <Icon size={13} />
              </button>
            )
          })}

          <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 6px' }} />

          <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowAddKey(true)} style={{ gap: 4 }}>
            <Plus size={13} /> 添加
          </button>
        </div>
      </div>

      {/* 策略提示 */}
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>
        {strategyHint[service.strategy]}
        {service.strategy === 'roundRobin' && ' (拖拽调整顺序)'}
      </div>

      {showAddKey && <AddKeyForm onAdd={handleAddKey} onCancel={() => setShowAddKey(false)} />}

      {service.apiKeys.length === 0 && !showAddKey ? (
        <div style={{
          padding: '28px 20px',
          textAlign: 'center',
          background: 'var(--surface-2)',
          borderRadius: 10,
          border: '1px dashed var(--border)'
        }}>
          <AlertCircle size={24} style={{ color: 'var(--text-3)', margin: '0 auto 8px' }} />
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>暂无 API Key，点击上方添加</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {service.apiKeys.map((k, idx) => (
            <KeyRow
              key={k.id}
              keyConfig={k}
              index={idx}
              strategy={service.strategy}
              onUpdate={(updates) => handleUpdateKey(k.id, updates)}
              onDelete={() => handleDeleteKey(k.id)}
              onDragStart={(e) => handleDragStart(idx, e)}
              onDragOver={(e) => handleDragOver(idx, e)}
              onDrop={(e) => handleDrop(idx, e)}
              isDragging={draggedIndex === idx}
              isDragOver={dragOverIndex === idx}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// DDG 地区选项
// ============================================================================
const DDG_REGION_OPTIONS = [
  { value: 'wt-wt', label: '全球' },
  { value: 'cn-zh', label: '中国' },
  { value: 'us-en', label: '美国' },
  { value: 'uk-en', label: '英国' },
  { value: 'jp-jp', label: '日本' },
  { value: 'kr-kr', label: '韩国' },
  { value: 'de-de', label: '德国' },
  { value: 'fr-fr', label: '法国' },
  { value: 'ru-ru', label: '俄罗斯' },
  { value: 'hk-tzh', label: '香港' },
  { value: 'tw-tzh', label: '台湾' },
  { value: 'sg-en', label: '新加坡' },
  { value: 'au-en', label: '澳大利亚' },
  { value: 'ca-en', label: '加拿大' },
  { value: 'in-en', label: '印度' }
]

const DDG_SAFE_SEARCH_OPTIONS = [
  { value: 'off', label: '关闭' },
  { value: 'moderate', label: '适中' },
  { value: 'strict', label: '严格' }
]

const DDG_TIME_RANGE_OPTIONS = [
  { value: '', label: '不限' },
  { value: 'd', label: '过去一天' },
  { value: 'w', label: '过去一周' },
  { value: 'm', label: '过去一月' },
  { value: 'y', label: '过去一年' }
]

// ============================================================================
// 服务详情 - 无需 Key
// ============================================================================
function ServiceDetailSimple({ service, onUpdate }: {
  service: SearchServiceConfig
  onUpdate: (updates: Partial<SearchServiceConfig>) => void
}) {
  const brand = SERVICE_BRANDS[service.type]
  const sc = service.serviceConfig ?? {}

  const updateServiceConfig = (key: string, value: unknown) => {
    onUpdate({ serviceConfig: { ...sc, [key]: value } })
  }

  return (
    <div style={{ padding: 20, maxWidth: 480 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <ServiceBadge type={service.type} size={44} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{service.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{brand.description}</div>
        </div>
        <button
          type="button"
          className={`toggle ${service.enabled ? 'toggleOn' : ''}`}
          onClick={() => onUpdate({ enabled: !service.enabled })}
          title={service.enabled ? '禁用' : '启用'}
        >
          <div className="toggleThumb" />
        </button>
      </div>

      {service.type === 'searxng' && (
        <div style={{ maxWidth: 400 }}>
          <label style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, display: 'block' }}>实例地址</label>
          <input className="input" style={{ width: '100%', fontSize: 13 }} placeholder="https://searx.example.com" value={service.baseUrl || ''} onChange={e => onUpdate({ baseUrl: e.target.value || undefined })} />
        </div>
      )}

      {service.type === 'duckduckgo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, display: 'block' }}>搜索地区</label>
            <CustomSelect
              value={String(sc.region ?? 'wt-wt')}
              onChange={(val) => updateServiceConfig('region', val)}
              options={DDG_REGION_OPTIONS}
              width="100%"
              style={{ fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, display: 'block' }}>安全搜索</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {DDG_SAFE_SEARCH_OPTIONS.map(opt => {
                const isActive = (sc.safeSearch ?? 'moderate') === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateServiceConfig('safeSearch', opt.value)}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 400,
                      borderRadius: 6,
                      border: isActive ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                      background: isActive ? 'var(--primary-alpha)' : 'transparent',
                      color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 100ms ease'
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, display: 'block' }}>时间范围</label>
            <CustomSelect
              value={String(sc.timeRange ?? '')}
              onChange={(val) => updateServiceConfig('timeRange', val)}
              options={DDG_TIME_RANGE_OPTIONS}
              width="100%"
              style={{ fontSize: 13 }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 添加服务面板
// ============================================================================
function AddServicePanel({ existingTypes, onAdd }: {
  existingTypes: Set<SearchServiceType>
  onAdd: (type: SearchServiceType) => void
}) {
  const types: SearchServiceType[] = ['tavily', 'exa', 'brave', 'duckduckgo', 'serper', 'bing', 'searxng', 'custom']

  return (
    <div style={{ padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>添加搜索服务</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {types.map(type => {
          const brand = SERVICE_BRANDS[type]
          const exists = existingTypes.has(type) && type !== 'custom'
          return (
            <button
              key={type} type="button" className="btn btn-ghost"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: 14, borderRadius: 10, justifyContent: 'flex-start',
                border: '1px solid var(--border)',
                opacity: exists ? 0.5 : 1
              }}
              disabled={exists} onClick={() => onAdd(type)}
            >
              <ServiceBadge type={type} size={36} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{SERVICE_DISPLAY_NAMES[type]}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                  {!brand.needsKey ? '免费' : '支持多 Key'}
                  {exists && ' · 已添加'}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// 主组件
// ============================================================================
export function SearchPane({ config, onSave }: { config: AppConfig; onSave: (next: AppConfig) => Promise<void> }) {
  const searchConfig = config.searchConfig
  const services = searchConfig.services
  const globalConfig = searchConfig.global

  const [selectedId, setSelectedId] = useState<string | 'add' | null>(services[0]?.id ?? null)

  // 同步选中状态
  useEffect(() => {
    if (selectedId && selectedId !== 'add' && !services.some(s => s.id === selectedId)) {
      setSelectedId(services[0]?.id ?? null)
    }
  }, [services, selectedId])

  const updateGlobal = useCallback(async (updates: Partial<SearchGlobalConfig>) => {
    await onSave({
      ...config,
      searchConfig: {
        ...searchConfig,
        global: { ...globalConfig, ...updates }
      }
    })
  }, [config, onSave, searchConfig, globalConfig])

  const updateService = useCallback(async (id: string, updates: Partial<SearchServiceConfig>) => {
    const newServices = services.map(s => s.id === id ? { ...s, ...updates } : s)
    await onSave({
      ...config,
      searchConfig: { ...searchConfig, services: newServices }
    })

    // 同步注册到后端
    const updatedService = newServices.find(s => s.id === id)
    if (updatedService && updatedService.enabled) {
      const needsKey = SERVICE_BRANDS[updatedService.type]?.needsKey
      if (!needsKey || updatedService.apiKeys.length > 0) {
        try {
          const regConfig: Record<string, unknown> = {
            type: updatedService.type,
            id: updatedService.id,
            apiKeys: updatedService.apiKeys,
            strategy: updatedService.strategy,
            apiKey: updatedService.apiKeys.find(k => k.isEnabled && k.key)?.key ?? '',
            ...(updatedService.baseUrl ? { baseUrl: updatedService.baseUrl } : {}),
            ...(updatedService.serviceConfig ?? {})
          }
          await window.api.search.register(id, regConfig as any, globalConfig.defaultServiceId === id)
        } catch (e) {
          console.error('Failed to register search service:', e)
        }
      }
    }
  }, [config, onSave, searchConfig, services, globalConfig])

  const addService = useCallback(async (type: SearchServiceType) => {
    const id = type === 'custom' ? `custom_${Date.now()}` : type
    if (services.some(s => s.id === id)) return

    const newService: SearchServiceConfig = {
      id,
      name: SERVICE_DISPLAY_NAMES[type],
      type,
      enabled: false,
      apiKeys: [],
      strategy: 'roundRobin',
      connectionStatus: type === 'duckduckgo' ? 'connected' : 'untested'
    }

    await onSave({
      ...config,
      searchConfig: { ...searchConfig, services: [...services, newService] }
    })
    setSelectedId(id)
  }, [config, onSave, searchConfig, services])

  const selectedService = services.find(s => s.id === selectedId)
  const existingTypes = new Set(services.map(s => s.type))

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)' }}>
      {/* 左侧 - 服务列表 */}
      <div style={{ width: 220, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>搜索</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
          {services.map(service => (
            <ServiceListItem key={service.id} service={service} isSelected={selectedId === service.id} onClick={() => setSelectedId(service.id)} />
          ))}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
          <button type="button" className={`btn btn-sm ${selectedId === 'add' ? 'btn-primary' : ''}`} style={{ width: '100%', justifyContent: 'center', gap: 5 }} onClick={() => setSelectedId('add')}>
            <Plus size={13} /> 添加服务
          </button>
        </div>
      </div>

      {/* 右侧 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 全局设置栏 */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Globe size={15} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>联网搜索</span>
            <button type="button" className={`toggle ${globalConfig.enabled ? 'toggleOn' : ''}`} onClick={() => updateGlobal({ enabled: !globalConfig.enabled })} style={{ marginLeft: 6 }}>
              <div className="toggleThumb" />
            </button>
          </div>

          <div style={{ width: 1, height: 18, background: 'var(--border)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ListOrdered size={13} style={{ color: 'var(--text-3)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>结果数</span>
            <input
              type="number"
              className="input"
              style={{ width: 50, height: 26, fontSize: 13, textAlign: 'center', padding: '0 4px' }}
              value={globalConfig.maxResults}
              min={1}
              max={50}
              onChange={e => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 1 && v <= 50) updateGlobal({ maxResults: v })
              }}
            />
          </div>

          <div style={{ width: 1, height: 18, background: 'var(--border)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={13} style={{ color: 'var(--text-3)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>超时</span>
            <input
              type="number"
              className="input"
              style={{ width: 50, height: 26, fontSize: 13, textAlign: 'center', padding: '0 4px' }}
              value={globalConfig.timeout}
              min={1}
              max={120}
              onChange={e => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 1 && v <= 120) updateGlobal({ timeout: v })
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>秒</span>
          </div>
        </div>

        {/* 服务详情区 */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {selectedId === 'add' ? (
            <AddServicePanel existingTypes={existingTypes} onAdd={addService} />
          ) : selectedService ? (
            SERVICE_BRANDS[selectedService.type].needsKey ? (
              <ServiceDetailWithKeys service={selectedService} onUpdate={updates => updateService(selectedService.id, updates)} />
            ) : (
              <ServiceDetailSimple service={selectedService} onUpdate={updates => updateService(selectedService.id, updates)} />
            )
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>选择一个服务</div>
          )}
        </div>
      </div>
    </div>
  )
}
