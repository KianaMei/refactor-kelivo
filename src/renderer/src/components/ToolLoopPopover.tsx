/**
 * 工具循环上限弹出层
 * 对齐 Flutter Kelivo 的 tool_loop_popover/sheet 行为：设置最大工具调用轮数
 */
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface Props {
  value: number
  maxLimit?: number
  onChange: (v: number) => void
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, Math.trunc(v)))
}

function formatValue(v: number): string {
  if (v <= 0) return '禁用'
  return String(v)
}

export function ToolLoopPopover({ value, maxLimit = 100, onChange }: Props) {
  const [local, setLocal] = useState(clampInt(value, 0, maxLimit))
  const presets = [0, 1, 3, 5, 10, 20]

  function commit(next: number) {
    const v = clampInt(next, 0, maxLimit)
    setLocal(v)
    onChange(v)
  }

  return (
    <div style={{ padding: '14px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div
          style={{
            padding: 6,
            borderRadius: 8,
            background: 'var(--primary-bg)',
            display: 'flex'
          }}
        >
          <RefreshCw size={16} style={{ color: 'var(--primary)' }} />
        </div>
        <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
          工具循环
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)' }}>
          {formatValue(local)}
        </div>
      </div>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={maxLimit}
        step={1}
        value={local}
        onChange={(e) => commit(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--primary)' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', margin: '2px 4px 14px' }}>
        <span>禁用</span>
        <span>{maxLimit}</span>
      </div>

      {/* Preset chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {presets.map((p) => {
          const isSelected = local === p
          return (
            <button
              key={p}
              type="button"
              onClick={() => commit(p)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                background: isSelected ? 'var(--primary-bg)' : 'transparent',
                color: isSelected ? 'var(--primary)' : 'var(--text-2)',
                fontSize: 12,
                fontWeight: isSelected ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.12s ease'
              }}
            >
              {formatValue(p)}
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
        设置每次对话中模型最多可进行的工具调用轮数（0 表示不允许工具调用）。
      </div>
    </div>
  )
}

