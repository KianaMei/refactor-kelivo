/**
 * Claude (Anthropic) Provider Adapter (shared)
 * 处理 Anthropic Claude API 的流式聊天补全
 * 零 Node.js 依赖，可在 Renderer 进程直接使用
 */

import type { ProviderConfigV2 } from '../../types'
import type {
  ChatStreamChunk,
  TokenUsage,
  ToolCallInfo,
  ToolResultInfo,
  ChatMessage,
  ToolDefinition,
  OnToolCallFn
} from '../../chatStream'
import { mergeUsage } from '../../chatStream'
import {
  postJsonStream,
  parseSSELine,
  readErrorBody,
  joinUrl
} from '../../streamingHttpClient'
import type { UserImage } from '../chatApiService'
import * as helper from '../../chatApiHelper'

/** 发送流式请求的参数 */
export interface SendStreamParams {
  config: ProviderConfigV2
  modelId: string
  messages: ChatMessage[]
  userImages?: UserImage[]
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
    userImages,
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

  const isReasoning = checkModelIsReasoning(modelId)
  const actualBudget = helper.effortToBudget(thinkingBudget, upstreamModelId)
  const reasoningEnabled = isReasoning && actualBudget !== 0

  let systemPrompt = ''
  const nonSystemMessages: ChatMessage[] = []
  for (const m of messages) {
    if (m.role === 'system') {
      const s = typeof m.content === 'string' ? m.content : ''
      if (s) {
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${s}` : s
      }
      continue
    }
    nonSystemMessages.push(m)
  }

  let currentMessages = buildAnthropicMessages(nonSystemMessages, userImages)
  const anthropicTools = convertToolsToAnthropic(tools)

  const allTools: Array<Record<string, unknown>> = []
  if (anthropicTools.length > 0) allTools.push(...anthropicTools)

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

  const headers: Record<string, string> = {
    Authorization: `Bearer ${helper.effectiveApiKey(config)}`,
    'x-api-key': helper.effectiveApiKey(config),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'anthropic-beta': 'web-fetch-2025-09-10,interleaved-thinking-2025-05-14,context-1m-2025-08-07',
    ...helper.customHeaders(config, modelId),
    ...extraHeaders
  }

  let usage: TokenUsage | undefined

  for (let round = 0; round < maxToolLoopIterations; round++) {
    const body: Record<string, unknown> = {
      model: upstreamModelId,
      max_tokens: maxTokens ?? 64000,
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

    const extraBodyCfg = helper.customBody(config, modelId)
    Object.assign(body, extraBodyCfg)
    if (extraBody) {
      for (const [k, v] of Object.entries(extraBody)) {
        body[k] = typeof v === 'string' ? helper.parseOverrideValue(v) : v
      }
    }

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

    const result = await processClaudeStream({
      lines: response.lines,
      usage,
      onToolCall,
      isReasoning
    })

    usage = result.usage

    for (const chunk of result.chunks) {
      yield chunk
    }

    if (result.toolCalls.length > 0 && onToolCall) {
      yield {
        content: '',
        isDone: false,
        totalTokens: usage?.totalTokens ?? 0,
        usage,
        toolCalls: result.toolCalls
      }

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

      yield {
        content: '',
        isDone: false,
        totalTokens: usage?.totalTokens ?? 0,
        usage,
        toolResults
      }

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

  let currentToolId = ''
  let currentToolName = ''
  let currentToolInput = ''

  for await (const line of lines) {
    if (line.startsWith('event:')) continue

    const data = parseSSELine(line)
    if (data === null) continue

    try {
      const json = JSON.parse(data)
      const eventType = json.type as string

      switch (eventType) {
        case 'message_start': {
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
            const partial = (delta.partial_json as string) ?? ''
            currentToolInput += partial
          }
          break
        }

        case 'content_block_stop': {
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

        case 'message_stop':
          break

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
      console.warn('[ClaudeAdapter] JSON parse error:', e)
    }
  }

  return { chunks, usage, toolCalls, textContent }
}

// ========== Helpers ==========

function buildAnthropicMessages(
  messages: ChatMessage[],
  userImages?: UserImage[]
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = []

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const isLast = i === messages.length - 1
    const role = m.role === 'tool' ? 'user' : m.role
    const rawContent = m.content

    if (isLast && userImages && userImages.length > 0 && role === 'user') {
      const parts: Array<Record<string, unknown>> = []
      const text = typeof rawContent === 'string' ? rawContent : ''
      if (text) parts.push({ type: 'text', text })

      for (const img of userImages) {
        parts.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mime,
            data: img.base64
          }
        })
      }

      result.push({ role: 'user', content: parts })
    } else if (typeof rawContent === 'string') {
      result.push({
        role,
        content: [{ type: 'text', text: rawContent }]
      })
    } else if (Array.isArray(rawContent)) {
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
  if (m.includes('claude') && (m.includes('opus') || m.includes('sonnet'))) {
    if (m.includes('claude-4') || m.includes('claude-sonnet-4') || m.includes('claude-opus-4')) {
      return true
    }
    if (m.includes('3.5') || m.includes('3-5')) {
      return true
    }
  }
  return false
}
