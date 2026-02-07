import type Database from 'better-sqlite3'

export const version = 2

function getColumnNames(db: Database.Database, tableName: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  return new Set(rows.map((r) => r.name))
}

export function up(db: Database.Database): void {
  const cols = getColumnNames(db, 'agent_sessions')

  // 说明：SQLite 的 ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS，所以这里手动判断，提升可靠性。
  if (!cols.has('sdk_provider')) {
    db.exec(`ALTER TABLE agent_sessions ADD COLUMN sdk_provider TEXT NOT NULL DEFAULT 'claude';`)
  }
  if (!cols.has('api_provider_id')) {
    db.exec(`ALTER TABLE agent_sessions ADD COLUMN api_provider_id TEXT;`)
  }
  if (!cols.has('model_id')) {
    db.exec(`ALTER TABLE agent_sessions ADD COLUMN model_id TEXT;`)
  }
  if (!cols.has('permission_mode')) {
    db.exec(`ALTER TABLE agent_sessions ADD COLUMN permission_mode TEXT;`)
  }
  if (!cols.has('sandbox_mode')) {
    db.exec(`ALTER TABLE agent_sessions ADD COLUMN sandbox_mode TEXT;`)
  }
  if (!cols.has('approval_policy')) {
    db.exec(`ALTER TABLE agent_sessions ADD COLUMN approval_policy TEXT;`)
  }
}

