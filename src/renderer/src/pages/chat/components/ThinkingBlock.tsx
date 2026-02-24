/**
 * ThinkingBlock — 用 ChainOfThought 包裹 ReasoningStep + ToolStep
 * 作为 MessageBubble 的直接子组件
 */
import { ChainOfThought } from '../../../components/ChainOfThought'
import { ReasoningStep } from './ReasoningStep'
import { ToolStep } from './ToolStep'
import type { ThinkingStep } from '../types/messageParts'

interface ThinkingBlockProps {
  steps: ThinkingStep[]
  isLoading: boolean
  autoCollapseThinking: boolean
  enableReasoningMarkdown: boolean
  onApprove?: (tcId: string) => void
  onDeny?: (tcId: string, reason?: string) => void
}

export function ThinkingBlock({
  steps, isLoading, autoCollapseThinking, enableReasoningMarkdown,
  onApprove, onDeny
}: ThinkingBlockProps) {
  return (
    <ChainOfThought
      steps={steps}
      collapsedVisibleCount={2}
      renderStep={(step, _idx, { isFirst, isLast }) => {
        if (step.type === 'reasoning') {
          return (
            <ReasoningStep
              key={`r-${_idx}`}
              data={step.data}
              isLoading={isLoading}
              isFirst={isFirst}
              isLast={isLast}
              autoCollapseThinking={autoCollapseThinking}
              enableReasoningMarkdown={enableReasoningMarkdown}
            />
          )
        }
        return (
          <ToolStep
            key={`t-${step.data.id}`}
            tc={step.data}
            approvalState={step.approvalState}
            isFirst={isFirst}
            isLast={isLast}
            onApprove={onApprove}
            onDeny={onDeny}
          />
        )
      }}
    />
  )
}
