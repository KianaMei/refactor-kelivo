import { useEffect, useRef } from 'react'

import type { ChatMessage } from './MessageBubble'
import type { TokenUsage } from '../../../../shared/chatStream'

export interface StreamDoneInfo {
  msgId: string
  convId: string
  content: string
  usage?: TokenUsage
  reasoning?: string
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
  const reasoningStartAtRef = useRef<number | null>(null)

  // 流式 chunk 可能非常频繁；逐 chunk setState 会导致整页（尤其滚动）卡死。
  // 这里做一个轻量节流：累积 delta，每 33ms 刷新一次 UI。
  const pendingDeltaRef = useRef<string>('')
  const pendingReasoningDeltaRef = useRef<string>('')
  const flushTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const flush = () => {
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

    const scheduleFlush = () => {
      if (flushTimerRef.current !== null) return
      flushTimerRef.current = window.setTimeout(flush, 33)
    }

    const offChunk = window.api.chat.onChunk((evt) => {
      const st = streamingRef.current
      if (!st || st.streamId !== evt.streamId) return

      if (evt.chunk.content) {
        accRef.current.content += evt.chunk.content
        pendingDeltaRef.current += evt.chunk.content
        scheduleFlush()
      }

      if (evt.chunk.reasoning) {
        // 记录推理开始时间，用于 UI 显示耗时
        reasoningStartAtRef.current ??= Date.now()
        accRef.current.reasoning += evt.chunk.reasoning
        pendingReasoningDeltaRef.current += evt.chunk.reasoning
        scheduleFlush()
      }

      if (evt.chunk.isDone) {
        // 结束前确保 UI 最终内容对齐（避免最后一段 delta 未 flush）
        if (flushTimerRef.current !== null) {
          window.clearTimeout(flushTimerRef.current)
          flushTimerRef.current = null
        }
        pendingDeltaRef.current = ''
        pendingReasoningDeltaRef.current = ''

        const finalContent = accRef.current.content
        const finalReasoning = accRef.current.reasoning || undefined
        accRef.current = { content: '', reasoning: '' }
        const reasoningDuration =
          reasoningStartAtRef.current != null ? (Date.now() - reasoningStartAtRef.current) / 1000.0 : undefined
        reasoningStartAtRef.current = null

        // 兜底：直接把最终内容写回 state（保证一致性）
        setMessagesByConv((prev) => {
          const list = prev[st.convId] ?? []
          const next = list.map((m) =>
            m.id === st.msgId
              ? { ...m, content: finalContent, reasoning: finalReasoning, reasoningDuration }
              : m
          )
          return { ...prev, [st.convId]: next }
        })

        onStreamDone?.({
          msgId: st.msgId,
          convId: st.convId,
          content: finalContent,
          usage: evt.chunk.usage ?? undefined,
          reasoning: finalReasoning
        })

        streamingRef.current = null
        setIsGenerating(false)
        setLoadingConversationIds((prev) => {
          const next = new Set(prev)
          next.delete(st.convId)
          return next
        })
      }
    })

    const offError = window.api.chat.onError((evt) => {
      const st = streamingRef.current
      if (!st || st.streamId !== evt.streamId) return

      // 发生错误也要清理定时 flush，避免持续占用主线程
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      pendingDeltaRef.current = ''
      pendingReasoningDeltaRef.current = ''
      reasoningStartAtRef.current = null

      const errorContent = (accRef.current.content ? accRef.current.content + '\n\n' : '') + `【错误】${evt.message}`
      accRef.current = { content: '', reasoning: '' }

      setMessagesByConv((prev) => {
        const list = prev[st.convId] ?? []
        const next = list.map((m) =>
          m.id === st.msgId ? { ...m, content: errorContent } : m
        )
        return { ...prev, [st.convId]: next }
      })

      onStreamDone?.({ msgId: st.msgId, convId: st.convId, content: errorContent })

      streamingRef.current = null
      setIsGenerating(false)
      setLoadingConversationIds((prev) => {
        const next = new Set(prev)
        next.delete(st.convId)
        return next
      })
    })

    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      pendingDeltaRef.current = ''
      pendingReasoningDeltaRef.current = ''
      offChunk()
      offError()
    }
  }, [setIsGenerating, setLoadingConversationIds, setMessagesByConv, streamingRef, onStreamDone])
}
