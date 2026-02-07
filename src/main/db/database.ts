import { app } from 'electron'
import { join } from 'path'
import BetterSqlite3 from 'better-sqlite3'
import type Database from 'better-sqlite3'

import * as migration001 from './migrations/001_initial'
import * as migration002 from './migrations/002_agent_sessions_provider'

interface Migration {
  version: number
  up: (db: Database.Database) => void
}

const migrations: Migration[] = [migration001, migration002]

let db: Database.Database | null = null

function ensureMigrationsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )
  `)
}

function getCurrentVersion(database: Database.Database): number {
  const row = database
    .prepare('SELECT MAX(version) AS v FROM _migrations')
    .get() as { v: number | null } | undefined
  return row?.v ?? 0
}

function runMigrations(database: Database.Database): void {
  ensureMigrationsTable(database)
  const current = getCurrentVersion(database)

  for (const migration of migrations) {
    if (migration.version <= current) continue

    database.transaction(() => {
      migration.up(database)
      database
        .prepare('INSERT INTO _migrations (version) VALUES (?)')
        .run(migration.version)
    })()

    console.log(`[db] migration ${migration.version} applied`)
  }
}

export function initDatabase(): void {
  if (db) return

  const dbPath = join(app.getPath('userData'), 'kelivo.db')
  console.log(`[db] opening ${dbPath}`)

  db = new BetterSqlite3(dbPath)

  // Performance pragmas
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  runMigrations(db)
  console.log('[db] ready')
}

export function getDb(): Database.Database {
  if (!db) throw new Error('[db] not initialized — call initDatabase() first')
  return db
}

export function closeDatabase(): void {
  if (!db) return
  db.close()
  db = null
  console.log('[db] closed')
}
