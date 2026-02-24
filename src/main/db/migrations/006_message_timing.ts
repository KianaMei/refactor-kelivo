import type Database from 'better-sqlite3'

export const version = 6

export function up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE messages ADD COLUMN finished_at INTEGER;
    ALTER TABLE messages ADD COLUMN first_token_at INTEGER;
  `)
}
