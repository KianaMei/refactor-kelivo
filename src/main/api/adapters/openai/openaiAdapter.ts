/**
 * OpenAI Provider Adapter - Unified Entry Point
 * 根据配置路由到 Chat Completions API 或 Responses API
 */

import type { ProviderConfigV2 } from '../../../../shared/types'
import type {
  ChatStreamChunk,
  ChatMessage,
  ToolDefinition,
  OnToolCallFn
} from '../../../../shared/chatStream'
import * as openaiChatCompletions from './openaiChatCompletions'
import * as openaiResponsesApi from './openaiResponsesApi'

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
 * 发送流式请求到 OpenAI 兼容 API
 * 根据 config.useResponseApi 路由到 Responses API 或 Chat Completions
 */
export async function* sendStream(params: SendStreamParams): AsyncGenerator<ChatStreamChunk> {
  const { config } = params

  if (config.useResponseApi === true) {
    // 使用 OpenAI Responses API
    yield* openaiResponsesApi.sendStream(params)
  } else {
    // 使用标准 Chat Completions API
    yield* openaiChatCompletions.sendStream(params)
  }
}
