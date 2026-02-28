import { getDb } from '../database'
import type {
  DbMessage,
  MessageDayCount,
  MessageCreateInput,
  MessageTokenDay,
  MessageUsageStats,
  MessageUsageStatsParams,
  MessageUpdateInput,
  MessageSearchResult
} from '../../../shared/db-types'

// ── Row ↔ TS conversion ────────────────────────────────────

interface MessageRow {
  id: string
  conversation_id: string
  role: string
  content: string
  model_id: string | null
  provider_id: string | null
  sort_order: number
  group_id: string | null
  version: number
  total_tokens: number | null
  token_usage: string | null
  is_streaming: number
  reasoning_text: string | null
  reasoning_signature: string | null
  reasoning_started_at: number | null
  reasoning_finished_at: number | null
  reasoning_segments: string | null
  tool_calls: string | null
  translation: string | null
  translation_expanded: number | null
  finished_at: number | null
  first_token_at: number | null
  created_at: number
}

interface MessageStatsRow {
  totalConversations: number
  totalMessages: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalCachedTokens: number
}

function rowToMessage(row: MessageRow): DbMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    modelId: row.model_id,
    providerId: row.provider_id,
    sortOrder: row.sort_order,
    groupId: row.group_id,
    version: row.version,
    totalTokens: row.total_tokens,
    tokenUsage: row.token_usage ? JSON.parse(row.token_usage) : null,
    isStreaming: row.is_streaming === 1,
    reasoningText: row.reasoning_text,
    reasoningSignature: row.reasoning_signature,
    reasoningStartedAt: row.reasoning_started_at,
    reasoningFinishedAt: row.reasoning_finished_at,
    reasoningSegments: row.reasoning_segments ? JSON.parse(row.reasoning_segments) : null,
    toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : null,
    translation: row.translation,
    translationExpanded: row.translation_expanded !== 0,
    finishedAt: row.finished_at,
    firstTokenAt: row.first_token_at,
    createdAt: row.created_at
  }
}

// ── CRUD ────────────────────────────────────────────────────

export function listMessages(conversationId: string): DbMessage[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY sort_order ASC')
    .all(conversationId) as MessageRow[]
  return rows.map(rowToMessage)
}

export function getMessage(id: string): DbMessage | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined
  return row ? rowToMessage(row) : null
}

export function createMessage(input: MessageCreateInput): DbMessage {
  const db = getDb()
  const now = Date.now()
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, model_id, provider_id, sort_order, group_id, version, is_streaming, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.conversationId,
    input.role,
    input.content ?? '',
    input.modelId ?? null,
    input.providerId ?? null,
    input.sortOrder,
    input.groupId ?? null,
    input.version ?? 0,
    input.isStreaming ? 1 : 0,
    now
  )
  return getMessage(input.id)!
}

export function createMessages(inputs: MessageCreateInput[]): void {
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, model_id, provider_id, sort_order, group_id, version, is_streaming, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const now = Date.now()
  const run = db.transaction((items: MessageCreateInput[]) => {
    for (const input of items) {
      stmt.run(
        input.id,
        input.conversationId,
        input.role,
        input.content ?? '',
        input.modelId ?? null,
        input.providerId ?? null,
        input.sortOrder,
        input.groupId ?? null,
        input.version ?? 0,
        input.isStreaming ? 1 : 0,
        now
      )
    }
  })
  run(inputs)
}

