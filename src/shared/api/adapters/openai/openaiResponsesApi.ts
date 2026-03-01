/**
 * OpenAI Responses API Handler (shared)
 * 处理 OpenAI Responses API 格式的流式请求
 * 零 Node.js 依赖，可在 Renderer 进程直接使用
 */

import type { ProviderConfigV2 } from '../../../types'
import type {
  ChatStreamChunk,
  TokenUsage,
  RoundUsage,
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
import type { SendStreamParams } from '../../adapterParams'
import type { ResponsesReasoningSummary, ResponsesTextVerbosity } from '../../../responsesOptions'
import * as helper from '../../../chatApiHelper'
import { buildResponsesInputPayload } from './openaiMessageFormat'

/**
 * OpenAI Responses API 流式请求处理器
 */
export async function* sendStream(params: SendStreamParams): AsyncGenerator<ChatStreamChunk> {
  const {
    config,
    modelId,
    messages,
    userImages,
    thinkingBudget,
    responsesReasoningSummary = 'detailed',
    responsesTextVerbosity = 'high',
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
  const url = joinUrl(base, '/responses')

  const isReasoning = checkModelIsReasoning(modelId)
  const rawEffort = helper.effortForBudget(thinkingBudget)
  const xhighSupported = helper.supportsResponsesXHighEffort(upstreamModelId) || helper.supportsResponsesXHighEffort(modelId)
  const effort = rawEffort === 'xhigh' && !xhighSupported ? 'high' : rawEffort

  const { input, instructions } = buildResponsesInputPayload(messages, userImages)
  const isCodex = config.providerType === 'codex_oauth'
  const toolList = buildToolList(tools, config, modelId, isCodex)

  // Codex 对齐 CPA：system prompt → developer role 消息放入 input，instructions 保持空
  const codexInput = isCodex ? prependDeveloperMessage(input, instructions) : input

  const body: Record<string, unknown> = {
    model: upstreamModelId,
    input: codexInput,
    stream: true,
    // Codex: instructions 始终为空字符串（system 内容已转为 developer message），store=false
    ...(isCodex
      ? { instructions: '', store: false }
      : instructions ? { instructions } : {}),
    // Codex 不支持 temperature/top_p/max_output_tokens，发了会被拒绝
    ...(!isCodex && temperature !== undefined && { temperature }),
    ...(!isCodex && topP !== undefined && { top_p: topP }),
    ...(!isCodex && maxTokens !== undefined && maxTokens > 0 && { max_output_tokens: maxTokens }),
    ...(toolList.length > 0 && {
      tools: toolList,
      tool_choice: 'auto'
    }),
    ...(isCodex
      ? buildCodexReasoningConfig(effort)
      : buildResponsesReasoningConfig({ isReasoning, effort, summary: responsesReasoningSummary })),
    ...buildResponsesTextConfig(responsesTextVerbosity)
  }

  // Codex 特有字段（对齐 CPA codex_openai_request / codex_openai-responses_request）
  if (isCodex) {
    body['parallel_tool_calls'] = true
    body['include'] = ['reasoning.encrypted_content']
  }

  try {
    const ov = helper.modelOverride(config, modelId)
    const ws = ov['webSearch'] as Record<string, unknown> | undefined
    if (ws?.['include_sources'] === true) {
      // Codex 的 include 已在上方设置，这里仅对非 Codex 供应商追加
      if (!isCodex) {
        body['include'] = ['web_search_call.action.sources']
      }
    }
  } catch {
    // ignore
  }

  const apiKey = helper.effectiveApiKey(config)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...helper.customHeaders(config, modelId),
    ...extraHeaders
  }

  // Codex OAuth 特殊请求头（对齐 CPA codex_executor）
  if (config.providerType === 'codex_oauth') {
    headers['Version'] = '0.101.0'
    headers['User-Agent'] = 'codex_cli_rs/0.101.0'
    headers['Originator'] = 'codex_cli_rs'
    headers['Session_id'] = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
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
    lines: response.lines,
    url,
    headers,
    toolList,
    systemInstructions: instructions,
    thinkingBudget,
    responsesReasoningSummary,
    responsesTextVerbosity,
    temperature,
    topP,
    maxTokens,
    tools,
    onToolCall,
    extraHeaders,
    extraBody,
    maxToolLoopIterations,
    signal
  })
}

