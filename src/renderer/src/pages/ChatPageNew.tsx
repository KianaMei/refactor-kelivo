/**
 * 聊天页面 - 重构版
 * 对齐旧版 Kelivo 的 home_page.dart
 * 包括：双栏布局（会话列表 + 消息区）
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'

import type { AssistantConfig } from '../../../shared/types'
import { useConfig } from '../contexts/ConfigContext'
import { ConversationSidebar, type Conversation } from './chat/ConversationSidebar'
import { WorkspaceSelector } from './chat/WorkspaceSelector'
import { MessageBubble, type ChatMessage } from './chat/MessageBubble'
import { ChatInputBar, type Attachment, type MentionedModel } from './chat/ChatInputBar'
import { getEffectiveAssistant, applyAssistantRegex } from './chat/assistantChat'
import { ChatTopBar } from '../components/ChatTopBar'
import { MessageAnchorLine } from '../components/MessageAnchorLine'
import { SidebarResizeHandle } from '../components/SidebarResizeHandle'
import { ChatPagePopovers } from './chat/ChatPagePopovers'
import { useResolvedAssetUrl } from './chat/useResolvedAssetUrl'
import { useMessageTTS } from './chat/useMessageTTS'
import { useMessageTranslation } from './chat/useMessageTranslation'
import { useConversationManager } from './chat/useConversationManager'
import { useChatStream } from './chat/useChatStream'
import { useChatActions } from './chat/useChatActions'
import type { EffortValue } from '../components/ReasoningBudgetPopover'
import type { ResponsesReasoningSummary, ResponsesTextVerbosity } from '../../../shared/responsesOptions'
import { supportsResponsesXHighEffort } from '../../../shared/chatApiHelper'


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
  onOpenDefaultModelSettings: () => void
  onOpenSettings?: (pane?: string) => void
}

export function ChatPage(props: Props) {
  const { config, updateConfig: onSave } = useConfig()

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
    setConversationThinkingBudget,
    setConversationResponsesReasoningSummary,
    setConversationResponsesTextVerbosity,
    clearConversationContext,
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
  const isOpenAIResponsesMode =
    (currentProvider?.providerType === 'openai' || currentProvider?.providerType === 'openai_response') &&
    currentProvider.useResponseApi === true
  const allowXHighReasoning =
    isOpenAIResponsesMode &&
    !!effectiveModelId &&
    supportsResponsesXHighEffort(effectiveModelId)
  const responsesReasoningSummary =
    (activeConversation?.responsesReasoningSummary ?? 'detailed') as ResponsesReasoningSummary
  const responsesTextVerbosity =
    (activeConversation?.responsesTextVerbosity ?? 'high') as ResponsesTextVerbosity
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

  const {
    handleDeleteMessage, handleEditMessage, handleRegenerateMessage,
    handleVersionChange, handleResendMessage, handleMentionReAnswer,
    handleForkMessage, handleSelectModel
  } = useChatActions({
    config, activeConvId, activeConversation, activeAssistant, activeAssistantId,
    activeMessages, messagesByConv, setMessagesByConv, setConversations,
    selectedVersions, setSelectedVersions,
    streamingRef, isGenerating, setIsGenerating, setLoadingConversationIds,
    runRendererStream, assistantMemories, recentChats, scrollTargetRef,
    setModelPickerOpen, setPendingReAnswerMsgId, pendingReAnswerMsgId,
    onSave
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

  // 朗读消息 (TTS)
  const { speakingMsgId, handleSpeakMessage } = useMessageTTS()

  // 翻译消息
  const { translatingMsgId, handleTranslateMessage, setMessageTranslationExpanded } =
    useMessageTranslation({ activeConvId, activeAssistant, config, setMessagesByConv })

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
            ) : (() => {
              const truncIdx = activeConversation?.truncateIndex ?? -1
              const truncateMsgId = truncIdx > 0 && truncIdx <= activeMessages.length
                ? activeMessages[truncIdx - 1]?.id
                : null
              return displayMessages.map((m) => (
                <React.Fragment key={m.id}>
                  <MessageBubble
                    message={{ ...m, version: m._versionIndex, totalVersions: m._totalVersions }}
                    displayContent={applyAssistantRegex(m.content, m.role, activeAssistant?.regexRules, 'display')}
                    assistantName={activeAssistant?.name}
                    assistantAvatar={activeAssistant?.avatar}
                    useAssistantAvatar={activeAssistant?.useAssistantAvatar}
                    isLoading={m.id === streamingMsgId}
                    displaySettings={config.display}
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
                  {truncateMsgId && m.id === truncateMsgId && (
                    <div className="contextTruncateDivider">
                      <div className="contextTruncateLine" />
                      <span className="contextTruncateLabel">上下文已清除</span>
                      <div className="contextTruncateLine" />
                    </div>
                  )}
                </React.Fragment>
              ))
            })()
            }
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
          allowXHighReasoning={allowXHighReasoning}
          showResponsesOptions={isOpenAIResponsesMode}
          responsesReasoningSummary={responsesReasoningSummary}
          onResponsesReasoningSummaryChange={(v) => void setConversationResponsesReasoningSummary(v)}
          responsesTextVerbosity={responsesTextVerbosity}
          onResponsesTextVerbosityChange={(v) => void setConversationResponsesTextVerbosity(v)}
          maxTokens={activeAssistant?.maxTokens ?? 0}
          onMaxTokensChange={(v) => void patchActiveAssistant({ maxTokens: v })}
          mcpServers={mcpServers}
          onToggleMcpServer={(id) => void toggleAssistantMcpServer(id)}
          mcpToolCallMode={config.mcpToolCallMode}
          onMcpToolCallModeChange={(mode) => void setMcpToolCallMode(mode)}
          onClearContext={() => void clearConversationContext()}
          isContextCleared={(activeConversation?.truncateIndex ?? -1) >= 0}
          toolLoopIterations={activeAssistant?.maxToolLoopIterations ?? 10}
          onToolLoopIterationsChange={(v) => void patchActiveAssistant({ maxToolLoopIterations: v })}
          onOpenModelPicker={() => setModelPickerOpen((v) => !v)}
          enableUserMarkdown={config.display?.enableUserMarkdown !== false}
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
          onSelectAssistant={(id) => {
            setConversations((prev) => prev.map((c) => (c.id === activeConvId ? { ...c, assistantId: id } : c)))
            void window.api.db.conversations.update(activeConvId, { assistantId: id })
              .catch(err => console.error('[ChatPageNew] update assistantId failed:', err))
          }}
          onManageAssistant={() => {
            setAssistantPickerOpen(false)
            props.onOpenSettings?.('assistant')
          }}
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
