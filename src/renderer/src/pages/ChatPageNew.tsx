/**
 * 聊天页面 - 重构版
 * 对齐旧版 Kelivo 的 home_page.dart
 * 包括：双栏布局（会话列表 + 消息区）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'

import { DEFAULT_TRANSLATE_PROMPT } from '../../../shared/types'
import type { AppConfig, AssistantConfig } from '../../../shared/types'
import type { ChatMessageInput } from '../../../shared/chat'
import type { ChatMessage as ChatStreamMessage } from '../../../shared/chatStream'
import type { DbConversation, DbMessage, DbWorkspace } from '../../../shared/db-types'
import { ConversationSidebar, type Conversation } from './chat/ConversationSidebar'
import { WorkspaceSelector } from './chat/WorkspaceSelector'
import { MessageBubble, type ChatMessage } from './chat/MessageBubble'
import { ChatInputBar, type Attachment, type MentionedModel } from './chat/ChatInputBar'
import { buildChatRequestMessages, getDefaultAssistantId, getEffectiveAssistant, applyAssistantRegex, buildCustomBody, buildCustomHeaders } from './chat/assistantChat'
import { ChatTopBar } from '../components/ChatTopBar'
import { MessageAnchorLine } from '../components/MessageAnchorLine'
import { SidebarResizeHandle } from '../components/SidebarResizeHandle'
import { useChatStreamEvents } from './chat/useChatStreamEvents'
import { rendererSendMessageStream } from '../lib/chatService'
import { ChatPagePopovers } from './chat/ChatPagePopovers'
import { useResolvedAssetUrl } from './chat/useResolvedAssetUrl'
import type { EffortValue } from '../components/ReasoningBudgetPopover'

function safeUuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}

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
    assistantCount
  }
}

function dbMsgToChatMessage(m: DbMessage): ChatMessage {
  // 解析 toolCalls 数据（兼容新旧格式）
  let toolCalls: ChatMessage['toolCalls']
  let blocks: ChatMessage['blocks']
  if (m.toolCalls) {
    const data = m.toolCalls as any
    if (Array.isArray(data)) {
      // 旧格式：直接是数组
      toolCalls = data
    } else if (data.toolCalls) {
      // 新格式：{ toolCalls: [...], blocks: [...] }
      toolCalls = data.toolCalls
      blocks = data.blocks?.length ? data.blocks : undefined
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
    usage: m.tokenUsage ?? undefined,
    toolCalls,
    blocks,
    // 透传模型信息
    providerId: m.providerId ?? undefined,
    modelId: m.modelId ?? undefined
  }
}

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

  // 工作区状态
  const [workspaces, setWorkspaces] = useState<DbWorkspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)

  // 会话状态
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string>('')
  const [loadingConversationIds, setLoadingConversationIds] = useState<Set<string>>(new Set())
  const [titleGeneratingConversationIds, setTitleGeneratingConversationIds] = useState<Set<string>>(new Set())
  const [dbReady, setDbReady] = useState(false)

  // 消息状态
  const [messagesByConv, setMessagesByConv] = useState<Record<string, ChatMessage[]>>({})

  // 输入状态
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [mentionedModels, setMentionedModels] = useState<MentionedModel[]>([])

  // UI 状态
  const [isGenerating, setIsGenerating] = useState(false)
  const streamingRef = useRef<{ streamId: string; convId: string; msgId: string } | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  type MentionSendQueue = {
    convId: string
    assistantId: string | null
    assistantSnapshot: AssistantConfig | null
    userInput: string
    history: ChatMessage[]
    models: MentionedModel[]
    thinkingBudget: number
    maxToolLoopIterations: number
    enableSearchTool: boolean
    customHeaders?: Record<string, string>
    customBody?: Record<string, unknown>
    userImagePaths: string[]
    documents: Array<{ path: string; fileName: string; mime: string }>
  }

  const mentionSendQueueRef = useRef<MentionSendQueue | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollTargetRef = useRef<string | null>(null)

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
  const activeConversation = conversations.find((c) => c.id === activeConvId)

  // 切换会话时：清理多模型发送队列（避免串到其它会话）
  useEffect(() => {
    mentionSendQueueRef.current = null
  }, [activeConvId])
  const sidebarLoadingConversationIds = useMemo(() => {
    if (titleGeneratingConversationIds.size === 0) return loadingConversationIds
    const next = new Set(loadingConversationIds)
    for (const id of titleGeneratingConversationIds) next.add(id)
    return next
  }, [loadingConversationIds, titleGeneratingConversationIds])

  // 按工作区过滤的对话列表
  const filteredConversations = useMemo(() => {
    if (activeWorkspaceId === null) return conversations
    return conversations.filter((c) => c.workspaceId === activeWorkspaceId)
  }, [conversations, activeWorkspaceId])

  // 只显示启用且有模型的供应商
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

  const defaultAssistantId = getDefaultAssistantId(config)
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

  // DB: 初始加载工作区和对话列表
  useEffect(() => {
    void (async () => {
      // 加载工作区
      const wsList = await window.api.db.workspaces.list()
      setWorkspaces(wsList)

      // 加载对话
      const result = await window.api.db.conversations.list()
      if (result.items.length === 0) {
        setDbReady(true)
        return
      }
      const convs: Conversation[] = await Promise.all(
        result.items.map(async (c) => {
          const count = await window.api.db.conversations.assistantCount(c.id)
          return dbConvToConversation(c, count)
        })
      )
      setConversations(convs)
      setActiveConvId(convs[0].id)
      setDbReady(true)
    })()
  }, [])

  // DB: 空数据库时自动创建第一个对话
  useEffect(() => {
    if (dbReady && conversations.length === 0 && !activeConvId) {
      handleNewConversation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReady])

  // DB: 加载当前对话的消息
  useEffect(() => {
    if (!activeConvId) return
    // 如果已经在内存中有消息（刚创建的对话），跳过
    if (messagesByConv[activeConvId] !== undefined) return
    void (async () => {
      const dbMessages = await window.api.db.messages.list(activeConvId)
      const msgs = dbMessages.map(dbMsgToChatMessage)
      setMessagesByConv((prev) => ({ ...prev, [activeConvId]: msgs }))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId])

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
    })()
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

  // 助手聊天背景
  const usePure = config.display?.usePureBackground ?? false
  const backgroundUrl = useResolvedAssetUrl(activeAssistant?.background ?? null)
  const backgroundRaw = (activeAssistant?.background ?? '').trim()
  const backgroundColor = (usePure || backgroundUrl) ? null : (backgroundRaw || null)
  const effectiveBackgroundUrl = usePure ? null : backgroundUrl
  const backgroundMaskOpacity = Math.max(0, Math.min(200, config.display?.chatBackgroundMaskStrength ?? 50)) / 200

  // 当前正在流式生成的消息 ID
  const streamingMsgId = isGenerating ? streamingRef.current?.msgId : null

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
  }, [activeMessages, selectedVersions, isGenerating])

  // DB: 流式完成后持久化消息
  const handleStreamDone = useCallback((info: { msgId: string; convId: string; content: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number }; reasoning?: string; toolCalls?: unknown[]; blocks?: unknown[] }) => {
    const toolCallsData = info.toolCalls || info.blocks
      ? { toolCalls: info.toolCalls ?? [], blocks: info.blocks ?? [] }
      : null

    void window.api.db.messages.update(info.msgId, {
      content: info.content,
      isStreaming: false,
      tokenUsage: info.usage ?? null,
      totalTokens: info.usage?.totalTokens ?? null,
      reasoningText: info.reasoning ?? null,
      toolCalls: toolCallsData
    })
    void window.api.db.conversations.update(info.convId, {})
  }, [])

  const { consumeStream } = useChatStreamEvents({
    streamingRef,
    setMessagesByConv,
    setIsGenerating,
    setLoadingConversationIds,
    onStreamDone: handleStreamDone
  })

  /** 在 Renderer 进程直接发起 AI 流式请求并消费 */
  async function runRendererStream(params: {
    providerId: string
    modelId: string
    messages: ChatMessageInput[]
    assistantId?: string | null
    enableSearchTool?: boolean
    enableMemory?: boolean
    thinkingBudget?: number
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
    const assistantSnapshot =
      params.assistantId && appConfig.assistantConfigs[params.assistantId]
        ? appConfig.assistantConfigs[params.assistantId]
        : null

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

  // 滚动到底部
  async function startNextMentionedModelIfAny() {
    // 防止并发：只要正在生成，就不要触发队列
    if (isGenerating) return

    const queue = mentionSendQueueRef.current
    if (!queue) return

    // 会话切换时队列会被清理；这里再做一层保护
    if (queue.convId !== activeConvId) {
      mentionSendQueueRef.current = null
      return
    }

    const nextModel = queue.models[0]
    const restModels = queue.models.slice(1)
    mentionSendQueueRef.current = restModels.length ? { ...queue, models: restModels } : null

    if (!nextModel?.providerId || !nextModel.modelId) {
      // 非法项直接跳过（理论上不会出现）
      await startNextMentionedModelIfAny()
      return
    }

    const providerId = nextModel.providerId
    const modelId = nextModel.modelId
    const assistant = queue.assistantSnapshot
    const now = Date.now()
    const assistantMsgId = safeUuid()
    const currentMsgCount = (messagesByConv[queue.convId] ?? []).length

    // UI：追加一个新的 assistant 占位消息（每个 @ 模型一条流）
    setMessagesByConv((prev) => {
      const list = prev[queue.convId] ?? []
      return {
        ...prev,
        [queue.convId]: [...list, { id: assistantMsgId, role: 'assistant', content: '', ts: now, providerId, modelId }]
      }
    })

    // 会话计数/排序：与 handleSend 保持一致
    setConversations((prev) =>
      prev
        .map((c) => (c.id === queue.convId ? { ...c, updatedAt: Date.now(), assistantCount: (c.assistantCount ?? 0) + 1 } : c))
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return b.updatedAt - a.updatedAt
        })
    )

    // DB：persist empty assistant message
    void window.api.db.messages.create({
      id: assistantMsgId,
      conversationId: queue.convId,
      role: 'assistant',
      content: '',
      sortOrder: currentMsgCount,
      isStreaming: true,
      providerId,
      modelId
    })

    // 预先生成 streamId，避免 invoke 返回慢导致丢 chunk/error
    const streamId = safeUuid()
    streamingRef.current = { streamId, convId: queue.convId, msgId: assistantMsgId }
    setIsGenerating(true)
    setLoadingConversationIds((prev) => new Set(prev).add(queue.convId))

    try {
      const reqMessages: ChatMessageInput[] = buildChatRequestMessages({
        assistant,
        history: queue.history,
        userInput: queue.userInput,
        memories: assistantMemories,
        recentChats
      })

      await runRendererStream({
        providerId,
        modelId,
        messages: reqMessages,
        assistantId: queue.assistantId,
        enableSearchTool: queue.enableSearchTool,
        enableMemory: queue.assistantSnapshot?.enableMemory,
        thinkingBudget: queue.thinkingBudget,
        maxToolLoopIterations: queue.maxToolLoopIterations,
        userImagePaths: queue.userImagePaths,
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

      if (streamingRef.current?.streamId === streamId) streamingRef.current = null
      setIsGenerating(false)
      setLoadingConversationIds((prev) => {
        const next = new Set(prev)
        next.delete(queue.convId)
        return next
      })
    }
  }

  // 多模型分发：当前流结束后自动发送队列里的下一个模型
  useEffect(() => {
    if (isGenerating) return
    if (!mentionSendQueueRef.current) return
    void startNextMentionedModelIfAny()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, activeConvId])

  useEffect(() => {
    const targetMsgId = scrollTargetRef.current
    if (targetMsgId) {
      document.getElementById(`msg-${targetMsgId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      scrollTargetRef.current = null
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages.length])

  // 会话操作
  function handleNewConversation() {
    const id = safeUuid()
    const assistant = getEffectiveAssistant(config, defaultAssistantId)
    const preset = assistant?.presetMessages ?? []
    const now = Date.now()
    const presetMsgs: ChatMessage[] = preset.map((m, i) => ({
      id: safeUuid(),
      role: m.role,
      content: m.content,
      ts: now + i
    }))
    // 新对话归属当前工作区，如果没选择则归属默认工作区
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
      thinkingBudget: null
    }
    setConversations((prev) => [conv, ...prev])
    setMessagesByConv((prev) => ({ ...prev, [id]: presetMsgs }))
    setActiveConvId(id)

    // DB: persist
    void (async () => {
      await window.api.db.conversations.create({ id, title: '新对话', assistantId: assistant?.id, workspaceId })
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
    })()
  }

  function handleRenameConversation(id: string, newTitle: string) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c)))
    void window.api.db.conversations.update(id, { title: newTitle })
  }

  function handleDeleteConversation(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    setMessagesByConv((prev) => {
      const next = { ...prev }
      delete next[id]
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
  }

  function handleTogglePinConversation(id: string) {
    const conv = conversations.find((c) => c.id === id)
    const newPinned = !conv?.pinned
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: newPinned } : c)))
    void window.api.db.conversations.update(id, { isPinned: newPinned })
  }

  function handleRegenerateConversationTitle(id: string) {
    // 对齐 Flutter：优先使用“标题生成模型”，否则回落到“对话默认模型”
    const providerId = config.titleModelProvider ?? config.currentModelProvider
    const modelId = config.titleModelId ?? config.currentModelId
    if (!providerId || !modelId) {
      props.onOpenDefaultModelSettings()
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

  // 工作区操作
  function handleCreateWorkspace(name: string) {
    const id = safeUuid()
    void (async () => {
      const ws = await window.api.db.workspaces.create({ id, name })
      setWorkspaces((prev) => [...prev, ws])
      setActiveWorkspaceId(ws.id)
    })()
  }

  function handleRenameWorkspace(id: string, name: string) {
    void (async () => {
      await window.api.db.workspaces.update(id, { name })
      setWorkspaces((prev) => prev.map((w) => (w.id === id ? { ...w, name } : w)))
    })()
  }

  function handleDeleteWorkspace(id: string) {
    // 不能删除默认工作区
    if (id === 'default') return
    void (async () => {
      await window.api.db.workspaces.delete(id)
      setWorkspaces((prev) => prev.filter((w) => w.id !== id))
      // 如果删除的是当前工作区，切换到全部
      if (activeWorkspaceId === id) {
        setActiveWorkspaceId(null)
      }
      // 将该工作区的对话移动到默认工作区
      setConversations((prev) =>
        prev.map((c) => (c.workspaceId === id ? { ...c, workspaceId: 'default' } : c))
      )
    })()
  }

  // 发送消息
  function handleSend() {
    if (isGenerating) return

    const assistant = activeAssistant
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

    // 助手绑定模型优先；否则使用全局默认模型（若存在 @ 提及，则优先使用提及模型）
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

    // 未配置可用模型时，直接提示用户去设置页配置。
    if (!primaryMention && assistant?.boundModelProvider && !assistant.boundModelId) {
      setMessagesByConv((prev) => {
        const list = prev[activeConvId] ?? []
        return {
          ...prev,
          [activeConvId]: [
            ...list,
            userMsg,
            { id: safeUuid(), role: 'assistant', content: '【错误】该助手已选择供应商，但未绑定具体模型。请到“设置-助手”中配置。', ts: now + 1 }
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
            {
              id: safeUuid(),
              role: 'assistant',
              content: '请先配置默认模型（右上角提示处或点击"去设置"）。',
              ts: now + 1
            }
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
          {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            ts: now + 1,
            providerId,
            modelId
          }
        ]
      }
    })

    // 更新会话时间和消息数
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

    // DB: persist user + empty assistant messages
    void window.api.db.messages.createBatch([
      { id: userMsg.id, conversationId: activeConvId, role: 'user', content: displayText, sortOrder: currentMsgCount },
      { id: assistantMsgId, conversationId: activeConvId, role: 'assistant', content: '', sortOrder: currentMsgCount + 1, isStreaming: true, providerId, modelId }
    ])

    // 预先生成 streamId，避免 ipc invoke 返回滞后导致丢 chunk/error 事件，从而卡死 isGenerating
    // @ 多模型：把剩余模型塞进队列，等待当前流结束后自动发送
    mentionSendQueueRef.current =
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
        const userInput = text || (hasAttachments ? '请根据我上传的附件进行分析。' : displayText)

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
          enableSearchTool,
          enableMemory: assistant?.enableMemory,
          thinkingBudget,
          maxToolLoopIterations,
          userImagePaths: attachmentPayload.userImagePaths,
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
        // 清理本次 stream 状态
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

  function handleStop() {
    const st = streamingRef.current
    if (!st) return
    mentionSendQueueRef.current = null
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }

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

  async function setConversationThinkingBudget(v: EffortValue) {
    if (!activeConvId) return
    setConversations((prev) => prev.map((c) => (c.id === activeConvId ? { ...c, thinkingBudget: v } : c)))
    await window.api.db.conversations.update(activeConvId, { thinkingBudget: v })
  }

  async function clearConversationContext() {
    if (!activeConvId) return
    const truncateIndex = (messagesByConv[activeConvId] ?? []).length
    setConversations((prev) => prev.map((c) => (c.id === activeConvId ? { ...c, truncateIndex } : c)))
    await window.api.db.conversations.update(activeConvId, { truncateIndex })
  }

  // 消息操作
  function handleDeleteMessage(msg: ChatMessage) {
    setMessagesByConv((prev) => {
      const list = prev[activeConvId] ?? []
      return { ...prev, [activeConvId]: list.filter((m) => m.id !== msg.id) }
    })
    void window.api.db.messages.delete(msg.id)
  }

  // 编辑消息 - 更新消息内容并重新生成回答
  function handleEditMessage(msg: ChatMessage, newContent: string) {
    // 更新消息内容
    setMessagesByConv((prev) => {
      const list = prev[activeConvId] ?? []
      return { ...prev, [activeConvId]: list.map((m) => (m.id === msg.id ? { ...m, content: newContent } : m)) }
    })
    void window.api.db.messages.update(msg.id, { content: newContent })

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

  // 重发用户消息
  function handleResendMessage(msg: ChatMessage) {
    if (msg.role !== 'user') return
    setDraft(msg.content)
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
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null)

  function handleSpeakMessage(msg: ChatMessage) {
    // 使用浏览器内置 TTS
    if ('speechSynthesis' in window) {
      // 如果正在播放这条消息，停止
      if (speakingMsgId === msg.id) {
        window.speechSynthesis.cancel()
        setSpeakingMsgId(null)
        return
      }
      // 停止当前正在播放的
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(msg.content)
      utterance.lang = 'zh-CN'
      utterance.onend = () => setSpeakingMsgId(null)
      utterance.onerror = () => setSpeakingMsgId(null)
      setSpeakingMsgId(msg.id)
      window.speechSynthesis.speak(utterance)
    }
  }

  // 翻译消息
  const [translatingMsgId, setTranslatingMsgId] = useState<string | null>(null)
  const translationAbortRef = useRef<AbortController | null>(null)

  async function handleTranslateMessage(msg: ChatMessage) {
    if (translatingMsgId) return // 已在翻译中

    // 如果已有翻译，切换显示/隐藏
    if (msg.translation) {
      setMessagesByConv((prev) => {
        const list = prev[activeConvId] ?? []
        return {
          ...prev,
          [activeConvId]: list.map((m) =>
            m.id === msg.id ? { ...m, translation: undefined } : m
          )
        }
      })
      return
    }

    const assistant = activeAssistant
    const appConfig = await window.api.config.get()
    const providerId =
      appConfig.translateModelProvider ??
      assistant?.boundModelProvider ??
      appConfig.currentModelProvider
    const modelId =
      appConfig.translateModelId ??
      assistant?.boundModelId ??
      appConfig.currentModelId

    if (!providerId || !modelId) return

    setTranslatingMsgId(msg.id)

    try {
      const sourceText = String(msg.content ?? '')
      const targetLang = /[\u4e00-\u9fff]/.test(sourceText)
        ? 'English'
        : 'Simplified Chinese'
      const promptTemplate = appConfig.translatePrompt ?? config.translatePrompt ?? DEFAULT_TRANSLATE_PROMPT
      const translatePrompt = promptTemplate
        .replaceAll('{source_text}', sourceText)
        .replaceAll('{target_lang}', targetLang)

      // 初始化翻译状态
      setMessagesByConv((prev) => {
        const list = prev[activeConvId] ?? []
        return {
          ...prev,
          [activeConvId]: list.map((m) =>
            m.id === msg.id ? { ...m, translation: '翻译中...' } : m
          )
        }
      })

      const providerConfig = appConfig.providerConfigs[providerId]
      if (!providerConfig) throw new Error(`Provider ${providerId} not configured`)
      const translationMaxTokens =
        assistant?.maxTokens && assistant.maxTokens > 0
          ? assistant.maxTokens
          : 4096

      const ac = new AbortController()
      translationAbortRef.current = ac

      const generator = rendererSendMessageStream({
        config: providerConfig,
        modelId,
        messages: [{ role: 'user', content: translatePrompt }] as ChatStreamMessage[],
        temperature: 0.3,
        maxTokens: translationMaxTokens,
        signal: ac.signal
      })

      let translationContent = ''
      for await (const chunk of generator) {
        if (chunk.content) {
          translationContent += chunk.content
          const content = translationContent
          setMessagesByConv((prev) => {
            const list = prev[activeConvId] ?? []
            return {
              ...prev,
              [activeConvId]: list.map((m) =>
                m.id === msg.id ? { ...m, translation: content } : m
              )
            }
          })
        }
      }

      void window.api.db.messages.update(msg.id, { translation: translationContent })
    } catch (e) {
      console.error('Translation failed:', e)
    } finally {
      translationAbortRef.current = null
      setTranslatingMsgId(null)
    }
  }

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
    })()
  }

  // 附件操作
  function clearInputAttachments() {
    setAttachments((prev) => {
      for (const a of prev) {
        try { URL.revokeObjectURL(a.url) } catch { /* ignore */ }
      }
      return []
    })
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
            {activeMessages.length === 0 ? (
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
