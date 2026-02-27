/**
 * 推理预算弹出层
 * 对齐 Flutter Kelivo 的 reasoning_budget_popover.dart
 * effort levels: auto, off, minimal, low, medium, high, xhigh
 */

import type { ResponsesReasoningSummary, ResponsesTextVerbosity } from '../../../shared/responsesOptions'

const EFFORT_LEVELS = [
  { key: 'auto', value: -1, color: '#3b82f6' },
  { key: 'off', value: 0, color: '#9ca3af' },
  { key: 'minimal', value: -10, color: '#14b8a6' },
  { key: 'low', value: -20, color: '#22c55e' },
  { key: 'medium', value: -30, color: '#f97316' },
  { key: 'high', value: -40, color: '#ef4444' },
  { key: 'xhigh', value: -50, color: '#b91c1c' },
] as const

export type EffortValue = -1 | 0 | -10 | -20 | -30 | -40 | -50

interface Props {
  value: EffortValue
  onChange: (v: EffortValue) => void
  allowXHigh?: boolean
  showResponsesOptions?: boolean
  responsesReasoningSummary?: ResponsesReasoningSummary
  onResponsesReasoningSummaryChange?: (v: ResponsesReasoningSummary) => void
  responsesTextVerbosity?: ResponsesTextVerbosity
  onResponsesTextVerbosityChange?: (v: ResponsesTextVerbosity) => void
}

const RESPONSES_SUMMARY_LEVELS: Array<{ key: ResponsesReasoningSummary; label: string }> = [
  { key: 'off', label: 'off' },
  { key: 'auto', label: 'auto' },
  { key: 'concise', label: 'concise' },
  { key: 'detailed', label: 'detailed' }
]

const RESPONSES_VERBOSITY_LEVELS: Array<{ key: ResponsesTextVerbosity; label: string }> = [
  { key: 'low', label: 'low' },
  { key: 'medium', label: 'medium' },
  { key: 'high', label: 'high' }
]

function valueToIndex(v: number, levels: ReadonlyArray<{ value: number }>): number {
  const idx = levels.findIndex((l) => l.value === v)
  if (idx >= 0) return idx
  // legacy positive values
  if (v > 0) {
    if (v < 2048) return 2
    if (v < 8192) return 3
    if (v < 20000) return 4
    return levels.findIndex((l) => l.value === -40)
  }
  return 0
}

export function ReasoningBudgetPopover({
  value,
  onChange,
  allowXHigh = false,
  showResponsesOptions = false,
  responsesReasoningSummary = 'detailed',
  onResponsesReasoningSummaryChange,
  responsesTextVerbosity = 'high',
  onResponsesTextVerbosityChange
}: Props) {
  const effortLevels = allowXHigh ? EFFORT_LEVELS : EFFORT_LEVELS.filter((l) => l.value !== -50)
  const selectedIndex = valueToIndex(value, effortLevels)

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
        {effortLevels.map((level, i) => {
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

      {showResponsesOptions && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 16, marginBottom: 10, color: 'var(--text-1)' }}>
            reasoning.summary
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
            {RESPONSES_SUMMARY_LEVELS.map((level) => {
              const isSelected = level.key === responsesReasoningSummary
              return (
                <button
                  key={level.key}
                  type="button"
                  onClick={() => onResponsesReasoningSummaryChange?.(level.key)}
                  style={{
                    flex: 1,
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected ? '#fff' : 'var(--text-3)',
                    background: isSelected ? '#3b82f6' : 'transparent',
                    boxShadow: isSelected ? '0 1px 4px rgba(59, 130, 246, 0.35)' : 'none',
                    transition: 'all 0.18s ease'
                  }}
                >
                  {level.label}
                </button>
              )
            })}
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 14, marginBottom: 10, color: 'var(--text-1)' }}>
            text.verbosity
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
            {RESPONSES_VERBOSITY_LEVELS.map((level) => {
              const isSelected = level.key === responsesTextVerbosity
              return (
                <button
                  key={level.key}
                  type="button"
                  onClick={() => onResponsesTextVerbosityChange?.(level.key)}
                  style={{
                    flex: 1,
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected ? '#fff' : 'var(--text-3)',
                    background: isSelected ? '#0ea5e9' : 'transparent',
                    boxShadow: isSelected ? '0 1px 4px rgba(14, 165, 233, 0.35)' : 'none',
                    transition: 'all 0.18s ease'
                  }}
                >
                  {level.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
