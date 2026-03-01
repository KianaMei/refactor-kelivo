import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppConfig } from '../../../../shared/types'
import type { DbAssistant, DbConversation, DbMessage, DbWorkspace } from '../../../../shared/db-types'
import type { Conversation } from './ConversationSidebar'
import type { ChatMessage } from './MessageBubble'
import { getDefaultAssistantId, getEffectiveAssistant } from './assistantChat'
import { revokeOrphanBlobUrls } from './utils/objectUrls'
import type { EffortValue } from '../../components/ReasoningBudgetPopover'
import type { ResponsesReasoningSummary, ResponsesTextVerbosity } from '../../../../shared/responsesOptions'
import { safeUuid } from '../../../../shared/utils'

function dbConvToConversation(c: DbConversation, assistantCount?: number): Conversation {
  return {
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt,
    pinned: c.isPinned || undefined,
    assistantId: c.assistantId ?? undefined,
    workspaceId: c.workspaceId,
    truncateIndex: c.truncateIndex,
    thinkingBudget: c.thinkingBudget,
    responsesReasoningSummary: c.responsesReasoningSummary,
    responsesTextVerbosity: c.responsesTextVerbosity,
    assistantCount
  }
}

function dbMsgToChatMessage(m: DbMessage): ChatMessage {
  let toolCalls: ChatMessage['toolCalls']
  let blocks: ChatMessage['blocks']
  if (m.toolCalls) {
    const data = m.toolCalls as unknown
    if (Array.isArray(data)) {
      toolCalls = data
    } else if (data && typeof data === 'object' && 'toolCalls' in data) {
      const rec = data as Record<string, unknown>
      toolCalls = rec.toolCalls as ChatMessage['toolCalls']
      const b = rec.blocks
      blocks = Array.isArray(b) && b.length ? (b as ChatMessage['blocks']) : undefined
    }
  }

  return {
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    ts: m.createdAt,
    groupId: m.groupId ?? undefined,
    version: m.version,
    reasoning: m.reasoningText ?? undefined,
    translation: m.translation ?? undefined,
    translationExpanded: m.translationExpanded,
    usage: m.tokenUsage ?? undefined,
    finishedAt: m.finishedAt ?? undefined,
    firstTokenAt: m.firstTokenAt ?? undefined,
    toolCalls,
    blocks,
    providerId: m.providerId ?? undefined,
    modelId: m.modelId ?? undefined
  }
}

interface Deps {
  config: AppConfig
  onOpenDefaultModelSettings: () => void
}

