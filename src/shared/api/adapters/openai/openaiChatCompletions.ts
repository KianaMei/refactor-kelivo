/**
 * OpenAI Chat Completions API Handler (shared)
 * 处理 OpenAI 兼容 API 的流式聊天补全
 * 零 Node.js 依赖，可在 Renderer 进程直接使用
 */

import type { ProviderConfigV2 } from '../../../types'
import type {
  ChatStreamChunk,
  TokenUsage,
  ToolCallInfo,
  ToolResultInfo,
  ChatMessage,
  ToolDefinition,
  OnToolCallFn
} from '../../../chatStream'
import { mergeUsage } from '../../../chatStream'
import {
  postJsonStream,
  parseSSELine,
  readErrorBody,
  joinUrl
} from '../../../streamingHttpClient'
import type { UserImage } from '../../chatApiService'
import * as helper from '../../../chatApiHelper'

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
 * OpenAI Chat Completions API 流式请求处理器
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
  const path = config.chatPath ?? '/chat/completions'
  const url = joinUrl(base, path)

  let host = ''
  try {
    host = new URL(config.baseUrl).host.toLowerCase()
  } catch {
    // ignore
  }

  const isReasoning = checkModelIsReasoning(modelId)
  const rawEffort = helper.effortForBudget(thinkingBudget)
  const effort = rawEffort === 'minimal' ? 'low' : rawEffort
  const isGrok = helper.isGrokModel(config, modelId)

  const mm = buildMessages(messages, userImages)

  const body: Record<string, unknown> = {
    model: upstreamModelId,
    messages: mm,
    stream: true,
    ...(temperature !== undefined && { temperature }),
    ...(topP !== undefined && { top_p: topP }),
    ...(maxTokens !== undefined && maxTokens > 0 && { max_tokens: maxTokens }),
    ...(isReasoning && effort !== 'off' && effort !== 'auto' && { reasoning_effort: effort }),
    ...(tools && tools.length > 0 && {
      tools: helper.cleanToolsForCompatibility(tools as any),
      tool_choice: 'auto'
    })
  }

  helper.applyVendorReasoningConfig({
    body,
    host,
    modelId,
    isReasoning,
    thinkingBudget,
    effort,
    isGrokModel: isGrok
  })

  const apiKey = helper.apiKeyForRequest(config, modelId)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...helper.customHeaders(config, modelId),
    ...extraHeaders
  }

  if (!host.includes('mistral.ai')) {
    body['stream_options'] = { include_usage: true }
  }

  if (isGrok) {
    const builtIns = helper.builtInTools(config, modelId)
    if (builtIns.has('search')) {
      body['search_parameters'] = { mode: 'auto', return_citations: true }
    }
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

  yield* processStream({
    config,
    modelId,
    messages,
    userImages,
    lines: response.lines,
    url,
    headers,
    isReasoning,
    thinkingBudget,
    temperature,
    topP,
    maxTokens,
    effort,
    tools,
    onToolCall,
    extraHeaders,
    extraBody,
    maxToolLoopIterations,
    signal,
    isGrok
  })
}

// ========== Stream Processing ==========

interface ProcessStreamParams {
  config: ProviderConfigV2
  modelId: string
  messages: ChatMessage[]
  userImages?: UserImage[]
  lines: AsyncGenerator<string, void, unknown>
  url: string
  headers: Record<string, string>
  isReasoning: boolean
  thinkingBudget?: number
  temperature?: number
  topP?: number
  maxTokens?: number
  effort: string
  tools?: ToolDefinition[]
  onToolCall?: OnToolCallFn
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
  maxToolLoopIterations: number
  signal?: AbortSignal
  isGrok: boolean
}

