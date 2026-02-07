/**
 * Chat Stream Types
 * 定义 AI 聊天流式响应的核心数据结构
 */

/** Token 使用统计 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  cachedTokens?: number
  thoughtTokens?: number
  totalTokens: number
}

/** Tool 调用信息 */
export interface ToolCallInfo {
  id: string
  name: string
  arguments: Record<string, unknown>
}

/** Tool 执行结果信息 */
export interface ToolResultInfo {
  id: string
  name: string
  arguments: Record<string, unknown>
  content: string
}

/** 流式响应的单个 chunk */
export interface ChatStreamChunk {
  /** 文本内容增量 */
  content: string
  /** 推理/思考内容增量 (Claude extended thinking, DeepSeek R1, etc.) */
  reasoning?: string
  /** 是否为最后一个 chunk */
  isDone: boolean
  /** 累计 token 数 (近似或精确) */
  totalTokens: number
  /** 详细 token 统计 */
  usage?: TokenUsage
  /** 当前 chunk 包含的 tool 调用请求 */
  toolCalls?: ToolCallInfo[]
  /** 当前 chunk 包含的 tool 执行结果 */
  toolResults?: ToolResultInfo[]
  /** 错误信息 */
  error?: string
}

/** 创建空的 TokenUsage */
export function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
}

/** 合并两个 TokenUsage */
export function mergeUsage(a: TokenUsage | undefined, b: TokenUsage): TokenUsage {
  if (!a) return b
  return {
    promptTokens: Math.max(a.promptTokens, b.promptTokens),
    completionTokens: a.completionTokens + b.completionTokens,
    cachedTokens: (a.cachedTokens ?? 0) + (b.cachedTokens ?? 0),
    totalTokens: Math.max(a.promptTokens, b.promptTokens) + a.completionTokens + b.completionTokens
  }
}

/** 聊天消息格式 (OpenAI 风格) */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ChatMessagePart[]
  name?: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
}

/** 多模态消息部分 */
export type ChatMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** 工具定义 (OpenAI 风格) */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

/** 流式请求参数 */
export interface ChatStreamParams {
  providerId: string
  modelId: string
  messages: ChatMessage[]
  /** 用户附加的图片路径 */
  userImagePaths?: string[]
  /** 思考预算 (token 数或 effort level) */
  thinkingBudget?: number
  temperature?: number
  topP?: number
  maxTokens?: number
  /** 工具列表 */
  tools?: ToolDefinition[]
  /** 额外请求头 */
  extraHeaders?: Record<string, string>
  /** 额外请求体参数 */
  extraBody?: Record<string, unknown>
  /** 最大工具调用轮数 */
  maxToolLoopIterations?: number
}

/** Tool 调用回调函数类型 */
export type OnToolCallFn = (name: string, args: Record<string, unknown>) => Promise<string>
