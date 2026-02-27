import { getDb } from '../database'
import type {
  DbConversation,
  ConversationCreateInput,
  ConversationUpdateInput,
  ConversationListParams,
  ConversationListResult
} from '../../../shared/db-types'
import {
  normalizeResponsesReasoningSummary,
  normalizeResponsesTextVerbosity
} from '../../../shared/responsesOptions'

// ── Row ↔ TS conversion ────────────────────────────────────

interface ConversationRow {
  id: string
  title: string
  workspace_id: string | null
  assistant_id: string | null
  is_pinned: number
  mcp_server_ids: string | null
  truncate_index: number
  version_selections: string | null
  thinking_budget: number | null
  responses_reasoning_summary: string | null
  responses_text_verbosity: string | null
  summary: string | null
  last_summarized_message_count: number
  created_at: number
  updated_at: number
}

function rowToConversation(row: ConversationRow): DbConversation {
  return {
    id: row.id,
    title: row.title,
    workspaceId: row.workspace_id,
    assistantId: row.assistant_id,
    isPinned: row.is_pinned === 1,
    mcpServerIds: row.mcp_server_ids ? JSON.parse(row.mcp_server_ids) : null,
    truncateIndex: row.truncate_index,
    versionSelections: row.version_selections ? JSON.parse(row.version_selections) : null,
    thinkingBudget: row.thinking_budget,
    responsesReasoningSummary: normalizeResponsesReasoningSummary(row.responses_reasoning_summary),
    responsesTextVerbosity: normalizeResponsesTextVerbosity(row.responses_text_verbosity),
    summary: row.summary,
    lastSummarizedMessageCount: row.last_summarized_message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// ── CRUD ────────────────────────────────────────────────────

export function listConversations(params: ConversationListParams = {}): ConversationListResult {
  const db = getDb()
  const { workspaceId, limit = 200, offset = 0, search } = params

  const conditions: string[] = []
  const args: unknown[] = []

  if (workspaceId !== undefined) {
    if (workspaceId === null) {
      conditions.push('workspace_id IS NULL')
    } else {
      conditions.push('workspace_id = ?')
      args.push(workspaceId)
    }
  }

  if (search) {
    conditions.push('title LIKE ?')
    args.push(`%${search}%`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const total = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM conversations ${where}`).get(...args) as { cnt: number }
  ).cnt

  const rows = db
    .prepare(
      `SELECT * FROM conversations ${where} ORDER BY is_pinned DESC, updated_at DESC LIMIT ? OFFSET ?`
    )
    .all(...args, limit, offset) as ConversationRow[]

  return { items: rows.map(rowToConversation), total }
}

export function getConversation(id: string): DbConversation | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined
  return row ? rowToConversation(row) : null
}

export function createConversation(input: ConversationCreateInput): DbConversation {
  const db = getDb()
  const now = Date.now()
  db.prepare(
    `INSERT INTO conversations (id, title, workspace_id, assistant_id, is_pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.title ?? '',
    input.workspaceId ?? null,
    input.assistantId ?? null,
    input.isPinned ? 1 : 0,
    now,
    now
  )
  return getConversation(input.id)!
}

export function updateConversation(id: string, input: ConversationUpdateInput): DbConversation | null {
  const db = getDb()
  const sets: string[] = []
  const args: unknown[] = []

  if (input.title !== undefined) { sets.push('title = ?'); args.push(input.title) }
  if (input.workspaceId !== undefined) { sets.push('workspace_id = ?'); args.push(input.workspaceId) }
  if (input.assistantId !== undefined) { sets.push('assistant_id = ?'); args.push(input.assistantId) }
  if (input.isPinned !== undefined) { sets.push('is_pinned = ?'); args.push(input.isPinned ? 1 : 0) }
  if (input.mcpServerIds !== undefined) {
    sets.push('mcp_server_ids = ?')
    args.push(input.mcpServerIds ? JSON.stringify(input.mcpServerIds) : null)
  }
  if (input.truncateIndex !== undefined) { sets.push('truncate_index = ?'); args.push(input.truncateIndex) }
  if (input.versionSelections !== undefined) {
    sets.push('version_selections = ?')
    args.push(input.versionSelections ? JSON.stringify(input.versionSelections) : null)
  }
  if (input.thinkingBudget !== undefined) { sets.push('thinking_budget = ?'); args.push(input.thinkingBudget) }
  if (input.responsesReasoningSummary !== undefined) {
    sets.push('responses_reasoning_summary = ?')
    args.push(input.responsesReasoningSummary)
  }
  if (input.responsesTextVerbosity !== undefined) {
    sets.push('responses_text_verbosity = ?')
    args.push(input.responsesTextVerbosity)
  }
  if (input.summary !== undefined) { sets.push('summary = ?'); args.push(input.summary) }
  if (input.lastSummarizedMessageCount !== undefined) {
    sets.push('last_summarized_message_count = ?')
    args.push(input.lastSummarizedMessageCount)
  }

  if (sets.length === 0) return getConversation(id)

  sets.push('updated_at = ?')
  args.push(Date.now())
  args.push(id)

  db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...args)
  return getConversation(id)
}

export function deleteConversation(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

export function searchConversations(query: string, workspaceId?: string | null): DbConversation[] {
  const db = getDb()
  const conditions = ['title LIKE ?']
  const args: unknown[] = [`%${query}%`]

  if (workspaceId !== undefined) {
    if (workspaceId === null) {
      conditions.push('workspace_id IS NULL')
    } else {
      conditions.push('workspace_id = ?')
      args.push(workspaceId)
    }
  }

  const where = `WHERE ${conditions.join(' AND ')}`
  const rows = db
    .prepare(`SELECT * FROM conversations ${where} ORDER BY updated_at DESC LIMIT 50`)
    .all(...args) as ConversationRow[]

  return rows.map(rowToConversation)
}

export function getConversationMessageCount(conversationId: string): number {
  const db = getDb()
  const row = db
    .prepare('SELECT COUNT(*) AS cnt FROM messages WHERE conversation_id = ?')
    .get(conversationId) as { cnt: number }
  return row.cnt
}

/**
 * 统计“会话消息数”（对齐 Flutter 侧边栏 ChatTile 的 CountBadge）
 * - 以 groupId 折叠版本：每个 group 只计最后一个版本（max version）
 * - 仅统计 assistant 角色
 */
export function getConversationAssistantMessageCount(conversationId: string): number {
  const db = getDb()

  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS cnt
      FROM (
        SELECT COALESCE(group_id, id) AS gid, MAX(version) AS maxv
        FROM messages
        WHERE conversation_id = ?
        GROUP BY gid
      ) g
      JOIN messages m
        ON m.conversation_id = ?
       AND COALESCE(m.group_id, m.id) = g.gid
       AND m.version = g.maxv
      WHERE m.role = 'assistant'
      `
    )
    .get(conversationId, conversationId) as { cnt: number }

  return row.cnt
}
