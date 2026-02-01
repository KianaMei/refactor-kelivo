/**
 * Chat API Service
 * 统一的聊天 API 入口，根据 Provider 类型路由到相应的 Adapter
 */

import type { ProviderConfigV2 } from '../../shared/types'
import type {
  ChatStreamChunk,
  ChatMessage,
  ToolDefinition,
  OnToolCallFn
} from '../../shared/chatStream'
import { classifyProviderKind, isXAIEndpoint } from './helpers/chatApiHelper'
import * as openaiAdapter from './adapters/openai/openaiAdapter'
import * as claudeAdapter from './adapters/claudeAdapter'
import * as googleAdapter from './adapters/googleAdapter'

/** 发送流式消息的参数 */
export interface SendMessageStreamParams {
  /** Provider 配置 */
  config: ProviderConfigV2
  /** 模型 ID */
  modelId: string
  /** 消息列表 */
  messages: ChatMessage[]
  /** 用户附加的图片路径 */
  userImagePaths?: string[]
  /** 思考预算 (token 数或 effort level) */
  thinkingBudget?: number
  /** 温度 */
  temperature?: number
  /** Top P */
  topP?: number
  /** 最大输出 tokens */
  maxTokens?: number
  /** 最大工具调用轮数 */
  maxToolLoopIterations?: number
  /** 工具列表 */
  tools?: ToolDefinition[]
  /** 工具调用回调 */
  onToolCall?: OnToolCallFn
  /** 额外请求头 */
  extraHeaders?: Record<string, string>
  /** 额外请求体参数 */
  extraBody?: Record<string, unknown>
  /** 中止信号 */
  signal?: AbortSignal
}

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

  // 检查是否是 xAI 端点 (需要特殊处理)
  if (isXAIEndpoint(config)) {
    // xAI 使用 OpenAI 兼容 API (Chat Completions)
    yield* openaiAdapter.sendStream({
      config: { ...config, useResponseApi: false }, // xAI 不支持 Responses API
      modelId,
      ...rest
    })
    return
  }

  // 根据 provider 类型路由
  switch (kind) {
    case 'openai':
      // OpenAI 兼容 API (包括 OpenAI, Azure, 各种中转)
      // 根据 config.useResponseApi 自动选择 Chat Completions 或 Responses API
      yield* openaiAdapter.sendStream({
        config,
        modelId,
        ...rest
      })
      break

    case 'claude':
      // Anthropic Claude API
      yield* claudeAdapter.sendStream({
        config,
        modelId,
        ...rest
      })
      break

    case 'google':
      // Google Gemini / Vertex AI
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

  // 使用流式 API 收集完整响应
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
export { classifyProviderKind } from './helpers/chatApiHelper'
