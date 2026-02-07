import { ipcMain } from 'electron'
import crypto from 'crypto'

import { IpcChannel } from '../shared/ipc'
import type { ChatMessageInput, ChatStreamStartParams } from '../shared/chat'
import { loadConfig } from './configStore'
import { isAbortError } from './http'
import { sendMessageStream, generateText } from './api/chatApiService'
import type { ChatMessage, OnToolCallFn, ToolDefinition } from '../shared/chatStream'
import { SEARCH_TOOL_DEFINITION, formatSearchResultsXml } from './services/search/searchService'
import { searchManager, createSearchService } from './services/search'
import { MEMORY_TOOL_DEFINITIONS, formatMemoryToolResult, handleMemoryToolCall } from './services/memoryToolHandler'
import { extractDocumentText } from './services/documentExtractor'
import { DEFAULT_OCR_PROMPT, OcrService, runOcr } from './services/ocrService'

type StreamState = {
  controller: AbortController
}

const streams = new Map<string, StreamState>()

const MAX_DOC_CHARS = 12000
const MAX_OCR_CHARS = 8000

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, Math.trunc(v)))
}

function modelSupportsTools(providerId: string, modelId: string, modelOverrides: Record<string, any> | undefined): boolean {
  const id = (modelId ?? '').toLowerCase()
  // embedding 模型默认不支持 tools
  if (id.includes('embed') || id.includes('embedding') || id.includes('text-embedding') || id.includes('ada')) return false

  const ov = (modelOverrides ?? {})[modelId] as { abilities?: unknown } | undefined
  const abilities = (ov?.abilities as unknown[] | undefined) ?? undefined
  if (Array.isArray(abilities) && abilities.some((x) => String(x).toLowerCase() === 'tool')) return true

  // 兜底：常见 chat 模型大多支持 tools（对齐 renderer 的 inferModelMeta）
  return (
    id.includes('gpt-4') ||
    id.includes('gpt-3.5') ||
    id.includes('claude') ||
    id.includes('gemini') ||
    id.includes('qwen') ||
    id.includes('glm') ||
    id.includes('deepseek') ||
    id.includes('mistral') ||
    id.includes('llama') ||
    id.includes('grok')
  )
}

function modelSupportsImageInput(modelId: string, modelOverrides: Record<string, any> | undefined): boolean {
  const id = (modelId ?? '').toLowerCase()

  const ov = (modelOverrides ?? {})[modelId] as { input?: unknown } | undefined
  const input = (ov?.input as unknown[] | undefined) ?? undefined
  if (Array.isArray(input) && input.some((x) => String(x).toLowerCase() === 'image')) return true

  return (
    id.includes('vision') ||
    id.includes('4o') ||
    id.includes('gpt-4-turbo') ||
    id.includes('gemini') ||
    id.includes('claude-3') ||
    id.includes('claude-4') ||
    id.includes('qwen-vl') ||
    id.includes('glm-4v')
  )
}

function appendToSystemMessage(messages: ChatMessage[], extra: string): ChatMessage[] {
  const content = (extra ?? '').trim()
  if (!content) return messages

  if (messages.length > 0 && messages[0].role === 'system' && typeof messages[0].content === 'string') {
    const prev = (messages[0].content ?? '').trim()
    messages[0] = {
      ...messages[0],
      content: prev ? `${prev}\n\n${content}` : content
    }
    return messages
  }

  return [{ role: 'system', content }, ...messages]
}

function resolveSearchServiceId(cfg: Awaited<ReturnType<typeof loadConfig>>): string {
  const desired = cfg.searchConfig?.global?.defaultServiceId ?? null
  if (!desired) return 'duckduckgo'
  return desired
}

function pickFirstEnabledApiKey(service: any): string | null {
  const keys = (service?.apiKeys ?? []) as Array<{ key?: string; isEnabled?: boolean }>
  for (const k of keys) {
    const raw = String(k?.key ?? '').trim()
    if (!raw) continue
    if (k?.isEnabled === false) continue
    return raw
  }
  return null
}

