import type Database from 'better-sqlite3'

export const version = 7

export function up(db: Database.Database): void {
    db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_library (
      id TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      use_count INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_library_created_at
      ON prompt_library(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_prompt_library_is_favorite
      ON prompt_library(is_favorite);
  `)
}
