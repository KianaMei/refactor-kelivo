/**
 * API 测试页面
 * 对齐旧版 Kelivo 的 desktop_api_test_page.dart
 * 包括：多配置管理、拉取 models、流式测试、工具面板等
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Send,
  Square,
  Copy,
  Check,
  ChevronDown,
  ExternalLink,
  Zap,
  Settings,
  Play,
  X
} from 'lucide-react'
import { CustomSelect } from '../components/ui/CustomSelect'
import { BrandAvatar } from './settings/providers/components/BrandAvatar'
import type { AppConfig, ProviderConfigV2, ApiTestConfig } from '../../../shared/types'
import { useConfig } from '../contexts/ConfigContext'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { rendererSendMessageStream, type ChatMessage } from '../lib/chatService'
import { MessageBubble } from './chat/MessageBubble'
import { ChatInputBar } from './chat/ChatInputBar'
import { safeUuid } from '../../../shared/utils'

// Type alias for compatibility
type TestMessage = ChatMessage & {
  id: string
  ts: number
}

// Ensure window.api.models.testFetch is available
declare global {
  interface Window {
    apiTestStopCurrent?: () => void
  }
}

const PROVIDER_PRESETS: Record<string, { name: string; defaultUrl: string }> = {
  openai: { name: 'OpenAI 兼容', defaultUrl: 'https://api.openai.com/v1' },
  anthropic: { name: 'Anthropic 格式', defaultUrl: 'https://api.anthropic.com/v1' },
  google: { name: 'Gemini 格式', defaultUrl: 'https://generativelanguage.googleapis.com/v1beta' }
}


interface Props {
  onOpenSettings?: (pane?: string) => void
}

export function ApiTestPage(props: Props) {
  const { config, updateConfig } = useConfig()
  // 多配置管理
  const configs = config.apiTestConfigs || []
  const activeConfigId = config.apiTestActiveConfigId

  const setConfigs = (updater: ApiTestConfig[] | ((prev: ApiTestConfig[]) => ApiTestConfig[])) => {
    const nextConfigs = typeof updater === 'function' ? updater(config.apiTestConfigs) : updater
    updateConfig({ ...config, apiTestConfigs: nextConfigs })
  }

  const setActiveConfigId = (nextId: string) => {
    updateConfig({ ...config, apiTestActiveConfigId: nextId })
  }

  // 当前配置
  const activeConfig: ApiTestConfig = useMemo(() => {
    const list: ApiTestConfig[] = configs && configs.length > 0 ? configs : [{
      id: 'default',
      name: '默认配置',
      provider: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      models: [],
      selectedModel: null
    }]
    return list.find((c) => c.id === activeConfigId) ?? list[0]
  }, [configs, activeConfigId])

  // 编辑状态
  const [apiKey, setApiKey] = useState(activeConfig.apiKey)
  const [baseUrl, setBaseUrl] = useState(activeConfig.baseUrl)
  const [selectedProvider, setSelectedProvider] = useState<string>(activeConfig.provider)
  const [models, setModels] = useState<string[]>(activeConfig.models)
  const [selectedModel, setSelectedModel] = useState<string | null>(activeConfig.selectedModel)

  // 模型获取状态
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const [manualModelInput, setManualModelInput] = useState('')

  // 消息和生成状态
  const [messages, setMessages] = useState<TestMessage[]>([])
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [reasoningEffort, setReasoningEffort] = useState<number>(-1)
  const streamingMsgId = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // 编辑消息对话框
  const [editDialog, setEditDialog] = useState<{ open: boolean; msgId: string; content: string }>({
    open: false,
    msgId: '',
    content: ''
  })

  // 侧边栏可调整宽度
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('apiTestPanelWidth')
    return saved ? Number(saved) : 280
  })
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(280)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = panelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const delta = ev.clientX - startX.current
      const newWidth = Math.min(500, Math.max(200, startWidth.current + delta))
      setPanelWidth(newWidth)
    }

    const handleMouseUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      // 保存到 localStorage
      const el = document.querySelector('.apiTestConfigPanel') as HTMLElement
      if (el) localStorage.setItem('apiTestPanelWidth', String(el.offsetWidth))
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [panelWidth])

  // 重命名对话框
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; configId: string; name: string }>({
    open: false,
    configId: '',
    name: ''
  })

  // 模型快速切换弹窗
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const configDeleteConfirm = useDeleteConfirm()

  // 同步活动配置到编辑状态
  useEffect(() => {
    setApiKey(activeConfig.apiKey)
    setBaseUrl(activeConfig.baseUrl)
    setSelectedProvider(activeConfig.provider)
    setModels(activeConfig.models)
    setSelectedModel(activeConfig.selectedModel)
    setModelError(null)
  }, [activeConfigId, activeConfig])

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, streamingContent, streamingReasoning])

  // 更新当前配置
  function updateActiveConfig(partial: Partial<ApiTestConfig>) {
    setConfigs((prev) =>
      prev.map((c) => (c.id === activeConfigId ? { ...c, ...partial } : c))
    )
  }

  // 添加新配置
  function handleAddConfig() {
    const id = safeUuid()
    const newConfig: ApiTestConfig = {
      id,
      name: `配置 ${configs.length + 1}`,
      provider: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      models: [],
      selectedModel: null
    }
    setConfigs((prev) => [...prev, newConfig])
    setActiveConfigId(id)
  }

  // 删除配置
  function handleDeleteConfig(id: string) {
    if (configs.length <= 1) return
    setConfigs((prev) => prev.filter((c) => c.id !== id))
    if (activeConfigId === id) {
      setActiveConfigId(configs.find((c) => c.id !== id)?.id ?? configs[0].id)
    }
  }

  // 重命名配置
  function handleRenameConfig() {
    if (!renameDialog.name.trim()) return
    setConfigs((prev) =>
      prev.map((c) => (c.id === renameDialog.configId ? { ...c, name: renameDialog.name.trim() } : c))
    )
    setRenameDialog({ open: false, configId: '', name: '' })
  }

  // 供应商变更
  function handleProviderChange(provider: string) {
    setSelectedProvider(provider)
    const preset = PROVIDER_PRESETS[provider]
    if (preset) {
      setBaseUrl(preset.defaultUrl)
      updateActiveConfig({ provider: provider as any, baseUrl: preset.defaultUrl })
    }
  }

  // 保存配置
  function handleSaveConfig() {
    updateActiveConfig({
      apiKey,
      baseUrl,
      provider: selectedProvider as any,
      models,
      selectedModel
    })
    // 如果有 input，处理掉它
    if (input.trim()) {
      setInput('')
    }
  }

  // 重新生成最后一条 User 消息
  async function handleRegenerate() {
    if (isGenerating) return
    // 找到最后一条 user 消息的索引
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserIdx = i; break }
    }
    if (lastUserIdx === -1) return

    // 截断到最后一条 user 消息（含），直接传入 handleSend 避免 setState 异步问题
    const truncated = messages.slice(0, lastUserIdx + 1)
    setMessages(truncated)
    await handleSend(truncated)
  }

  // 转换为供应商配置
  async function handleConvertToProvider() {
    if (!apiKey.trim()) return

    // 尽量把自定义模型带入
    const isGoogle = selectedProvider === 'google' || baseUrl.includes('google')
    const providerType = isGoogle ? 'google' : (selectedProvider === 'anthropic' ? 'claude' : 'openai')

    const newProviderId: string = safeUuid()

    // 创建一个新的提供商配置
    const newProvider: ProviderConfigV2 = {
      id: newProviderId,
      name: `${activeConfig.name} - 已转换`,
      baseUrl: baseUrl || 'https://api.openai.com/v1',
      apiKey,
      providerType,
      models: [...models],
      modelOverrides: {},
      enabled: true,
      createdAt: String(Date.now()),
      updatedAt: String(Date.now())
    }

    const latestConfig = await window.api.config.get()

    const nextProvidersOrder = latestConfig.providersOrder?.length
      ? [...latestConfig.providersOrder, newProvider.id]
      : [...Object.keys(latestConfig.providerConfigs), newProvider.id]

    // 更新到 AppConfig
    await updateConfig({
      ...latestConfig,
      providerConfigs: {
        ...latestConfig.providerConfigs,
        [newProvider.id]: newProvider
      },
      providersOrder: Array.from(new Set(nextProvidersOrder)),
      ui: {
        ...latestConfig.ui,
        desktop: {
          ...latestConfig.ui.desktop,
          selectedSettingsMenu: 'providers' as any
        }
      }
    })

    // 成功后仅切换 Tab
    props.onOpenSettings?.()
  }

  // 获取模型列表
  async function handleFetchModels() {
    if (!apiKey.trim() || !baseUrl.trim()) {
      setModelError('请先输入 API Key 和 Base URL')
      return
    }

    setLoadingModels(true)
    setModelError(null)

    try {
      const result = await (window.api.models as any).testFetch({
        providerType: selectedProvider,
        baseUrl,
        apiKey
      })

      const fetchedModels = result.models || []
      setModels(fetchedModels)
      if (fetchedModels.length > 0 && (!selectedModel || !fetchedModels.includes(selectedModel))) {
        setSelectedModel(fetchedModels[0])
      }
      updateActiveConfig({ models: fetchedModels, selectedModel: fetchedModels[0] })
    } catch (e) {
      setModelError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingModels(false)
    }
  }

  // 使用手动输入的模型
  function handleUseManualModel() {
    const model = manualModelInput.trim()
    if (!model) return
    if (!models.includes(model)) {
      setModels((prev) => [...prev, model])
    }
    setSelectedModel(model)
    setManualModelInput('')
    updateActiveConfig({
      models: models.includes(model) ? models : [...models, model],
      selectedModel: model
    })
  }

  // 发送测试消息
  // overrideHistory: 可选，用于 regenerate/resend 时传入截断后的消息列表，避免 setState 异步问题
  async function handleSend(overrideHistory?: TestMessage[]) {
    const history = overrideHistory ?? messages
    const text = overrideHistory ? '' : input.trim()

    // 如果没有 overrideHistory，则需要有用户输入
    if (!overrideHistory && !text) return
    if (isGenerating) return
    if (!selectedModel) {
      setModelError('请先选择一个模型')
      return
    }

    // 构建新消息列表
    let sendMessages: TestMessage[]
    if (overrideHistory) {
      // regenerate/resend: 已经包含了 user 消息
      sendMessages = overrideHistory
    } else {
      const userMsg: TestMessage = { id: safeUuid(), role: 'user', content: text, ts: Date.now() }
      sendMessages = [...history, userMsg]
      setMessages(sendMessages)
      setInput('')
    }

    const assistantMsgId = safeUuid()
    setIsGenerating(true)
    streamingMsgId.current = assistantMsgId
    setStreamingContent('')
    setStreamingReasoning('')

    const startTime = Date.now()

    // 构建临时提供商配置
    const tempConfig: ProviderConfigV2 = {
      id: 'test-api-provider',
      name: 'API Test Provider',
      providerType: selectedProvider as any,
      baseUrl,
      apiKey,
      models: [],
      modelOverrides: {},
      enabled: true,
      createdAt: String(Date.now()),
      updatedAt: String(Date.now())
    }

    // AbortController
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    // 从全局配置读取工具相关参数（对齐 reference 的 _sendMessage）
    const appConfig = config
    const searchEnabled = appConfig.searchConfig?.global?.enabled ?? false
    const searchServiceId = appConfig.searchConfig?.global?.defaultServiceId ?? undefined

    let fullContent = ''
    let reasoningContent = ''
    let usage: any = undefined
    let firstTokenAt: number | undefined = undefined

    try {
      const stream = rendererSendMessageStream({
        config: tempConfig,
        modelId: selectedModel,
        messages: sendMessages.map(m => ({ role: m.role, content: m.content })),
        thinkingBudget: reasoningEffort,
        enableSearchTool: searchEnabled,
        searchServiceId,
        mcpServers: appConfig.mcpServers ?? [],
        mcpToolCallMode: appConfig.mcpToolCallMode,
        signal: abortController.signal
      })

      for await (const chunk of stream) {
        if (!firstTokenAt && chunk.content) {
          firstTokenAt = Date.now()
        }

        if (chunk.content) fullContent += chunk.content
        if (chunk.reasoning) reasoningContent += chunk.reasoning
        if (chunk.usage) usage = chunk.usage

        setStreamingContent(fullContent)
        setStreamingReasoning(reasoningContent)
      }

      const finishedAt = Date.now()
      const assistantMsg: TestMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: fullContent,
        reasoning: reasoningContent || undefined,
        ts: finishedAt,
        latency: firstTokenAt ? firstTokenAt - startTime : undefined,
        firstTokenAt,
        finishedAt,
        usage: usage ? {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens
        } : undefined,
      } as unknown as ChatMessage & { ts: number, id: string }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (e) {
      const isAbort = (e as Error).name === 'AbortError'
      if (isAbort) {
        // 用户手动停止：保存已生成的内容
        const stoppedContent = fullContent ? fullContent + '\n\n（已停止）' : '（已停止）'
        setMessages((prev) => [...prev, {
          id: assistantMsgId,
          role: 'assistant',
          content: stoppedContent,
          ts: Date.now()
        } as unknown as TestMessage])
      } else {
        // 非 abort 错误：显示错误消息
        setMessages((prev) => [...prev, {
          id: assistantMsgId,
          role: 'assistant',
          content: `【错误】${e instanceof Error ? e.message : String(e)}`,
          ts: Date.now()
        } as unknown as TestMessage])
      }
    } finally {
      setIsGenerating(false)
      streamingMsgId.current = null
      abortControllerRef.current = null
      setStreamingContent('')
      setStreamingReasoning('')
    }
  }

  // 停止生成
  function handleStop() {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }

  // 清空消息
  function handleClear() {
    handleStop()
    setMessages([])
    setIsGenerating(false)
    streamingMsgId.current = null
    setStreamingContent('')
    setStreamingReasoning('')
  }

  // 复制消息
  const [copiedId, setCopiedId] = useState<string | null>(null)
  function handleCopy(msg: TestMessage) {
    if (typeof msg.content === 'string') {
      navigator.clipboard.writeText(msg.content)
      setCopiedId(msg.ts.toString())
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  // 删除消息（对齐 reference _deleteMessage）
  function handleDeleteMessage(msg: TestMessage) {
    // 如果正在流式输出且删除的是流式消息，直接停止
    if (streamingMsgId.current === msg.id) {
      handleStop()
    }
    setMessages((prev) => prev.filter((m) => m.id !== msg.id))
  }

  // 编辑消息（对齐 reference _editMessage）
  function handleEditMessage(msg: TestMessage, newContent: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, content: newContent } : m))
    )
  }

  // 重发用户消息（对齐 reference _resendMessage）
  async function handleResendMessage(msg: TestMessage) {
    if (isGenerating) return
    const idx = messages.findIndex((m) => m.id === msg.id)
    if (idx < 0) return

    // 截断该消息之后的所有消息，保留到该用户消息（含）
    const truncated = messages.slice(0, idx + 1)
    setMessages(truncated)
    await handleSend(truncated)
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 左侧配置面板 */}
      <div className="apiTestConfigPanel frosted" style={{ width: panelWidth }}>
        {/* 配置选择器 */}
        <div className="apiTestConfigHeader">
          <CustomSelect
            value={activeConfigId}
            onChange={setActiveConfigId}
            options={configs.map(c => ({ value: c.id, label: c.name }))}
            className="select"
            width="100%"
          />
          <button type="button" className="btn btn-icon" onClick={handleAddConfig} title="添加配置">
            <Plus size={16} />
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setRenameDialog({ open: true, configId: activeConfigId, name: activeConfig.name })}
            title="重命名"
          >
            <Edit2 size={16} />
          </button>
          {configs.length > 1 && (
            configDeleteConfirm.isConfirming(activeConfigId) ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={() => configDeleteConfirm.confirmDelete(activeConfigId, () => handleDeleteConfig(activeConfigId))}
                  title="确认删除"
                  style={{ color: 'var(--danger)' }}
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={() => configDeleteConfirm.cancelConfirm()}
                  title="取消"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => configDeleteConfirm.startConfirm(activeConfigId)}
                title="删除配置"
              >
                <Trash2 size={16} />
              </button>
            )
          )}
        </div>

        {/* 供应商选择 (使用 Radix UI 重构) */}
        <div className="apiTestField">
          <label>供应商</label>
          <CustomSelect
            value={selectedProvider}
            onChange={handleProviderChange}
            options={Object.entries(PROVIDER_PRESETS).map(([key, preset]) => ({
              value: key,
              label: preset.name,
              icon: <BrandAvatar name={preset.name} size={16} square />
            }))}
            className="select"
          />
        </div>

        {/* API Key */}
        <div className="apiTestField">
          <label>API Key</label>
          <input
            className="input"
            type="text"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              updateActiveConfig({ apiKey: e.target.value })
            }}
            placeholder="sk-..."
          />
        </div>

        {/* Base URL */}
        <div className="apiTestField">
          <label>Base URL</label>
          <input
            className="input"
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value)
              updateActiveConfig({ baseUrl: e.target.value })
            }}
            placeholder="https://api.openai.com/v1"
          />
        </div>

        {/* 模型选择 */}
        <div className="apiTestField">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label>模型</label>
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleFetchModels}
              disabled={loadingModels}
            >
              <RefreshCw size={12} className={loadingModels ? 'spinning' : ''} />
              <span>{loadingModels ? '获取中...' : '获取模型列表'}</span>
            </button>
          </div>

          {modelError && (
            <div className="apiTestError">{modelError}</div>
          )}

          {models.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <CustomSelect
                value={selectedModel ?? ''}
                onChange={(val) => {
                  setSelectedModel(val)
                  updateActiveConfig({ selectedModel: val })
                }}
                options={models.map(m => ({ value: m, label: m }))}
                placeholder="选择模型"
                className="select"
              />
            </div>
          )}

          {/* 手动输入模型 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              className="input"
              value={manualModelInput}
              onChange={(e) => setManualModelInput(e.target.value)}
              placeholder="手动输入模型 ID"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn"
              onClick={handleUseManualModel}
              disabled={!manualModelInput.trim()}
            >
              使用
            </button>
          </div>
        </div>

        {/* 快捷操作 */}
        <div style={{ marginTop: 'auto', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={handleConvertToProvider}
            disabled={!apiKey.trim()}
          >
            <ExternalLink size={14} />
            <span>转换为供应商配置</span>
          </button>
        </div>
      </div>

      {/* 拖拽调整宽度手柄 */}
      <div className="resizeHandle" onMouseDown={handleResizeStart} />

      {/* 右侧测试区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* 顶部工具栏 */}
        <div className="apiTestTopBar frosted">
          <div style={{ fontWeight: 700 }}>API 测试</div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {selectedModel ? `当前模型：${selectedModel}` : '未选择模型'}
          </div>
          <button type="button" className="btn" onClick={handleClear}>
            清空
          </button>
        </div>

        {/* 消息列表 */}
        <div className="apiTestMessages">
          {messages.length === 0 && !isGenerating ? (
            <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🧪</div>
              <div>配置好 API 参数后，发送消息进行测试</div>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <MessageBubble
                  key={msg.id}
                  message={msg as any}
                  assistantName={activeConfig.name}
                  providerName={selectedProvider}
                  onCopy={() => handleCopy(msg)}
                  onDelete={() => handleDeleteMessage(msg)}
                  onEdit={(m, newContent) => handleEditMessage(msg, newContent)}
                  onRegenerate={msg.role === 'assistant' && idx === messages.length - 1 && !isGenerating
                    ? () => handleRegenerate()
                    : undefined}
                  onResend={msg.role === 'user' && !isGenerating
                    ? () => handleResendMessage(msg)
                    : undefined}
                />
              ))}
              {isGenerating && (
                <MessageBubble
                  message={({
                    id: 'streaming',
                    role: 'assistant',
                    content: streamingContent,
                    reasoning: streamingReasoning || undefined,
                    ts: Date.now()
                  }) as any}
                  isLoading={true}
                  assistantName={activeConfig.name}
                  providerName={selectedProvider}
                />
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入栏 */}
        <div style={{ padding: '0 20px 20px', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
          <ChatInputBar
            value={input}
            onChange={setInput}
            onSend={() => handleSend()}
            onStop={handleStop}
            onRegenerate={(() => {
              const clone = [...messages]
              return clone.reverse().findIndex((m) => m.role === 'user') !== -1 ? handleRegenerate : undefined
            })()}
            isGenerating={isGenerating}
            disabled={!selectedModel || isGenerating}
            placeholder={selectedModel ? "输入测试消息..." : "请先选择一个模型..."}
            currentModelId={selectedModel || ''}
            currentProviderName={selectedProvider}
            reasoningEffort={reasoningEffort as any}
            onReasoningEffortChange={setReasoningEffort as any}
            onOpenModelPicker={() => setModelPickerOpen(true)}
            onClearContext={handleClear}
          />
        </div>
      </div>

      {/* 编辑消息对话框 */}
      {editDialog.open && (
        <div className="modalOverlay" onMouseDown={() => setEditDialog((d) => ({ ...d, open: false }))}>
          <div className="modalSurface frosted" style={{ width: 480, padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>编辑消息</div>
            <textarea
              className="input"
              style={{ width: '100%', minHeight: 120, marginBottom: 16, resize: 'vertical' }}
              value={editDialog.content}
              onChange={(e) => setEditDialog((d) => ({ ...d, content: e.target.value }))}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setEditDialog((d) => ({ ...d, open: false }))}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={() => {
                const msg = messages.find((m) => m.id === editDialog.msgId)
                if (msg) handleEditMessage(msg, editDialog.content.trim())
                setEditDialog({ open: false, msgId: '', content: '' })
              }}>
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重命名对话框 */}
      {renameDialog.open && (
        <div className="modalOverlay" onMouseDown={() => setRenameDialog((d) => ({ ...d, open: false }))}>
          <div className="modalSurface frosted" style={{ width: 360, padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>重命名配置</div>
            <input
              className="input"
              style={{ width: '100%', marginBottom: 16 }}
              value={renameDialog.name}
              onChange={(e) => setRenameDialog((d) => ({ ...d, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameConfig()
                if (e.key === 'Escape') setRenameDialog((d) => ({ ...d, open: false }))
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setRenameDialog((d) => ({ ...d, open: false }))}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={handleRenameConfig}>
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 模型快速切换对话框 */}
      {modelPickerOpen && (
        <div className="modalOverlay" onMouseDown={() => setModelPickerOpen(false)}>
          <div className="modalSurface frosted" style={{ width: 320, maxHeight: 400, display: 'flex', flexDirection: 'column' }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>
              选择模型
            </div>
            <div className="scrollbarHover" style={{ overflowY: 'auto', padding: 8 }}>
              {activeConfig.models.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', opacity: 0.5, fontSize: 13 }}>
                  暂无模型，请先在左侧获取列表或手动输入
                </div>
              ) : (
                activeConfig.models.map((m) => (
                  <div
                    key={m}
                    onClick={() => { setSelectedModel(m); setModelPickerOpen(false); }}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: selectedModel === m ? 600 : 400,
                      background: selectedModel === m ? 'var(--primary-bg)' : 'transparent',
                      color: selectedModel === m ? 'var(--primary)' : 'var(--text)',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedModel !== m) e.currentTarget.style.background = 'var(--hover-bg)'
                    }}
                    onMouseLeave={(e) => {
                      if (selectedModel !== m) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {m}
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setModelPickerOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
