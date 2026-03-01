/**
 * Renderer-side Chat Service
 * 在 Renderer 进程中直接发起 AI HTTP 请求（通过 shared adapter）
 * 工具调用通过 IPC 委托给 Main 进程执行
 */

import { sendMessageStream } from '../../../shared/api/chatApiService'
import { sendPromptToolStream } from '../../../shared/api/adapters/promptToolAdapter'
import type { UserImage } from '../../../shared/api/chatApiService'
import type { ChatStreamChunk, ChatMessage, ToolDefinition, OnToolCallFn } from '../../../shared/chatStream'
import type { ProviderConfigV2, McpServerConfig, McpToolCallMode } from '../../../shared/types'
import type { ResponsesReasoningSummary, ResponsesTextVerbosity } from '../../../shared/responsesOptions'

// ========== Tool Definitions ==========

const SEARCH_TOOL_DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Search the web for information. Use this when you need up-to-date information or facts you are not certain about.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' }
      },
      required: ['query']
    }
  }
}

const MEMORY_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_memory',
      description: 'create a memory record',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The content of the memory record' }
        },
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_memory',
      description: 'update a memory record',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'The id of the memory record' },
          content: { type: 'string', description: 'The content of the memory record' }
        },
        required: ['id', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_memory',
      description: 'delete a memory record',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'The id of the memory record' }
        },
        required: ['id']
      }
    }
  }
]

type McpToolSummary = {
  name: string
  description?: string
  schema?: Record<string, unknown>
}

type McpRuntimeTool = {
  serverId: string
  remoteToolName: string
}

type PreparedMcpTools = {
  nativeTools: ToolDefinition[]
  runtimeTools: Map<string, McpRuntimeTool>
}

// ========== Helpers ==========

function modelSupportsTools(
  modelId: string,
  modelOverrides?: Record<string, unknown>
): boolean {
  const id = (modelId ?? '').toLowerCase()
  if (id.includes('embed') || id.includes('embedding') || id.includes('text-embedding') || id.includes('ada')) {
    return false
  }

  // modelOverrides 优先：用户可通过 abilities 显式控制
  const ov = (modelOverrides ?? {})[modelId] as { abilities?: unknown } | undefined
  const abilities = (ov?.abilities as unknown[] | undefined) ?? undefined
  if (Array.isArray(abilities)) {
    if (abilities.some((x) => String(x).toLowerCase() === 'no-tool')) return false
    if (abilities.some((x) => String(x).toLowerCase() === 'tool')) return true
  }

  // Fallback：按模型名称模式匹配（已知支持 function calling 的系列）
  return (
    id.includes('gpt-4') ||
    id.includes('gpt-5') ||
    id.includes('gpt-3.5') ||
    /^o[134]/.test(id) ||
    id.includes('claude') ||
    id.includes('gemini') ||
    id.includes('qwen') ||
    id.includes('glm') ||
    id.includes('deepseek') ||
    id.includes('mistral') ||
    id.includes('llama') ||
    id.includes('grok') ||
    id.includes('kimi') ||
    id.includes('moonshot')
  )
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatSearchResultsXml(data: {
  answer?: string
  items: Array<{ title: string; url: string; text: string }>
}): string {
  const lines: string[] = ['<search_results>']
  if (data.answer) {
    lines.push(`  <answer>${escapeXml(data.answer)}</answer>`)
  }
  data.items.forEach((item, i) => {
    lines.push(`  <result index="${i + 1}">`)
    lines.push(`    <title>${escapeXml(item.title)}</title>`)
    lines.push(`    <url>${escapeXml(item.url)}</url>`)
    lines.push(`    <snippet>${escapeXml(item.text)}</snippet>`)
    lines.push('  </result>')
  })
  lines.push('</search_results>')
  return lines.join('\n')
}

function sanitizeToolNamePart(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'tool'
}

function buildMcpNativeToolName(serverId: string, toolName: string, usedNames: Set<string>): string {
  const base = `mcp_${sanitizeToolNamePart(serverId)}_${sanitizeToolNamePart(toolName)}`
  const maxLength = 64

  let candidate = base.slice(0, maxLength)
  let counter = 2
  while (usedNames.has(candidate)) {
    const suffix = `_${counter++}`
    candidate = `${base.slice(0, Math.max(1, maxLength - suffix.length))}${suffix}`
  }
  usedNames.add(candidate)
  return candidate
}

function normalizeToolParameters(schema?: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { type: 'object', properties: {} }
  }
  return schema
}

