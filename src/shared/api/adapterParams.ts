/**
 * Adapter 公共参数类型 (shared)
 * 所有 Provider Adapter 的 sendStream 参数基础定义
 * 独立文件避免 chatApiService ↔ adapter 循环依赖
 */

import type { ProviderConfigV2 } from '../types'
import type { ResponsesReasoningSummary, ResponsesTextVerbosity } from '../responsesOptions'
import type {
  ChatMessage,
  ToolDefinition,
  OnToolCallFn
} from '../chatStream'

/** 预编码的用户图片 */
export interface UserImage {
  /** MIME 类型，如 image/png */
  mime: string
  /** 原始 base64 数据（不含 data: 前缀） */
  base64: string
}

/** 发送流式消息的公共参数 */
export interface SendStreamParams {
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
