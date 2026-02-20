export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessageInput {
  role: ChatRole
  content: string
  name?: string
  tool_call_id?: string
}
