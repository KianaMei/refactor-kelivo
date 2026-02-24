/**
 * ReasoningStep — 推理步骤组件
 * 3 态状态机：Collapsed → Preview（80px + gradient mask）→ Expanded
 */
import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { ControlledCotStep } from '../../../components/ChainOfThought'
import { MarkdownView } from '../../../components/MarkdownView'
import type { ReasoningData, ReasoningCardState } from '../types/messageParts'

interface ReasoningStepProps {
  data: ReasoningData
  isLoading: boolean
  isFirst: boolean
  isLast: boolean
  autoCollapseThinking: boolean
  enableReasoningMarkdown: boolean
}

function useReasoningState(
  isLoading: boolean,
  autoCollapse: boolean,
  hasContent: boolean
): [ReasoningCardState, (s: ReasoningCardState) => void] {
  const manualRef = useRef(false)
  const prevLoadingRef = useRef(isLoading)
  const [state, setState] = useState<ReasoningCardState>(() => {
    if (isLoading && hasContent) return 'preview'
    return 'collapsed'
  })

  useEffect(() => {
    if (isLoading && hasContent && state === 'collapsed' && !manualRef.current) {
      setState('preview')
    }
  }, [isLoading, hasContent, state])

  useEffect(() => {
    const wasLoading = prevLoadingRef.current
    if (wasLoading && !isLoading && autoCollapse && !manualRef.current) {
      setState('collapsed')
    }
    prevLoadingRef.current = isLoading
  }, [isLoading, autoCollapse])

  const setManualState = (s: ReasoningCardState) => {
    manualRef.current = true
    setState(s)
  }

  return [state, setManualState]
}

export function ReasoningStep({
  data, isLoading, isFirst, isLast, autoCollapseThinking, enableReasoningMarkdown
}: ReasoningStepProps) {
  const text = (data.text ?? '').trim().replace(/\\n/g, '\n')
  const hasContent = text.length > 0
  const [cardState, setCardState] = useReasoningState(isLoading, autoCollapseThinking, hasContent)

  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isLoading) return
    const el = bodyRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [isLoading, text])

  const durationSec = data.finishedAt && data.createdAt
    ? Math.max((data.finishedAt - data.createdAt) / 1000, 0)
    : undefined

  const title = data.geminiTitle
    || (durationSec != null ? `思考了 ${durationSec.toFixed(1)} 秒` : undefined)
    || (isLoading ? '思考中' : '深度思考')

  const isExpanded = cardState === 'expanded'
  const showBody = hasContent && (isExpanded || cardState === 'preview')
  const isPreview = cardState === 'preview'

  const onExpandedChange = (nextExpanded: boolean) => {
    if (isLoading) {
      setCardState(nextExpanded ? 'expanded' : 'preview')
    } else {
      setCardState(nextExpanded ? 'expanded' : 'collapsed')
    }
  }

  const icon = <span className="msgReasoningIcon" aria-hidden="true" />

  const label = (
    <span className={`msgReasoningTitle ${isLoading ? 'msgShimmer' : ''}`}>
      {title}
    </span>
  )

  return (
    <ControlledCotStep
      icon={icon}
      label={label}
      isFirst={isFirst}
      isLast={isLast}
      expanded={isExpanded}
      onExpandedChange={onExpandedChange}
      contentVisible={showBody}
    >
      {hasContent ? (
        <div
          ref={bodyRef}
          className={`msgReasoningContent scrollbarHover ${isPreview ? 'msgReasoningContentPreview' : ''}`}
        >
          {enableReasoningMarkdown ? (
            <MarkdownView content={text} />
          ) : (
            <pre className="msgReasoningPlain">{text}</pre>
          )}
        </div>
      ) : undefined}
    </ControlledCotStep>
  )
}
