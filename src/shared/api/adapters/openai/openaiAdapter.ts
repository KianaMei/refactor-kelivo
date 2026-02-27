/**
 * OpenAI Provider Adapter - Unified Entry Point (shared)
 * 根据配置路由到 Chat Completions API 或 Responses API
 * 零 Node.js 依赖
 */

import type { ProviderConfigV2 } from '../../../types'
import type {
  ChatStreamChunk,
  ChatMessage,
  ToolDefinition,
  OnToolCallFn
} from '../../../chatStream'
import type { UserImage } from '../../chatApiService'
import type { ResponsesReasoningSummary, ResponsesTextVerbosity } from '../../../responsesOptions'
import * as openaiChatCompletions from './openaiChatCompletions'
import * as openaiResponsesApi from './openaiResponsesApi'

/** 发送流式请求的参数 */
export interface SendStreamParams {
  config: ProviderConfigV2
  modelId: string
  messages: ChatMessage[]
  userImages?: UserImage[]
  thinkingBudget?: number
  responsesReasoningSummary?: ResponsesReasoningSummary
  responsesTextVerbosity?: ResponsesTextVerbosity
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
    yield* openaiResponsesApi.sendStream(params)
  } else {
    yield* openaiChatCompletions.sendStream(params)
  }
}