export function useConversationManager(deps: Deps) {
  const { config, onOpenDefaultModelSettings } = deps

  const [workspaces, setWorkspaces] = useState<DbWorkspace[]>([])
  const [assistants, setAssistants] = useState<DbAssistant[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() => {
    return localStorage.getItem('kelivo_activeWorkspaceId') ?? null
  })
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string>('')
  const [loadingConversationIds, setLoadingConversationIds] = useState<Set<string>>(new Set())
  const [titleGeneratingConversationIds, setTitleGeneratingConversationIds] = useState<Set<string>>(new Set())
  const [dbReady, setDbReady] = useState(false)
  const [messagesByConv, setMessagesByConv] = useState<Record<string, ChatMessage[]>>({})

  const defaultAssistantId = getDefaultAssistantId(assistants)
  const activeConversation = conversations.find((c) => c.id === activeConvId)

  useEffect(() => {
    if (activeWorkspaceId === null) {
      localStorage.removeItem('kelivo_activeWorkspaceId')
    } else {
      localStorage.setItem('kelivo_activeWorkspaceId', activeWorkspaceId)
    }
  }, [activeWorkspaceId])

  const reloadAssistants = useCallback(async () => {
    const list = await window.api.db.assistants.list()
    setAssistants(list)
    return list
  }, [])

  const sidebarLoadingConversationIds = useMemo(() => {
    if (titleGeneratingConversationIds.size === 0) return loadingConversationIds
    const next = new Set(loadingConversationIds)
    for (const id of titleGeneratingConversationIds) next.add(id)
    return next
  }, [loadingConversationIds, titleGeneratingConversationIds])

  const filteredConversations = useMemo(() => {
    if (activeWorkspaceId === null) return conversations
    return conversations.filter((c) => c.workspaceId === activeWorkspaceId)
  }, [conversations, activeWorkspaceId])

  // DB: 初始加载
  useEffect(() => {
    void (async () => {
      const [wsList, assistantList, result] = await Promise.all([
        window.api.db.workspaces.list(),
        window.api.db.assistants.list(),
        window.api.db.conversations.list()
      ])
      setWorkspaces(wsList)
      setAssistants(assistantList)
      if (result.items.length === 0) {
        setDbReady(true)
        return
      }
      const convs: Conversation[] = result.items.map((c) =>
        dbConvToConversation(c, 0)
      )
      setConversations(convs)
      setActiveConvId(convs[0].id)
      setDbReady(true)

      // 异步填充 assistantCount（不阻塞 UI）
      window.api.db.conversations.allAssistantCounts().then((allCounts) => {
        setConversations((prev) =>
          prev.map((c) => ({ ...c, assistantCount: allCounts[c.id] ?? c.assistantCount ?? 0 }))
        )
      }).catch(() => { /* 计数加载失败不影响功能 */ })
    })().catch(err => console.error('[useConversationManager] initial db load failed:', err))
  }, [reloadAssistants])

  // DB: 空数据库时自动创建第一个对话
  useEffect(() => {
    if (dbReady && conversations.length === 0 && !activeConvId) {
      handleNewConversation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // 意图：仅在 dbReady 首次变为 true 时触发；加入 conversations/activeConvId 会导致无限循环
  }, [dbReady])

  // DB: 加载当前对话的消息
  useEffect(() => {
    if (!activeConvId) return
    if (messagesByConv[activeConvId] !== undefined) return
    void (async () => {
      const dbMessages = await window.api.db.messages.list(activeConvId)
      const msgs = dbMessages.map(dbMsgToChatMessage)
      setMessagesByConv((prev) => ({ ...prev, [activeConvId]: msgs }))
    })().catch(err => console.error('[useConversationManager] load messages failed:', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // messagesByConv 不加入依赖：它是缓存命中检查的对象，加入会导致每次消息更新都重新触发加载
  }, [activeConvId])

  // 会话操作
  function handleNewConversation() {
    const id = safeUuid()
    const assistant = getEffectiveAssistant(assistants, defaultAssistantId)
    const preset = assistant?.presetMessages ?? []
    const inheritedThinkingBudget = activeConversation?.thinkingBudget ?? null
    const inheritedResponsesReasoningSummary = activeConversation?.responsesReasoningSummary ?? null
    const inheritedResponsesTextVerbosity = activeConversation?.responsesTextVerbosity ?? null
    const now = Date.now()
    const presetMsgs: ChatMessage[] = preset.map((m, i) => ({
      id: safeUuid(),
      role: m.role,
      content: m.content,
      ts: now + i
    }))
    const workspaceId = activeWorkspaceId ?? 'default'
    const presetAssistantCount = presetMsgs.filter((m) => m.role === 'assistant').length
    const conv: Conversation = {
      id,
      title: '新对话',
      updatedAt: now,
      assistantCount: presetAssistantCount,
      assistantId: assistant?.id,
      workspaceId,
      truncateIndex: -1,
      thinkingBudget: inheritedThinkingBudget,
      responsesReasoningSummary: inheritedResponsesReasoningSummary,
      responsesTextVerbosity: inheritedResponsesTextVerbosity
    }
    setConversations((prev) => [conv, ...prev])
    setMessagesByConv((prev) => ({ ...prev, [id]: presetMsgs }))
    setActiveConvId(id)

    void (async () => {
      await window.api.db.conversations.create({ id, title: '新对话', assistantId: assistant?.id, workspaceId })
      if (inheritedThinkingBudget !== null) {
        await window.api.db.conversations.update(id, { thinkingBudget: inheritedThinkingBudget })
      }
      if (inheritedResponsesReasoningSummary !== null || inheritedResponsesTextVerbosity !== null) {
        await window.api.db.conversations.update(id, {
          responsesReasoningSummary: inheritedResponsesReasoningSummary,
          responsesTextVerbosity: inheritedResponsesTextVerbosity
        })
      }
      if (presetMsgs.length > 0) {
        await window.api.db.messages.createBatch(
          presetMsgs.map((m, i) => ({
            id: m.id,
            conversationId: id,
            role: m.role,
            content: m.content,
            sortOrder: i
          }))
        )
      }
    })().catch(err => console.error('[useConversationManager] create conversation failed:', err))
  }

  function handleRenameConversation(id: string, newTitle: string) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c)))
    void window.api.db.conversations.update(id, { title: newTitle })
      .catch(err => console.error('[useConversationManager] rename conversation failed:', err))
  }

  function handleDeleteConversation(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    setMessagesByConv((prev) => {
      const removing = prev[id] ?? []
      const next = { ...prev }
      delete next[id]

      revokeOrphanBlobUrls({ removing, remainingByConv: next })
      return next
    })
    if (activeConvId === id) {
      const remaining = conversations.filter((c) => c.id !== id)
      if (remaining.length > 0) {
        setActiveConvId(remaining[0].id)
      } else {
        handleNewConversation()
      }
    }
    void window.api.db.conversations.delete(id)
      .catch(err => console.error('[useConversationManager] delete conversation failed:', err))
  }

  function handleTogglePinConversation(id: string) {
    const conv = conversations.find((c) => c.id === id)
    const newPinned = !conv?.pinned
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: newPinned } : c)))
    void window.api.db.conversations.update(id, { isPinned: newPinned })
      .catch(err => console.error('[useConversationManager] toggle pin failed:', err))
  }

  function handleRegenerateConversationTitle(id: string) {
    const providerId = config.titleModelProvider ?? config.currentModelProvider
    const modelId = config.titleModelId ?? config.currentModelId
    if (!providerId || !modelId) {
      onOpenDefaultModelSettings()
      return
    }

    setTitleGeneratingConversationIds((prev) => new Set(prev).add(id))
    void (async () => {
      try {
        const updated = await window.api.db.conversations.regenerateTitle(id)
        if (updated?.title) {
          setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c)))
        }
      } catch (e) {
        console.error('[ChatPage] regenerate title failed', e)
      } finally {
        setTitleGeneratingConversationIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    })()
  }

  async function setConversationThinkingBudget(v: EffortValue) {
    if (!activeConvId) return
    setConversations((prev) => prev.map((c) => (c.id === activeConvId ? { ...c, thinkingBudget: v } : c)))
    await window.api.db.conversations.update(activeConvId, { thinkingBudget: v })
  }

  async function setConversationResponsesReasoningSummary(v: ResponsesReasoningSummary) {
    if (!activeConvId) return
    setConversations((prev) => prev.map((c) => (c.id === activeConvId ? { ...c, responsesReasoningSummary: v } : c)))
    await window.api.db.conversations.update(activeConvId, { responsesReasoningSummary: v })
  }

  async function setConversationResponsesTextVerbosity(v: ResponsesTextVerbosity) {
    if (!activeConvId) return
    setConversations((prev) => prev.map((c) => (c.id === activeConvId ? { ...c, responsesTextVerbosity: v } : c)))
    await window.api.db.conversations.update(activeConvId, { responsesTextVerbosity: v })
  }

  async function clearConversationContext() {
    if (!activeConvId) return
    const currentConv = conversations.find((c) => c.id === activeConvId)
    const msgCount = (messagesByConv[activeConvId] ?? []).length
    // Toggle: 如果 truncateIndex 已在末尾，则取消清除；否则设置为当前消息数量
    const truncateIndex = (currentConv?.truncateIndex === msgCount) ? -1 : msgCount
    setConversations((prev) => prev.map((c) => (c.id === activeConvId ? { ...c, truncateIndex } : c)))
    await window.api.db.conversations.update(activeConvId, { truncateIndex })
  }

  async function handleMoveConversationToWorkspace(id: string, workspaceId: string | null) {
    const targetWorkspaceId = workspaceId ?? 'default'
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, workspaceId: targetWorkspaceId } : c))
    )
    await window.api.db.conversations.update(id, { workspaceId: targetWorkspaceId })
  }

  // 工作区操作
  function handleCreateWorkspace(name: string) {
    const id = safeUuid()
    void (async () => {
      const ws = await window.api.db.workspaces.create({ id, name })
      setWorkspaces((prev) => [...prev, ws])
      setActiveWorkspaceId(ws.id)
    })().catch(err => console.error('[useConversationManager] create workspace failed:', err))
  }

  function handleRenameWorkspace(id: string, name: string) {
    void (async () => {
      await window.api.db.workspaces.update(id, { name })
      setWorkspaces((prev) => prev.map((w) => (w.id === id ? { ...w, name } : w)))
    })().catch(err => console.error('[useConversationManager] rename workspace failed:', err))
  }

  function handleDeleteWorkspace(id: string) {
    if (id === 'default') return
    void (async () => {
      await window.api.db.workspaces.delete(id)
      setWorkspaces((prev) => prev.filter((w) => w.id !== id))
      if (activeWorkspaceId === id) {
        setActiveWorkspaceId(null)
      }
      setConversations((prev) =>
        prev.map((c) => (c.workspaceId === id ? { ...c, workspaceId: 'default' } : c))
      )
    })().catch(err => console.error('[useConversationManager] delete workspace failed:', err))
  }

  return {
    // State
    conversations, setConversations, activeConvId, setActiveConvId,
    workspaces, activeWorkspaceId, setActiveWorkspaceId,
    assistants, reloadAssistants,
    dbReady,
    loadingConversationIds, setLoadingConversationIds,
    titleGeneratingConversationIds,
    messagesByConv, setMessagesByConv,
    // Derived
    defaultAssistantId, activeConversation,
    sidebarLoadingConversationIds, filteredConversations,
    // Conversation handlers
    handleNewConversation, handleRenameConversation, handleDeleteConversation,
    handleTogglePinConversation, handleRegenerateConversationTitle,
    setConversationThinkingBudget,
    setConversationResponsesReasoningSummary,
    setConversationResponsesTextVerbosity,
    clearConversationContext,
    handleMoveConversationToWorkspace,
    // Workspace handlers
    handleCreateWorkspace, handleRenameWorkspace, handleDeleteWorkspace,
  }
}
