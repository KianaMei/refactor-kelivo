import { getDb } from '../database'
import type { DbMemory, MemoryCreateInput } from '../../../shared/db-types'

// ── Row ↔ TS conversion ────────────────────────────────────

interface MemoryRow {
  id: number
  assistant_id: string
  content: string
  created_at: number
}

function rowToMemory(row: MemoryRow): DbMemory {
  return {
    id: row.id,
    assistantId: row.assistant_id,
    content: row.content,
    createdAt: row.created_at
  }
}

// ── CRUD ────────────────────────────────────────────────────

export function listMemories(assistantId: string): DbMemory[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM assistant_memories WHERE assistant_id = ? ORDER BY created_at ASC')
    .all(assistantId) as MemoryRow[]
  return rows.map(rowToMemory)
}

export function getMemory(id: number): DbMemory | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM assistant_memories WHERE id = ?').get(id) as MemoryRow | undefined
  return row ? rowToMemory(row) : null
}

export function createMemory(input: MemoryCreateInput): DbMemory {
  const db = getDb()
  const now = Date.now()
  const result = db.prepare(
    `INSERT INTO assistant_memories (assistant_id, content, created_at)
     VALUES (?, ?, ?)`
  ).run(input.assistantId, input.content, now)
  return getMemory(result.lastInsertRowid as number)!
}

export function updateMemory(id: number, content: string): DbMemory | null {
  const db = getDb()
  const result = db.prepare(
    'UPDATE assistant_memories SET content = ? WHERE id = ?'
  ).run(content, id)
  if (result.changes === 0) {
    return null
  }
  return getMemory(id)
}

export function deleteMemory(id: number): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM assistant_memories WHERE id = ?').run(id)
  return result.changes > 0
}

export function deleteMemoriesByAssistant(assistantId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM assistant_memories WHERE assistant_id = ?').run(assistantId)
}

export function getMemoryCount(): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM assistant_memories').get() as { cnt: number }
  return row.cnt
}

// ── Migration helper ────────────────────────────────────────

export function bulkInsertMemories(memories: Array<{ assistantId: string; content: string }>): void {
  const db = getDb()
  const now = Date.now()
  const insert = db.prepare(
    `INSERT INTO assistant_memories (assistant_id, content, created_at) VALUES (?, ?, ?)`
  )
  const insertMany = db.transaction((items: typeof memories) => {
    for (const m of items) {
      insert.run(m.assistantId, m.content, now)
    }
  })
  insertMany(memories)
}
