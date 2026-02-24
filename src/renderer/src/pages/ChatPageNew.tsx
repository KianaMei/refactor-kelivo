/**
 * 聊天页面 - 重构版
 * 对齐旧版 Kelivo 的 home_page.dart
 * 包括：双栏布局（会话列表 + 消息区）
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'

import type { AppConfig, AssistantConfig } from '../../../shared/types'
import type { ChatMessageInput } from '../../../shared/chat'
import { ConversationSidebar, type Conversation } from './chat/ConversationSidebar'
import { WorkspaceSelector } from './chat/WorkspaceSelector'
import { MessageBubble, type ChatMessage } from './chat/MessageBubble'
import { ChatInputBar, type Attachment, type MentionedModel } from './chat/ChatInputBar'
import { buildChatRequestMessages, getEffectiveAssistant, applyAssistantRegex, buildCustomBody, buildCustomHeaders } from './chat/assistantChat'
import { ChatTopBar } from '../components/ChatTopBar'
import { MessageAnchorLine } from '../components/MessageAnchorLine'
import { SidebarResizeHandle } from '../components/SidebarResizeHandle'
import { ChatPagePopovers } from './chat/ChatPagePopovers'
import { useResolvedAssetUrl } from './chat/useResolvedAssetUrl'
import { useMessageTTS } from './chat/useMessageTTS'
import { useMessageTranslation } from './chat/useMessageTranslation'
import { useConversationManager } from './chat/useConversationManager'
import { useChatStream } from './chat/useChatStream'
import type { EffortValue } from '../components/ReasoningBudgetPopover'

import { safeUuid } from '../../../shared/utils'

function sliceAfterTruncate(messages: ChatMessage[], truncateIndex: number | undefined): ChatMessage[] {
  const t = truncateIndex ?? -1
  if (t >= 0 && t <= messages.length) return messages.slice(t)
  return messages
}

function collapseVersionsForRequest(messages: ChatMessage[], versionSelections: Record<string, number>): ChatMessage[] {
  const groups = new Map<string, ChatMessage[]>()
  const order: string[] = []

  for (const m of messages) {
    const gid = m.groupId ?? m.id
    const list = groups.get(gid)
    if (list) list.push(m)
    else {
      groups.set(gid, [m])
      order.push(gid)
    }
  }

  const out: ChatMessage[] = []
  for (const gid of order) {
    const vers = groups.get(gid) ?? []
    if (vers.length === 0) continue
    const selected = versionSelections[gid]
    const idx = selected != null && selected >= 0 && selected < vers.length ? selected : vers.length - 1
    out.push(vers[idx])
  }

  return out
}

interface Props {
  config: AppConfig
  onSave: (next: AppConfig) => Promise<void>
  onOpenDefaultModelSettings: () => void
  onOpenSettings?: (pane?: string) => void
}

export function ChatPage(props: Props) {
  const { config, onSave } = props

  const {
    conversations, setConversations, activeConvId, setActiveConvId,
    workspaces, activeWorkspaceId, setActiveWorkspaceId,
    dbReady,
    loadingConversationIds, setLoadingConversationIds,
    titleGeneratingConversationIds,
    messagesByConv, setMessagesByConv,
    defaultAssistantId, activeConversation,
    sidebarLoadingConversationIds, filteredConversations,
    handleNewConversation, handleRenameConversation, handleDeleteConversation,
    handleTogglePinConversation, handleRegenerateConversationTitle,
    setConversationThinkingBudget, clearConversationContext,
    handleCreateWorkspace, handleRenameWorkspace, handleDeleteWorkspace,
  } = useConversationManager({ config, onOpenDefaultModelSettings: props.onOpenDefaultModelSettings })

  // UI 状态
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollTargetRef = useRef<string | null>(null)
  const prevActiveConvIdRef = useRef<string>('')

  // 模型选择器
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const modelCapsuleRef = useRef<HTMLButtonElement>(null)
  const [pendingReAnswerMsgId, setPendingReAnswerMsgId] = useState<string | null>(null)

  // 消息版本选择状态：{ groupId -> 当前显示的版本索引 }
  const [selectedVersions, setSelectedVersions] = useState<Record<string, number>>({})

  // 助手选择器
  const [assistantPickerOpen, setAssistantPickerOpen] = useState(false)
  const assistantCapsuleRef = useRef<HTMLButtonElement>(null)

  // 侧边栏可拖动宽度
  const [sidebarWidth, setSidebarWidth] = useState(200)
  const SIDEBAR_MIN = 0
  const SIDEBAR_MAX = 400

  // 侧边栏位置（左/右）- 从设置读取
  const sidebarPosition = config.display?.topicPosition ?? 'left'

  // 计算属性
  const activeMessages = messagesByConv[activeConvId] ?? []
  const providers = useMemo(() => {
    const map = config.providerConfigs
    const order = config.providersOrder
    const list = order.map((k) => map[k]).filter(Boolean)
    for (const [k, v] of Object.entries(map)) {
      if (!order.includes(k)) list.push(v)
    }
    // 过滤：只保留启用且有模型的供应商
    return list.filter((p) => p.enabled && p.models && p.models.length > 0)
  }, [config.providerConfigs, config.providersOrder])

  const assistants = useMemo(() => {
    const order = config.assistantsOrder ?? []
    return order.map((id) => config.assistantConfigs[id]).filter(Boolean)
  }, [config.assistantConfigs, config.assistantsOrder])

  const activeAssistantId = activeConversation?.assistantId ?? defaultAssistantId
  const activeAssistant = getEffectiveAssistant(config, activeAssistantId)

  const effectiveProviderId = activeAssistant?.boundModelProvider ?? config.currentModelProvider
  const effectiveModelId = activeAssistant?.boundModelId ?? config.currentModelId
  const currentProvider = effectiveProviderId ? config.providerConfigs[effectiveProviderId] : null
  const needsDefaultModel = !effectiveProviderId || !effectiveModelId

  // 快捷短语：全局 + 当前助手
  const quickPhrases = useMemo(() => {
    const all = config.quickPhrases ?? []
    const globalPhrases = all.filter((p) => p.isGlobal)
    const assistantPhrases = activeAssistantId
      ? all.filter((p) => !p.isGlobal && p.assistantId === activeAssistantId)
      : []
    return [...globalPhrases, ...assistantPhrases]
  }, [activeAssistantId, config.quickPhrases])

  // MCP：基于助手选择的 serverIds 生成 Popover 所需的数据
  const mcpServers = useMemo(() => {
    const selected = new Set(activeAssistant?.mcpServerIds ?? [])
    return (config.mcpServers ?? [])
      .filter((s) => s.enabled)
      .map((s) => ({
        id: s.id,
        name: s.name,
        toolCount: s.tools.filter((t) => t.enabled).length,
        enabled: selected.has(s.id)
      }))
  }, [activeAssistant?.mcpServerIds, config.mcpServers])

  // 助手记忆（用于注入系统提示词）- 从 DB 加载
  const [assistantMemories, setAssistantMemories] = useState<Array<{ id: number; assistantId: string; content: string }>>([])

  useEffect(() => {
    if (!activeAssistantId) {
      setAssistantMemories([])
      return
    }
    void (async () => {
      const memories = await window.api.db.memories.list(activeAssistantId)
      setAssistantMemories(memories)
    })().catch(err => console.error('[ChatPageNew] load memories failed:', err))
  }, [activeAssistantId])

  // 最近对话标题（用于注入系统提示词）
  const recentChats = useMemo(() => {
    if (!activeAssistantId) return []
    return conversations
      .filter((c) => c.assistantId === activeAssistantId && c.id !== activeConvId)
      .filter((c) => c.title.trim())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 10)
      .map((c) => ({ timestamp: new Date(c.updatedAt).toISOString().slice(0, 10), title: c.title.trim() }))
  }, [activeAssistantId, activeConvId, conversations])

  // 流式聊天
  const {
    isGenerating, setIsGenerating,
    draft, setDraft,
    attachments,
    mentionedModels, setMentionedModels,
    streamingRef,
    streamingMsgId,
    runRendererStream,
    handleSend, handleStop,
    handleAddAttachment, handleRemoveAttachment,
  } = useChatStream({
    config, activeConvId, activeConversation, activeAssistant, activeAssistantId,
    activeMessages, selectedVersions, assistantMemories, recentChats,
    messagesByConv, setMessagesByConv, setConversations, setLoadingConversationIds,
    sliceAfterTruncate, collapseVersionsForRequest
  })

  const isActiveConversationReady = !activeConvId || messagesByConv[activeConvId] !== undefined

  // 助手聊天背景
  const usePure = config.display?.usePureBackground ?? false
  const backgroundUrl = useResolvedAssetUrl(activeAssistant?.background ?? null)
  const backgroundRaw = (activeAssistant?.background ?? '').trim()
  const backgroundColor = (usePure || backgroundUrl) ? null : (backgroundRaw || null)
  const effectiveBackgroundUrl = usePure ? null : backgroundUrl
  const backgroundMaskOpacity = Math.max(0, Math.min(200, config.display?.chatBackgroundMaskStrength ?? 50)) / 200

  // 计算要显示的消息（过滤掉非选中版本）
  // 注意：流式输出期间会非常频繁 setState；这里必须避免 O(n^2) 的 filter 循环，否则会导致 UI（尤其滚动）卡死。
  const displayMessages = useMemo(() => {
    const currentStreamingId = isGenerating ? streamingRef.current?.msgId : null

    // 预分组：groupId -> messages（保持原顺序）
    const groups = new Map<string, ChatMessage[]>()
    for (const m of activeMessages) {
      if (!m.groupId) continue
      const arr = groups.get(m.groupId)
      if (arr) arr.push(m)
      else groups.set(m.groupId, [m])
    }

    const displayedGroupIds = new Set<string>()
    const messagesToShow: Array<ChatMessage & { _versionIndex: number; _totalVersions: number }> = []

    for (const m of activeMessages) {
      // 没有 groupId 的消息直接显示
      if (!m.groupId) {
        messagesToShow.push({ ...m, _versionIndex: 0, _totalVersions: 1 })
        continue
      }

      // 如果这个 group 已经显示了，跳过
      if (displayedGroupIds.has(m.groupId)) continue

      const groupMessages = groups.get(m.groupId) ?? [m]

      // 如果正在生成这个 group 的某条消息，显示它
      if (currentStreamingId) {
        const streamingIdx = groupMessages.findIndex((gm) => gm.id === currentStreamingId)
        if (streamingIdx >= 0) {
          displayedGroupIds.add(m.groupId)
          const streamingMsg = groupMessages[streamingIdx]
          messagesToShow.push({ ...streamingMsg, _versionIndex: streamingIdx, _totalVersions: groupMessages.length })
          continue
        }
      }

      // 获取选中的版本索引，默认显示最新版本
      const selectedIdx = selectedVersions[m.groupId] ?? (groupMessages.length - 1)
      const clampedIdx = Math.min(selectedIdx, groupMessages.length - 1)
      const selectedMsg = groupMessages[clampedIdx]

      if (selectedMsg) {
        displayedGroupIds.add(m.groupId)
        messagesToShow.push({ ...selectedMsg, _versionIndex: clampedIdx, _totalVersions: groupMessages.length })
      }
    }

    return messagesToShow
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // streamingRef.current 是 ref 值，不触发 re-render，无需加入依赖；isGenerating 已覆盖流式状态变化
  }, [activeMessages, selectedVersions, isGenerating])

  useEffect(() => {
    if (!activeConvId || !isActiveConversationReady) return

    const targetMsgId = scrollTargetRef.current
    if (targetMsgId) {
      document.getElementById(`msg-${targetMsgId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      scrollTargetRef.current = null
      prevActiveConvIdRef.current = activeConvId
      return
    }

    const isConversationSwitched = prevActiveConvIdRef.current !== activeConvId
    messagesEndRef.current?.scrollIntoView({ behavior: isConversationSwitched ? 'auto' : 'smooth' })
    prevActiveConvIdRef.current = activeConvId
  }, [activeConvId, activeMessages.length, isActiveConversationReady])

  async function toggleSearchEnabled() {
    const enabled = config.searchConfig?.global?.enabled === true
    await onSave({
      ...config,
      searchConfig: {
        ...config.searchConfig,
        global: {
          ...config.searchConfig.global,
          enabled: !enabled
        }
      }
    })
  }

  async function patchActiveAssistant(patch: Partial<AssistantConfig>) {
    if (!activeAssistant) return
    const existing = config.assistantConfigs[activeAssistant.id]
    if (!existing) return

    await onSave({
      ...config,
      assistantConfigs: {
        ...config.assistantConfigs,
        [existing.id]: {
          ...existing,
          ...patch,
          updatedAt: new Date().toISOString()
        }
      }
    })
  }

  // 消息操作
  function handleDeleteMessage(msg: ChatMessage) {
    setMessagesByConv((prev) => {
      const list = prev[activeConvId] ?? []
      return { ...prev, [activeConvId]: list.filter((m) => m.id !== msg.id) }
    })
    void window.api.db.messages.delete(msg.id)
      .catch(err => console.error('[ChatPageNew] db message delete failed:', err))
  }

  // 编辑消息 - 更新消息内容并重新生成回答
  function handleEditMessage(msg: ChatMessage, newContent: string) {
    // 更新消息内容
    setMessagesByConv((prev) => {
      const list = prev[activeConvId] ?? []
      return { ...prev, [activeConvId]: list.map((m) => (m.id === msg.id ? { ...m, content: newContent } : m)) }
    })
    void window.api.db.messages.update(msg.id, { content: newContent })
      .catch(err => console.error('[ChatPageNew] db message update (edit) failed:', err))

    // 如果是用户消息，重新生成助手回答
    if (msg.role === 'user') {
      const messages = messagesByConv[activeConvId] ?? []
      const msgIndex = messages.findIndex((m) => m.id === msg.id)
      // 查找下一条助手消息
      const nextAssistantMsg = messages.slice(msgIndex + 1).find((m) => m.role === 'assistant')
      if (nextAssistantMsg) {
        // 使用新内容重新生成
        const assistant = activeAssistant
        const providerId = assistant?.boundModelProvider ?? config.currentModelProvider
        const modelId = assistant?.boundModelId ?? config.currentModelId
        if (!providerId || !modelId) return

        // 清空助手消息内容
        setMessagesByConv((prev) => {
          const list = prev[activeConvId] ?? []
          return {
            ...prev,
            [activeConvId]: list.map((m) => (m.id === nextAssistantMsg.id ? { ...m, content: '', ts: Date.now() } : m))
          }
        })
        void window.api.db.messages.update(nextAssistantMsg.id, { content: '', isStreaming: true })
          .catch(err => console.error('[ChatPageNew] db message update (reset for regen) failed:', err))

        // 预先生成 streamId，避免丢 chunk/error 导致卡死 isGenerating
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

    // 向前查找最近的 user 消息：用它之前的历史作为上下文（与“重新生成”一致）
    let userMsgIndex = msgIndex - 1
    while (userMsgIndex >= 0 && messages[userMsgIndex].role !== 'user') {
      userMsgIndex--
    }
    if (userMsgIndex < 0) return

    const userMsg = messages[userMsgIndex]

    // 版本分组：同一个 groupId 下的消息只显示一条（可切换版本）
    const groupId = targetMsg.groupId || targetMsg.id
    const existingVersions = messages.filter((m) => m.groupId === groupId || m.id === groupId)
    const newVersionIndex = existingVersions.length

    const newMsgId = safeUuid()
    const now = Date.now()

    // 生成新版本后：视图停留在该消息处（不跳到底部）
    scrollTargetRef.current = newMsgId

    // UI：补齐“首条版本”的 groupId（否则会出现“旧消息仍单独显示”），并追加新版本
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

    // 立即选中新版本：UI 在原位置“替换显示”
    setSelectedVersions((prev) => ({ ...prev, [groupId]: newVersionIndex }))

    // DB：补齐首条版本 groupId/version=0（若缺失），并新增一条 messages 记录
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

    // 预先生成 streamId，避免丢 chunk/error 导致 isGenerating 卡死
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

    // 复用该 user 之后的第一条 assistant 分组，保持“重发”版本切换体验一致
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

    // 生成新版本后：视图停留在该消息处（不跳到底部）
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

    // DB：补齐首条版本 groupId/version=0（若缺失），并新增一条 messages 记录
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

    // 预先生成 streamId，避免丢 chunk/error 导致 isGenerating 卡死
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

  // 重发用户消息
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

  // @提及回答 - 打开模型选择器，使用不同模型重新生成回答
  function handleMentionReAnswer(msg: ChatMessage) {
    if (msg.role !== 'assistant') return
    // 打开模型选择器
    setModelPickerOpen(true)
    // 保存待重新生成的消息 ID
    setPendingReAnswerMsgId(msg.id)
  }

  // 朗读消息 (TTS)
  const { speakingMsgId, handleSpeakMessage } = useMessageTTS()

  // 翻译消息
  const { translatingMsgId, handleTranslateMessage, setMessageTranslationExpanded } =
    useMessageTranslation({ activeConvId, activeAssistant, config, setMessagesByConv })

  // 创建分支 - 从当前消息创建新会话
  function handleForkMessage(msg: ChatMessage) {
    // 找到这条消息的索引
    const messages = messagesByConv[activeConvId] ?? []
    const msgIndex = messages.findIndex((m) => m.id === msg.id)
    if (msgIndex < 0) return

    // 取到这条消息及之前的所有消息
    const forkedMessages = messages.slice(0, msgIndex + 1).map((m) => ({
      ...m,
      id: safeUuid() // 生成新 ID
    }))

    // 创建新会话
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
    setActiveConvId(id)

    // DB: persist forked conversation + messages
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

  // 模型选择
  async function handleSelectModel(providerId: string, modelId: string) {
    // 如果是 @回答 触发的模型选择，使用选中的模型重新生成
    if (pendingReAnswerMsgId) {
      const msgId = pendingReAnswerMsgId
      setPendingReAnswerMsgId(null)
      setModelPickerOpen(false)

      startVersionedAssistantReAnswer({ targetAssistantMsgId: msgId, providerId, modelId })
      return
    }
    // 正常的模型选择，保存到配置
    await onSave({
      ...config,
      currentModelProvider: providerId,
      currentModelId: modelId
    })
    setModelPickerOpen(false)
  }

  // MCP：切换当前助手绑定的 serverIds（与 Flutter 的“助手 MCP”行为对齐）
  async function toggleAssistantMcpServer(serverId: string) {
    if (!activeAssistant) return
    const existing = config.assistantConfigs[activeAssistant.id]
    if (!existing) return

    const set = new Set(existing.mcpServerIds ?? [])
    if (set.has(serverId)) set.delete(serverId)
    else set.add(serverId)

    await onSave({
      ...config,
      assistantConfigs: {
        ...config.assistantConfigs,
        [existing.id]: {
          ...existing,
          mcpServerIds: Array.from(set),
          updatedAt: new Date().toISOString()
        }
      }
    })
  }

  async function setMcpToolCallMode(mode: 'native' | 'prompt') {
    await onSave({ ...config, mcpToolCallMode: mode })
  }

  // 侧边栏拖动处理
  function handleSidebarDrag(delta: number) {
    setSidebarWidth((prev) => Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, prev + delta)))
  }

  // 渲染侧边栏内容
  const sidebarContent = (
    <div style={{ width: sidebarWidth, height: '100%', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <WorkspaceSelector
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelect={setActiveWorkspaceId}
        onCreate={handleCreateWorkspace}
        onRename={handleRenameWorkspace}
        onDelete={handleDeleteWorkspace}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <ConversationSidebar
          conversations={filteredConversations}
          activeConvId={activeConvId}
          loadingConversationIds={loadingConversationIds}
          titleGeneratingIds={titleGeneratingConversationIds}
          assistantConfigs={config.assistantConfigs}
          showChatListDate={config.display?.showChatListDate ?? true}
          onSelect={setActiveConvId}
          onNew={handleNewConversation}
          onRename={handleRenameConversation}
          onDelete={handleDeleteConversation}
          onTogglePin={handleTogglePinConversation}
          onRegenerateTitle={handleRegenerateConversationTitle}
        />
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 侧边栏（左侧位置） */}
      {sidebarPosition === 'left' && (
        <>
          {sidebarContent}
          <SidebarResizeHandle
            visible={true}
            side="left"
            onDrag={handleSidebarDrag}
          />
        </>
      )}

      {/* 中间聊天区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        {/* 顶部栏 */}
        <ChatTopBar
          title={activeConversation?.title || '新对话'}
          assistantName={activeAssistant?.name}
          assistantAvatar={activeAssistant?.avatar}
          assistantCapsuleRef={assistantCapsuleRef}
          providerName={currentProvider?.name}
          modelId={effectiveModelId ?? undefined}
          modelCapsuleRef={modelCapsuleRef}
          onRenameConversation={(newTitle) => handleRenameConversation(activeConvId, newTitle)}
          onShowAssistantSelect={() => setAssistantPickerOpen((v) => !v)}
          onShowModelSelect={() => setModelPickerOpen((v) => !v)}
          onNewConversation={handleNewConversation}
        />

        {/* 默认模型提示 */}
        {needsDefaultModel && (
          <div className="surface frosted" style={{ margin: 12, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            <AlertCircle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800 }}>还未配置默认模型</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>配置后即可开始对话与流式输出。</div>
            </div>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-primary" onClick={() => (activeAssistant?.boundModelProvider && !activeAssistant?.boundModelId && props.onOpenSettings ? props.onOpenSettings('assistant') : props.onOpenDefaultModelSettings())}>
              去设置
            </button>
          </div>
        )}

        {/* 消息列表 */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {(effectiveBackgroundUrl || backgroundColor) ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: effectiveBackgroundUrl ? `url(${effectiveBackgroundUrl})` : undefined,
                backgroundColor: effectiveBackgroundUrl ? undefined : (backgroundColor ?? undefined),
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                pointerEvents: 'none'
              }}
            />
          ) : null}
          {(effectiveBackgroundUrl || backgroundColor) && backgroundMaskOpacity > 0 ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `rgba(0,0,0,${backgroundMaskOpacity})`,
                pointerEvents: 'none'
              }}
            />
          ) : null}

          <div id="chatMessagesScroll" className="chatMessagesScroll scrollbarHover" style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto', padding: 16, scrollbarGutter: 'stable' }}>
            {!isActiveConversationReady ? (
              <div className="chatHistoryLoading" role="status" aria-live="polite" aria-label="正在加载会话消息">
                <div className="chatHistoryLoadingRow">
                  <div className="chatHistoryLoadingAvatar chatHistoryLoadingWave" />
                  <div className="chatHistoryLoadingBubbleStack">
                    <div className="chatHistoryLoadingBubble chatHistoryLoadingBubble--sm chatHistoryLoadingWave" />
                    <div className="chatHistoryLoadingBubble chatHistoryLoadingBubble--lg chatHistoryLoadingWave" />
                  </div>
                </div>

                <div className="chatHistoryLoadingRow chatHistoryLoadingRow--right">
                  <div className="chatHistoryLoadingBubbleStack">
                    <div className="chatHistoryLoadingBubble chatHistoryLoadingBubble--md chatHistoryLoadingWave" />
                  </div>
                </div>

                <div className="chatHistoryLoadingRow">
                  <div className="chatHistoryLoadingAvatar chatHistoryLoadingWave" />
                  <div className="chatHistoryLoadingBubbleStack">
                    <div className="chatHistoryLoadingBubble chatHistoryLoadingBubble--md chatHistoryLoadingWave" />
                    <div className="chatHistoryLoadingBubble chatHistoryLoadingBubble--sm chatHistoryLoadingWave" />
                  </div>
                </div>

                <div className="chatHistoryLoadingTyping" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : activeMessages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
                <div>开始新对话</div>
              </div>
            ) : (
              displayMessages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={{ ...m, version: m._versionIndex, totalVersions: m._totalVersions }}
                  displayContent={applyAssistantRegex(m.content, m.role, activeAssistant?.regexRules, 'display')}
                  assistantName={activeAssistant?.name}
                  assistantAvatar={activeAssistant?.avatar}
                  useAssistantAvatar={activeAssistant?.useAssistantAvatar}
                  isLoading={m.id === streamingMsgId}
                  displaySettings={config.display}
                  // 传递供应商名称
                  providerName={m.providerId ? (config.providerConfigs[m.providerId]?.name ?? m.providerId) : undefined}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                  onRegenerate={handleRegenerateMessage}
                  onResend={handleResendMessage}
                  onMentionReAnswer={handleMentionReAnswer}
                  onSpeak={handleSpeakMessage}
                  onTranslate={handleTranslateMessage}
                  onTranslationExpandChange={(msg, expanded) => setMessageTranslationExpanded(msg.id, expanded)}
                  onFork={handleForkMessage}
                  onVersionChange={handleVersionChange}
                  isTranslating={translatingMsgId === m.id}
                  isSpeaking={speakingMsgId === m.id}
                  user={config.user}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 消息锚点导航（Cherry Studio 风格） */}
          <MessageAnchorLine
            messages={displayMessages}
            onScrollToMessage={(id) => {
              const el = document.getElementById(`msg-${id}`)
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            onScrollToBottom={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
            userName={config.user.name}
            userAvatarType={config.user.avatarType}
            userAvatarValue={config.user.avatarValue}
            assistantName={activeAssistant?.name}
            assistantAvatar={activeAssistant?.avatar}
            useAssistantAvatar={activeAssistant?.useAssistantAvatar}
          />
        </div>

        {/* 输入栏 */}
        <ChatInputBar
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          onStop={handleStop}
          isGenerating={isGenerating}
          disabled={needsDefaultModel}
          attachments={attachments}
          onAddAttachment={handleAddAttachment}
          onRemoveAttachment={handleRemoveAttachment}
          mentionedModels={mentionedModels}
          onAddMention={(m) =>
            setMentionedModels((prev) => {
              const exists = prev.some((x) => x.providerId === m.providerId && x.modelId === m.modelId)
              return exists ? prev : [...prev, m]
            })
          }
          onRemoveMention={(m) => setMentionedModels((prev) => prev.filter((x) => x.modelId !== m.modelId || x.providerId !== m.providerId))}
          availableProviders={providers}
          quickPhrases={quickPhrases}
          onQuickPhrase={(content) => setDraft((prev) => prev + content)}
          onManageQuickPhrases={() => props.onOpenSettings?.('quickPhrases')}
          currentModelId={effectiveModelId ?? undefined}
          currentProviderName={currentProvider?.name}

          searchConfig={config.searchConfig}
          onSearchConfigChange={(newSearchConfig) => {
            onSave({ ...config, searchConfig: newSearchConfig })
          }}

          reasoningEffort={(activeConversation?.thinkingBudget ?? -1) as EffortValue}
          onReasoningEffortChange={(v) => void setConversationThinkingBudget(v)}
          maxTokens={activeAssistant?.maxTokens ?? 0}
          onMaxTokensChange={(v) => void patchActiveAssistant({ maxTokens: v })}
          mcpServers={mcpServers}
          onToggleMcpServer={(id) => void toggleAssistantMcpServer(id)}
          mcpToolCallMode={config.mcpToolCallMode}
          onMcpToolCallModeChange={(mode) => void setMcpToolCallMode(mode)}
          onClearContext={() => void clearConversationContext()}
          toolLoopIterations={activeAssistant?.maxToolLoopIterations ?? 10}
          onToolLoopIterationsChange={(v) => void patchActiveAssistant({ maxToolLoopIterations: v })}
          onOpenModelPicker={() => setModelPickerOpen((v) => !v)}
        />

        <ChatPagePopovers
          modelCapsuleRef={modelCapsuleRef}
          modelPickerOpen={modelPickerOpen}
          onCloseModelPicker={() => {
            setModelPickerOpen(false)
            setPendingReAnswerMsgId(null)
          }}
          providers={providers}
          currentProviderId={config.currentModelProvider ?? undefined}
          currentModelId={config.currentModelId ?? undefined}
          onSelectModel={handleSelectModel}

          assistantCapsuleRef={assistantCapsuleRef}
          assistantPickerOpen={assistantPickerOpen}
          onCloseAssistantPicker={() => setAssistantPickerOpen(false)}
          assistants={assistants}
          activeAssistantId={activeAssistantId ?? null}
          onSelectAssistant={(id) => setConversations((prev) => prev.map((c) => (c.id === activeConvId ? { ...c, assistantId: id } : c)))}
          onManageAssistant={() => props.onOpenSettings?.('assistant')}
        />

      </div>

      {/* 侧边栏（右侧位置） */}
      {sidebarPosition === 'right' && (
        <>
          <SidebarResizeHandle
            visible={true}
            side="right"
            onDrag={handleSidebarDrag}
          />
          {sidebarContent}
        </>
      )}
    </div>
  )
}
