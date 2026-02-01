/**
 * 推理预算弹出层
 * 对齐 Flutter Kelivo 的 reasoning_budget_popover.dart
 * effort levels: auto, off, minimal, low, medium, high
 */

const EFFORT_LEVELS = [
  { key: 'auto', value: -1, color: '#3b82f6' },
  { key: 'off', value: 0, color: '#9ca3af' },
  { key: 'minimal', value: -10, color: '#14b8a6' },
  { key: 'low', value: -20, color: '#22c55e' },
  { key: 'medium', value: -30, color: '#f97316' },
  { key: 'high', value: -40, color: '#ef4444' },
] as const

export type EffortValue = -1 | 0 | -10 | -20 | -30 | -40

interface Props {
  value: EffortValue
  onChange: (v: EffortValue) => void
}

function valueToIndex(v: number): number {
  const idx = EFFORT_LEVELS.findIndex((l) => l.value === v)
  if (idx >= 0) return idx
  // legacy positive values
  if (v > 0) {
    if (v < 2048) return 2
    if (v < 8192) return 3
    if (v < 20000) return 4
    return 5
  }
  return 0
}

export function ReasoningBudgetPopover({ value, onChange }: Props) {
  const selectedIndex = valueToIndex(value)

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: 'var(--text-1)' }}>
        推理预算
      </div>
      <div
        style={{
          height: 36,
          display: 'flex',
          borderRadius: 8,
          background: 'var(--surface-2)',
          padding: 3,
          gap: 2
        }}
      >
        {EFFORT_LEVELS.map((level, i) => {
          const isSelected = i === selectedIndex
          return (
            <button
              key={level.key}
              type="button"
              onClick={() => onChange(level.value)}
              style={{
                flex: 1,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: isSelected ? 600 : 500,
                color: isSelected ? '#fff' : 'var(--text-3)',
                background: isSelected ? level.color : 'transparent',
                boxShadow: isSelected ? `0 1px 4px ${level.color}4d` : 'none',
                transition: 'all 0.18s ease'
              }}
            >
              {level.key}
            </button>
          )
        })}
      </div>
    </div>
  )
}
