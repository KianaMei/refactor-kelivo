/**
 * 最大 tokens 弹出层
 * 对齐 Flutter Kelivo 的 max_tokens_popover.dart
 * slider + preset chips
 */
import { useState } from 'react'
import { FileText } from 'lucide-react'

interface Props {
  value: number // 0 = unlimited
  maxLimit?: number
  onChange: (v: number) => void
}

function formatValue(v: number): string {
  if (v === 0) return '不限制'
  if (v >= 1000) {
    return `${v % 1000 === 0 ? (v / 1000).toFixed(0) : (v / 1000).toFixed(1)}K`
  }
  return String(v)
}

export function MaxTokensPopover({ value, maxLimit = 128000, onChange }: Props) {
  const [local, setLocal] = useState(value)
  const presets = [0, 4000, 8000, 16000, 32000]
  if (maxLimit >= 64000) presets.push(64000)

  function handleSlider(v: number) {
    // snap to nearest 1000
    const snapped = Math.round(v / 1000) * 1000
    setLocal(snapped)
    onChange(snapped)
  }

  function handlePreset(v: number) {
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
          <FileText size={16} style={{ color: 'var(--primary)' }} />
        </div>
        <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
          最大 Tokens
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
        step={1000}
        value={local}
        onChange={(e) => handleSlider(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--primary)' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', margin: '2px 4px 14px' }}>
        <span>不限制</span>
        <span>{formatValue(maxLimit)}</span>
      </div>

      {/* Preset chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {presets.map((p) => {
          const isSelected = local === p
          return (
            <button
              key={p}
              type="button"
              onClick={() => handlePreset(p)}
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
              {p === 0 ? '不限制' : formatValue(p)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