async function* processStream(params: ProcessStreamParams): AsyncGenerator<ChatStreamChunk> {
  const {
    config,
    modelId,
    messages,
    userImages,
    lines,
    url,
    headers,
    isReasoning,
    thinkingBudget,
    temperature,
    topP,
    maxTokens,
    effort,
    tools,
    onToolCall,
    extraHeaders,
    extraBody,
    maxToolLoopIterations,
    signal,
    isGrok
  } = params

  let usage: TokenUsage | undefined
  const toolAcc = new Map<number, { id: string; name: string; args: string }>()
  let finishReason: string | null = null

  const approxPromptChars = messages.reduce((acc, m) => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    return acc + content.length
  }, 0)
  const approxPromptTokens = Math.round(approxPromptChars / 4)
  let approxCompletionChars = 0

  for await (const line of lines) {
    const data = parseSSELine(line)

    if (data === null) {
      if (line.startsWith('data:') && line.substring(5).trim() === '[DONE]') {
        if (onToolCall && toolAcc.size > 0) {
          yield* executeToolsAndContinue({
            config,
            modelId,
            messages,
            userImages,
            url,
            headers,
            toolAcc,
            usage,
            isReasoning,
            thinkingBudget,
            temperature,
            topP,
            maxTokens,
            effort,
            tools,
            onToolCall,
            extraHeaders,
            extraBody,
            maxToolLoopIterations,
            signal,
            isGrok
          })
          return
        }

        const approxTotal = approxPromptTokens + Math.round(approxCompletionChars / 4)
        yield { content: '', isDone: true, totalTokens: usage?.totalTokens ?? approxTotal, usage }
        return
      }
      continue
    }

    try {
      const json = JSON.parse(data)
      let content = ''
      let reasoning: string | undefined

      const choices = json.choices as Array<Record<string, unknown>> | undefined
      if (choices && choices.length > 0) {
        const c0 = choices[0]
        finishReason = (c0.finish_reason as string) ?? null
        const message = c0.message as Record<string, unknown> | undefined
        const delta = c0.delta as Record<string, unknown> | undefined

        if (message?.content) {
          content = extractContent(message.content)
          if (content) approxCompletionChars += content.length
        } else if (delta) {
          content = extractContent(delta.content)
          if (content) approxCompletionChars += content.length

          const rc = (delta.reasoning_content ?? delta.reasoning) as string | undefined
          if (rc) reasoning = rc

          const tcs = delta.tool_calls as Array<Record<string, unknown>> | undefined
          if (tcs) {
            for (const t of tcs) {
              const idx = (t.index as number) ?? 0
              const id = t.id as string | undefined
              const func = t.function as Record<string, unknown> | undefined
              const name = func?.name as string | undefined
              const argsDelta = func?.arguments as string | undefined

              let entry = toolAcc.get(idx)
              if (!entry) {
                entry = { id: '', name: '', args: '' }
                toolAcc.set(idx, entry)
              }
              if (id) entry.id = id
              if (name) entry.name = name
              if (argsDelta) entry.args += argsDelta
            }
          }
        }
      }

      // XinLiu 兼容: root-level tool_calls
      const rootToolCalls = json.tool_calls as Array<Record<string, unknown>> | undefined
      if (rootToolCalls) {
        for (const t of rootToolCalls) {
          const id = String(t.id ?? '')
          const type = String(t.type ?? 'function')
          if (type !== 'function') continue
          const func = t.function as Record<string, unknown> | undefined
          if (!func) continue
          const name = String(func.name ?? '')
          const argsStr = String(func.arguments ?? '')
          if (!name) continue
          const idx = toolAcc.size
          toolAcc.set(idx, {
            id: id || `call_${idx}`,
            name,
            args: argsStr
          })
        }
        if (rootToolCalls.length > 0) finishReason = 'tool_calls'
      }

      // Usage tracking
      const u = json.usage as Record<string, unknown> | undefined
      if (u) {
        let prompt = (u.prompt_tokens as number) ?? 0
        const completion = (u.completion_tokens as number) ?? 0
        const details = u.prompt_tokens_details as Record<string, unknown> | undefined
        const cached = (details?.cached_tokens as number) ?? 0
        if (prompt === 0 && approxPromptTokens > 0) prompt = approxPromptTokens
        usage = mergeUsage(usage, {
          promptTokens: prompt,
          completionTokens: completion,
          cachedTokens: cached,
          totalTokens: prompt + completion
        })
      }

      // Grok citations
      if (isGrok) {
        const citations = helper.extractGrokCitations(json)
        if (citations.length > 0) {
          yield {
            content: '',
            isDone: false,
            totalTokens: usage?.totalTokens ?? 0,
            usage,
            toolResults: citations
          }
        }
      }

      if (content || reasoning) {
        const approxTotal = approxPromptTokens + Math.round(approxCompletionChars / 4)
        yield {
          content,
          reasoning,
          isDone: false,
          totalTokens: usage?.totalTokens ?? approxTotal,
          usage
        }
      }

      if (finishReason === 'tool_calls' && toolAcc.size > 0 && onToolCall) {
        yield* executeToolsAndContinue({
          config,
          modelId,
          messages,
          userImages,
          url,
          headers,
          toolAcc,
          usage,
          isReasoning,
          thinkingBudget,
          temperature,
          topP,
          maxTokens,
          effort,
          tools,
          onToolCall,
          extraHeaders,
          extraBody,
          maxToolLoopIterations,
          signal,
          isGrok
        })
        return
      }
    } catch (e) {
      console.warn('[OpenAIChatCompletions] JSON parse error:', e)
    }
  }

  yield { content: '', isDone: true, totalTokens: usage?.totalTokens ?? 0, usage }
}

