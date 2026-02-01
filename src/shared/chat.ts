export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessageInput {
  role: ChatRole
  content: string
  name?: string
  tool_call_id?: string
}

export interface ChatStreamStartParams {
  providerId: string
  modelId: string
  messages: ChatMessageInput[]
  temperature?: number
  topP?: number
  maxTokens?: number
}

export interface ChatStreamChunk {
  content: string
  isDone: boolean
}

export interface ChatStreamChunkEvent {
  streamId: string
  chunk: ChatStreamChunk
}

export interface ChatStreamErrorEvent {
  streamId: string
  message: string
}