function ensureSearchServiceRegistered(cfg: Awaited<ReturnType<typeof loadConfig>>, serviceId: string): void {
  const svc = (cfg.searchConfig?.services ?? []).find((s) => s.id === serviceId)
  if (!svc || svc.enabled !== true) return

  const type = String(svc.type ?? '').toLowerCase()
  // 仅支持 main 侧已实现的服务；其余类型忽略（避免误注册）
  if (type !== 'exa' && type !== 'tavily' && type !== 'brave' && type !== 'duckduckgo') return

  if (type === 'duckduckgo') {
    // 已内置默认注册；此处仅确保存在
    try {
      searchManager.setDefault(serviceId)
    } catch {
      // ignore
    }
    return
  }

  const apiKey = pickFirstEnabledApiKey(svc)
  if (!apiKey) return

  try {
    const service = createSearchService({
      type: type as 'exa' | 'tavily' | 'brave',
      apiKey,
      baseUrl: svc.baseUrl
    } as any)
    searchManager.register(serviceId, service, cfg.searchConfig?.global?.defaultServiceId === serviceId)
  } catch (e) {
    console.error('[ChatIpc] 注册搜索服务失败:', e)
  }
}

export function registerChatIpc(): void {
  ipcMain.handle(IpcChannel.ChatStreamStart, async (event, params: ChatStreamStartParams) => {
    // 允许 renderer 预先指定 streamId，避免 ipc invoke 返回滞后导致 renderer 丢失早到的 chunk/error
    const streamId = params.streamId ?? safeUuid()
    const controller = new AbortController()
    streams.set(streamId, { controller })

    // 注意：不要把 streamId 透传给上游请求体
    const { streamId: _ignored, ...rest } = params
    void runStream(event.sender, streamId, rest, controller.signal)
    return streamId
  })

  ipcMain.handle(IpcChannel.ChatStreamAbort, async (_event, streamId: string) => {
    const st = streams.get(streamId)
    if (!st) return
    st.controller.abort()
  })

  // 测试连接 - 通过 chatApiService 发送简单请求验证连接
  ipcMain.handle(IpcChannel.ChatTest, async (_event, params: { providerId: string; modelId: string }) => {
    const cfg = await loadConfig()
    const provider = cfg.providerConfigs[params.providerId]
    if (!provider) {
      throw new Error(`未找到供应商：${params.providerId}`)
    }

    if (!provider.apiKey) throw new Error('该供应商未配置 API Key')

    // 使用 generateText 发送简单测试请求（自动适配所有 provider 类型）
    await generateText({
      config: provider,
      modelId: params.modelId,
      prompt: 'Hi'
    })
    // 成功 - 不需要返回任何内容
  })
}

function safeUuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}

