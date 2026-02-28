/**
 * Chat API Service (shared)
 * 统一的聊天 API 入口，根据 Provider 类型路由到相应的 Adapter
 * 零 Node.js 依赖，可在 Renderer 进程直接使用
 */

import type { ProviderConfigV2 } from '../types'
import type {
  ChatStreamChunk,
  ChatMessage,
  ToolDefinition,
  OnToolCallFn
} from '../chatStream'
import { builtInTools, classifyProviderKind, isXAIEndpoint } from '../chatApiHelper'
import * as openaiAdapter from './adapters/openai/openaiAdapter'
import * as claudeAdapter from './adapters/claudeAdapter'
import * as googleAdapter from './adapters/googleAdapter'
import type { SendStreamParams, UserImage } from './adapterParams'

/** 发送流式消息的参数（SendStreamParams 的别名，保持向后兼容） */
export type SendMessageStreamParams = SendStreamParams
export type { UserImage }

/**
 * 发送流式聊天消息
 * 根据 provider 类型自动路由到相应的 adapter
 */
export async function* sendMessageStream(
  params: SendMessageStreamParams
): AsyncGenerator<ChatStreamChunk> {
  const { config, modelId, ...rest } = params

  // 确定 provider 类型
  const kind = classifyProviderKind(config.id, config.providerType)

  // 检查是否是 xAI 端点（优先对齐 xAI Agent Tools 新方案）
  if (isXAIEndpoint(config)) {
    // 当模型启用了内置 search 工具时，强制走 Responses API（tools: web_search）
    const builtIns = builtInTools(config, modelId)
    const shouldUseResponsesApi = config.useResponseApi === true || builtIns.has('search')

    yield* openaiAdapter.sendStream({
      config: { ...config, useResponseApi: shouldUseResponsesApi },
      modelId,
      ...rest
    })
    return
  }

  // 根据 provider 类型路由
  switch (kind) {
    case 'openai':
      yield* openaiAdapter.sendStream({
        config,
        modelId,
        ...rest
      })
      break

    case 'claude':
      yield* claudeAdapter.sendStream({
        config,
        modelId,
        ...rest
      })
      break

    case 'google':
      yield* googleAdapter.sendStream({
        config,
        modelId,
        ...rest
      })
      break

    default:
      throw new Error(`Unknown provider kind: ${kind}`)
  }
}

/**
 * 非流式文本生成 (用于标题摘要等)
 */
export async function generateText(params: {
  config: ProviderConfigV2
  modelId: string
  prompt: string
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
}): Promise<string> {
  const { config, modelId, prompt, extraHeaders, extraBody } = params

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }]

  let result = ''
  for await (const chunk of sendMessageStream({
    config,
    modelId,
    messages,
    temperature: 0.3,
    maxTokens: 512,
    extraHeaders,
    extraBody
  })) {
    result += chunk.content
    if (chunk.isDone) break
  }

  return result
}

// Re-export types and utilities
export type { ChatStreamChunk, ChatMessage, ToolDefinition, OnToolCallFn }
export { classifyProviderKind } from '../chatApiHelper'
