/**
 * Database types — shared between main (repo/IPC) and renderer (API calls).
 *
 * DB rows use snake_case + INTEGER booleans.
 * These TS interfaces use camelCase + native booleans.
 * Repos handle the conversion.
 */

import type { TokenUsage } from './chatStream'
export type { TokenUsage }

// ── Conversation ─────────────────────────────────────────────

export interface DbConversation {
  id: string
  title: string
  workspaceId: string | null
  assistantId: string | null
  isPinned: boolean
  mcpServerIds: string[] | null
  truncateIndex: number
  versionSelections: Record<string, number> | null
  thinkingBudget: number | null
  summary: string | null
  lastSummarizedMessageCount: number
  createdAt: number
  updatedAt: number
}

export interface ConversationCreateInput {
  id: string
  title?: string
  workspaceId?: string | null
  assistantId?: string | null
  isPinned?: boolean
}

export interface ConversationUpdateInput {
  title?: string
  workspaceId?: string | null
  assistantId?: string | null
  isPinned?: boolean
  mcpServerIds?: string[] | null
  truncateIndex?: number
  versionSelections?: Record<string, number> | null
  thinkingBudget?: number | null
  summary?: string | null
  lastSummarizedMessageCount?: number
}

export interface ConversationListParams {
  workspaceId?: string | null
  limit?: number
  offset?: number
  search?: string
}

export interface ConversationListResult {
  items: DbConversation[]
  total: number
}

// ── Message ──────────────────────────────────────────────────

export interface DbMessage {
  id: string
  conversationId: string
  role: string
  content: string
  modelId: string | null
  providerId: string | null
  sortOrder: number
  groupId: string | null
  version: number
  totalTokens: number | null
  tokenUsage: TokenUsage | null
  isStreaming: boolean
  reasoningText: string | null
  reasoningSignature: string | null
  reasoningStartedAt: number | null
  reasoningFinishedAt: number | null
  reasoningSegments: unknown[] | null
  toolCalls: unknown | null
  translation: string | null
  translationExpanded: boolean
  createdAt: number
}


export interface MessageCreateInput {
  id: string
  conversationId: string
  role: string
  content?: string
  modelId?: string | null
  providerId?: string | null
  sortOrder: number
  groupId?: string | null
  version?: number
  isStreaming?: boolean
}

export interface MessageUpdateInput {
  content?: string
  modelId?: string | null
  providerId?: string | null
  groupId?: string | null
  version?: number
  totalTokens?: number | null
  tokenUsage?: TokenUsage | null
  isStreaming?: boolean
  reasoningText?: string | null
  reasoningSignature?: string | null
  reasoningStartedAt?: number | null
  reasoningFinishedAt?: number | null
  reasoningSegments?: unknown[] | null
  toolCalls?: unknown | null
  translation?: string | null
  translationExpanded?: boolean
}

export interface MessageSearchResult {
  message: DbMessage
  conversationTitle: string
}

// ── Workspace ────────────────────────────────────────────────

export interface DbWorkspace {
  id: string
  name: string
  icon: string | null
  parentId: string | null
  defaultAssistantId: string | null
  lastConversationId: string | null
  description: string | null
  variables: Record<string, string> | null
  sortIndex: number
  createdAt: number
  updatedAt: number
}

export interface WorkspaceCreateInput {
  id: string
  name: string
  icon?: string | null
  parentId?: string | null
  defaultAssistantId?: string | null
  description?: string | null
  sortIndex?: number
}

export interface WorkspaceUpdateInput {
  name?: string
  icon?: string | null
  parentId?: string | null
  defaultAssistantId?: string | null
  lastConversationId?: string | null
  description?: string | null
  variables?: Record<string, string> | null
  sortIndex?: number
}

// ── Memory ──────────────────────────────────────────────────

export interface DbMemory {
  id: number
  assistantId: string
  content: string
  createdAt: number
}

export interface MemoryCreateInput {
  assistantId: string
  content: string
}

// ── Agent Session ───────────────────────────────────────────

export interface DbAgentSession {
  id: string
  agentId: string
  name: string
  sdkProvider: 'claude' | 'codex'
  apiProviderId: string | null
  sdkSessionId: string | null
  workingDirectory: string | null
  modelId: string | null
  permissionMode: string | null
  sandboxMode: string | null
  approvalPolicy: string | null
  status: string
  lastError: string | null
  totalTokens: number
  createdAt: number
  updatedAt: number
}

export interface AgentSessionCreateInput {
  id: string
  agentId: string
  name?: string
  sdkProvider?: 'claude' | 'codex'
  apiProviderId?: string | null
  sdkSessionId?: string | null
  workingDirectory?: string | null
  modelId?: string | null
  permissionMode?: string | null
  sandboxMode?: string | null
  approvalPolicy?: string | null
  status?: string
}

export interface AgentSessionUpdateInput {
  name?: string
  sdkProvider?: 'claude' | 'codex'
  apiProviderId?: string | null
  sdkSessionId?: string | null
  workingDirectory?: string | null
  modelId?: string | null
  permissionMode?: string | null
  sandboxMode?: string | null
  approvalPolicy?: string | null
  status?: string
  lastError?: string | null
  totalTokens?: number
}

// ── Agent Message ───────────────────────────────────────────

export interface DbAgentMessage {
  id: string
  sessionId: string
  type: string
  content: string
  toolName: string | null
  toolInput: string | null
  toolInputPreview: string | null
  toolResult: string | null
  toolStatus: string | null
  relatedToolCallId: string | null
  isStreaming: boolean
  modelId: string | null
  sortOrder: number
  createdAt: number
}

export interface AgentMessageCreateInput {
  id: string
  sessionId: string
  type: string
  content?: string
  toolName?: string | null
  toolInput?: string | null
  toolInputPreview?: string | null
  toolResult?: string | null
  toolStatus?: string | null
  relatedToolCallId?: string | null
  isStreaming?: boolean
  modelId?: string | null
  sortOrder: number
}

export interface AgentMessageUpdateInput {
  content?: string
  toolResult?: string | null
  toolStatus?: string | null
  isStreaming?: boolean
}