async function runStream(
  sender: Electron.WebContents,
  streamId: string,
  params: Omit<ChatStreamStartParams, 'streamId'>,
  signal: AbortSignal
): Promise<void> {
  try {
    const cfg = await loadConfig()
    const provider = cfg.providerConfigs[params.providerId]
    if (!provider) {
      throw new Error(`未找到供应商：${params.providerId}`)
    }

    if (!provider.apiKey) throw new Error('该供应商未配置 API Key')

    const assistantId = params.assistantId ?? null
    const assistant = assistantId ? cfg.assistantConfigs?.[assistantId] : null

    // 转换消息格式: ChatMessageInput[] -> ChatMessage[]
    let messages: ChatMessage[] = params.messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system' | 'tool',
      content: m.content
    }))

    // ── 附件预处理：文档提取 / 图片 OCR（当模型不支持图像输入时） ──────────────
    const docs = (params.documents ?? []).filter((d) => d && String(d.path ?? '').trim())
    if (docs.length > 0) {
      const blocks: string[] = []
      for (const d of docs) {
        const filePath = String(d.path ?? '').trim()
        const fileName = String(d.fileName ?? '').trim() || filePath
        const mime = String(d.mime ?? '').trim()
        const text = await extractDocumentText(filePath, mime)
        if (!text) continue
        const clipped = text.length > MAX_DOC_CHARS ? text.slice(0, MAX_DOC_CHARS) + '\n...(已截断)' : text
        blocks.push(`<document name="${fileName}">\n${clipped}\n</document>`)
      }
      if (blocks.length > 0) {
        messages = appendToSystemMessage(messages, blocks.join('\n\n'))
      }
    }

    const attachedImages = (params.userImagePaths ?? []).map((p) => String(p ?? '').trim()).filter(Boolean)
    const supportsImages = attachedImages.length > 0 && modelSupportsImageInput(params.modelId, provider.modelOverrides)
    let userImagePaths: string[] | undefined = supportsImages ? attachedImages : undefined

    if (!supportsImages && attachedImages.length > 0) {
      const ocrCfg = {
        enabled: cfg.ocrEnabled === true,
        providerId: cfg.ocrModelProvider ?? null,
        modelId: cfg.ocrModelId ?? null,
        prompt: DEFAULT_OCR_PROMPT
      }

      if (OcrService.isConfigured(ocrCfg)) {
        const ocrProvider = cfg.providerConfigs[ocrCfg.providerId!]
        if (ocrProvider && ocrProvider.apiKey) {
          const ocrText = await runOcr({
            imagePaths: attachedImages,
            providerConfig: ocrProvider,
            modelId: ocrCfg.modelId!,
            prompt: ocrCfg.prompt
          })
          if (ocrText && ocrText.trim()) {
            const clipped = ocrText.length > MAX_OCR_CHARS ? ocrText.slice(0, MAX_OCR_CHARS) + '\n...(已截断)' : ocrText
            messages = appendToSystemMessage(messages, OcrService.wrapOcrBlock(clipped))
          }
        }
      }
    }

    // ── Tools：联网搜索 + 记忆工具 ─────────────────────────────────────────
    const tools: ToolDefinition[] = []
    const supportsTools = modelSupportsTools(params.providerId, params.modelId, provider.modelOverrides)

    const enableSearchTool = params.enableSearchTool === true && cfg.searchConfig?.global?.enabled === true
    if (supportsTools && enableSearchTool) {
      tools.push(SEARCH_TOOL_DEFINITION as ToolDefinition)
    }

    if (supportsTools && assistant?.enableMemory === true) {
      tools.push(...MEMORY_TOOL_DEFINITIONS)
    }

    const onToolCall: OnToolCallFn | undefined = tools.length
      ? (async (name, args) => {
          try {
            if (name === SEARCH_TOOL_DEFINITION.function.name) {
              if (!enableSearchTool) return 'Error: web search is disabled'

              const query = String(args.query ?? '').trim()
              if (!query) return 'Error: query is required'

              const serviceId = resolveSearchServiceId(cfg)
              ensureSearchServiceRegistered(cfg, serviceId)

              const timeoutMs = clampInt((cfg.searchConfig?.global?.timeout ?? 10) * 1000, 1000, 120000)
              const resultSize = clampInt(cfg.searchConfig?.global?.maxResults ?? 10, 1, 50)

              const result = await searchManager.search(query, {
                serviceId,
                timeout: timeoutMs,
                resultSize
              })

              return formatSearchResultsXml(result)
            }

            if (assistantId) {
              const mem = await handleMemoryToolCall({ toolName: name, args, assistantId })
              if (mem) return formatMemoryToolResult(mem)
            }

            return `Error: unknown tool: ${name}`
          } catch (e) {
            return `Error: ${e instanceof Error ? e.message : String(e)}`
          }
        })
      : undefined

    // 使用统一的 chatApiService（自动适配 OpenAI/Claude/Google）
    for await (const chunk of sendMessageStream({
      config: provider,
      modelId: params.modelId,
      messages,
      userImagePaths,
      thinkingBudget: params.thinkingBudget,
      temperature: params.temperature,
      topP: params.topP,
      maxTokens: params.maxTokens,
      maxToolLoopIterations: params.maxToolLoopIterations,
      tools: tools.length ? tools : undefined,
      onToolCall,
      extraHeaders: params.customHeaders,
      extraBody: params.customBody,
      signal
    })) {
      if (sender.isDestroyed()) return

      // 原样转发 chunk（包含 content/reasoning/usage/toolCalls/toolResults 等）
      sender.send(IpcChannel.ChatStreamChunk, { streamId, chunk })
    }
  } catch (err) {
    if (isAbortError(err)) {
      if (!sender.isDestroyed()) {
        sender.send(IpcChannel.ChatStreamChunk, {
          streamId,
          chunk: { content: '', isDone: true, totalTokens: 0 }
        })
      }
      return
    }
    if (!sender.isDestroyed()) {
      sender.send(IpcChannel.ChatStreamError, {
        streamId,
        message: err instanceof Error ? err.message : String(err)
      })
    }
  } finally {
    streams.delete(streamId)
  }
}
