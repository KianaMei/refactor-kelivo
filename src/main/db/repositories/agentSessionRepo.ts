import { getDb } from '../database'
import type {
  DbAgentSession,
  AgentSessionCreateInput,
  AgentSessionUpdateInput
} from '../../../shared/db-types'

// ── Row ↔ TS conversion ────────────────────────────────────

interface AgentSessionRow {
  id: string
  agent_id: string
  name: string
  sdk_provider?: string
  api_provider_id?: string | null
  sdk_session_id: string | null
  working_directory: string | null
  model_id?: string | null
  permission_mode?: string | null
  sandbox_mode?: string | null
  approval_policy?: string | null
  status: string
  last_error: string | null
  total_tokens: number
  created_at: number
  updated_at: number
}

function rowToSession(row: AgentSessionRow): DbAgentSession {
  return {
    id: row.id,
    agentId: row.agent_id,
    name: row.name,
    sdkProvider: row.sdk_provider === 'codex' ? 'codex' : 'claude',
    apiProviderId: row.api_provider_id ?? null,
    sdkSessionId: row.sdk_session_id,
    workingDirectory: row.working_directory,
    modelId: row.model_id ?? null,
    permissionMode: row.permission_mode ?? null,
    sandboxMode: row.sandbox_mode ?? null,
    approvalPolicy: row.approval_policy ?? null,
    status: row.status,
    lastError: row.last_error,
    totalTokens: row.total_tokens,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// ── CRUD ────────────────────────────────────────────────────

export function listAgentSessions(agentId?: string): DbAgentSession[] {
  const db = getDb()
  let rows: AgentSessionRow[]
  if (agentId) {
    rows = db
      .prepare('SELECT * FROM agent_sessions WHERE agent_id = ? ORDER BY updated_at DESC')
      .all(agentId) as AgentSessionRow[]
  } else {
    rows = db
      .prepare('SELECT * FROM agent_sessions ORDER BY updated_at DESC')
      .all() as AgentSessionRow[]
  }
  return rows.map(rowToSession)
}

export function getAgentSession(id: string): DbAgentSession | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM agent_sessions WHERE id = ?').get(id) as AgentSessionRow | undefined
  return row ? rowToSession(row) : null
}

export function createAgentSession(input: AgentSessionCreateInput): DbAgentSession {
  const db = getDb()
  const now = Date.now()
  db.prepare(
    `INSERT INTO agent_sessions (
      id,
      agent_id,
      name,
      sdk_provider,
      api_provider_id,
      sdk_session_id,
      working_directory,
      model_id,
      permission_mode,
      sandbox_mode,
      approval_policy,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.agentId,
    input.name ?? '',
    input.sdkProvider ?? 'claude',
    input.apiProviderId ?? null,
    input.sdkSessionId ?? null,
    input.workingDirectory ?? null,
    input.modelId ?? null,
    input.permissionMode ?? null,
    input.sandboxMode ?? null,
    input.approvalPolicy ?? null,
    input.status ?? 'idle',
    now,
    now
  )
  return getAgentSession(input.id)!
}

export function updateAgentSession(id: string, input: AgentSessionUpdateInput): DbAgentSession | null {
  const db = getDb()
  const sets: string[] = []
  const args: unknown[] = []

  if (input.name !== undefined) { sets.push('name = ?'); args.push(input.name) }
  if (input.sdkProvider !== undefined) { sets.push('sdk_provider = ?'); args.push(input.sdkProvider) }
  if (input.apiProviderId !== undefined) { sets.push('api_provider_id = ?'); args.push(input.apiProviderId) }
  if (input.sdkSessionId !== undefined) { sets.push('sdk_session_id = ?'); args.push(input.sdkSessionId) }
  if (input.workingDirectory !== undefined) { sets.push('working_directory = ?'); args.push(input.workingDirectory) }
  if (input.modelId !== undefined) { sets.push('model_id = ?'); args.push(input.modelId) }
  if (input.permissionMode !== undefined) { sets.push('permission_mode = ?'); args.push(input.permissionMode) }
  if (input.sandboxMode !== undefined) { sets.push('sandbox_mode = ?'); args.push(input.sandboxMode) }
  if (input.approvalPolicy !== undefined) { sets.push('approval_policy = ?'); args.push(input.approvalPolicy) }
  if (input.status !== undefined) { sets.push('status = ?'); args.push(input.status) }
  if (input.lastError !== undefined) { sets.push('last_error = ?'); args.push(input.lastError) }
  if (input.totalTokens !== undefined) { sets.push('total_tokens = ?'); args.push(input.totalTokens) }

  if (sets.length === 0) return getAgentSession(id)

  sets.push('updated_at = ?')
  args.push(Date.now())
  args.push(id)

  db.prepare(`UPDATE agent_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...args)
  return getAgentSession(id)
}

export function deleteAgentSession(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM agent_sessions WHERE id = ?').run(id)
}
