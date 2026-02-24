/**
 * ChainOfThought 消息分块类型
 * 将 reasoning + tool 分组为统一的"思考块"
 */
import type { ToolCallData } from '../ToolCallItem'

// ─── 审批状态 ───

export type ToolApprovalState =
  | { type: 'auto' }
  | { type: 'pending' }
  | { type: 'approved' }
  | { type: 'denied'; reason?: string }

// ─── 推理数据 ───

export interface ReasoningData {
  text: string
  createdAt?: number
  finishedAt?: number
  geminiTitle?: string
}

/** 推理卡片 3 态 */
export type ReasoningCardState = 'collapsed' | 'preview' | 'expanded'

// ─── 思考步骤（ChainOfThought 内的单个步骤） ───

export type ThinkingStep =
  | { type: 'reasoning'; data: ReasoningData }
  | { type: 'tool'; data: ToolCallData; approvalState?: ToolApprovalState }

// ─── 消息分块（MessageBubble 渲染的顶层块） ───

export type MessagePartBlock =
  | { type: 'thinking'; steps: ThinkingStep[] }
  | { type: 'content'; text: string }
