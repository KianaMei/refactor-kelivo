import { getDb } from '../database'
import type {
  DbAgentMessage,
  AgentMessageCreateInput,
  AgentMessageUpdateInput
} from '../../../shared/db-types'

// ── Row ↔ TS conversion ────────────────────────────────────

interface AgentMessageRow {
  id: string
  session_id: string
  type: string
  content: string
  tool_name: string | null
  tool_input: string | null
  tool_input_preview: string | null
  tool_result: string | null
  tool_status: string | null
  related_tool_call_id: string | null
  is_streaming: number
  model_id: string | null
  sort_order: number
  created_at: number
}

function rowToMessage(row: AgentMessageRow): DbAgentMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    content: row.content,
    toolName: row.tool_name,
    toolInput: row.tool_input,
    toolInputPreview: row.tool_input_preview,
    toolResult: row.tool_result,
    toolStatus: row.tool_status,
    relatedToolCallId: row.related_tool_call_id,
    isStreaming: row.is_streaming === 1,
    modelId: row.model_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at
  }
}

// ── CRUD ────────────────────────────────────────────────────

export function listAgentMessages(sessionId: string): DbAgentMessage[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM agent_messages WHERE session_id = ? ORDER BY sort_order ASC')
    .all(sessionId) as AgentMessageRow[]
  return rows.map(rowToMessage)
}

export function getAgentMessage(id: string): DbAgentMessage | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM agent_messages WHERE id = ?').get(id) as AgentMessageRow | undefined
  return row ? rowToMessage(row) : null
}

export function createAgentMessage(input: AgentMessageCreateInput): DbAgentMessage {
  const db = getDb()
  const now = Date.now()
  db.prepare(
    `INSERT INTO agent_messages (id, session_id, type, content, tool_name, tool_input, tool_input_preview, tool_result, tool_status, related_tool_call_id, is_streaming, model_id, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.sessionId,
    input.type,
    input.content ?? '',
    input.toolName ?? null,
    input.toolInput ?? null,
    input.toolInputPreview ?? null,
    input.toolResult ?? null,
    input.toolStatus ?? null,
    input.relatedToolCallId ?? null,
    input.isStreaming ? 1 : 0,
    input.modelId ?? null,
    input.sortOrder,
    now
  )
  return getAgentMessage(input.id)!
}

export function updateAgentMessage(id: string, input: AgentMessageUpdateInput): DbAgentMessage | null {
  const db = getDb()
  const sets: string[] = []
  const args: unknown[] = []

  if (input.content !== undefined) { sets.push('content = ?'); args.push(input.content) }
  if (input.toolResult !== undefined) { sets.push('tool_result = ?'); args.push(input.toolResult) }
  if (input.toolStatus !== undefined) { sets.push('tool_status = ?'); args.push(input.toolStatus) }
  if (input.isStreaming !== undefined) { sets.push('is_streaming = ?'); args.push(input.isStreaming ? 1 : 0) }

  if (sets.length === 0) return getAgentMessage(id)

  args.push(id)
  db.prepare(`UPDATE agent_messages SET ${sets.join(', ')} WHERE id = ?`).run(...args)
  return getAgentMessage(id)
}

export function deleteAgentMessage(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM agent_messages WHERE id = ?').run(id)
}

export function getNextSortOrder(sessionId: string): number {
  const db = getDb()
  const row = db.prepare('SELECT MAX(sort_order) AS maxOrder FROM agent_messages WHERE session_id = ?').get(sessionId) as { maxOrder: number | null }
  return (row.maxOrder ?? -1) + 1
}