function resolveEnabledMcpToolNames(server: McpServerConfig): Set<string> | null {
  const localTools = server.tools ?? []
  if (localTools.length === 0) return null

  const enabled = new Set(localTools.filter((t) => t.enabled).map((t) => t.name))
  return enabled
}

async function prepareMcpTools(params: {
  serverIds?: string[]
  mcpServers?: McpServerConfig[]
}): Promise<PreparedMcpTools> {
  const serverIds = Array.from(new Set((params.serverIds ?? []).filter((id) => typeof id === 'string' && id.trim())))
  if (serverIds.length === 0) {
    return { nativeTools: [], runtimeTools: new Map<string, McpRuntimeTool>() }
  }

  const serverMap = new Map((params.mcpServers ?? []).map((s) => [s.id, s] as const))
  const runtimeTools = new Map<string, McpRuntimeTool>()
  const nativeTools: ToolDefinition[] = []
  const usedNames = new Set<string>()

  for (const serverId of serverIds) {
    const server = serverMap.get(serverId)
    if (!server || !server.enabled) continue

    let remoteTools: McpToolSummary[] = []
    try {
      const listed = await window.api.mcp.listTools(serverId)
      if (!listed.success) {
        console.warn(`[chatService] MCP listTools failed for ${serverId}: ${listed.error}`)
        continue
      }
      remoteTools = listed.tools
    } catch (error) {
      console.warn(`[chatService] MCP listTools exception for ${serverId}`, error)
      continue
    }

    const enabledToolNames = resolveEnabledMcpToolNames(server)
    const filteredTools = enabledToolNames
      ? remoteTools.filter((tool) => enabledToolNames.has(tool.name))
      : remoteTools

    for (const tool of filteredTools) {
      const nativeName = buildMcpNativeToolName(serverId, tool.name, usedNames)
      nativeTools.push({
        type: 'function',
        function: {
          name: nativeName,
          description: tool.description
            ? `[MCP:${server.name || serverId}/${tool.name}] ${tool.description}`
            : `[MCP:${server.name || serverId}/${tool.name}]`,
          parameters: normalizeToolParameters(tool.schema)
        }
      })
      runtimeTools.set(nativeName, {
        serverId,
        remoteToolName: tool.name
      })
    }
  }

  return {
    nativeTools,
    runtimeTools
  }
}

// ========== Tool Call Handler ==========