// ========== Stream Processing ==========

interface ProcessStreamParams {
  config: ProviderConfigV2
  modelId: string
  messages: ChatMessage[]
  lines: AsyncGenerator<string, void, unknown>
  url: string
  headers: Record<string, string>
  toolList: Array<Record<string, unknown>>
  systemInstructions: string
  thinkingBudget?: number
  responsesReasoningSummary: ResponsesReasoningSummary
  responsesTextVerbosity: ResponsesTextVerbosity
  temperature?: number
  topP?: number
  maxTokens?: number
  tools?: ToolDefinition[]
  onToolCall?: OnToolCallFn
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
  maxToolLoopIterations: number
  signal?: AbortSignal
}

async function* processStream(params: ProcessStreamParams): AsyncGenerator<ChatStreamChunk> {
  const {
    config,
    modelId,
    messages,
    lines,
    url,
    headers,
    toolList,
    systemInstructions,
    thinkingBudget,
    responsesReasoningSummary,
    responsesTextVerbosity,
    temperature,
    topP,
    maxTokens,
    tools,
    onToolCall,
    extraHeaders,
    extraBody,
    maxToolLoopIterations,
    signal
  } = params

  let usage: TokenUsage | undefined
  let totalTokens = 0

  const toolAccResp = new Map<string, { id: string; name: string; args: string }>()
  const itemIdToCallId = new Map<string, string>()

  for await (const line of lines) {
    const data = parseSSELine(line)

    if (data === null) {
      if (line.startsWith('data:') && line.substring(5).trim() === '[DONE]') {
        yield { content: '', isDone: true, totalTokens, usage }
        return
      }
      continue
    }

    try {
      const json = JSON.parse(data)
      const type = json.type as string

      switch (type) {
        case 'response.output_text.delta': {
          const delta = json.delta as string | undefined
          if (delta) {
            yield { content: delta, isDone: false, totalTokens, usage }
          }
          break
        }

        case 'response.reasoning_summary_text.delta': {
          const delta = json.delta as string | undefined
          if (delta) {
            yield { content: '', reasoning: delta, isDone: false, totalTokens, usage }
          }
          break
        }

        case 'response.output_item.added': {
          const item = json.item as Record<string, unknown> | undefined
          if (item?.type === 'function_call') {
            const callId = String(item.call_id ?? '')
            const itemId = String(item.id ?? '')
            const name = String(item.name ?? '')
            if (callId && itemId) {
              itemIdToCallId.set(itemId, callId)
              toolAccResp.set(callId, { id: callId, name, args: '' })
            }
          }
          break
        }

        case 'response.function_call_arguments.delta': {
          const itemId = String(json.item_id ?? '')
          const delta = String(json.delta ?? '')
          if (itemId && delta) {
            const callId = itemIdToCallId.get(itemId)
            if (callId) {
              const entry = toolAccResp.get(callId)
              if (entry) entry.args += delta
            }
          }
          break
        }

        case 'response.function_call_arguments.done': {
          const itemId = String(json.item_id ?? '')
          const args = String(json.arguments ?? '')
          if (itemId && args) {
            const callId = itemIdToCallId.get(itemId)
            if (callId) {
              const entry = toolAccResp.get(callId)
              if (entry) entry.args = args
            }
          }
          break
        }

        case 'response.completed': {
          const u = (json.response as Record<string, unknown>)?.usage as Record<string, unknown> | undefined
          if (u) {
            const inTok = (u.input_tokens as number) ?? 0
            const outTok = (u.output_tokens as number) ?? 0
            usage = mergeUsage(usage, {
              promptTokens: inTok,
              completionTokens: outTok,
              totalTokens: inTok + outTok
            })
            totalTokens = usage.totalTokens
          }

          const citations = extractWebSearchCitations(json)
          if (citations.length > 0) {
            yield { content: '', isDone: false, totalTokens, usage, toolResults: citations }
          }

          if (onToolCall && toolAccResp.size > 0) {
            yield* executeToolsAndContinue({
              config,
              modelId,
              messages,
              url,
              headers,
              toolAccResp,
              itemIdToCallId,
              usage,
              toolList,
              systemInstructions,
              thinkingBudget,
              responsesReasoningSummary,
              responsesTextVerbosity,
              temperature,
              topP,
              maxTokens,
              tools,
              onToolCall,
              extraHeaders,
              extraBody,
              maxToolLoopIterations,
              signal
            })
            return
          }

          yield { content: '', isDone: true, totalTokens, usage }
          return
        }
      }
    } catch {
      // JSON 解析错误，跳过
    }
  }

  yield { content: '', isDone: true, totalTokens, usage }
}

