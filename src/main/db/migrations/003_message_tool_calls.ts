import type Database from 'better-sqlite3'

export const version = 3

export function up(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(messages)`).all() as Array<{ name: string }>
  const has = new Set(cols.map((r) => r.name))

  if (!has.has('tool_calls')) {
    db.exec(`ALTER TABLE messages ADD COLUMN tool_calls TEXT;`)
  }
}
