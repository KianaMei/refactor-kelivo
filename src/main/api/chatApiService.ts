/**
 * Chat API Service (main)
 * 薄包装层：将 userImagePaths 转换为 userImages，委托给 shared
 */

import type { ProviderConfigV2 } from '../../shared/types'
import type { ResponsesReasoningSummary, ResponsesTextVerbosity } from '../../shared/responsesOptions'
import type {
  ChatStreamChunk,
  ChatMessage,
  ToolDefinition,
  OnToolCallFn
} from '../../shared/chatStream'
import {
  sendMessageStream as sharedSendMessageStream,
  type UserImage
} from '../../shared/api/chatApiService'
import { encodeBase64File } from './helpers/chatApiHelper'
import { mimeFromPath } from '../../shared/chatApiHelper'

/** 发送流式消息的参数（保持 userImagePaths 接口不变） */
export interface SendMessageStreamParams {
  config: ProviderConfigV2
  modelId: string
  messages: ChatMessage[]
  userImagePaths?: string[]
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

async function resolveImagePath(filePath: string): Promise<{ mime: string; base64: string }> {
  return { mime: mimeFromPath(filePath), base64: await encodeBase64File(filePath, false) }
}

/**
 * 发送流式聊天消息
 * 将文件路径转为预编码图片后委托给 shared
 */
export async function* sendMessageStream(
  params: SendMessageStreamParams
): AsyncGenerator<ChatStreamChunk> {
  const { userImagePaths, ...rest } = params

  let userImages: UserImage[] | undefined
  if (userImagePaths?.length) {
    userImages = await Promise.all(
      userImagePaths.map(async (p) => ({
        mime: mimeFromPath(p),
        base64: await encodeBase64File(p, false)
      }))
    )
  }

  yield* sharedSendMessageStream({ ...rest, userImages, resolveImagePath })
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
export { classifyProviderKind } from './helpers/chatApiHelper'
