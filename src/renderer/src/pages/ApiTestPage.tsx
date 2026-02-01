/**
 * API 测试页面
 * 对齐旧版 Kelivo 的 desktop_api_test_page.dart
 * 包括：多配置管理、拉取 models、流式测试、工具面板等
 */
import { useState, useMemo, useRef, useEffect } from 'react'
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
  Play
} from 'lucide-react'
import { MarkdownView } from '../components/MarkdownView'
import type { AppConfig } from '../../../shared/types'

interface ApiTestConfig {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'google' | 'custom'
  apiKey: string
  baseUrl: string
  models: string[]
  selectedModel: string | null
}

interface TestMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  ts: number
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  latency?: number
}

const PROVIDER_PRESETS: Record<string, { name: string; defaultUrl: string }> = {
  openai: { name: 'OpenAI', defaultUrl: 'https://api.openai.com/v1' },
  anthropic: { name: 'Anthropic', defaultUrl: 'https://api.anthropic.com/v1' },
  google: { name: 'Google AI', defaultUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  custom: { name: '自定义 (OpenAI 兼容)', defaultUrl: '' }
}

function safeUuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}

interface Props {
  config: AppConfig
}

export function ApiTestPage(props: Props) {
  // 多配置管理
  const [configs, setConfigs] = useState<ApiTestConfig[]>(() => [
    {
      id: 'default',
      name: '默认配置',
      provider: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      models: [],
      selectedModel: null
    }
  ])
  const [activeConfigId, setActiveConfigId] = useState('default')

  // 当前配置
  const activeConfig = useMemo(() => configs.find((c) => c.id === activeConfigId) ?? configs[0], [configs, activeConfigId])

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
  const streamingMsgId = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 重命名对话框
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; configId: string; name: string }>({
    open: false,
    configId: '',
    name: ''
  })

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
  }, [messages.length, streamingContent])

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
      // 实际项目中这里应该调用 IPC 或 fetch
      // 这里模拟一个请求
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // 模拟返回的模型列表
      const mockModels = selectedProvider === 'openai'
        ? ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini']
        : selectedProvider === 'anthropic'
          ? ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229']
          : ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp']

      setModels(mockModels)
      if (mockModels.length > 0 && !selectedModel) {
        setSelectedModel(mockModels[0])
      }
      updateActiveConfig({ models: mockModels, selectedModel: mockModels[0] })
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
  async function handleSend() {
    const text = input.trim()
    if (!text) return
    if (isGenerating) return
    if (!selectedModel) {
      setModelError('请先选择一个模型')
      return
    }

    const userMsg: TestMessage = { id: safeUuid(), role: 'user', content: text, ts: Date.now() }
    const assistantMsgId = safeUuid()

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsGenerating(true)
    streamingMsgId.current = assistantMsgId
    setStreamingContent('')

    const startTime = Date.now()

    try {
      // 模拟流式响应
      // 实际项目中应该调用真实的 API
      const mockResponse = `这是来自 ${selectedModel} 的测试响应。\n\n您发送的消息是：\n\n> ${text}\n\n当前时间：${new Date().toLocaleString()}`

      for (let i = 0; i < mockResponse.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 10))
        setStreamingContent((prev) => prev + mockResponse[i])
      }

      const latency = Date.now() - startTime
      const assistantMsg: TestMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: mockResponse,
        ts: Date.now(),
        latency,
        usage: {
          promptTokens: Math.floor(text.length / 4),
          completionTokens: Math.floor(mockResponse.length / 4),
          totalTokens: Math.floor((text.length + mockResponse.length) / 4)
        }
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (e) {
      const errMsg: TestMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: `【错误】${e instanceof Error ? e.message : String(e)}`,
        ts: Date.now()
      }
      setMessages((prev) => [...prev, errMsg])
    } finally {
      setIsGenerating(false)
      streamingMsgId.current = null
      setStreamingContent('')
    }
  }

  // 停止生成
  function handleStop() {
    // 在实际项目中需要中断流式请求
    setIsGenerating(false)
    streamingMsgId.current = null
    if (streamingContent) {
      const assistantMsg: TestMessage = {
        id: safeUuid(),
        role: 'assistant',
        content: streamingContent + '\n\n（已停止）',
        ts: Date.now()
      }
      setMessages((prev) => [...prev, assistantMsg])
      setStreamingContent('')
    }
  }

  // 清空消息
  function handleClear() {
    setMessages([])
  }

  // 复制消息
  const [copiedId, setCopiedId] = useState<string | null>(null)
  function handleCopy(msg: TestMessage) {
    navigator.clipboard.writeText(msg.content)
    setCopiedId(msg.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 左侧配置面板 */}
      <div className="apiTestConfigPanel frosted">
        {/* 配置选择器 */}
        <div className="apiTestConfigHeader">
          <select
            className="select"
            value={activeConfigId}
            onChange={(e) => setActiveConfigId(e.target.value)}
            style={{ flex: 1 }}
          >
            {configs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => handleDeleteConfig(activeConfigId)}
              title="删除配置"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        {/* 供应商选择 */}
        <div className="apiTestField">
          <label>供应商</label>
          <select className="select" value={selectedProvider} onChange={(e) => handleProviderChange(e.target.value)}>
            {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
              <option key={key} value={key}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div className="apiTestField">
          <label>API Key</label>
          <input
            className="input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={handleSaveConfig}
            placeholder="sk-..."
          />
        </div>

        {/* Base URL */}
        <div className="apiTestField">
          <label>Base URL</label>
          <input
            className="input"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            onBlur={handleSaveConfig}
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
            <select
              className="select"
              value={selectedModel ?? ''}
              onChange={(e) => {
                setSelectedModel(e.target.value)
                updateActiveConfig({ selectedModel: e.target.value })
              }}
              style={{ marginTop: 8 }}
            >
              <option value="" disabled>选择模型</option>
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
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
          <button type="button" className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }}>
            <ExternalLink size={14} />
            <span>转换为供应商配置</span>
          </button>
        </div>
      </div>

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
              {messages.map((msg) => (
                <div key={msg.id} className={`apiTestMessage ${msg.role === 'user' ? 'apiTestMessageUser' : ''}`}>
                  <div className="apiTestMessageContent">
                    <MarkdownView content={msg.content} />
                  </div>
                  <div className="apiTestMessageMeta">
                    {msg.usage && (
                      <span>
                        {msg.usage.totalTokens} tokens
                      </span>
                    )}
                    {msg.latency && (
                      <span>{(msg.latency / 1000).toFixed(2)}s</span>
                    )}
                    <button
                      type="button"
                      className="btn btn-icon btn-sm"
                      onClick={() => handleCopy(msg)}
                    >
                      {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              ))}
              {isGenerating && streamingContent && (
                <div className="apiTestMessage">
                  <div className="apiTestMessageContent">
                    <MarkdownView content={streamingContent} />
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入栏 */}
        <div className="apiTestInputBar frosted">
          <textarea
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="输入测试消息..."
            rows={2}
            style={{ flex: 1, resize: 'none', minHeight: 60 }}
          />
          {isGenerating ? (
            <button type="button" className="btn btn-primary" onClick={handleStop}>
              <Square size={16} />
              <span>停止</span>
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={handleSend} disabled={!selectedModel}>
              <Send size={16} />
              <span>发送</span>
            </button>
          )}
        </div>
      </div>

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
    </div>
  )
}
