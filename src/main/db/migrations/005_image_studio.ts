import type Database from 'better-sqlite3'

export const version = 5

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS image_generations (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      input_sources_json TEXT NOT NULL,
      request_options_json TEXT NOT NULL,
      queue_request_id TEXT,
      status_url TEXT,
      response_url TEXT,
      cancel_url TEXT,
      logs_json TEXT NOT NULL DEFAULT '[]',
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      finished_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS image_generation_outputs (
      id TEXT PRIMARY KEY,
      generation_id TEXT NOT NULL,
      output_index INTEGER NOT NULL,
      remote_url TEXT,
      local_path TEXT,
      content_type TEXT,
      width INTEGER,
      height INTEGER,
      file_size INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (generation_id) REFERENCES image_generations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_image_generations_created_at
      ON image_generations(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_image_generations_status
      ON image_generations(status);

    CREATE INDEX IF NOT EXISTS idx_image_generation_outputs_generation
      ON image_generation_outputs(generation_id, output_index);
  `)
}
