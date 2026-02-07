import type Database from 'better-sqlite3'

export const version = 1

export function up(db: Database.Database): void {
  db.exec(`
    -- Workspaces
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      parent_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      default_assistant_id TEXT,
      last_conversation_id TEXT,
      description TEXT,
      variables TEXT,
      sort_index INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Conversations
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      assistant_id TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      mcp_server_ids TEXT,
      truncate_index INTEGER NOT NULL DEFAULT 0,
      version_selections TEXT,
      thinking_budget INTEGER,
      summary TEXT,
      last_summarized_message_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Messages
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      model_id TEXT,
      provider_id TEXT,
      sort_order INTEGER NOT NULL,
      group_id TEXT,
      version INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER,
      token_usage TEXT,
      is_streaming INTEGER NOT NULL DEFAULT 0,
      reasoning_text TEXT,
      reasoning_signature TEXT,
      reasoning_started_at INTEGER,
      reasoning_finished_at INTEGER,
      reasoning_segments TEXT,
      translation TEXT,
      created_at INTEGER NOT NULL
    );

    -- Assistant memories
    CREATE TABLE assistant_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assistant_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    -- Agent sessions
    CREATE TABLE agent_sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      sdk_session_id TEXT,
      working_directory TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      last_error TEXT,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Agent messages
    CREATE TABLE agent_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tool_name TEXT,
      tool_input TEXT,
      tool_input_preview TEXT,
      tool_result TEXT,
      tool_status TEXT,
      related_tool_call_id TEXT,
      is_streaming INTEGER NOT NULL DEFAULT 0,
      model_id TEXT,
      sort_order INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- Indexes
    CREATE INDEX idx_conversations_workspace ON conversations(workspace_id);
    CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
    CREATE INDEX idx_conversations_pinned ON conversations(is_pinned, updated_at DESC);
    CREATE INDEX idx_messages_conversation ON messages(conversation_id, sort_order);
    CREATE INDEX idx_messages_group ON messages(group_id) WHERE group_id IS NOT NULL;
    CREATE INDEX idx_memories_assistant ON assistant_memories(assistant_id);
    CREATE INDEX idx_agent_messages_session ON agent_messages(session_id, sort_order);

    -- Full-text search
    CREATE VIRTUAL TABLE messages_fts USING fts5(
      content,
      content='messages',
      content_rowid='rowid'
    );

    CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
    END;

    CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    END;

    CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
      INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
    END;
  `)
}