function buildToolCallHandler(params: {
  enableSearch: boolean
  searchServiceId?: string | null
  assistantId?: string | null
  mcpRuntimeTools?: Map<string, McpRuntimeTool>
}): OnToolCallFn {
  const { enableSearch, searchServiceId, assistantId, mcpRuntimeTools } = params

  return async (name: string, args: Record<string, unknown>): Promise<string> => {
    try {
      if (name === 'web_search') {
        if (!enableSearch) return 'Error: web search is disabled'
        const query = String(args.query ?? '').trim()
        if (!query) return 'Error: query is required'

        const result = await window.api.search.execute({
          query,
          serviceId: searchServiceId ?? undefined
        })
        if (!result.success || !result.data) {
          return `Error: ${result.error ?? 'search failed'}`
        }
        return formatSearchResultsXml(result.data)
      }

      const mcpRuntime = mcpRuntimeTools?.get(name)
      if (mcpRuntime) {
        const result = await window.api.mcp.callTool({
          serverId: mcpRuntime.serverId,
          toolName: mcpRuntime.remoteToolName,
          arguments: args
        })
        if (!result.success) return `Error: ${result.error}`
        if (result.isError) {
          return `Error: MCP ${mcpRuntime.remoteToolName} failed: ${result.content}`
        }
        return result.content
      }

      if (assistantId) {
        if (name === 'create_memory') {
          const content = String(args.content ?? '').trim()
          if (!content) return 'Error: Content is required'
          await window.api.db.memories.create({ assistantId, content })
          return content
        }
        if (name === 'edit_memory') {
          const id = Number(args.id)
          const content = String(args.content ?? '').trim()
          if (!Number.isInteger(id) || id <= 0) return 'Error: Valid id is required'
          if (!content) return 'Error: Content is required'
          const updated = await window.api.db.memories.update(id, content)
          if (!updated) return `Error: Memory with id ${id} not found`
          return content
        }
        if (name === 'delete_memory') {
          const id = Number(args.id)
          if (!Number.isInteger(id) || id <= 0) return 'Error: Valid id is required'
          await window.api.db.memories.delete(id)
          return 'deleted'
        }
      }

      return `Error: unknown tool: ${name}`
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  }
}

// ========== Public API ==========

export interface RendererStreamParams {
  config: ProviderConfigV2
  modelId: string
  messages: ChatMessage[]
  userImages?: UserImage[]
  assistantId?: string | null
  enableSearchTool?: boolean
  searchServiceId?: string | null
  enableMemory?: boolean
  mcpServerIds?: string[]
  mcpServers?: McpServerConfig[]
  mcpToolCallMode?: McpToolCallMode
  thinkingBudget?: number
  responsesReasoningSummary?: ResponsesReasoningSummary
  responsesTextVerbosity?: ResponsesTextVerbosity
  temperature?: number
  topP?: number
  maxTokens?: number
  maxToolLoopIterations?: number
  customHeaders?: Record<string, string>
  customBody?: Record<string, unknown>
  signal?: AbortSignal
}

/**
 * 在 Renderer 进程中直接发起 AI 流式请求
 * 返回 AsyncGenerator<ChatStreamChunk>，由调用方消费
 */
export async function* rendererSendMessageStream(
  params: RendererStreamParams
): AsyncGenerator<ChatStreamChunk> {
  const {
    config,
    modelId,
    messages,
    userImages,
    assistantId,
    enableSearchTool,
    searchServiceId,
    enableMemory,
    mcpServerIds,
    mcpServers,
    mcpToolCallMode,
    thinkingBudget,
    responsesReasoningSummary,
    responsesTextVerbosity,
    temperature,
    topP,
    maxTokens,
    maxToolLoopIterations,
    customHeaders,
    customBody,
    signal
  } = params

  const tools: ToolDefinition[] = []
  let mcpRuntimeTools = new Map<string, McpRuntimeTool>()
  const isPromptMode = mcpToolCallMode === 'prompt'
  const supportsTools = modelSupportsTools(
    modelId,
    config.modelOverrides as Record<string, unknown> | undefined
  )

  if (
    mcpServerIds &&
    mcpServerIds.length > 0 &&
    (supportsTools || mcpToolCallMode === 'prompt')
  ) {
    const preparedMcp = await prepareMcpTools({
      serverIds: mcpServerIds,
      mcpServers
    })
    if (preparedMcp.nativeTools.length > 0) {
      tools.push(...preparedMcp.nativeTools)
      mcpRuntimeTools = preparedMcp.runtimeTools
    }
  }

  if ((supportsTools || isPromptMode) && enableSearchTool) {
    tools.push(SEARCH_TOOL_DEFINITION)
  }
  if ((supportsTools || isPromptMode) && enableMemory) {
    tools.push(...MEMORY_TOOL_DEFINITIONS)
  }

  const onToolCall =
    tools.length > 0
      ? buildToolCallHandler({
          enableSearch: enableSearchTool === true,
          searchServiceId,
          assistantId,
          mcpRuntimeTools
        })
      : undefined

  // Prompt 模式：通过 XML 提示词注入 + 流式解析实现工具调用
  if (isPromptMode && tools.length > 0 && onToolCall) {
    yield* sendPromptToolStream({
      config,
      modelId,
      messages,
      userImages,
      thinkingBudget,
      temperature,
      topP,
      maxTokens,
      maxToolLoopIterations,
      tools,
      onToolCall,
      extraHeaders: customHeaders,
      extraBody: customBody,
      signal
    })
    return
  }

  // Native 模式：通过原生 function calling 实现工具调用
  yield* sendMessageStream({
    config,
    modelId,
    messages,
    userImages,
    thinkingBudget,
    responsesReasoningSummary,
    responsesTextVerbosity,
    temperature,
    topP,
    maxTokens,
    maxToolLoopIterations,
    tools: tools.length > 0 ? tools : undefined,
    onToolCall,
    extraHeaders: customHeaders,
    extraBody: customBody,
    signal
  })
}

export type { ChatStreamChunk, ChatMessage, UserImage }
