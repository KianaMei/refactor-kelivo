import { getDb } from '../database'
import type {
  DbWorkspace,
  WorkspaceCreateInput,
  WorkspaceUpdateInput
} from '../../../shared/db-types'

// ── Row ↔ TS conversion ────────────────────────────────────

interface WorkspaceRow {
  id: string
  name: string
  icon: string | null
  parent_id: string | null
  default_assistant_id: string | null
  last_conversation_id: string | null
  description: string | null
  variables: string | null
  sort_index: number
  created_at: number
  updated_at: number
}

function rowToWorkspace(row: WorkspaceRow): DbWorkspace {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    parentId: row.parent_id,
    defaultAssistantId: row.default_assistant_id,
    lastConversationId: row.last_conversation_id,
    description: row.description,
    variables: row.variables ? JSON.parse(row.variables) : null,
    sortIndex: row.sort_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// ── CRUD ────────────────────────────────────────────────────

export function listWorkspaces(): DbWorkspace[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM workspaces ORDER BY sort_index ASC, created_at ASC')
    .all() as WorkspaceRow[]
  return rows.map(rowToWorkspace)
}

export function getWorkspace(id: string): DbWorkspace | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as WorkspaceRow | undefined
  return row ? rowToWorkspace(row) : null
}

export function createWorkspace(input: WorkspaceCreateInput): DbWorkspace {
  const db = getDb()
  const now = Date.now()
  db.prepare(
    `INSERT INTO workspaces (id, name, icon, parent_id, default_assistant_id, description, sort_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.name,
    input.icon ?? null,
    input.parentId ?? null,
    input.defaultAssistantId ?? null,
    input.description ?? null,
    input.sortIndex ?? 0,
    now,
    now
  )
  return getWorkspace(input.id)!
}

export function updateWorkspace(id: string, input: WorkspaceUpdateInput): DbWorkspace | null {
  const db = getDb()
  const sets: string[] = []
  const args: unknown[] = []

  if (input.name !== undefined) { sets.push('name = ?'); args.push(input.name) }
  if (input.icon !== undefined) { sets.push('icon = ?'); args.push(input.icon) }
  if (input.parentId !== undefined) { sets.push('parent_id = ?'); args.push(input.parentId) }
  if (input.defaultAssistantId !== undefined) { sets.push('default_assistant_id = ?'); args.push(input.defaultAssistantId) }
  if (input.lastConversationId !== undefined) { sets.push('last_conversation_id = ?'); args.push(input.lastConversationId) }
  if (input.description !== undefined) { sets.push('description = ?'); args.push(input.description) }
  if (input.variables !== undefined) {
    sets.push('variables = ?')
    args.push(input.variables ? JSON.stringify(input.variables) : null)
  }
  if (input.sortIndex !== undefined) { sets.push('sort_index = ?'); args.push(input.sortIndex) }

  if (sets.length === 0) return getWorkspace(id)

  sets.push('updated_at = ?')
  args.push(Date.now())
  args.push(id)

  db.prepare(`UPDATE workspaces SET ${sets.join(', ')} WHERE id = ?`).run(...args)
  return getWorkspace(id)
}

export function deleteWorkspace(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
}

export function getWorkspaceChildren(parentId: string | null): DbWorkspace[] {
  const db = getDb()
  const rows = parentId === null
    ? db.prepare('SELECT * FROM workspaces WHERE parent_id IS NULL ORDER BY sort_index ASC').all() as WorkspaceRow[]
    : db.prepare('SELECT * FROM workspaces WHERE parent_id = ? ORDER BY sort_index ASC').all(parentId) as WorkspaceRow[]
  return rows.map(rowToWorkspace)
}

export function getWorkspaceCount(): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM workspaces').get() as { cnt: number }
  return row.cnt
}

export const DEFAULT_WORKSPACE_ID = 'default'

export function ensureDefaultWorkspace(): DbWorkspace {
  const existing = getWorkspace(DEFAULT_WORKSPACE_ID)
  if (existing) return existing
  return createWorkspace({
    id: DEFAULT_WORKSPACE_ID,
    name: '默认工作区',
    sortIndex: 0
  })
}
