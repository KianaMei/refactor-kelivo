/**
 * Chat API Service (shared)
 * 统一的聊天 API 入口，根据 Provider 类型路由到相应的 Adapter
 * 零 Node.js 依赖，可在 Renderer 进程直接使用
 */

import type { ProviderConfigV2 } from '../types'
import type { ResponsesReasoningSummary, ResponsesTextVerbosity } from '../responsesOptions'
import type {
  ChatStreamChunk,
  ChatMessage,
  ToolDefinition,
  OnToolCallFn
} from '../chatStream'
import { classifyProviderKind, isXAIEndpoint } from '../chatApiHelper'
import * as openaiAdapter from './adapters/openai/openaiAdapter'
import * as claudeAdapter from './adapters/claudeAdapter'
import * as googleAdapter from './adapters/googleAdapter'

/** 预编码的用户图片 */
export interface UserImage {
  /** MIME 类型，如 image/png */
  mime: string
  /** 原始 base64 数据（不含 data: 前缀） */
  base64: string
}

/** 发送流式消息的参数 */
export interface SendMessageStreamParams {
  /** Provider 配置 */
  config: ProviderConfigV2
  /** 模型 ID */
  modelId: string
  /** 消息列表 */
  messages: ChatMessage[]
  /** 用户附加的图片（预编码） */
  userImages?: UserImage[]
  /** 思考预算 (token 数或 effort level) */
  thinkingBudget?: number
  /** Responses API: reasoning.summary */
  responsesReasoningSummary?: ResponsesReasoningSummary
  /** Responses API: text.verbosity */
  responsesTextVerbosity?: ResponsesTextVerbosity
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
  /** 解析本地图片路径为 base64（仅 Main 进程提供） */
  resolveImagePath?: (filePath: string) => Promise<{ mime: string; base64: string }>
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
