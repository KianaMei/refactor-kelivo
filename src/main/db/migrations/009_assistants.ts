import type Database from 'better-sqlite3'

export const version = 9

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assistants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT '🤖',
      avatar_type TEXT NOT NULL DEFAULT 'emoji',
      use_assistant_avatar INTEGER NOT NULL DEFAULT 0,
      system_prompt TEXT NOT NULL DEFAULT '',
      message_template TEXT NOT NULL DEFAULT '{{ message }}',
      is_default INTEGER NOT NULL DEFAULT 0,
      deletable INTEGER NOT NULL DEFAULT 1,
      bound_model_provider TEXT,
      bound_model_id TEXT,
      temperature REAL,
      top_p REAL,
      max_tokens INTEGER,
      stream_output INTEGER NOT NULL DEFAULT 1,
      context_message_size INTEGER NOT NULL DEFAULT 64,
      limit_context_messages INTEGER NOT NULL DEFAULT 1,
      max_tool_loop_iterations INTEGER NOT NULL DEFAULT 10,
      mcp_server_ids TEXT NOT NULL DEFAULT '[]',
      background TEXT,
      custom_headers TEXT NOT NULL DEFAULT '[]',
      custom_body TEXT NOT NULL DEFAULT '[]',
      enable_memory INTEGER NOT NULL DEFAULT 0,
      enable_recent_chats_reference INTEGER NOT NULL DEFAULT 0,
      preset_messages TEXT NOT NULL DEFAULT '[]',
      regex_rules TEXT NOT NULL DEFAULT '[]',
      sort_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  const cols = db.prepare('PRAGMA table_info(assistants)').all() as Array<{ name: string }>
  const colSet = new Set(cols.map((c) => c.name))
  if (!colSet.has('sort_index')) {
    db.exec('ALTER TABLE assistants ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0')
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_assistants_is_default ON assistants(is_default);
    CREATE INDEX IF NOT EXISTS idx_assistants_sort_index ON assistants(sort_index, created_at);
  `)
}
