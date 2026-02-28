/**
 * 聊天消息 action handlers：
 * 删除、编辑、重新生成、版本切换、重发、@回答、分支
 */
import type React from 'react'
import type { AppConfig, AssistantConfig } from '../../../../shared/types'
import type { ChatMessageInput } from '../../../../shared/chat'
import type { ChatMessage } from './MessageBubble'
import type { Conversation } from './ConversationSidebar'
import { buildChatRequestMessages, buildCustomHeaders, buildCustomBody } from './assistantChat'
import { revokeOrphanBlobUrls } from './utils/objectUrls'
import { safeUuid } from '../../../../shared/utils'

export interface UseChatActionsParams {
  config: AppConfig
  activeConvId: string
  activeConversation: Conversation | undefined
  activeAssistant: AssistantConfig | undefined | null
  activeAssistantId: string | undefined | null
  activeMessages: ChatMessage[]
  messagesByConv: Record<string, ChatMessage[]>
  setMessagesByConv: React.Dispatch<React.SetStateAction<Record<string, ChatMessage[]>>>
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  selectedVersions: Record<string, number>
  setSelectedVersions: React.Dispatch<React.SetStateAction<Record<string, number>>>
  streamingRef: React.MutableRefObject<{ streamId: string; convId: string; msgId: string } | null>
  isGenerating: boolean
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>
  setLoadingConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>
  runRendererStream: (opts: {
    providerId: string
    modelId: string
    messages: ChatMessageInput[]
    assistantId: string | null
    enableSearchTool: boolean
    enableMemory?: boolean
    thinkingBudget: number
    maxToolLoopIterations?: number
    temperature?: number
    topP?: number
    maxTokens?: number
    customHeaders?: Record<string, string>
    customBody?: Record<string, unknown>
  }) => Promise<void>
  assistantMemories: Array<{ id: number; assistantId: string; content: string }>
  recentChats: Array<{ timestamp: string; title: string }>
  scrollTargetRef: React.MutableRefObject<string | null>
  setModelPickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  setPendingReAnswerMsgId: React.Dispatch<React.SetStateAction<string | null>>
  pendingReAnswerMsgId: string | null
  onSave: (next: AppConfig) => Promise<void>
}

