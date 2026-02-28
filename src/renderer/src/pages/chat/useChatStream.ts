import { useEffect, useRef, useState } from 'react'
import type { AppConfig } from '../../../../shared/types'
import type { DbAssistant } from '../../../../shared/db-types'
import type { ChatMessageInput } from '../../../../shared/chat'
import type { ChatMessage as ChatStreamMessage, ChatStreamChunk } from '../../../../shared/chatStream'
import type { Conversation } from './ConversationSidebar'
import type { ChatMessage } from './MessageBubble'
import type { Attachment, MentionedModel } from './ChatInputBar'
import { buildChatRequestMessages, buildCustomBody, buildCustomHeaders } from './assistantChat'
import { rendererSendMessageStream } from '../../lib/chatService'
import { useChatStreamEvents } from './useChatStreamEvents'
import { safeUuid } from '../../../../shared/utils'
import { wrapOcrBlock } from '../../../../shared/ocr'
import type { ResponsesReasoningSummary, ResponsesTextVerbosity } from '../../../../shared/responsesOptions'

/** 检查模型是否支持图像输入（modelOverrides.input 包含 'image'） */
function modelSupportsImageInput(config: AppConfig, providerId: string, modelId: string): boolean {
  const provider = config.providerConfigs[providerId]
  if (!provider) return false
  const ov = provider.modelOverrides?.[modelId] as { input?: string[] } | undefined
  return Array.isArray(ov?.input) && ov.input.includes('image')
}

interface MentionSendQueue {
  convId: string
  assistantId: string | null
  assistantSnapshot: DbAssistant | null
  userInput: string
  history: ChatMessage[]
  models: MentionedModel[]
  thinkingBudget: number
  responsesReasoningSummary: ResponsesReasoningSummary
  responsesTextVerbosity: ResponsesTextVerbosity
  maxToolLoopIterations: number
  enableSearchTool: boolean
  customHeaders?: Record<string, string>
  customBody?: Record<string, unknown>
  userImagePaths: string[]
  documents: Array<{ path: string; fileName: string; mime: string }>
}

interface Deps {
  config: AppConfig
  activeConvId: string
  activeConversation: Conversation | undefined
  activeAssistant: DbAssistant | null
  activeAssistantId: string | null
  activeMessages: ChatMessage[]
  selectedVersions: Record<string, number>
  assistantMemories: Array<{ id: number; assistantId: string; content: string }>
  recentChats: Array<{ timestamp: string; title: string }>
  messagesByConv: Record<string, ChatMessage[]>
  setMessagesByConv: React.Dispatch<React.SetStateAction<Record<string, ChatMessage[]>>>
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  setLoadingConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>
  sliceAfterTruncate: (messages: ChatMessage[], truncateIndex: number | undefined) => ChatMessage[]
  collapseVersionsForRequest: (messages: ChatMessage[], versionSelections: Record<string, number>) => ChatMessage[]
}

