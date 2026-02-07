export function RowDivider() {
  return <div style={s.rowDivider} />
}

export function LabeledRow(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={s.labeledRow}>
      <div style={s.rowLabel}>{props.label}</div>
      <div style={s.rowTrailing}>{props.children}</div>
    </div>
  )
}

export function SliderRow(props: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <LabeledRow label={props.label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step ?? 0.1}
          value={props.value}
          onChange={(e) => props.onChange(Number(e.target.value))}
          style={{ width: 140 }}
        />
        <span style={{ fontSize: 13, opacity: 0.85, minWidth: 46, textAlign: 'right' }}>
          {props.value.toFixed(2)}
        </span>
      </div>
    </LabeledRow>
  )
}

const s: Record<string, React.CSSProperties> = {
  rowDivider: {
    height: 1,
    background: 'var(--border)',
    margin: '4px 8px',
    opacity: 0.5
  },
  labeledRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 4px',
    gap: 12
  },
  rowLabel: {
    fontSize: 14,
    flex: 1
  },
  rowTrailing: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8
  }
}

