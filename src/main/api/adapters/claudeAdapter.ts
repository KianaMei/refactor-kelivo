/**
 * Claude (Anthropic) Provider Adapter
 * 处理 Anthropic Claude API 的流式聊天补全
 */

import type { ProviderConfigV2 } from '../../../shared/types'
import type {
  ChatStreamChunk,
  TokenUsage,
  ToolCallInfo,
  ToolResultInfo,
  ChatMessage,
  ToolDefinition,
  OnToolCallFn
} from '../../../shared/chatStream'
import { mergeUsage } from '../../../shared/chatStream'
import {
  postJsonStream,
  parseSSELine,
  readErrorBody,
  joinUrl
} from '../streamingHttpClient'
import * as helper from '../helpers/chatApiHelper'

/** 发送流式请求的参数 */
export interface SendStreamParams {
  config: ProviderConfigV2
  modelId: string
  messages: ChatMessage[]
  userImagePaths?: string[]
  thinkingBudget?: number
  temperature?: number
  topP?: number
  maxTokens?: number
  maxToolLoopIterations?: number
  tools?: ToolDefinition[]
  onToolCall?: OnToolCallFn
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
  signal?: AbortSignal
}

/**
 * Claude API 流式请求处理器
 */
export async function* sendStream(params: SendStreamParams): AsyncGenerator<ChatStreamChunk> {
  const {
    config,
    modelId,
    messages,
    userImagePaths,
    thinkingBudget,
    temperature,
    topP,
    maxTokens,
    maxToolLoopIterations = 10,
    tools,
    onToolCall,
    extraHeaders,
    extraBody,
    signal
  } = params

  const upstreamModelId = helper.apiModelId(config, modelId)
  const base = config.baseUrl.replace(/\/+$/, '')
  const url = joinUrl(base, '/messages')

  // 检测模型是否支持 reasoning
  const isReasoning = checkModelIsReasoning(modelId)
  const actualBudget = helper.effortToBudget(thinkingBudget, upstreamModelId)
  const reasoningEnabled = isReasoning && actualBudget !== 0

  // 提取 system prompt (Anthropic 使用顶级 system，不是 system role)
  let systemPrompt = ''
  const nonSystemMessages: ChatMessage[] = []
  for (const m of messages) {
    const role = m.role
    if (role === 'system') {
      const s = typeof m.content === 'string' ? m.content : ''
      if (s) {
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${s}` : s
      }
      continue
    }
    nonSystemMessages.push(m)
  }

  // 转换消息格式 (处理图片)
  let currentMessages = await buildAnthropicMessages(nonSystemMessages, userImagePaths)

  // 转换 OpenAI 风格的 tools 到 Anthropic custom tools
  const anthropicTools = convertToolsToAnthropic(tools)

  // 收集所有工具
  const allTools: Array<Record<string, unknown>> = []
  if (anthropicTools.length > 0) allTools.push(...anthropicTools)

  // 启用 Claude 内置 web search
  const builtIns = helper.builtInTools(config, modelId)
  if (builtIns.has('search')) {
    const ov = helper.modelOverride(config, modelId)
    const ws = (ov['webSearch'] as Record<string, unknown>) ?? {}
    const entry: Record<string, unknown> = {
      type: 'web_search_20250305',
      name: 'web_search'
    }
    if (typeof ws['max_uses'] === 'number' && ws['max_uses'] > 0) {
      entry['max_uses'] = ws['max_uses']
    }
    if (Array.isArray(ws['allowed_domains'])) {
      entry['allowed_domains'] = ws['allowed_domains'].map(String)
    }
    if (Array.isArray(ws['blocked_domains'])) {
      entry['blocked_domains'] = ws['blocked_domains'].map(String)
    }
    if (ws['user_location'] && typeof ws['user_location'] === 'object') {
      entry['user_location'] = ws['user_location']
    }
    allTools.push(entry)
  }

  // 构建请求头
  const headers: Record<string, string> = {
    Authorization: `Bearer ${helper.effectiveApiKey(config)}`, // 代理服务需要的认证
    'x-api-key': helper.effectiveApiKey(config),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true', // 浏览器访问许可
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    // Cherry Studio 格式: 启用 web-fetch、交错思考、大上下文
    'anthropic-beta': 'web-fetch-2025-09-10,interleaved-thinking-2025-05-14,context-1m-2025-08-07',
    ...helper.customHeaders(config, modelId),
    ...extraHeaders
  }

  let usage: TokenUsage | undefined

  // 多轮 tool calling 循环
  for (let round = 0; round < maxToolLoopIterations; round++) {
    const body: Record<string, unknown> = {
      model: upstreamModelId,
      max_tokens: maxTokens ?? 4096,
      messages: currentMessages,
      stream: true,
      ...(systemPrompt && {
        system: [{ type: 'text', text: systemPrompt }]
      }),
      ...(temperature !== undefined && { temperature }),
      ...(topP !== undefined && { top_p: topP }),
      ...(allTools.length > 0 && {
        tools: allTools,
        tool_choice: { type: 'auto' }
      }),
      ...(isReasoning && {
        thinking: {
          type: reasoningEnabled ? 'enabled' : 'disabled',
          ...(reasoningEnabled && actualBudget > 0 && { budget_tokens: actualBudget })
        }
      })
    }

    // 自定义 body 覆盖
    const extraBodyCfg = helper.customBody(config, modelId)
    Object.assign(body, extraBodyCfg)
    if (extraBody) {
      for (const [k, v] of Object.entries(extraBody)) {
        body[k] = typeof v === 'string' ? helper.parseOverrideValue(v) : v
      }
    }

    // 发送请求
    const response = await postJsonStream({
      url,
      headers,
      body,
      config,
      signal
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const errorBody = await readErrorBody(response.rawStream)
      throw new Error(`HTTP ${response.statusCode}: ${errorBody}`)
    }

    // 处理流
    const result = await processClaudeStream({
      lines: response.lines,
      usage,
      onToolCall,
      isReasoning
    })

    usage = result.usage

    // Yield 所有 chunks
    for (const chunk of result.chunks) {
      yield chunk
    }

    // 检查是否有 tool calls 需要执行
    if (result.toolCalls.length > 0 && onToolCall) {
      // Yield tool calls
      yield {
        content: '',
        isDone: false,
        totalTokens: usage?.totalTokens ?? 0,
        usage,
        toolCalls: result.toolCalls
      }

      // 执行 tools
      const toolResults: ToolResultInfo[] = []
      for (const tc of result.toolCalls) {
        const res = await onToolCall(tc.name, tc.arguments)
        toolResults.push({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
          content: res
        })
      }

      // Yield tool results
      yield {
        content: '',
        isDone: false,
        totalTokens: usage?.totalTokens ?? 0,
        usage,
        toolResults
      }

      // 构建后续消息
      // 添加 assistant 消息 (包含 tool_use blocks)
      const assistantContent: Array<Record<string, unknown>> = []
      if (result.textContent) {
        assistantContent.push({ type: 'text', text: result.textContent })
      }
      for (const tc of result.toolCalls) {
        assistantContent.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments
        })
      }
      currentMessages.push({ role: 'assistant', content: assistantContent })

      // 添加 user 消息 (包含 tool_result blocks)
      const userContent: Array<Record<string, unknown>> = []
      for (const tr of toolResults) {
        userContent.push({
          type: 'tool_result',
          tool_use_id: tr.id,
          content: tr.content
        })
      }
      currentMessages.push({ role: 'user', content: userContent })

      continue
    }

    // 没有 tool calls，完成
    yield { content: '', isDone: true, totalTokens: usage?.totalTokens ?? 0, usage }
    return
  }

  // 达到最大迭代次数
  yield { content: '', isDone: true, totalTokens: usage?.totalTokens ?? 0, usage }
}

// ========== Stream Processing ==========

interface ProcessStreamResult {
  chunks: ChatStreamChunk[]
  usage?: TokenUsage
  toolCalls: ToolCallInfo[]
  textContent: string
}

async function processClaudeStream(params: {
  lines: AsyncGenerator<string, void, unknown>
  usage?: TokenUsage
  onToolCall?: OnToolCallFn
  isReasoning: boolean
}): Promise<ProcessStreamResult> {
  const { lines, usage: initialUsage, isReasoning } = params

  const chunks: ChatStreamChunk[] = []
  let usage = initialUsage
  const toolCalls: ToolCallInfo[] = []
  let textContent = ''

  // 当前 tool_use block 累积
  let currentToolId = ''
  let currentToolName = ''
  let currentToolInput = ''

  for await (const line of lines) {
    // Claude 使用不同的 SSE 格式: event: xxx\ndata: {...}
    if (line.startsWith('event:')) {
      continue // 跳过 event 行
    }

    const data = parseSSELine(line)
    if (data === null) continue

    try {
      const json = JSON.parse(data)
      const eventType = json.type as string

      switch (eventType) {
        case 'message_start': {
          // 消息开始，可能包含 usage
          const msg = json.message as Record<string, unknown> | undefined
          if (msg?.usage) {
            const u = msg.usage as Record<string, unknown>
            usage = mergeUsage(usage, {
              promptTokens: (u.input_tokens as number) ?? 0,
              completionTokens: 0,
              totalTokens: (u.input_tokens as number) ?? 0
            })
          }
          break
        }

        case 'content_block_start': {
          const block = json.content_block as Record<string, unknown> | undefined
          if (block?.type === 'tool_use') {
            currentToolId = (block.id as string) ?? ''
            currentToolName = (block.name as string) ?? ''
            currentToolInput = ''
          }
          break
        }

        case 'content_block_delta': {
          const delta = json.delta as Record<string, unknown> | undefined
          if (!delta) break

          const deltaType = delta.type as string

          if (deltaType === 'text_delta') {
            const text = (delta.text as string) ?? ''
            if (text) {
              textContent += text
              chunks.push({
                content: text,
                isDone: false,
                totalTokens: usage?.totalTokens ?? 0,
                usage
              })
            }
          } else if (deltaType === 'thinking_delta' && isReasoning) {
            const thinking = (delta.thinking as string) ?? ''
            if (thinking) {
              chunks.push({
                content: '',
                reasoning: thinking,
                isDone: false,
                totalTokens: usage?.totalTokens ?? 0,
                usage
              })
            }
          } else if (deltaType === 'input_json_delta') {
            // Tool input 累积
            const partial = (delta.partial_json as string) ?? ''
            currentToolInput += partial
          }
          break
        }

        case 'content_block_stop': {
          // 如果当前有 tool_use block，完成它
          if (currentToolId && currentToolName) {
            let args: Record<string, unknown> = {}
            try {
              args = JSON.parse(currentToolInput || '{}')
            } catch {
              // ignore
            }
            toolCalls.push({
              id: currentToolId,
              name: currentToolName,
              arguments: args
            })
            currentToolId = ''
            currentToolName = ''
            currentToolInput = ''
          }
          break
        }

        case 'message_delta': {
          // 消息结束，包含最终 usage
          const delta = json.delta as Record<string, unknown> | undefined
          const u = json.usage as Record<string, unknown> | undefined
          if (u) {
            usage = mergeUsage(usage, {
              promptTokens: 0,
              completionTokens: (u.output_tokens as number) ?? 0,
              totalTokens: (u.output_tokens as number) ?? 0
            })
          }
          break
        }

        case 'message_stop': {
          // 消息完成
          break
        }

        case 'error': {
          const error = json.error as Record<string, unknown> | undefined
          const message = (error?.message as string) ?? 'Unknown error'
          throw new Error(`Claude API error: ${message}`)
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Claude API error:')) {
        throw e
      }
      // JSON 解析错误，跳过
      console.warn('[ClaudeAdapter] JSON parse error:', e)
    }
  }

  return { chunks, usage, toolCalls, textContent }
}

// ========== Helpers ==========

async function buildAnthropicMessages(
  messages: ChatMessage[],
  userImagePaths?: string[]
): Promise<Array<Record<string, unknown>>> {
  const result: Array<Record<string, unknown>> = []

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const isLast = i === messages.length - 1
    const role = m.role === 'tool' ? 'user' : m.role // Anthropic 没有 tool role
    const rawContent = m.content

    // 处理最后一条用户消息的附加图片
    if (isLast && userImagePaths && userImagePaths.length > 0 && role === 'user') {
      const parts: Array<Record<string, unknown>> = []
      const text = typeof rawContent === 'string' ? rawContent : ''
      if (text) parts.push({ type: 'text', text })

      for (const p of userImagePaths) {
        if (p.startsWith('http') || p.startsWith('data:')) {
          // URL 或 data URL
          parts.push({ type: 'text', text: p })
        } else {
          // 本地文件
          const mime = helper.mimeFromPath(p)
          const b64 = await helper.encodeBase64File(p, false)
          parts.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mime,
              data: b64
            }
          })
        }
      }

      result.push({ role: 'user', content: parts })
    } else if (typeof rawContent === 'string') {
      // 简单文本
      result.push({
        role,
        content: [{ type: 'text', text: rawContent }]
      })
    } else if (Array.isArray(rawContent)) {
      // 已经是结构化内容
      const parts: Array<Record<string, unknown>> = []
      for (const it of rawContent) {
        if (typeof it === 'object' && it !== null) {
          parts.push(it as Record<string, unknown>)
        } else if (it) {
          parts.push({ type: 'text', text: String(it) })
        }
      }
      result.push({ role, content: parts })
    } else {
      result.push({ role, content: [{ type: 'text', text: '' }] })
    }
  }

  return result
}

function convertToolsToAnthropic(
  tools?: ToolDefinition[]
): Array<Record<string, unknown>> {
  if (!tools || tools.length === 0) return []

  const result: Array<Record<string, unknown>> = []
  for (const t of tools) {
    const fn = t.function
    if (!fn?.name) continue

    result.push({
      name: fn.name,
      ...(fn.description && { description: fn.description }),
      input_schema: fn.parameters ?? { type: 'object' }
    })
  }
  return result
}

function checkModelIsReasoning(modelId: string): boolean {
  const m = modelId.toLowerCase()
  // Claude 4 Opus 和 Claude 4 Sonnet 支持 extended thinking
  if (m.includes('claude') && (m.includes('opus') || m.includes('sonnet'))) {
    // Claude 4+ 支持
    if (m.includes('claude-4') || m.includes('claude-sonnet-4') || m.includes('claude-opus-4')) {
      return true
    }
    // Claude 3.5 sonnet 也支持
    if (m.includes('3.5') || m.includes('3-5')) {
      return true
    }
  }
  return false
}