// ========== Tool Execution ==========

interface ExecuteToolsParams {
  config: ProviderConfigV2
  modelId: string
  messages: ChatMessage[]
  url: string
  headers: Record<string, string>
  toolAccResp: Map<string, { id: string; name: string; args: string }>
  itemIdToCallId: Map<string, string>
  usage?: TokenUsage
  toolList: Array<Record<string, unknown>>
  systemInstructions: string
  thinkingBudget?: number
  responsesReasoningSummary: ResponsesReasoningSummary
  responsesTextVerbosity: ResponsesTextVerbosity
  temperature?: number
  topP?: number
  maxTokens?: number
  tools?: ToolDefinition[]
  onToolCall: OnToolCallFn
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
  maxToolLoopIterations: number
  signal?: AbortSignal
}

async function* executeToolsAndContinue(params: ExecuteToolsParams): AsyncGenerator<ChatStreamChunk> {
  const {
    config,
    modelId,
    messages,
    url,
    headers,
    toolAccResp,
    itemIdToCallId,
    usage: initialUsage,
    toolList,
    systemInstructions,
    thinkingBudget,
    responsesReasoningSummary,
    responsesTextVerbosity,
    temperature,
    topP,
    maxTokens,
    onToolCall,
    extraHeaders,
    extraBody,
    maxToolLoopIterations,
    signal
  } = params

  const upstreamModelId = helper.apiModelId(config, modelId)
  let usage = initialUsage
  let totalTokens = usage?.totalTokens ?? 0

  const isReasoning = checkModelIsReasoning(modelId)
  const rawEffort = helper.effortForBudget(thinkingBudget)
  const xhighSupported = helper.supportsResponsesXHighEffort(upstreamModelId) || helper.supportsResponsesXHighEffort(modelId)
  const effort = rawEffort === 'xhigh' && !xhighSupported ? 'high' : rawEffort

  const callInfos: ToolCallInfo[] = []
  const msgs: Array<{ id: string; name: string; args: Record<string, unknown>; callId: string }> = []

  for (const [key, m] of toolAccResp) {
    let args: Record<string, unknown>
    try {
      args = JSON.parse(m.args || '{}')
    } catch {
      args = {}
    }
    const id = m.id || key
    callInfos.push({ id, name: m.name, arguments: args })
    msgs.push({ id, name: m.name, args, callId: m.id || key })
  }

  if (callInfos.length > 0) {
    yield { content: '', isDone: false, totalTokens, usage, toolCalls: callInfos }
  }

  const resultsInfo: ToolResultInfo[] = []
  const toolOutputs: Array<Record<string, unknown>> = []

  for (const m of msgs) {
    const res = await onToolCall(m.name, m.args)
    resultsInfo.push({ id: m.id, name: m.name, arguments: m.args, content: res })
    toolOutputs.push({ type: 'function_call_output', call_id: m.callId, output: res })
  }

  if (resultsInfo.length > 0) {
    yield { content: '', isDone: false, totalTokens, usage, toolResults: resultsInfo }
  }

  const { input: normalizedConversation } = buildResponsesInputPayload(messages)
  const conversation: Array<Record<string, unknown>> = [...normalizedConversation]
  for (const m of msgs) {
    conversation.push({
      type: 'function_call',
      call_id: m.callId,
      name: m.name,
      arguments: JSON.stringify(m.args)
    })
  }
  conversation.push(...toolOutputs)

  const isCodexLoop = config.providerType === 'codex_oauth'
  let totalToolCallCount = msgs.length
  const roundUsages: RoundUsage[] = []

  // Round 1: 初始请求的 usage
  if (initialUsage) {
    roundUsages.push({
      promptTokens: initialUsage.promptTokens,
      completionTokens: initialUsage.completionTokens,
      cachedTokens: initialUsage.cachedTokens,
      totalTokens: initialUsage.totalTokens
    })
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (totalToolCallCount >= maxToolLoopIterations) break
    const body: Record<string, unknown> = {
      model: upstreamModelId,
      input: conversation,
      stream: true,
      // Codex: instructions 为空（system 内容在初始请求中已作为 developer message），store=false
      ...(isCodexLoop
        ? { instructions: '', store: false }
        : systemInstructions ? { instructions: systemInstructions } : {}),
      ...(isCodexLoop
        ? buildCodexReasoningConfig(effort)
        : buildResponsesReasoningConfig({ isReasoning, effort, summary: responsesReasoningSummary })),
      ...buildResponsesTextConfig(responsesTextVerbosity),
      // Codex 不支持 temperature/top_p/max_output_tokens
      ...(!isCodexLoop && temperature !== undefined && { temperature }),
      ...(!isCodexLoop && topP !== undefined && { top_p: topP }),
      ...(!isCodexLoop && maxTokens !== undefined && maxTokens > 0 && { max_output_tokens: maxTokens }),
      ...(toolList.length > 0 && {
        tools: toolList,
        tool_choice: 'auto'
      })
    }

    // Codex 特有字段
    if (isCodexLoop) {
      body['parallel_tool_calls'] = true
      body['include'] = ['reasoning.encrypted_content']
    }

    const response = await postJsonStream({
      url,
      headers,
      body,
      signal
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const errorBody = await readErrorBody(response.rawStream)
      throw new Error(`HTTP ${response.statusCode}: ${errorBody}`)
    }

    toolAccResp.clear()
    itemIdToCallId.clear()
    let responseCompleted = false

    for await (const line of response.lines) {
      if (responseCompleted) break

      const data = parseSSELine(line)
      if (data === null) {
        // 处理 [DONE] 信号
        if (line.startsWith('data:') && line.substring(5).trim() === '[DONE]') break
        continue
      }

      try {
        const json = JSON.parse(data)
        const type = json.type as string

        switch (type) {
          case 'response.reasoning_summary_text.delta': {
            const delta = json.delta as string | undefined
            if (delta) yield { content: '', reasoning: delta, isDone: false, totalTokens, usage }
            break
          }
          case 'response.output_text.delta': {
            const delta = json.delta as string | undefined
            if (delta) yield { content: delta, isDone: false, totalTokens, usage }
            break
          }
          case 'response.output_item.added': {
            const item = json.item as Record<string, unknown> | undefined
            if (item?.type === 'function_call') {
              const callId = String(item.call_id ?? '')
              const itemId = String(item.id ?? '')
              const name = String(item.name ?? '')
              if (callId && itemId) {
                itemIdToCallId.set(itemId, callId)
                toolAccResp.set(callId, { id: callId, name, args: '' })
              }
            }
            break
          }
          case 'response.function_call_arguments.delta': {
            const itemId = String(json.item_id ?? '')
            const delta = String(json.delta ?? '')
            if (itemId && delta) {
              const callId = itemIdToCallId.get(itemId)
              if (callId) {
                const entry = toolAccResp.get(callId)
                if (entry) entry.args += delta
              }
            }
            break
          }
          case 'response.function_call_arguments.done': {
            const itemId = String(json.item_id ?? '')
            const args = String(json.arguments ?? '')
            if (itemId && args) {
              const callId = itemIdToCallId.get(itemId)
              if (callId) {
                const entry = toolAccResp.get(callId)
                if (entry) entry.args = args
              }
            }
            break
          }
          case 'response.completed': {
            const u = (json.response as Record<string, unknown>)?.usage as Record<string, unknown> | undefined
            if (u) {
              const inTok = (u.input_tokens as number) ?? 0
              const outTok = (u.output_tokens as number) ?? 0
              roundUsages.push({ promptTokens: inTok, completionTokens: outTok, totalTokens: inTok + outTok })
              usage = mergeUsage(usage, {
                promptTokens: inTok,
                completionTokens: outTok,
                totalTokens: inTok + outTok
              })
              if (usage) usage.roundUsages = roundUsages
              totalTokens = usage.totalTokens
            }
            responseCompleted = true
            break
          }
        }
      } catch {
        // ignore
      }
    }

    if (toolAccResp.size > 0) {
      const callInfos2: ToolCallInfo[] = []
      const msgs2: Array<{ id: string; name: string; args: Record<string, unknown>; callId: string }> = []

      for (const [key, m] of toolAccResp) {
        let args: Record<string, unknown>
        try { args = JSON.parse(m.args || '{}') } catch { args = {} }
        const id = m.id || key
        callInfos2.push({ id, name: m.name, arguments: args })
        msgs2.push({ id, name: m.name, args, callId: m.id || key })
      }

      if (callInfos2.length > 0) {
        yield { content: '', isDone: false, totalTokens, usage, toolCalls: callInfos2 }
      }

      const resultsInfo2: ToolResultInfo[] = []
      const toolOutputs2: Array<Record<string, unknown>> = []
      for (const m of msgs2) {
        const res = await onToolCall(m.name, m.args)
        resultsInfo2.push({ id: m.id, name: m.name, arguments: m.args, content: res })
        toolOutputs2.push({ type: 'function_call_output', call_id: m.callId, output: res })
      }

      if (resultsInfo2.length > 0) {
        yield { content: '', isDone: false, totalTokens, usage, toolResults: resultsInfo2 }
      }

      totalToolCallCount += msgs2.length

      for (const m of msgs2) {
        conversation.push({ type: 'function_call', call_id: m.callId, name: m.name, arguments: JSON.stringify(m.args) })
      }
      conversation.push(...toolOutputs2)
      continue
    } else {
      break
    }
  }

  // 到达工具调用上限后，发一次不带 tools 的请求，让模型基于已有结果生成回复
  const finalBody: Record<string, unknown> = {
    model: upstreamModelId,
    input: conversation,
    stream: true,
    ...(isCodexLoop
      ? { instructions: '', store: false }
      : systemInstructions ? { instructions: systemInstructions } : {}),
    ...(isCodexLoop
      ? buildCodexReasoningConfig(effort)
      : buildResponsesReasoningConfig({ isReasoning, effort, summary: responsesReasoningSummary })),
    ...buildResponsesTextConfig(responsesTextVerbosity),
    ...(!isCodexLoop && temperature !== undefined && { temperature }),
    ...(!isCodexLoop && topP !== undefined && { top_p: topP }),
    ...(!isCodexLoop && maxTokens !== undefined && maxTokens > 0 && { max_output_tokens: maxTokens })
  }

  if (isCodexLoop) {
    finalBody['include'] = ['reasoning.encrypted_content']
  }

  const extraBodyCfg = helper.customBody(config, modelId)
  Object.assign(finalBody, extraBodyCfg)
  if (extraBody) {
    for (const [k, v] of Object.entries(extraBody)) {
      finalBody[k] = typeof v === 'string' ? helper.parseOverrideValue(v) : v
    }
  }

  try {
    const finalResp = await postJsonStream({ url, headers, body: finalBody, signal })
    if (finalResp.statusCode >= 200 && finalResp.statusCode < 300) {
      for await (const line of finalResp.lines) {
        const data = parseSSELine(line)
        if (data === null) {
          if (line.startsWith('data:') && line.substring(5).trim() === '[DONE]') break
          continue
        }
        try {
          const json = JSON.parse(data)
          const type = json.type as string
          if (type === 'response.output_text.delta') {
            const delta = json.delta as string | undefined
            if (delta) yield { content: delta, isDone: false, totalTokens, usage }
          } else if (type === 'response.reasoning_summary_text.delta') {
            const delta = json.delta as string | undefined
            if (delta) yield { content: '', reasoning: delta, isDone: false, totalTokens, usage }
          } else if (type === 'response.completed') {
            const u = (json.response as Record<string, unknown>)?.usage as Record<string, unknown> | undefined
            if (u) {
              const inTok = (u.input_tokens as number) ?? 0
              const outTok = (u.output_tokens as number) ?? 0
              roundUsages.push({ promptTokens: inTok, completionTokens: outTok, totalTokens: inTok + outTok })
              usage = mergeUsage(usage, { promptTokens: inTok, completionTokens: outTok, totalTokens: inTok + outTok })
              if (usage) usage.roundUsages = roundUsages
              totalTokens = usage.totalTokens
            }
          }
        } catch { /* ignore */ }
      }
    }
  } catch {
    // 最终请求失败时静默处理，不影响已有结果
  }

  if (usage) usage.roundUsages = roundUsages
  yield { content: '', isDone: true, totalTokens, usage }
}

// ========== Helpers ==========

function buildToolList(
  tools: ToolDefinition[] | undefined,
  config: ProviderConfigV2,
  modelId: string,
  isCodexProvider = false
): Array<Record<string, unknown>> {
  const toolList: Array<Record<string, unknown>> = []

  if (tools && tools.length > 0) {
    for (const t of tools) {
      const fn = t.function
      if (!fn?.name) continue
      toolList.push({
        type: 'function',
        name: fn.name,
        ...(fn.description && { description: fn.description }),
        ...(fn.parameters && { parameters: fn.parameters })
      })
    }
  }

  // OpenAI Responses 支持模型 + xAI 端点（Agent Tools）
  // Codex OAuth 不注入内置 web_search：CPA 不添加内置工具，且内置搜索不受 maxToolLoop 控制
  // 会导致模型疯狂调用 40+ 次搜索。Codex 用户的搜索走自定义 function tool（可控）。
  if (!isCodexProvider && (isResponsesWebSearchSupported(modelId) || helper.isXAIEndpoint(config))) {
    const builtIns = helper.builtInTools(config, modelId)
    if (builtIns.has('search')) {
      const ov = helper.modelOverride(config, modelId)
      const ws = (ov['webSearch'] as Record<string, unknown>) ?? {}

      const usePreview = ws['preview'] === true || String(ws['tool'] ?? '') === 'preview'
      const entry: Record<string, unknown> = {
        type: usePreview ? 'web_search_preview' : 'web_search'
      }

      if (Array.isArray(ws['allowed_domains']) && ws['allowed_domains'].length > 0) {
        entry['filters'] = { allowed_domains: ws['allowed_domains'].map(String) }
      }
      if (ws['user_location'] && typeof ws['user_location'] === 'object') {
        entry['user_location'] = ws['user_location']
      }
      if (usePreview && typeof ws['search_context_size'] === 'string') {
        entry['search_context_size'] = ws['search_context_size']
      }

      toolList.push(entry)
    }
  }

  return toolList
}

function buildResponsesReasoningConfig(params: {
  isReasoning: boolean
  effort: string
  summary: ResponsesReasoningSummary
}): Record<string, unknown> {
  const { isReasoning, effort, summary } = params
  if (!isReasoning || effort === 'off') return {}

  const reasoning: Record<string, unknown> = { summary }
  if (effort !== 'auto') {
    reasoning.effort = effort
  }

  if (Object.keys(reasoning).length === 0) return {}

  return { reasoning }
}

function buildResponsesTextConfig(verbosity: ResponsesTextVerbosity): Record<string, unknown> {
  return { text: { verbosity } }
}

function extractWebSearchCitations(json: Record<string, unknown>): ToolResultInfo[] {
  try {
    const response = json.response as Record<string, unknown> | undefined
    const output = response?.output as Array<Record<string, unknown>> | undefined
    if (!output) return []

    const items: Array<Record<string, unknown>> = []
    const seen = new Set<string>()
    let idx = 1

    for (const it of output) {
      if (it.type !== 'message') continue
      const content = it.content as Array<Record<string, unknown>> | undefined
      if (!content) continue

      for (const block of content) {
        const anns = block.annotations as Array<Record<string, unknown>> | undefined
        if (!anns) continue

        for (const an of anns) {
          if (an.type !== 'url_citation') continue
          const citUrl = String(an.url ?? '')
          if (!citUrl || seen.has(citUrl)) continue

          const title = String(an.title ?? '')
          items.push({ index: idx, url: citUrl, ...(title && { title }) })
          seen.add(citUrl)
          idx++
        }
      }
    }

    if (items.length === 0) return []
    return [{
      id: 'builtin_search',
      name: 'search_web',
      arguments: {},
      content: JSON.stringify({ items })
    }]
  } catch {
    return []
  }
}

function isResponsesWebSearchSupported(modelId: string): boolean {
  const m = modelId.toLowerCase()
  if (m.startsWith('gpt-4o')) return true
  if (m === 'gpt-4.1' || m === 'gpt-4.1-mini') return true
  if (m.startsWith('o4-mini')) return true
  if (m === 'o3' || m.startsWith('o3-')) return true
  if (m.startsWith('gpt-5')) return true
  return false
}

function checkModelIsReasoning(modelId: string): boolean {
  const m = modelId.toLowerCase()
  if (/^o[134]/.test(m)) return true
  if (m.startsWith('o3') || m.startsWith('o4')) return true
  // GPT-5 系列在 Responses API 下也可能返回 reasoning summary
  if (m.startsWith('gpt-5')) return true
  return false
}

// ========== Codex-Specific Helpers ==========

/**
 * Codex 思考配置（对齐 CPA codex_openai_request.go）
 * - 格式: { reasoning: { effort, summary } }
 * - effort 默认 "medium"（CPA: reasoning_effort 不存在时 fallback "medium"）
 * - summary 固定 "auto"
 */
function buildCodexReasoningConfig(effort: string): Record<string, unknown> {
  return {
    reasoning: {
      effort: effort === 'off' || effort === 'auto' ? 'medium' : effort,
      summary: 'auto'
    }
  }
}

/**
 * Codex: 将 instructions（system prompt）转为 developer role 消息插入 input 头部
 * CPA 的做法：system 消息不进 instructions 字段，而是作为 developer role 放在 input 中
 * instructions 字段保持空字符串
 */
function prependDeveloperMessage(
  input: Array<Record<string, unknown>>,
  instructions: string
): Array<Record<string, unknown>> {
  if (!instructions) return input
  return [
    {
      type: 'message',
      role: 'developer',
      content: [{ type: 'input_text', text: instructions }]
    },
    ...input
  ]
}