// ========== Tool Execution ==========

interface ExecuteToolsParams {
  config: ProviderConfigV2
  modelId: string
  messages: ChatMessage[]
  userImages?: UserImage[]
  url: string
  headers: Record<string, string>
  toolAcc: Map<number, { id: string; name: string; args: string }>
  usage?: TokenUsage
  isReasoning: boolean
  thinkingBudget?: number
  temperature?: number
  topP?: number
  maxTokens?: number
  effort: string
  tools?: ToolDefinition[]
  onToolCall: OnToolCallFn
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
  maxToolLoopIterations: number
  signal?: AbortSignal
  isGrok: boolean
}

async function* executeToolsAndContinue(params: ExecuteToolsParams): AsyncGenerator<ChatStreamChunk> {
  const {
    config,
    modelId,
    messages,
    url,
    headers,
    toolAcc,
    usage: initialUsage,
    isReasoning,
    thinkingBudget,
    temperature,
    topP,
    maxTokens,
    effort,
    tools,
    onToolCall,
    extraHeaders,
    extraBody,
    maxToolLoopIterations,
    signal,
    isGrok
  } = params

  let usage = initialUsage
  const upstreamModelId = helper.apiModelId(config, modelId)
  let host = ''
  try {
    host = new URL(config.baseUrl).host.toLowerCase()
  } catch {
    // ignore
  }

  const calls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = []
  const callInfos: ToolCallInfo[] = []
  const toolMsgs: Array<{ name: string; id: string; args: Record<string, unknown> }> = []

  for (const [, m] of toolAcc) {
    const id = m.id || `call_${calls.length}`
    const name = m.name
    let args: Record<string, unknown>
    try {
      args = JSON.parse(m.args || '{}')
    } catch {
      args = {}
    }
    callInfos.push({ id, name, arguments: args })
    calls.push({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })
    toolMsgs.push({ name, id, args })
  }

  if (callInfos.length > 0) {
    yield { content: '', isDone: false, totalTokens: usage?.totalTokens ?? 0, usage, toolCalls: callInfos }
  }

  const results: Array<{ tool_call_id: string; content: string }> = []
  const resultsInfo: ToolResultInfo[] = []

  for (const m of toolMsgs) {
    const res = await onToolCall(m.name, m.args)
    results.push({ tool_call_id: m.id, content: res })
    resultsInfo.push({ id: m.id, name: m.name, arguments: m.args, content: res })
  }

  if (resultsInfo.length > 0) {
    yield { content: '', isDone: false, totalTokens: usage?.totalTokens ?? 0, usage, toolResults: resultsInfo }
  }

  let currentMessages: ChatMessage[] = messages.map((m) => ({ ...m }))
  currentMessages.push({ role: 'assistant', content: '', tool_calls: calls })
  for (const r of results) {
    const call = calls.find((c) => c.id === r.tool_call_id)
    currentMessages.push({
      role: 'tool',
      tool_call_id: r.tool_call_id,
      name: call?.function.name,
      content: r.content
    })
  }

  for (let round = 0; round < maxToolLoopIterations; round++) {
    const body2: Record<string, unknown> = {
      model: upstreamModelId,
      messages: currentMessages,
      stream: true,
      ...(temperature !== undefined && { temperature }),
      ...(topP !== undefined && { top_p: topP }),
      ...(maxTokens !== undefined && maxTokens > 0 && { max_tokens: maxTokens }),
      ...(isReasoning && effort !== 'off' && effort !== 'auto' && { reasoning_effort: effort }),
      ...(tools && tools.length > 0 && {
        tools: helper.cleanToolsForCompatibility(tools as any),
        tool_choice: 'auto'
      })
    }

    helper.applyVendorReasoningConfig({
      body: body2,
      host,
      modelId,
      isReasoning,
      thinkingBudget,
      effort,
      isGrokModel: isGrok
    })

    if (!host.includes('mistral.ai')) {
      body2['stream_options'] = { include_usage: true }
    }

    const extraBodyCfg = helper.customBody(config, modelId)
    Object.assign(body2, extraBodyCfg)
    if (extraBody) {
      for (const [k, v] of Object.entries(extraBody)) {
        body2[k] = typeof v === 'string' ? helper.parseOverrideValue(v) : v
      }
    }

    const headers2 = { ...headers, ...extraHeaders }

    const resp2 = await postJsonStream({
      url,
      headers: headers2,
      body: body2,
      signal
    })

    if (resp2.statusCode < 200 || resp2.statusCode >= 300) {
      const errorBody = await readErrorBody(resp2.rawStream)
      throw new Error(`HTTP ${resp2.statusCode}: ${errorBody}`)
    }

    const toolAcc2 = new Map<number, { id: string; name: string; args: string }>()
    let finishReason2: string | null = null
    let contentAccum = ''

    for await (const line of resp2.lines) {
      const data = parseSSELine(line)
      if (data === null) continue

      try {
        const o = JSON.parse(data)
        const choices = o.choices as Array<Record<string, unknown>> | undefined
        if (choices && choices.length > 0) {
          const c0 = choices[0]
          finishReason2 = (c0.finish_reason as string) ?? null
          const delta = c0.delta as Record<string, unknown> | undefined

          const txt = delta?.content as string | undefined
          const rc = (delta?.reasoning_content ?? delta?.reasoning) as string | undefined

          const u = o.usage as Record<string, unknown> | undefined
          if (u) {
            const prompt = (u.prompt_tokens as number) ?? 0
            const completion = (u.completion_tokens as number) ?? 0
            const details = u.prompt_tokens_details as Record<string, unknown> | undefined
            const cached = (details?.cached_tokens as number) ?? 0
            usage = mergeUsage(usage, {
              promptTokens: prompt,
              completionTokens: completion,
              cachedTokens: cached,
              totalTokens: prompt + completion
            })
          }

          if (isGrok) {
            const citations = helper.extractGrokCitations(o)
            if (citations.length > 0) {
              yield { content: '', isDone: false, totalTokens: usage?.totalTokens ?? 0, usage, toolResults: citations }
            }
          }

          if (rc) {
            yield { content: '', reasoning: rc, isDone: false, totalTokens: 0, usage }
          }
          if (txt) {
            contentAccum += txt
            yield { content: txt, isDone: false, totalTokens: 0, usage }
          }

          const tcs = delta?.tool_calls as Array<Record<string, unknown>> | undefined
          if (tcs) {
            for (const t of tcs) {
              const idx = (t.index as number) ?? 0
              const id = t.id as string | undefined
              const func = t.function as Record<string, unknown> | undefined
              const name = func?.name as string | undefined
              const argsDelta = func?.arguments as string | undefined

              let entry = toolAcc2.get(idx)
              if (!entry) {
                entry = { id: '', name: '', args: '' }
                toolAcc2.set(idx, entry)
              }
              if (id) entry.id = id
              if (name) entry.name = name
              if (argsDelta) entry.args += argsDelta
            }
          }
        }

        // XinLiu 兼容
        const rootToolCalls2 = o.tool_calls as Array<Record<string, unknown>> | undefined
        if (rootToolCalls2) {
          for (const t of rootToolCalls2) {
            const id = String(t.id ?? '')
            const type = String(t.type ?? 'function')
            if (type !== 'function') continue
            const func = t.function as Record<string, unknown> | undefined
            if (!func) continue
            const name = String(func.name ?? '')
            const argsStr = String(func.arguments ?? '')
            if (!name) continue
            const idx = toolAcc2.size
            toolAcc2.set(idx, { id: id || `call_${idx}`, name, args: argsStr })
          }
          if (rootToolCalls2.length > 0 && !finishReason2) finishReason2 = 'tool_calls'
        }
      } catch {
        // ignore
      }
    }

    if (finishReason2 === 'tool_calls' || toolAcc2.size > 0) {
      const calls2: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = []
      const callInfos2: ToolCallInfo[] = []
      const toolMsgs2: Array<{ name: string; id: string; args: Record<string, unknown> }> = []

      for (const [, m] of toolAcc2) {
        const id = m.id || `call_${calls2.length}`
        const name = m.name
        let args: Record<string, unknown>
        try {
          args = JSON.parse(m.args || '{}')
        } catch {
          args = {}
        }
        callInfos2.push({ id, name, arguments: args })
        calls2.push({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })
        toolMsgs2.push({ name, id, args })
      }

      if (callInfos2.length > 0) {
        yield { content: '', isDone: false, totalTokens: usage?.totalTokens ?? 0, usage, toolCalls: callInfos2 }
      }

      const results2: Array<{ tool_call_id: string; content: string }> = []
      const resultsInfo2: ToolResultInfo[] = []
      for (const m of toolMsgs2) {
        const res = await onToolCall(m.name, m.args)
        results2.push({ tool_call_id: m.id, content: res })
        resultsInfo2.push({ id: m.id, name: m.name, arguments: m.args, content: res })
      }

      if (resultsInfo2.length > 0) {
        yield { content: '', isDone: false, totalTokens: usage?.totalTokens ?? 0, usage, toolResults: resultsInfo2 }
      }

      currentMessages = [
        ...currentMessages,
        ...(contentAccum ? [{ role: 'assistant' as const, content: contentAccum }] : []),
        { role: 'assistant' as const, content: '', tool_calls: calls2 },
        ...results2.map((r) => ({
          role: 'tool' as const,
          tool_call_id: r.tool_call_id,
          name: calls2.find((c) => c.id === r.tool_call_id)?.function.name,
          content: r.content
        }))
      ]
      continue
    } else {
      yield { content: '', isDone: true, totalTokens: usage?.totalTokens ?? 0, usage }
      return
    }
  }

  // 达到最大迭代次数
  yield { content: '', isDone: true, totalTokens: usage?.totalTokens ?? 0, usage }
}

