/**
 * ToolStep — 工具调用步骤，作为 ChainOfThought 的 ControlledCotStep 渲染
 */
import { useState } from 'react'
import { ControlledCotStep } from '../../../components/ChainOfThought'
import { DotLoading } from '../../../components/DotLoading'
import { resolveToolMeta, ToolResultContent, type ToolCallData } from '../ToolCallItem'
import type { ToolApprovalState } from '../types/messageParts'
import { ToolDenyDialog } from './ToolDenyDialog'

interface ToolStepProps {
  tc: ToolCallData
  approvalState?: ToolApprovalState
  isFirst: boolean
  isLast: boolean
  onApprove?: (tcId: string) => void
  onDeny?: (tcId: string, reason?: string) => void
}

export function ToolStep({ tc, approvalState, isFirst, isLast, onApprove, onDeny }: ToolStepProps) {
  const [expanded, setExpanded] = useState(false)
  const [denyOpen, setDenyOpen] = useState(false)
  const meta = resolveToolMeta(tc)
  const isLoading = tc.status === 'running' || tc.status === 'pending'
  const isPending = approvalState?.type === 'pending'

  const icon = isLoading ? <DotLoading size={4} /> : meta.icon

  const extra = (
    <>
      {meta.params && (
        <span className="tcParams" title={meta.params}>{meta.params}</span>
      )}
      {tc.status === 'error' && <span className="tcError">Error</span>}
      {isPending && (
        <span className="cotApprovalBtns">
          <button
            type="button"
            className="cotApproveBtn"
            onClick={(e) => { e.stopPropagation(); onApprove?.(tc.id) }}
          >
            允许
          </button>
          <button
            type="button"
            className="cotDenyBtn"
            onClick={(e) => { e.stopPropagation(); setDenyOpen(true) }}
          >
            拒绝
          </button>
        </span>
      )}
    </>
  )

  const hasContent = !!tc.result || (tc.arguments && Object.keys(tc.arguments).length > 0)

  return (
    <>
      <ControlledCotStep
        icon={icon}
        label={meta.label}
        extra={extra}
        isFirst={isFirst}
        isLast={isLast}
        expanded={expanded && !!hasContent}
        onExpandedChange={(v) => { if (hasContent && !isLoading) setExpanded(v) }}
      >
        {hasContent ? (
          <div className="tcContent">
            <ToolResultContent tc={tc} />
          </div>
        ) : undefined}
      </ControlledCotStep>
      <ToolDenyDialog
        open={denyOpen}
        onClose={() => setDenyOpen(false)}
        onDeny={(reason) => {
          setDenyOpen(false)
          onDeny?.(tc.id, reason)
        }}
      />
    </>
  )
}
