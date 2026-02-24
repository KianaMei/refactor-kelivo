/**
 * groupMessageParts — 将 ChatMessage 的 blocks/reasoning/toolCalls 分组为 MessagePartBlock[]
 *
 * 规则：
 * 1. 有 blocks 时，按 blocks 顺序遍历，连续的 reasoning + tool 合并为一个 ThinkingBlock
 * 2. 无 blocks 时，回退到 flat 模式：reasoning → tools → content
 */
import type { MessagePartBlock, ThinkingStep, ReasoningData } from '../types/messageParts'
import type { ChatMessage } from '../MessageBubble'

export function groupMessageParts(
  message: ChatMessage,
  effectiveReasoning: string,
  displayContent: string
): MessagePartBlock[] {
  const hasReasoning = effectiveReasoning.trim().length > 0
  const toolCalls = message.toolCalls ?? []

  // ─── 有 blocks 时：按 blocks 顺序分组 ───
  if (message.blocks && message.blocks.length > 0) {
    const result: MessagePartBlock[] = []

    // 如果有 reasoning，先作为第一个 thinking block 的开头
    let pendingThinkingSteps: ThinkingStep[] = []

    if (hasReasoning) {
      pendingThinkingSteps.push({
        type: 'reasoning',
        data: {
          text: effectiveReasoning,
          createdAt: message.ts,
          finishedAt: message.reasoningDuration
            ? message.ts + message.reasoningDuration * 1000
            : undefined
        }
      })
    }

    for (const block of message.blocks) {
      if (block.type === 'tool') {
        const tc = toolCalls.find((t) => t.id === block.toolCallId)
        if (tc) {
          pendingThinkingSteps.push({ type: 'tool', data: tc })
        }
      } else {
        // text block — 先 flush 积累的 thinking steps
        if (pendingThinkingSteps.length > 0) {
          result.push({ type: 'thinking', steps: pendingThinkingSteps })
          pendingThinkingSteps = []
        }
        result.push({ type: 'content', text: block.content })
      }
    }

    // flush 尾部
    if (pendingThinkingSteps.length > 0) {
      result.push({ type: 'thinking', steps: pendingThinkingSteps })
    }

    return result
  }

  // ─── 无 blocks：flat 回退 ───
  const result: MessagePartBlock[] = []
  const thinkingSteps: ThinkingStep[] = []

  if (hasReasoning) {
    thinkingSteps.push({
      type: 'reasoning',
      data: {
        text: effectiveReasoning,
        createdAt: message.ts,
        finishedAt: message.reasoningDuration
          ? message.ts + message.reasoningDuration * 1000
          : undefined
      }
    })
  }

  for (const tc of toolCalls) {
    thinkingSteps.push({ type: 'tool', data: tc })
  }

  if (thinkingSteps.length > 0) {
    result.push({ type: 'thinking', steps: thinkingSteps })
  }

  if (displayContent.trim()) {
    result.push({ type: 'content', text: displayContent })
  }

  return result
}