// ========== Helpers ==========

function extractContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const sb: string[] = []
    for (const it of content) {
      if (it && typeof it === 'object') {
        const obj = it as Record<string, unknown>
        const t = (obj.text ?? obj.delta ?? '') as string
        if (t && (!obj.type || obj.type === 'text')) sb.push(t)
      }
    }
    return sb.join('')
  }
  return ''
}

function buildMessages(
  messages: ChatMessage[],
  userImages?: UserImage[]
): Array<Record<string, unknown>> {
  const mm: Array<Record<string, unknown>> = []

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const isLast = i === messages.length - 1
    const raw = typeof m.content === 'string' ? m.content : ''
    const hasMarkdownImages = raw.includes('![') && raw.includes('](')
    const hasCustomImages = raw.includes('[image:')
    const hasAttachedImages = isLast && userImages && userImages.length > 0 && m.role === 'user'

    if (hasMarkdownImages || hasCustomImages || hasAttachedImages) {
      const parts: Array<Record<string, unknown>> = []
      if (raw) parts.push({ type: 'text', text: raw })

      if (hasAttachedImages) {
        for (const img of userImages!) {
          const dataUrl = `data:${img.mime};base64,${img.base64}`
          parts.push({ type: 'image_url', image_url: { url: dataUrl } })
        }
      }

      mm.push({ role: m.role, content: parts })
    } else if (typeof m.content === 'string') {
      mm.push({ role: m.role, content: m.content })
    } else {
      mm.push({ role: m.role, content: m.content })
    }
  }

  return mm
}

function checkModelIsReasoning(modelId: string): boolean {
  const m = modelId.toLowerCase()
  if (/^o[134]/.test(m)) return true
  if (m.includes('deepseek') && m.includes('r1')) return true
  if (m.includes('claude') && (m.includes('opus') || m.includes('sonnet'))) return true
  if (m.includes('qwen') && m.includes('qwq')) return true
  return false
}
