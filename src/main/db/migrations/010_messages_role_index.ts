import type Database from 'better-sqlite3'

export const version = 10

export function up(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_conv_role
      ON messages(conversation_id, role, group_id, version);
  `)
}