export function updateMessage(id: string, input: MessageUpdateInput): DbMessage | null {
  const db = getDb()
  const sets: string[] = []
  const args: unknown[] = []

  if (input.content !== undefined) { sets.push('content = ?'); args.push(input.content) }
  if (input.modelId !== undefined) { sets.push('model_id = ?'); args.push(input.modelId) }
  if (input.providerId !== undefined) { sets.push('provider_id = ?'); args.push(input.providerId) }
  if (input.groupId !== undefined) { sets.push('group_id = ?'); args.push(input.groupId) }
  if (input.version !== undefined) { sets.push('version = ?'); args.push(input.version) }
  if (input.totalTokens !== undefined) { sets.push('total_tokens = ?'); args.push(input.totalTokens) }
  if (input.tokenUsage !== undefined) {
    sets.push('token_usage = ?')
    args.push(input.tokenUsage ? JSON.stringify(input.tokenUsage) : null)
  }
  if (input.isStreaming !== undefined) { sets.push('is_streaming = ?'); args.push(input.isStreaming ? 1 : 0) }
  if (input.reasoningText !== undefined) { sets.push('reasoning_text = ?'); args.push(input.reasoningText) }
  if (input.reasoningSignature !== undefined) { sets.push('reasoning_signature = ?'); args.push(input.reasoningSignature) }
  if (input.reasoningStartedAt !== undefined) { sets.push('reasoning_started_at = ?'); args.push(input.reasoningStartedAt) }
  if (input.reasoningFinishedAt !== undefined) { sets.push('reasoning_finished_at = ?'); args.push(input.reasoningFinishedAt) }
  if (input.reasoningSegments !== undefined) {
    sets.push('reasoning_segments = ?')
    args.push(input.reasoningSegments ? JSON.stringify(input.reasoningSegments) : null)
  }
  if (input.toolCalls !== undefined) {
    sets.push('tool_calls = ?')
    args.push(input.toolCalls ? JSON.stringify(input.toolCalls) : null)
  }
  if (input.translation !== undefined) { sets.push('translation = ?'); args.push(input.translation) }
  if (input.translationExpanded !== undefined) { sets.push('translation_expanded = ?'); args.push(input.translationExpanded ? 1 : 0) }
  if (input.finishedAt !== undefined) { sets.push('finished_at = ?'); args.push(input.finishedAt) }
  if (input.firstTokenAt !== undefined) { sets.push('first_token_at = ?'); args.push(input.firstTokenAt) }

  if (sets.length === 0) return getMessage(id)

  args.push(id)
  db.prepare(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`).run(...args)
  return getMessage(id)
}

export function deleteMessage(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM messages WHERE id = ?').run(id)
}

export function deleteMessagesByConversation(conversationId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId)
}

export function getMessageVersions(groupId: string): DbMessage[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM messages WHERE group_id = ? ORDER BY version ASC')
    .all(groupId) as MessageRow[]
  return rows.map(rowToMessage)
}

export function searchMessages(query: string): MessageSearchResult[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT m.*, c.title AS conv_title
       FROM messages_fts fts
       JOIN messages m ON m.rowid = fts.rowid
       JOIN conversations c ON c.id = m.conversation_id
       WHERE messages_fts MATCH ?
       ORDER BY rank
       LIMIT 50`
    )
    .all(query) as (MessageRow & { conv_title: string })[]

  return rows.map((r) => ({
    message: rowToMessage(r),
    conversationTitle: r.conv_title
  }))
}

export function getNextSortOrder(conversationId: string): number {
  const db = getDb()
  const row = db
    .prepare('SELECT MAX(sort_order) AS max_order FROM messages WHERE conversation_id = ?')
    .get(conversationId) as { max_order: number | null }
  return (row.max_order ?? -1) + 1
}

export function getMessageUsageStats(params: MessageUsageStatsParams = {}): MessageUsageStats {
  const db = getDb()

  const startDay = (params.startDay ?? '').trim()
  const trendStartDay = (params.trendStartDay ?? '').trim()

  const totals = db.prepare(
    `SELECT
        (SELECT COUNT(*) FROM conversations) AS totalConversations,
        COUNT(*) AS totalMessages,
        COALESCE(SUM(CAST(json_extract(token_usage, '$.promptTokens') AS INTEGER)), 0) AS totalPromptTokens,
        COALESCE(SUM(CAST(json_extract(token_usage, '$.completionTokens') AS INTEGER)), 0) AS totalCompletionTokens,
        COALESCE(SUM(CAST(json_extract(token_usage, '$.cachedTokens') AS INTEGER)), 0) AS totalCachedTokens
      FROM messages`
  ).get() as MessageStatsRow

  const userMessagesPerDay = db.prepare(
    `SELECT
        date(created_at / 1000, 'unixepoch', 'localtime') AS day,
        COUNT(*) AS count
      FROM messages
      WHERE role = 'user'
        AND (? = '' OR date(created_at / 1000, 'unixepoch', 'localtime') >= date(?))
      GROUP BY day
      ORDER BY day ASC`
  ).all(startDay, startDay) as MessageDayCount[]

  const tokenUsagePerDay = db.prepare(
    `SELECT
        date(created_at / 1000, 'unixepoch', 'localtime') AS day,
        COALESCE(SUM(CAST(json_extract(token_usage, '$.promptTokens') AS INTEGER)), 0) AS promptTokens,
        COALESCE(SUM(CAST(json_extract(token_usage, '$.completionTokens') AS INTEGER)), 0) AS completionTokens,
        COALESCE(SUM(CAST(json_extract(token_usage, '$.cachedTokens') AS INTEGER)), 0) AS cachedTokens
      FROM messages
      WHERE token_usage IS NOT NULL
        AND (? = '' OR date(created_at / 1000, 'unixepoch', 'localtime') >= date(?))
      GROUP BY day
      ORDER BY day ASC`
  ).all(trendStartDay, trendStartDay) as Array<Omit<MessageTokenDay, 'totalTokens'>>

  return {
    totalConversations: totals.totalConversations ?? 0,
    totalMessages: totals.totalMessages ?? 0,
    totalPromptTokens: totals.totalPromptTokens ?? 0,
    totalCompletionTokens: totals.totalCompletionTokens ?? 0,
    totalCachedTokens: totals.totalCachedTokens ?? 0,
    userMessagesPerDay,
    tokenUsagePerDay: tokenUsagePerDay.map((item) => ({
      ...item,
      totalTokens: (item.promptTokens ?? 0) + (item.completionTokens ?? 0) + (item.cachedTokens ?? 0)
    }))
  }
}
