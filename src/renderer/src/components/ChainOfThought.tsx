/**
 * ChainOfThought 通用容器
 * 按 rikkahub 结构：icon rail（上下两段连线）+ content 区域
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import './ChainOfThought.css'

// ─── Step 基础 props ───

interface CotStepBaseProps {
  icon?: ReactNode
  label: ReactNode
  extra?: ReactNode
  children?: ReactNode
  contentVisible?: boolean
  isFirst?: boolean
  isLast?: boolean
}

// ─── 非受控 Step ───

interface CotStepProps extends CotStepBaseProps {
  defaultExpanded?: boolean
}

export function CotStep({ defaultExpanded = false, contentVisible, ...props }: CotStepProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  return (
    <CotStepContent
      {...props}
      expanded={expanded}
      onExpandedChange={setExpanded}
      contentVisible={contentVisible ?? expanded}
    />
  )
}

// ─── 受控 Step ───

interface ControlledCotStepProps extends CotStepBaseProps {
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}

export function ControlledCotStep({
  expanded, onExpandedChange, contentVisible, ...props
}: ControlledCotStepProps) {
  return (
    <CotStepContent
      {...props}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      contentVisible={contentVisible ?? expanded}
    />
  )
}

// ─── Step 内部实现 ───

interface CotStepContentProps extends CotStepBaseProps {
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  contentVisible: boolean
}

function CotStepContent({
  icon, label, extra, children,
  expanded, onExpandedChange, contentVisible,
  isFirst, isLast
}: CotStepContentProps) {
  const hasContent = Boolean(children)
  const clickable = hasContent

  const handleClick = () => {
    if (hasContent) onExpandedChange(!expanded)
  }

  const iconContent = icon
    ? <div className="cotStepIconInner">{icon}</div>
    : <div className="cotStepDot" />

  const indicator = hasContent
    ? (expanded
      ? <ChevronUp size={14} className="cotStepIndicator" />
      : <ChevronDown size={14} className="cotStepIndicator" />)
    : null

  return (
    <div className={`cotStep ${clickable ? 'cotStep--clickable' : ''}`}>
      {/* Icon rail: 上段连线 + 图标 + 下段连线 */}
      <div
        className={`cotStepRail ${clickable ? 'cotStepRail--clickable' : ''}`}
        onClick={clickable ? handleClick : undefined}
      >
        <div className={`cotRailLine cotRailLineTop ${isFirst === false ? 'cotRailLine--visible' : ''}`} />
        <div className="cotStepIconWrap">{iconContent}</div>
        <div className={`cotRailLine cotRailLineBottom ${isLast === false ? 'cotRailLine--visible' : ''}`} />
      </div>

      {/* Content */}
      <div className="cotStepBody">
        {clickable ? (
          <button type="button" className="cotStepRow" onClick={handleClick}>
            <span className="cotStepLabel">{label}</span>
            {extra && <span className="cotStepExtra">{extra}</span>}
            {indicator}
          </button>
        ) : (
          <div className="cotStepRow">
            <span className="cotStepLabel">{label}</span>
            {extra && <span className="cotStepExtra">{extra}</span>}
            {indicator}
          </div>
        )}

        {contentVisible && hasContent && (
          <div className="cotStepExpanded">{children}</div>
        )}
      </div>
    </div>
  )
}

// ─── ChainOfThought 主容器 ───

interface ChainOfThoughtProps<T> {
  steps: T[]
  renderStep: (step: T, index: number, info: { isFirst: boolean; isLast: boolean }) => ReactNode
  collapsedVisibleCount?: number
  className?: string
}

export function ChainOfThought<T>({
  steps, renderStep, collapsedVisibleCount = 2, className
}: ChainOfThoughtProps<T>) {
  const [expanded, setExpanded] = useState(false)
  const canCollapse = steps.length > collapsedVisibleCount
  const visibleSteps = expanded || !canCollapse
    ? steps
    : steps.slice(-collapsedVisibleCount)
  const hiddenCount = Math.max(steps.length - collapsedVisibleCount, 0)

  return (
    <div className={`cotCard ${className ?? ''}`}>
      {canCollapse && (
        <button
          type="button"
          className="cotCollapseBtn"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="cotCollapseBtnIcon">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
          <span>
            {expanded ? '收起' : `显示 ${hiddenCount} 个更早的步骤`}
          </span>
        </button>
      )}

      <div className="cotStepsContainer">
        {visibleSteps.map((step, i) =>
          renderStep(step, i, {
            isFirst: i === 0,
            isLast: i === visibleSteps.length - 1
          })
        )}
      </div>
    </div>
  )
}