export function useChatStream(deps: Deps) {
  const {
    config, activeConvId, activeConversation, activeAssistant, activeAssistantId,
    activeMessages, selectedVersions, assistantMemories, recentChats,
    messagesByConv, setMessagesByConv, setConversations, setLoadingConversationIds,
    sliceAfterTruncate, collapseVersionsForRequest
  } = deps

  const [isGenerating, setIsGenerating] = useState(false)
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [mentionedModels, setMentionedModels] = useState<MentionedModel[]>([])

  const streamingRef = useRef<{ streamId: string; convId: string; msgId: string } | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const mentionSendQueueRef = useRef<MentionSendQueue | null>(null)

  // 切换会话时清理队列
  useEffect(() => {
    mentionSendQueueRef.current = null
  }, [activeConvId])

  const handleStreamDone = (info: { msgId: string; convId: string; content: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number }; reasoning?: string; toolCalls?: unknown[]; blocks?: unknown[]; finishedAt?: number; firstTokenAt?: number }) => {
    const toolCallsData = info.toolCalls || info.blocks
      ? { toolCalls: info.toolCalls ?? [], blocks: info.blocks ?? [] }
      : null
    void window.api.db.messages.update(info.msgId, {
      content: info.content,
      isStreaming: false,
      tokenUsage: info.usage ?? null,
      totalTokens: info.usage?.totalTokens ?? null,
      reasoningText: info.reasoning ?? null,
      toolCalls: toolCallsData,
      finishedAt: info.finishedAt ?? null,
      firstTokenAt: info.firstTokenAt ?? null
    }).catch(err => console.error('[useChatStream] db message update (stream done) failed:', err))
    void window.api.db.conversations.update(info.convId, {})
      .catch(err => console.error('[useChatStream] db conversation update (stream done) failed:', err))
  }

  const { consumeStream } = useChatStreamEvents({
    streamingRef,
    setMessagesByConv,
    setIsGenerating,
    setLoadingConversationIds,
    onStreamDone: handleStreamDone
  })

  async function runRendererStream(params: {
    providerId: string
    modelId: string
    messages: ChatMessageInput[]
    assistantId?: string | null
    assistantSnapshot?: DbAssistant | null
    enableSearchTool?: boolean
    enableMemory?: boolean
    thinkingBudget?: number
    responsesReasoningSummary?: ResponsesReasoningSummary
    responsesTextVerbosity?: ResponsesTextVerbosity
    maxToolLoopIterations?: number
    userImagePaths?: string[]
    temperature?: number
    topP?: number
    maxTokens?: number
    customHeaders?: Record<string, string>
    customBody?: Record<string, unknown>
  }) {
    const appConfig = await window.api.config.get()
    const providerConfig = appConfig.providerConfigs[params.providerId]
    if (!providerConfig) throw new Error(`Provider ${params.providerId} not configured`)
    const assistantSnapshot = params.assistantSnapshot ?? null

    const ac = new AbortController()
    abortControllerRef.current = ac

    let userImages: Array<{ mime: string; base64: string }> | undefined
    if (params.userImagePaths && params.userImagePaths.length > 0) {
      const result = await window.api.chat.preprocess({ imagePaths: params.userImagePaths })
      userImages = result.images.length > 0 ? result.images : undefined
    }

    const generator = rendererSendMessageStream({
      config: providerConfig,
      modelId: params.modelId,
      messages: params.messages as ChatStreamMessage[],
      userImages,
      assistantId: params.assistantId,
      enableSearchTool: params.enableSearchTool,
      searchServiceId: appConfig.searchConfig?.global?.defaultServiceId ?? undefined,
      enableMemory: params.enableMemory,
      mcpServerIds: assistantSnapshot?.mcpServerIds ?? [],
      mcpServers: appConfig.mcpServers ?? [],
      mcpToolCallMode: appConfig.mcpToolCallMode,
      thinkingBudget: params.thinkingBudget,
      responsesReasoningSummary: params.responsesReasoningSummary,
      responsesTextVerbosity: params.responsesTextVerbosity,
      maxToolLoopIterations: params.maxToolLoopIterations,
      temperature: params.temperature,
      topP: params.topP,
      maxTokens: params.maxTokens,
      customHeaders: params.customHeaders,
      customBody: params.customBody,
      signal: ac.signal
    })

    await consumeStream(generator)
  }

  function clearInputAttachments() {
    // NOTE: 附件发送后会被写入 message.attachments（用于聊天历史展示）。
    // 如果这里 revoke 掉 object URL，会导致消息气泡里的图片立刻变成“裂图”。
    // 仅清空输入栏状态，object URL 的生命周期由“聊天历史仍在显示”决定。
    setAttachments([])
  }

  function handleAddAttachment(files: FileList) {
    const newAttachments: Attachment[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const isImage = file.type.startsWith('image/')
      const filePath = String((file as unknown as { path?: string }).path ?? '').trim() || undefined
      newAttachments.push({
        id: safeUuid(),
        type: isImage ? 'image' : 'file',
        name: file.name,
        url: URL.createObjectURL(file),
        path: filePath,
        mime: file.type || undefined,
        file
      })
    }
    setAttachments((prev) => [...prev, ...newAttachments])
  }

  function handleRemoveAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id)
      if (target) {
        try { URL.revokeObjectURL(target.url) } catch { /* ignore */ }
      }
      return prev.filter((a) => a.id !== id)
    })
  }

  function handleStop() {
    const st = streamingRef.current
    if (!st) return
    mentionSendQueueRef.current = null
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }

  async function startNextMentionedModelIfAny() {
    if (isGenerating) return
    const queue = mentionSendQueueRef.current
    if (!queue) return
    if (queue.convId !== activeConvId) {
      mentionSendQueueRef.current = null
      return
    }

    const nextModel = queue.models[0]
    const restModels = queue.models.slice(1)
    mentionSendQueueRef.current = restModels.length ? { ...queue, models: restModels } : null

    if (!nextModel?.providerId || !nextModel.modelId) {
      await startNextMentionedModelIfAny()
      return
    }

    const providerId = nextModel.providerId
    const modelId = nextModel.modelId
    const assistant = queue.assistantSnapshot
    const now = Date.now()
    const assistantMsgId = safeUuid()
    const currentMsgCount = (messagesByConv[queue.convId] ?? []).length

    setMessagesByConv((prev) => {
      const list = prev[queue.convId] ?? []
      return {
        ...prev,
        [queue.convId]: [...list, { id: assistantMsgId, role: 'assistant', content: '', ts: now, providerId, modelId }]
      }
    })

    setConversations((prev) =>
      prev
        .map((c) => (c.id === queue.convId ? { ...c, updatedAt: Date.now(), assistantCount: (c.assistantCount ?? 0) + 1 } : c))
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return b.updatedAt - a.updatedAt
        })
    )

    void window.api.db.messages.create({
      id: assistantMsgId,
      conversationId: queue.convId,
      role: 'assistant',
      content: '',
      sortOrder: currentMsgCount,
      isStreaming: true,
      providerId,
      modelId
    }).catch(err => console.error('[useChatStream] db message create failed:', err))

    const streamId = safeUuid()
    streamingRef.current = { streamId, convId: queue.convId, msgId: assistantMsgId }
    setIsGenerating(true)
    setLoadingConversationIds((prev) => new Set(prev).add(queue.convId))

    try {
      let effectiveUserInput = queue.userInput
      let effectiveImagePaths = queue.userImagePaths

      // OCR: 多模型@提及场景，当目标模型不支持图像输入时走 OCR
      if (
        config.ocrEnabled &&
        config.ocrModelProvider &&
        config.ocrModelId &&
        effectiveImagePaths.length > 0 &&
        !modelSupportsImageInput(config, providerId, modelId)
      ) {
        try {
          const ocrResult = await window.api.ocr.run({ imagePaths: effectiveImagePaths })
          if (ocrResult.success && ocrResult.text) {
            effectiveUserInput = wrapOcrBlock(ocrResult.text) + '\n' + effectiveUserInput
            effectiveImagePaths = []
          }
        } catch (ocrErr) {
          console.warn('[useChatStream] OCR failed in mention queue, falling back to direct image send:', ocrErr)
        }
      }

      const reqMessages: ChatMessageInput[] = buildChatRequestMessages({
        assistant,
        history: queue.history,
        userInput: effectiveUserInput,
        memories: assistantMemories,
        recentChats
      })

      await runRendererStream({
        providerId,
        modelId,
        messages: reqMessages,
        assistantId: queue.assistantId,
        assistantSnapshot: assistant,
        enableSearchTool: queue.enableSearchTool,
        enableMemory: queue.assistantSnapshot?.enableMemory,
        thinkingBudget: queue.thinkingBudget,
        responsesReasoningSummary: queue.responsesReasoningSummary,
        responsesTextVerbosity: queue.responsesTextVerbosity,
        maxToolLoopIterations: queue.maxToolLoopIterations,
        userImagePaths: effectiveImagePaths,
        temperature: assistant?.temperature,
        topP: assistant?.topP,
        maxTokens: assistant?.maxTokens,
        customHeaders: queue.customHeaders,
        customBody: queue.customBody
      })
    } catch (e) {
      const errorText = `【错误】${e instanceof Error ? e.message : String(e)}`
      setMessagesByConv((prev) => {
        const list = prev[queue.convId] ?? []
        const next = list.map((m) => (m.id === assistantMsgId ? { ...m, content: errorText } : m))
        return { ...prev, [queue.convId]: next }
      })
      void window.api.db.messages.update(assistantMsgId, { content: errorText, isStreaming: false })
        .catch(err => console.error('[useChatStream] db message update (error) failed:', err))

      if (streamingRef.current?.streamId === streamId) streamingRef.current = null
      setIsGenerating(false)
      setLoadingConversationIds((prev) => {
        const next = new Set(prev)
        next.delete(queue.convId)
        return next
      })
    }
  }

  function handleSend() {
    if (isGenerating) return

    const assistant = activeAssistant ?? null
    const mentioned = mentionedModels.slice()
    const primaryMention = mentioned[0] ?? null
    const text = draft.trim()
    const attachmentPayload = (() => {
      const userImagePaths: string[] = []
      const documents: Array<{ path: string; fileName: string; mime: string }> = []
      for (const a of attachments) {
        const p = String(a.path ?? '').trim()
        if (!p) continue
        if (a.type === 'image') userImagePaths.push(p)
        else documents.push({ path: p, fileName: a.name, mime: a.mime ?? '' })
      }
      return { userImagePaths, documents }
    })()
    const hasAttachments = attachmentPayload.userImagePaths.length > 0 || attachmentPayload.documents.length > 0
    if (!text && !hasAttachments) return

    const providerId = primaryMention?.providerId ?? (assistant?.boundModelProvider ?? config.currentModelProvider)
    const modelId = primaryMention?.modelId ?? (assistant?.boundModelId ?? config.currentModelId)
    const now = Date.now()
    const displayText = text || (attachments.length > 0 ? '（发送了附件）' : '')
    const userInputForModel = text || (hasAttachments ? '请根据我上传的附件进行分析。' : displayText)
    const historySnapshot = collapseVersionsForRequest(
      sliceAfterTruncate(activeMessages, activeConversation?.truncateIndex),
      selectedVersions
    )
    const thinkingBudget = activeConversation?.thinkingBudget ?? -1
    const responsesReasoningSummary = activeConversation?.responsesReasoningSummary ?? 'detailed'
    const responsesTextVerbosity = activeConversation?.responsesTextVerbosity ?? 'high'
    const maxToolLoopIterations = assistant?.maxToolLoopIterations ?? 10
    const enableSearchTool = config.searchConfig?.global?.enabled === true
    const assistantIdForTools = activeAssistantId ?? null
    const customHeaders = buildCustomHeaders(assistant)
    const customBody = buildCustomBody(assistant)
    const userMsg: ChatMessage = {
      id: safeUuid(),
      role: 'user',
      content: displayText,
      ts: now,
      attachments: attachments.length > 0 ? attachments.map((a) => ({ type: a.type, url: a.url, name: a.name })) : undefined
    }

    setDraft('')
    clearInputAttachments()

    if (!primaryMention && assistant?.boundModelProvider && !assistant.boundModelId) {
      setMessagesByConv((prev) => {
        const list = prev[activeConvId] ?? []
        return {
          ...prev,
          [activeConvId]: [
            ...list,
            userMsg,
            { id: safeUuid(), role: 'assistant', content: '【错误】该助手已选择供应商，但未绑定具体模型。请到"设置-助手"中配置。', ts: now + 1 }
          ]
        }
      })
      return
    }
    if (!providerId || !modelId) {
      setMessagesByConv((prev) => {
        const list = prev[activeConvId] ?? []
        return {
          ...prev,
          [activeConvId]: [
            ...list,
            userMsg,
            { id: safeUuid(), role: 'assistant', content: '请先配置默认模型（右上角提示处或点击"去设置"）。', ts: now + 1 }
          ]
        }
      })
      return
    }

    const assistantMsgId = safeUuid()
    const currentMsgCount = (messagesByConv[activeConvId] ?? []).length
    setMessagesByConv((prev) => {
      const list = prev[activeConvId] ?? []
      return {
        ...prev,
        [activeConvId]: [
          ...list,
          userMsg,
          { id: assistantMsgId, role: 'assistant', content: '', ts: now + 1, providerId, modelId }
        ]
      }
    })

    setConversations((prev) =>
      prev
        .map((c) =>
          c.id === activeConvId
            ? { ...c, updatedAt: Date.now(), assistantCount: (c.assistantCount ?? 0) + 1 }
            : c
        )
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return b.updatedAt - a.updatedAt
        })
    )

    void window.api.db.messages.createBatch([
      { id: userMsg.id, conversationId: activeConvId, role: 'user', content: displayText, sortOrder: currentMsgCount },
      { id: assistantMsgId, conversationId: activeConvId, role: 'assistant', content: '', sortOrder: currentMsgCount + 1, isStreaming: true, providerId, modelId }
    ]).catch(err => console.error('[useChatStream] db createBatch failed:', err))

    mentionSendQueueRef.current =
      mentioned.length > 1
        ? {
          convId: activeConvId,
          assistantId: assistantIdForTools,
          assistantSnapshot: assistant,
          userInput: userInputForModel,
          history: historySnapshot,
          models: mentioned.slice(1),
          thinkingBudget,
          responsesReasoningSummary,
          responsesTextVerbosity,
          maxToolLoopIterations,
          enableSearchTool,
          customHeaders,
          customBody,
          userImagePaths: attachmentPayload.userImagePaths,
          documents: attachmentPayload.documents
        }
        : null

    const streamId = safeUuid()
    streamingRef.current = { streamId, convId: activeConvId, msgId: assistantMsgId }
    setIsGenerating(true)
    setLoadingConversationIds((prev) => new Set(prev).add(activeConvId))

    void (async () => {
      try {
        const historySnapshot = collapseVersionsForRequest(
          sliceAfterTruncate(activeMessages, activeConversation?.truncateIndex),
          selectedVersions
        )
        let userInput = text || (hasAttachments ? '请根据我上传的附件进行分析。' : displayText)
        let effectiveImagePaths = attachmentPayload.userImagePaths

        // OCR: 当启用且已配置、有图片、且当前聊天模型不支持图像输入时，先用 OCR 模型提取图片文本
        if (
          config.ocrEnabled &&
          config.ocrModelProvider &&
          config.ocrModelId &&
          effectiveImagePaths.length > 0 &&
          !modelSupportsImageInput(config, providerId, modelId)
        ) {
          try {
            const ocrResult = await window.api.ocr.run({ imagePaths: effectiveImagePaths })
            if (ocrResult.success && ocrResult.text) {
              userInput = wrapOcrBlock(ocrResult.text) + '\n' + userInput
              effectiveImagePaths = []
            }
          } catch (ocrErr) {
            console.warn('[useChatStream] OCR failed, falling back to direct image send:', ocrErr)
          }
        }

        const reqMessages: ChatMessageInput[] = buildChatRequestMessages({
          assistant,
          history: historySnapshot,
          userInput,
          memories: assistantMemories,
          recentChats
        })

        await runRendererStream({
          providerId,
          modelId,
          messages: reqMessages,
          assistantId: assistantIdForTools,
          assistantSnapshot: assistant,
          enableSearchTool,
          enableMemory: assistant?.enableMemory,
          thinkingBudget,
          responsesReasoningSummary,
          responsesTextVerbosity,
          maxToolLoopIterations,
          userImagePaths: effectiveImagePaths,
          temperature: assistant?.temperature,
          topP: assistant?.topP,
          maxTokens: assistant?.maxTokens,
          customHeaders,
          customBody
        })
      } catch (e) {
        setMessagesByConv((prev) => {
          const list = prev[activeConvId] ?? []
          const next = list.map((m) =>
            m.id === assistantMsgId ? { ...m, content: `【错误】${e instanceof Error ? e.message : String(e)}` } : m
          )
          return { ...prev, [activeConvId]: next }
        })
        if (streamingRef.current?.streamId === streamId) streamingRef.current = null
        setIsGenerating(false)
        setLoadingConversationIds((prev) => {
          const next = new Set(prev)
          next.delete(activeConvId)
          return next
        })
      }
    })()
  }

  // 多模型分发：当前流结束后自动发送队列里的下一个模型
  useEffect(() => {
    if (isGenerating) return
    if (!mentionSendQueueRef.current) return
    void startNextMentionedModelIfAny()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // startNextMentionedModelIfAny 是内部闭包函数，其依赖链复杂；加入会导致 ref 不稳定和无限重渲染
  }, [isGenerating, activeConvId])

  const streamingMsgId = isGenerating ? streamingRef.current?.msgId : null

  return {
    isGenerating, setIsGenerating,
    draft, setDraft,
    attachments, setAttachments,
    mentionedModels, setMentionedModels,
    streamingRef, abortControllerRef,
    streamingMsgId,
    consumeStream,
    runRendererStream,
    handleSend, handleStop,
    handleAddAttachment, handleRemoveAttachment, clearInputAttachments,
  }
}
