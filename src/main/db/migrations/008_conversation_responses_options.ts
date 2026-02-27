import type Database from 'better-sqlite3'

export const version = 8

export function up(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(conversations)').all() as Array<{ name: string }>
  const colSet = new Set(cols.map((c) => c.name))

  if (!colSet.has('responses_reasoning_summary')) {
    db.exec('ALTER TABLE conversations ADD COLUMN responses_reasoning_summary TEXT')
  }

  if (!colSet.has('responses_text_verbosity')) {
    db.exec('ALTER TABLE conversations ADD COLUMN responses_text_verbosity TEXT')
  }
}
