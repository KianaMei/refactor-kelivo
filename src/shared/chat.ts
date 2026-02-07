import type { ChatStreamChunk } from './chatStream'

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessageInput {
  role: ChatRole
  content: string
  name?: string
  tool_call_id?: string
}

export interface ChatStreamStartParams {
  /**
   * 可选：由 renderer 预先生成的 streamId。
   * 这样可以避免“chunk/error 先到、invoke 返回后到”导致 renderer 丢事件，从而卡死 isGenerating。
   */
  streamId?: string

  providerId: string
  modelId: string
  messages: ChatMessageInput[]
  /** 思考预算 (token 数或 effort level) */
  thinkingBudget?: number
  temperature?: number
  topP?: number
  maxTokens?: number
  /** 最大工具调用轮数 */
  maxToolLoopIterations?: number
  /** 当前对话使用的 assistantId（用于工具调用等） */
  assistantId?: string | null
  /** 是否启用联网搜索工具（需要在设置中启用搜索） */
  enableSearchTool?: boolean
  /** 用户本次附加的图片路径（仅对最后一条 user 消息生效） */
  userImagePaths?: string[]
  /** 用户本次附加的文档（用于主进程提取文本并注入上下文） */
  documents?: Array<{
    path: string
    fileName: string
    mime: string
  }>
  stream?: boolean
  customHeaders?: Record<string, string>
  customBody?: Record<string, unknown>
}

export type { ChatStreamChunk }

export interface ChatStreamChunkEvent {
  streamId: string
  chunk: ChatStreamChunk
}

export interface ChatStreamErrorEvent {
  streamId: string
  message: string
}