export function useChatActions(params: UseChatActionsParams) {
  const {
    config, activeConvId, activeConversation, activeAssistantId,
    activeMessages, messagesByConv, setMessagesByConv, setConversations,
    selectedVersions, setSelectedVersions,
    streamingRef, isGenerating, setIsGenerating, setLoadingConversationIds,
    runRendererStream, assistantMemories, recentChats, scrollTargetRef,
    setModelPickerOpen, setPendingReAnswerMsgId, pendingReAnswerMsgId, onSave
  } = params
  const activeAssistant = params.activeAssistant ?? null

  function handleDeleteMessage(msg: ChatMessage) {
    setMessagesByConv((prev) => {
      const list = prev[activeConvId] ?? []
      const nextList = list.filter((m) => m.id !== msg.id)
      const nextByConv = { ...prev, [activeConvId]: nextList }
      revokeOrphanBlobUrls({ removing: [msg], remainingByConv: nextByConv })
      return nextByConv
    })
    void window.api.db.messages.delete(msg.id)
      .catch(err => console.error('[ChatPageNew] db message delete failed:', err))
  }

  function handleEditMessage(msg: ChatMessage, newContent: string) {
    setMessagesByConv((prev) => {
      const list = prev[activeConvId] ?? []
      return { ...prev, [activeConvId]: list.map((m) => (m.id === msg.id ? { ...m, content: newContent } : m)) }
    })
    void window.api.db.messages.update(msg.id, { content: newContent })
      .catch(err => console.error('[ChatPageNew] db message update (edit) failed:', err))

    if (msg.role === 'user') {
      const messages = messagesByConv[activeConvId] ?? []
      const msgIndex = messages.findIndex((m) => m.id === msg.id)
      const nextAssistantMsg = messages.slice(msgIndex + 1).find((m) => m.role === 'assistant')
      if (nextAssistantMsg) {
        const assistant = activeAssistant
        const providerId = assistant?.boundModelProvider ?? config.currentModelProvider
        const modelId = assistant?.boundModelId ?? config.currentModelId
        if (!providerId || !modelId) return

        setMessagesByConv((prev) => {
          const list = prev[activeConvId] ?? []
          return {
            ...prev,
            [activeConvId]: list.map((m) => (m.id === nextAssistantMsg.id ? { ...m, content: '', ts: Date.now() } : m))
          }
        })
        void window.api.db.messages.update(nextAssistantMsg.id, { content: '', isStreaming: true })
          .catch(err => console.error('[ChatPageNew] db message update (reset for regen) failed:', err))

        const streamId = safeUuid()
        streamingRef.current = { streamId, convId: activeConvId, msgId: nextAssistantMsg.id }
        setIsGenerating(true)
        setLoadingConversationIds((prev) => new Set(prev).add(activeConvId))

        void (async () => {
          try {
            const historyForRegen = messages.slice(0, msgIndex)
            const reqMessages: ChatMessageInput[] = buildChatRequestMessages({
              assistant,
              history: historyForRegen,
              userInput: newContent,
              memories: assistantMemories,
              recentChats
            })
            const customHeaders = buildCustomHeaders(assistant)
            const customBody = buildCustomBody(assistant)
            await runRendererStream({
              providerId,
              modelId,
              messages: reqMessages,
              assistantId: activeAssistantId ?? null,
              enableSearchTool: config.searchConfig?.global?.enabled === true,
              enableMemory: assistant?.enableMemory,
              thinkingBudget: activeConversation?.thinkingBudget ?? -1,
              maxToolLoopIterations: assistant?.maxToolLoopIterations ?? 10,
              temperature: assistant?.temperature,
              topP: assistant?.topP,
              maxTokens: assistant?.maxTokens,
              customHeaders,
              customBody
            })
          } catch (e) {
            setMessagesByConv((prev) => {
              const list = prev[activeConvId] ?? []
              return {
                ...prev,
                [activeConvId]: list.map((m) =>
                  m.id === nextAssistantMsg.id ? { ...m, content: `【错误】${e instanceof Error ? e.message : String(e)}` } : m
                )
              }
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
    }
  }

  function startVersionedAssistantReAnswer(options: { targetAssistantMsgId: string; providerId: string; modelId: string }) {
    const { targetAssistantMsgId, providerId, modelId } = options

    const messages = messagesByConv[activeConvId] ?? []
    const msgIndex = messages.findIndex((m) => m.id === targetAssistantMsgId)
    if (msgIndex <= 0) return

    const targetMsg = messages[msgIndex]
    if (targetMsg.role !== 'assistant') return

    let userMsgIndex = msgIndex - 1
    while (userMsgIndex >= 0 && messages[userMsgIndex].role !== 'user') {
      userMsgIndex--
    }
    if (userMsgIndex < 0) return

    const userMsg = messages[userMsgIndex]

    const groupId = targetMsg.groupId || targetMsg.id
    const existingVersions = messages.filter((m) => m.groupId === groupId || m.id === groupId)
    const newVersionIndex = existingVersions.length

    const newMsgId = safeUuid()
    const now = Date.now()

    scrollTargetRef.current = newMsgId

    setMessagesByConv((prev) => {
      const list = prev[activeConvId] ?? []
      const patchedList = list.map((m) => {
        if (m.id === groupId && !m.groupId && m.role === 'assistant') return { ...m, groupId, version: 0 }
        return m
      })
      return {
        ...prev,
        [activeConvId]: [...patchedList, { id: newMsgId, role: 'assistant', content: '', ts: now, groupId, version: newVersionIndex, providerId, modelId }]
      }
    })

    setSelectedVersions((prev) => ({ ...prev, [groupId]: newVersionIndex }))

    void (async () => {
      try {
        const rootMsg = messages.find((m) => m.id === groupId)
        if (rootMsg && rootMsg.role === 'assistant' && !rootMsg.groupId) {
          await window.api.db.messages.update(rootMsg.id, { groupId, version: 0 })
        }

        const nextOrder = await window.api.db.messages.nextSortOrder(activeConvId)
        await window.api.db.messages.create({
          id: newMsgId,
          conversationId: activeConvId,
          role: 'assistant',
          content: '',
          sortOrder: nextOrder,
          groupId,
          version: newVersionIndex,
          isStreaming: true,
          providerId,
          modelId
        })
      } catch (e) {
        console.error('[ChatPage] persist versioned assistant message failed', e)
      }
    })()

    const streamId = safeUuid()
    streamingRef.current = { streamId, convId: activeConvId, msgId: newMsgId }
    setIsGenerating(true)
    setLoadingConversationIds((prev) => new Set(prev).add(activeConvId))

    void (async () => {
      try {
        const historyForRegen = messages.slice(0, userMsgIndex)
        const reqMessages: ChatMessageInput[] = buildChatRequestMessages({
          assistant: activeAssistant,
          history: historyForRegen,
          userInput: userMsg.content,
          memories: assistantMemories,
          recentChats
        })
        const customHeaders = buildCustomHeaders(activeAssistant)
        const customBody = buildCustomBody(activeAssistant)
        await runRendererStream({
          providerId,
          modelId,
          messages: reqMessages,
          assistantId: activeAssistantId ?? null,
          enableSearchTool: config.searchConfig?.global?.enabled === true,
          enableMemory: activeAssistant?.enableMemory,
          thinkingBudget: activeConversation?.thinkingBudget ?? -1,
          maxToolLoopIterations: activeAssistant?.maxToolLoopIterations ?? 10,
          temperature: activeAssistant?.temperature,
          topP: activeAssistant?.topP,
          maxTokens: activeAssistant?.maxTokens,
          customHeaders,
          customBody
        })
      } catch (e) {
        const errorText = `【错误】${e instanceof Error ? e.message : String(e)}`
        setMessagesByConv((prev) => {
          const list = prev[activeConvId] ?? []
          return {
            ...prev,
            [activeConvId]: list.map((m) => (m.id === newMsgId ? { ...m, content: errorText } : m))
          }
        })
        void window.api.db.messages.update(newMsgId, { content: errorText, isStreaming: false })
          .catch(err => console.error('[ChatPageNew] db message update (error state) failed:', err))

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

  function handleRegenerateMessage(msg: ChatMessage) {
    if (msg.role !== 'assistant') return
    const assistant = activeAssistant
    const providerId = assistant?.boundModelProvider ?? config.currentModelProvider
    const modelId = assistant?.boundModelId ?? config.currentModelId
    if (!providerId || !modelId) return

    startVersionedAssistantReAnswer({ targetAssistantMsgId: msg.id, providerId, modelId })
  }

  function handleVersionChange(msg: ChatMessage, newVersionIndex: number) {
    const groupId = msg.groupId || msg.id
    setSelectedVersions((prev) => ({ ...prev, [groupId]: newVersionIndex }))
  }

  function startUserMessageResend(options: { targetUserMsgId: string; providerId: string; modelId: string }) {
    const { targetUserMsgId, providerId, modelId } = options
    const messages = messagesByConv[activeConvId] ?? []
    const clickedUserIndex = messages.findIndex((m) => m.id === targetUserMsgId && m.role === 'user')
    if (clickedUserIndex < 0) return

    const clickedUserMsg = messages[clickedUserIndex]
    const userGroupId = clickedUserMsg.groupId ?? clickedUserMsg.id
    let firstUserIndex = messages.findIndex((m) => m.role === 'user' && (m.groupId ?? m.id) === userGroupId)
    if (firstUserIndex < 0) firstUserIndex = clickedUserIndex

    let targetGroupId: string | undefined
    for (let i = firstUserIndex + 1; i < messages.length; i++) {
      if (messages[i].role === 'assistant') {
        targetGroupId = messages[i].groupId || messages[i].id
        break
      }
    }
    const newVersionIndex = targetGroupId
      ? messages.filter((m) => m.role === 'assistant' && (m.groupId === targetGroupId || m.id === targetGroupId)).length
      : 0

    const newMsgId = safeUuid()
    const now = Date.now()

    scrollTargetRef.current = newMsgId

    setMessagesByConv((prev) => {
      const list = prev[activeConvId] ?? []
      const patchedList = targetGroupId
        ? list.map((m) => {
            if (m.id === targetGroupId && !m.groupId && m.role === 'assistant') return { ...m, groupId: targetGroupId, version: 0 }
            return m
          })
        : list

      return {
        ...prev,
        [activeConvId]: [
          ...patchedList,
          {
            id: newMsgId,
            role: 'assistant',
            content: '',
            ts: now,
            groupId: targetGroupId,
            version: targetGroupId ? newVersionIndex : undefined,
            providerId,
            modelId
          }
        ]
      }
    })

    if (targetGroupId) {
      setSelectedVersions((prev) => ({ ...prev, [targetGroupId]: newVersionIndex }))
    }

    void (async () => {
      try {
        if (targetGroupId) {
          const rootMsg = messages.find((m) => m.id === targetGroupId)
          if (rootMsg && rootMsg.role === 'assistant' && !rootMsg.groupId) {
            await window.api.db.messages.update(rootMsg.id, { groupId: targetGroupId, version: 0 })
          }
        }

        const nextOrder = await window.api.db.messages.nextSortOrder(activeConvId)
        await window.api.db.messages.create({
          id: newMsgId,
          conversationId: activeConvId,
          role: 'assistant',
          content: '',
          sortOrder: nextOrder,
          groupId: targetGroupId,
          version: targetGroupId ? newVersionIndex : undefined,
          isStreaming: true,
          providerId,
          modelId
        })
      } catch (e) {
        console.error('[ChatPage] persist resent assistant message failed', e)
      }
    })()

    const streamId = safeUuid()
    streamingRef.current = { streamId, convId: activeConvId, msgId: newMsgId }
    setIsGenerating(true)
    setLoadingConversationIds((prev) => new Set(prev).add(activeConvId))

    void (async () => {
      try {
        const historyForResend = messages.slice(0, firstUserIndex)
        const reqMessages: ChatMessageInput[] = buildChatRequestMessages({
          assistant: activeAssistant,
          history: historyForResend,
          userInput: clickedUserMsg.content,
          memories: assistantMemories,
          recentChats
        })
        const customHeaders = buildCustomHeaders(activeAssistant)
        const customBody = buildCustomBody(activeAssistant)
        await runRendererStream({
          providerId,
          modelId,
          messages: reqMessages,
          assistantId: activeAssistantId ?? null,
          enableSearchTool: config.searchConfig?.global?.enabled === true,
          enableMemory: activeAssistant?.enableMemory,
          thinkingBudget: activeConversation?.thinkingBudget ?? -1,
          maxToolLoopIterations: activeAssistant?.maxToolLoopIterations ?? 10,
          temperature: activeAssistant?.temperature,
          topP: activeAssistant?.topP,
          maxTokens: activeAssistant?.maxTokens,
          customHeaders,
          customBody
        })
      } catch (e) {
        const errorText = `【错误】${e instanceof Error ? e.message : String(e)}`
        setMessagesByConv((prev) => {
          const list = prev[activeConvId] ?? []
          return {
            ...prev,
            [activeConvId]: list.map((m) => (m.id === newMsgId ? { ...m, content: errorText } : m))
          }
        })
        void window.api.db.messages.update(newMsgId, { content: errorText, isStreaming: false })
          .catch(err => console.error('[ChatPageNew] db message update (error state) failed:', err))

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

  function handleResendMessage(msg: ChatMessage) {
    if (msg.role !== 'user' || isGenerating) return
    const assistant = activeAssistant
    const providerId = assistant?.boundModelProvider ?? config.currentModelProvider
    const modelId = assistant?.boundModelId ?? config.currentModelId
    if (!providerId || !modelId) return

    startUserMessageResend({
      targetUserMsgId: msg.id,
      providerId,
      modelId
    })
  }

  function handleMentionReAnswer(msg: ChatMessage) {
    if (msg.role !== 'assistant') return
    setModelPickerOpen(true)
    setPendingReAnswerMsgId(msg.id)
  }

  function handleForkMessage(msg: ChatMessage) {
    const messages = messagesByConv[activeConvId] ?? []
    const msgIndex = messages.findIndex((m) => m.id === msg.id)
    if (msgIndex < 0) return

    const forkedMessages = messages.slice(0, msgIndex + 1).map((m) => ({
      ...m,
      id: safeUuid()
    }))

    const id = safeUuid()
    const conv: Conversation = {
      id,
      title: `${activeConversation?.title || '新对话'} (分支)`,
      updatedAt: Date.now(),
      assistantCount: forkedMessages.filter((m) => m.role === 'assistant').length,
      assistantId: activeConversation?.assistantId,
      workspaceId: activeConversation?.workspaceId ?? null,
      truncateIndex: -1,
      thinkingBudget: activeConversation?.thinkingBudget ?? null
    }

    setConversations((prev) => [conv, ...prev])
    setMessagesByConv((prev) => ({ ...prev, [id]: forkedMessages }))

    void (async () => {
      await window.api.db.conversations.create({
        id,
        title: conv.title,
        assistantId: activeConversation?.assistantId
      })
      await window.api.db.messages.createBatch(
        forkedMessages.map((m, i) => ({
          id: m.id,
          conversationId: id,
          role: m.role,
          content: m.content,
          sortOrder: i,
          groupId: m.groupId,
          version: m.version
        }))
      )
    })().catch(err => console.error('[ChatPageNew] fork conversation db persist failed:', err))
  }

  async function handleSelectModel(providerId: string, modelId: string) {
    if (pendingReAnswerMsgId) {
      const msgId = pendingReAnswerMsgId
      setPendingReAnswerMsgId(null)
      setModelPickerOpen(false)

      startVersionedAssistantReAnswer({ targetAssistantMsgId: msgId, providerId, modelId })
      return
    }
    await onSave({
      ...config,
      currentModelProvider: providerId,
      currentModelId: modelId
    })
    setModelPickerOpen(false)
  }

  return {
    handleDeleteMessage,
    handleEditMessage,
    handleRegenerateMessage,
    handleVersionChange,
    handleResendMessage,
    handleMentionReAnswer,
    handleForkMessage,
    handleSelectModel
  }
}
