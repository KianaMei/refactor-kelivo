/**
 * 语义化数据视图（属性面板风格）
 * 不是"代码视图"，而是"数据视图"：
 * - 键值行布局（label | value），无花括号/引号
 * - 嵌套对象 → 折叠区块（带左侧色条）
 * - 数组 → 卡片列表
 * - URL 可点击，长文本可展开
 * - API wrapper {code, data} 自动拆包
 */
import { useState } from 'react'
import { ChevronRight, ChevronDown, ExternalLink } from 'lucide-react'

type JsonValue = string | number | boolean | null | JsonValue[] | Record<string, JsonValue>

// ─── 辅助：人性化 key 名（camelCase → 空格分词）───
function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\s/, '')
    .toLowerCase()
}

// ─── API wrapper 语义拆包 ───
export function unwrapApiResponse(obj: unknown): { inner: unknown; badge: string } | null {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return null
  const o = obj as Record<string, unknown>
  const keys = Object.keys(o)

  if ('code' in o && 'data' in o && keys.length <= 5) {
    const ok = o.code === 0 || o.code === 200 || o.code === '0' || o.code === '200'
    return { inner: o.data, badge: ok ? `✓ code ${o.code}` : `✗ code ${o.code}` }
  }
  if ('status' in o && ('result' in o || 'data' in o) && keys.length <= 5) {
    return { inner: 'data' in o ? o.data : o.result, badge: String(o.status) }
  }
  if ('success' in o && 'data' in o && keys.length <= 5) {
    return { inner: o.data, badge: o.success ? '✓ success' : '✗ failed' }
  }
  return null
}

// ─── 标量值渲染 ───
function ScalarValue({ value }: { value: string | number | boolean | null }) {
  const [expanded, setExpanded] = useState(false)

  if (value === null) return <span className="dv-null">—</span>
  if (typeof value === 'boolean')
    return <span className={value ? 'dv-bool-true' : 'dv-bool-false'}>{value ? 'true' : 'false'}</span>
  if (typeof value === 'number') return <span className="dv-num">{value.toLocaleString()}</span>

  // string
  const s = value
  if (/^https?:\/\//.test(s)) {
    const label = s.length > 55 ? s.slice(0, 55) + '…' : s
    return (
      <a className="dv-url" href={s} target="_blank" rel="noopener noreferrer">
        {label} <ExternalLink size={10} />
      </a>
    )
  }
  if (s.length > 160 && !expanded) {
    return (
      <span className="dv-str">
        {s.slice(0, 160)}…{' '}
        <button className="dv-more" onClick={() => setExpanded(true)}>展开</button>
      </span>
    )
  }
  return <span className="dv-str">{s}</span>
}

// ─── 数组渲染 ───
function ArraySection({ items, depth }: { items: JsonValue[]; depth: number }) {
  const [collapsed, setCollapsed] = useState(depth >= 1)

  if (items.length === 0) return <span className="dv-empty">空列表</span>

  // 纯标量数组 → inline chips
  const allScalar = items.every(
    (v) => v === null || typeof v !== 'object'
  )
  if (allScalar) {
    return (
      <div className="dv-chips">
        {items.map((v, i) => (
          <span key={i} className="dv-chip">
            <ScalarValue value={v as string | number | boolean | null} />
          </span>
        ))}
      </div>
    )
  }

  // 对象数组 → 卡片列表
  return (
    <div className="dv-arr-section">
      <button className="dv-arr-toggle" onClick={() => setCollapsed((v) => !v)}>
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <span>{items.length} 项</span>
      </button>
      {!collapsed && (
        <div className="dv-arr-cards">
          {items.map((item, i) => (
            <div key={i} className="dv-arr-card">
              <div className="dv-arr-card-idx">{i + 1}</div>
              <div className="dv-arr-card-body">
                <DataSection value={item} depth={depth + 1} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 对象/数据区块渲染 ───
function DataSection({ value, depth }: { value: unknown; depth: number }) {
  if (value === null || typeof value !== 'object') {
    return <ScalarValue value={value as string | number | boolean | null} />
  }

  if (Array.isArray(value)) {
    return <ArraySection items={value as JsonValue[]} depth={depth} />
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return <span className="dv-empty">{ }</span>

  return (
    <div className="dv-rows">
      {entries.map(([k, v]) => {
        const isNested = v !== null && typeof v === 'object'
        return isNested ? (
          <NestedRow key={k} label={k} value={v} depth={depth} />
        ) : (
          <div key={k} className="dv-row">
            <span className="dv-label">{humanizeKey(k)}</span>
            <ScalarValue value={v as string | number | boolean | null} />
          </div>
        )
      })}
    </div>
  )
}

// ─── 嵌套对象行 ───
function NestedRow({ label, value, depth }: { label: string; value: unknown; depth: number }) {
  const isArray = Array.isArray(value)
  const count = isArray
    ? (value as unknown[]).length
    : Object.keys(value as object).length
  const [collapsed, setCollapsed] = useState(depth >= 1)

  return (
    <div className="dv-nested">
      <button
        className="dv-nested-header"
        onClick={() => setCollapsed((v) => !v)}
      >
        {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
        <span className="dv-nested-label">{humanizeKey(label)}</span>
        {collapsed && (
          <span className="dv-nested-hint">
            {isArray ? `${count} 项` : `${count} 个字段`}
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="dv-nested-body">
          <DataSection value={value} depth={depth + 1} />
        </div>
      )}
    </div>
  )
}

// ─── 主入口 ───
export function JsonTreeView({ data }: { data: unknown }) {
  const unwrapped = unwrapApiResponse(data)
  const display = unwrapped ? unwrapped.inner : data

  return (
    <div className="dv-root">
      {unwrapped && (
        <span className={`dv-badge ${unwrapped.badge.startsWith('✓') ? 'dv-badge-ok' : 'dv-badge-err'}`}>
          {unwrapped.badge}
        </span>
      )}
      <DataSection value={display} depth={0} />
    </div>
  )
}
