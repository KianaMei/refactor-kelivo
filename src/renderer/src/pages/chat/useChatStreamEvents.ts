import { useCallback, useEffect, useRef } from 'react'

import type { ChatMessage } from './MessageBubble'
import type { ChatStreamChunk, TokenUsage } from '../../../../shared/chatStream'
import { isAbortError } from '../../../../shared/streamingHttpClient'

type MessageBlock =
  | { type: 'text'; content: string }
  | { type: 'tool'; toolCallId: string }

export interface StreamDoneInfo {
  msgId: string
  convId: string
  content: string
  usage?: TokenUsage
  reasoning?: string
  toolCalls?: Array<{ id: string; name: string; arguments?: Record<string, unknown>; status: string; result?: string }>
  blocks?: MessageBlock[]
  finishedAt?: number
  firstTokenAt?: number
}

export function useChatStreamEvents(args: {
  streamingRef: React.MutableRefObject<{ streamId: string; convId: string; msgId: string } | null>
  setMessagesByConv: React.Dispatch<React.SetStateAction<Record<string, ChatMessage[]>>>
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>
  setLoadingConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>
  onStreamDone?: (info: StreamDoneInfo) => void
}) {
  const { streamingRef, setMessagesByConv, setIsGenerating, setLoadingConversationIds, onStreamDone } = args
  const accRef = useRef<{ content: string; reasoning: string }>({ content: '', reasoning: '' })
  const firstTokenAtRef = useRef<number | null>(null)
  const toolCallsAccRef = useRef<Array<{ id: string; name: string; arguments?: Record<string, unknown>; status: string; result?: string }>>([])
  const reasoningStartAtRef = useRef<number | null>(null)
  // blocks 交替渲染：追踪分割点
  const lastSplitIndexRef = useRef<number>(0)
  const blocksAccRef = useRef<MessageBlock[]>([])

  // 流式 chunk 可能非常频繁；逐 chunk setState 会导致整页（尤其滚动）卡死。
  // 这里做一个轻量节流：累积 delta，每 33ms 刷新一次 UI。
  const pendingDeltaRef = useRef<string>('')
  const pendingReasoningDeltaRef = useRef<string>('')
  const flushTimerRef = useRef<number | null>(null)

  // 用 ref 包装 flush，避免 useCallback 依赖频繁变化的 state setter
  const flushRef = useRef<() => void>(() => {})
  flushRef.current = () => {
    flushTimerRef.current = null
    const st = streamingRef.current
    if (!st) {
      pendingDeltaRef.current = ''
      pendingReasoningDeltaRef.current = ''
      return
    }
    const delta = pendingDeltaRef.current
    const reasoningDelta = pendingReasoningDeltaRef.current
    if (!delta && !reasoningDelta) return
    pendingDeltaRef.current = ''
    pendingReasoningDeltaRef.current = ''
    setMessagesByConv((prev) => {
      const list = prev[st.convId] ?? []
      const now = Date.now()
      const reasoningDuration =
        reasoningStartAtRef.current != null ? (now - reasoningStartAtRef.current) / 1000.0 : undefined
      const next = list.map((m) => {
        if (m.id !== st.msgId) return m
        return {
          ...m,
          content: delta ? m.content + delta : m.content,
          reasoning: reasoningDelta ? (m.reasoning ?? '') + reasoningDelta : m.reasoning,
          reasoningDuration
        }
      })
      return { ...prev, [st.convId]: next }
    })
  }

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return
    flushTimerRef.current = window.setTimeout(() => flushRef.current(), 33)
  }, [])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
    }
  }, [])

  /**
   * 消费 AsyncGenerator<ChatStreamChunk>，驱动 UI 更新
   * 替代原来的 IPC onChunk/onError 监听
   */
  const consumeStream = useCallback(
    async (generator: AsyncGenerator<ChatStreamChunk>) => {
      const st = streamingRef.current
      if (!st) return

      let lastUsage: TokenUsage | undefined

      try {
        for await (const chunk of generator) {
          // streamingRef 被清空说明用户已中止
          if (!streamingRef.current) break

          if (chunk.content) {
            firstTokenAtRef.current ??= Date.now()
            accRef.current.content += chunk.content
            pendingDeltaRef.current += chunk.content
            scheduleFlush()
          }

          if (chunk.reasoning) {
            reasoningStartAtRef.current ??= Date.now()
            accRef.current.reasoning += chunk.reasoning
            pendingReasoningDeltaRef.current += chunk.reasoning
            scheduleFlush()
          }

          if (chunk.usage) {
            lastUsage = chunk.usage
          }

          // 工具调用：标记为 running
          if (chunk.toolCalls && chunk.toolCalls.length > 0) {
            const toolCalls = chunk.toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments as Record<string, unknown> | undefined,
              status: 'running' as const
            }))
            // 记录分割点：当前累积内容中，上次分割后的文本作为 text block
            const textSinceLastSplit = accRef.current.content.substring(lastSplitIndexRef.current)
            if (textSinceLastSplit) {
              blocksAccRef.current.push({ type: 'text', content: textSinceLastSplit })
            }
            for (const tc of toolCalls) {
              blocksAccRef.current.push({ type: 'tool', toolCallId: tc.id })
            }
            lastSplitIndexRef.current = accRef.current.content.length

            toolCallsAccRef.current = [...toolCallsAccRef.current, ...toolCalls]
            setMessagesByConv((prev) => {
              const list = prev[st.convId] ?? []
              const next = list.map((m) => {
                if (m.id !== st.msgId) return m
                return { ...m, toolCalls: [...(m.toolCalls ?? []), ...toolCalls] }
              })
              return { ...prev, [st.convId]: next }
            })
          }

          // 工具结果：标记为 done
          if (chunk.toolResults && chunk.toolResults.length > 0) {
            const results = chunk.toolResults
            toolCallsAccRef.current = toolCallsAccRef.current.map((tc) => {
              const tr = results.find((r) => r.id === tc.id)
              if (!tr) return tc
              return { ...tc, status: 'done' as const, result: tr.content }
            })
            setMessagesByConv((prev) => {
              const list = prev[st.convId] ?? []
              const next = list.map((m) => {
                if (m.id !== st.msgId) return m
                const updated = (m.toolCalls ?? []).map((tc) => {
                  const tr = results.find((r) => r.id === tc.id)
                  if (!tr) return tc
                  return { ...tc, status: 'done' as const, result: tr.content }
                })
                return { ...m, toolCalls: updated }
              })
              return { ...prev, [st.convId]: next }
            })
          }

          if (chunk.isDone) break
        }

        // ── 流结束：最终 flush ──
        if (flushTimerRef.current !== null) {
          window.clearTimeout(flushTimerRef.current)
          flushTimerRef.current = null
        }
        pendingDeltaRef.current = ''
        pendingReasoningDeltaRef.current = ''

        const finalContent = accRef.current.content
        const finalReasoning = accRef.current.reasoning || undefined
        const finalToolCalls = toolCallsAccRef.current.length > 0 ? toolCallsAccRef.current : undefined

        // 构建交替渲染 blocks
        let finalBlocks: MessageBlock[] | undefined
        if (finalToolCalls && blocksAccRef.current.length > 0) {
          const tailText = finalContent.substring(lastSplitIndexRef.current)
          if (tailText.trim()) {
            blocksAccRef.current.push({ type: 'text', content: tailText })
          }
          finalBlocks = blocksAccRef.current.filter((b) =>
            b.type === 'tool' || (b.type === 'text' && b.content.trim())
          )
          if (finalBlocks.length <= 1 && finalBlocks[0]?.type === 'text') {
            finalBlocks = undefined
          }
        }

        accRef.current = { content: '', reasoning: '' }
        toolCallsAccRef.current = []
        lastSplitIndexRef.current = 0
        blocksAccRef.current = []
        const reasoningDuration =
          reasoningStartAtRef.current != null ? (Date.now() - reasoningStartAtRef.current) / 1000.0 : undefined
        reasoningStartAtRef.current = null

        // 兜底：直接把最终内容写回 state（保证一致性）
        setMessagesByConv((prev) => {
          const list = prev[st.convId] ?? []
          const next = list.map((m) =>
            m.id === st.msgId
              ? { ...m, content: finalContent, reasoning: finalReasoning, reasoningDuration, blocks: finalBlocks, finishedAt: Date.now(), firstTokenAt: firstTokenAtRef.current ?? undefined, usage: lastUsage ?? m.usage }
              : m
          )
          return { ...prev, [st.convId]: next }
        })

        onStreamDone?.({
          msgId: st.msgId,
          convId: st.convId,
          content: finalContent,
          usage: lastUsage,
          reasoning: finalReasoning,
          toolCalls: finalToolCalls,
          blocks: finalBlocks,
          finishedAt: Date.now(),
          firstTokenAt: firstTokenAtRef.current ?? undefined
        })
      } catch (e) {
        if (flushTimerRef.current !== null) {
          window.clearTimeout(flushTimerRef.current)
          flushTimerRef.current = null
        }
        pendingDeltaRef.current = ''
        pendingReasoningDeltaRef.current = ''
        reasoningStartAtRef.current = null

        if (isAbortError(e)) {
          // 用户取消：保留已累积的内容
          const partialContent = accRef.current.content
          const partialToolCalls = toolCallsAccRef.current.length > 0 ? toolCallsAccRef.current : undefined
          accRef.current = { content: '', reasoning: '' }
          toolCallsAccRef.current = []
          lastSplitIndexRef.current = 0
          blocksAccRef.current = []
          onStreamDone?.({ msgId: st.msgId, convId: st.convId, content: partialContent, toolCalls: partialToolCalls, finishedAt: Date.now(), firstTokenAt: firstTokenAtRef.current ?? undefined })
        } else {
          // 真正的错误
          const errorMsg = e instanceof Error ? e.message : String(e)
          const errorContent =
            (accRef.current.content ? accRef.current.content + '\n\n' : '') + `【错误】${errorMsg}`
          accRef.current = { content: '', reasoning: '' }
          toolCallsAccRef.current = []
          lastSplitIndexRef.current = 0
          blocksAccRef.current = []

          setMessagesByConv((prev) => {
            const list = prev[st.convId] ?? []
            const next = list.map((m) =>
              m.id === st.msgId ? { ...m, content: errorContent } : m
            )
            return { ...prev, [st.convId]: next }
          })

          onStreamDone?.({ msgId: st.msgId, convId: st.convId, content: errorContent, finishedAt: Date.now(), firstTokenAt: firstTokenAtRef.current ?? undefined })
        }
      } finally {
        firstTokenAtRef.current = null
        streamingRef.current = null
        setIsGenerating(false)
        setLoadingConversationIds((prev) => {
          const next = new Set(prev)
          next.delete(st.convId)
          return next
        })
      }
    },
    [streamingRef, setMessagesByConv, setIsGenerating, setLoadingConversationIds, onStreamDone, scheduleFlush]
  )

  return { consumeStream }
}
