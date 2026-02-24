import type Database from 'better-sqlite3'

export const version = 4

export function up(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(messages)`).all() as Array<{ name: string }>
  const has = new Set(cols.map((r) => r.name))

  if (!has.has('translation_expanded')) {
    db.exec(`ALTER TABLE messages ADD COLUMN translation_expanded INTEGER NOT NULL DEFAULT 1;`)
  }

  db.exec(`UPDATE messages SET translation_expanded = 1 WHERE translation_expanded IS NULL;`)
}

