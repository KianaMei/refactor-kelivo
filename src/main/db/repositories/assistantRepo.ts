import { getDb } from '../database'
import { createDefaultAssistantConfig } from '../../../shared/types'
import {
  DEFAULT_ASSISTANT_OCR_SYSTEM_PROMPT,
  DEFAULT_ASSISTANT_SAMPLE_SYSTEM_PROMPT
} from '../../../shared/types/defaults'
import type {
  AssistantCreateInput,
  AssistantUpdateInput,
  DbAssistant
} from '../../../shared/db-types'

interface AssistantRow {
  id: string
  name: string
  avatar: string
  avatar_type: 'emoji' | 'image'
  use_assistant_avatar: number
  system_prompt: string
  message_template: string
  is_default: number
  deletable: number
  bound_model_provider: string | null
  bound_model_id: string | null
  temperature: number | null
  top_p: number | null
  max_tokens: number | null
  stream_output: number
  context_message_size: number
  limit_context_messages: number
  max_tool_loop_iterations: number
  mcp_server_ids: string | null
  background: string | null
  custom_headers: string | null
  custom_body: string | null
  enable_memory: number
  enable_recent_chats_reference: number
  preset_messages: string | null
  regex_rules: string | null
  sort_index: number
  created_at: string
  updated_at: string
}

function parseJsonArray<T>(raw: string | null, fallback: T[]): T[] {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : fallback
  } catch {
    return fallback
  }
}

function rowToAssistant(row: AssistantRow): DbAssistant {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    avatarType: row.avatar_type,
    useAssistantAvatar: row.use_assistant_avatar === 1,
    systemPrompt: row.system_prompt,
    messageTemplate: row.message_template,
    isDefault: row.is_default === 1,
    deletable: row.deletable === 1,
    boundModelProvider: row.bound_model_provider,
    boundModelId: row.bound_model_id,
    temperature: row.temperature ?? undefined,
    topP: row.top_p ?? undefined,
    maxTokens: row.max_tokens ?? undefined,
    streamOutput: row.stream_output === 1,
    contextMessageSize: row.context_message_size,
    limitContextMessages: row.limit_context_messages === 1,
    maxToolLoopIterations: row.max_tool_loop_iterations,
    mcpServerIds: parseJsonArray<string>(row.mcp_server_ids, []),
    background: row.background,
    customHeaders: parseJsonArray(row.custom_headers, []),
    customBody: parseJsonArray(row.custom_body, []),
    enableMemory: row.enable_memory === 1,
    enableRecentChatsReference: row.enable_recent_chats_reference === 1,
    presetMessages: parseJsonArray(row.preset_messages, []),
    regexRules: parseJsonArray(row.regex_rules, []),
    sortIndex: row.sort_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function getNextSortIndex(): number {
  const db = getDb()
  const row = db.prepare('SELECT COALESCE(MAX(sort_index), -1) AS v FROM assistants').get() as { v: number }
  return row.v + 1
}

function ensureAssistantDefaults(input: AssistantCreateInput): DbAssistant {
  const nowIso = new Date().toISOString()
  const base = createDefaultAssistantConfig(input.id, input.name?.trim() || input.id, {
    temperature: 0.6,
    topP: 1.0,
    createdAt: nowIso,
    updatedAt: nowIso
  })
  return {
    ...base,
    ...input,
    id: input.id,
    name: input.name?.trim() || base.name,
    sortIndex: input.sortIndex ?? getNextSortIndex(),
    createdAt: input.createdAt ?? base.createdAt,
    updatedAt: input.updatedAt ?? base.updatedAt
  }
}

function insertAssistant(assistant: DbAssistant): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO assistants (
      id, name, avatar, avatar_type, use_assistant_avatar, system_prompt, message_template,
      is_default, deletable, bound_model_provider, bound_model_id, temperature, top_p, max_tokens,
      stream_output, context_message_size, limit_context_messages, max_tool_loop_iterations,
      mcp_server_ids, background, custom_headers, custom_body, enable_memory,
      enable_recent_chats_reference, preset_messages, regex_rules, sort_index, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )`
  ).run(
    assistant.id,
    assistant.name,
    assistant.avatar,
    assistant.avatarType,
    assistant.useAssistantAvatar ? 1 : 0,
    assistant.systemPrompt,
    assistant.messageTemplate,
    assistant.isDefault ? 1 : 0,
    assistant.deletable ? 1 : 0,
    assistant.boundModelProvider,
    assistant.boundModelId,
    assistant.temperature ?? null,
    assistant.topP ?? null,
    assistant.maxTokens ?? null,
    assistant.streamOutput ? 1 : 0,
    assistant.contextMessageSize,
    assistant.limitContextMessages ? 1 : 0,
    assistant.maxToolLoopIterations,
    JSON.stringify(assistant.mcpServerIds ?? []),
    assistant.background ?? null,
    JSON.stringify(assistant.customHeaders ?? []),
    JSON.stringify(assistant.customBody ?? []),
    assistant.enableMemory ? 1 : 0,
    assistant.enableRecentChatsReference ? 1 : 0,
    JSON.stringify(assistant.presetMessages ?? []),
    JSON.stringify(assistant.regexRules ?? []),
    assistant.sortIndex,
    assistant.createdAt,
    assistant.updatedAt
  )
}

export function listAssistants(): DbAssistant[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM assistants ORDER BY sort_index ASC, created_at ASC')
    .all() as AssistantRow[]
  return rows.map(rowToAssistant)
}

export function getAssistant(id: string): DbAssistant | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM assistants WHERE id = ?').get(id) as AssistantRow | undefined
  return row ? rowToAssistant(row) : null
}

export function getAssistantCount(): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM assistants').get() as { cnt: number }
  return row.cnt
}

export function getDefaultAssistant(): DbAssistant | null {
  const db = getDb()
  const row = db
    .prepare('SELECT * FROM assistants WHERE is_default = 1 ORDER BY sort_index ASC LIMIT 1')
    .get() as AssistantRow | undefined
  if (row) return rowToAssistant(row)
  const list = listAssistants()
  return list[0] ?? null
}

export function createAssistant(input: AssistantCreateInput): DbAssistant {
  const assistant = ensureAssistantDefaults(input)
  insertAssistant(assistant)
  if (assistant.isDefault) {
    setDefaultAssistant(assistant.id)
  }
  return getAssistant(assistant.id)!
}

export function updateAssistant(id: string, input: AssistantUpdateInput): DbAssistant | null {
  const existing = getAssistant(id)
  if (!existing) return null

  const updated: DbAssistant = {
    ...existing,
    ...input,
    id: existing.id,
    sortIndex: existing.sortIndex,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  }

  const db = getDb()
  db.prepare(
    `UPDATE assistants SET
      name = ?,
      avatar = ?,
      avatar_type = ?,
      use_assistant_avatar = ?,
      system_prompt = ?,
      message_template = ?,
      is_default = ?,
      deletable = ?,
      bound_model_provider = ?,
      bound_model_id = ?,
      temperature = ?,
      top_p = ?,
      max_tokens = ?,
      stream_output = ?,
      context_message_size = ?,
      limit_context_messages = ?,
      max_tool_loop_iterations = ?,
      mcp_server_ids = ?,
      background = ?,
      custom_headers = ?,
      custom_body = ?,
      enable_memory = ?,
      enable_recent_chats_reference = ?,
      preset_messages = ?,
      regex_rules = ?,
      updated_at = ?
    WHERE id = ?`
  ).run(
    updated.name,
    updated.avatar,
    updated.avatarType,
    updated.useAssistantAvatar ? 1 : 0,
    updated.systemPrompt,
    updated.messageTemplate,
    updated.isDefault ? 1 : 0,
    updated.deletable ? 1 : 0,
    updated.boundModelProvider,
    updated.boundModelId,
    updated.temperature ?? null,
    updated.topP ?? null,
    updated.maxTokens ?? null,
    updated.streamOutput ? 1 : 0,
    updated.contextMessageSize,
    updated.limitContextMessages ? 1 : 0,
    updated.maxToolLoopIterations,
    JSON.stringify(updated.mcpServerIds ?? []),
    updated.background ?? null,
    JSON.stringify(updated.customHeaders ?? []),
    JSON.stringify(updated.customBody ?? []),
    updated.enableMemory ? 1 : 0,
    updated.enableRecentChatsReference ? 1 : 0,
    JSON.stringify(updated.presetMessages ?? []),
    JSON.stringify(updated.regexRules ?? []),
    updated.updatedAt,
    id
  )

  if (input.isDefault === true) {
    setDefaultAssistant(id)
  }
  return getAssistant(id)
}

export function deleteAssistant(id: string): void {
  const existing = getAssistant(id)
  if (!existing) return

  const db = getDb()
  db.prepare('DELETE FROM assistants WHERE id = ?').run(id)

  if (existing.isDefault) {
    const fallback = listAssistants()[0]
    if (fallback) setDefaultAssistant(fallback.id)
  }
}

export function setDefaultAssistant(id: string): DbAssistant | null {
  const db = getDb()
  const nowIso = new Date().toISOString()
  db.transaction(() => {
    db.prepare('UPDATE assistants SET is_default = 0, updated_at = ? WHERE is_default = 1').run(nowIso)
    db.prepare('UPDATE assistants SET is_default = 1, updated_at = ? WHERE id = ?').run(nowIso, id)
  })()
  return getAssistant(id)
}

export function reorderAssistants(ids: string[]): DbAssistant[] {
  const current = listAssistants()
  if (current.length === 0) return current

  const existingIds = new Set(current.map((a) => a.id))
  const deduped: string[] = []
  const seen = new Set<string>()

  for (const id of ids) {
    if (!existingIds.has(id) || seen.has(id)) continue
    seen.add(id)
    deduped.push(id)
  }
  for (const a of current) {
    if (seen.has(a.id)) continue
    seen.add(a.id)
    deduped.push(a.id)
  }

  const db = getDb()
  const nowIso = new Date().toISOString()
  db.transaction(() => {
    const stmt = db.prepare('UPDATE assistants SET sort_index = ?, updated_at = ? WHERE id = ?')
    deduped.forEach((id, idx) => {
      stmt.run(idx, nowIso, id)
    })
  })()

  return listAssistants()
}

function createBuiltinAssistants(): DbAssistant[] {
  const nowIso = new Date().toISOString()
  return [
    {
      ...createDefaultAssistantConfig('default', '默认助手', {
        avatar: '🤖',
        systemPrompt: '',
        isDefault: true,
        deletable: false,
        temperature: 0.6,
        topP: 1.0,
        createdAt: nowIso,
        updatedAt: nowIso
      }),
      sortIndex: 0
    },
    {
      ...createDefaultAssistantConfig('sample', '示例助手', {
        avatar: '🧩',
        systemPrompt: DEFAULT_ASSISTANT_SAMPLE_SYSTEM_PROMPT,
        isDefault: false,
        deletable: false,
        temperature: 0.6,
        topP: 1.0,
        createdAt: nowIso,
        updatedAt: nowIso
      }),
      sortIndex: 1
    },
    {
      ...createDefaultAssistantConfig('ocr', 'OCR 助手', {
        avatar: '🔍',
        systemPrompt: DEFAULT_ASSISTANT_OCR_SYSTEM_PROMPT,
        isDefault: false,
        deletable: false,
        temperature: 0.6,
        topP: 1.0,
        createdAt: nowIso,
        updatedAt: nowIso
      }),
      sortIndex: 2
    }
  ]
}

export function ensureBuiltinAssistants(): DbAssistant[] {
  let existing = listAssistants()
  const existingIds = new Set(existing.map((a) => a.id))
  const builtins = createBuiltinAssistants()
  let nextSort = existing.length > 0 ? Math.max(...existing.map((a) => a.sortIndex)) + 1 : 0
  let hasDefault = existing.some((a) => a.isDefault)

  for (const builtin of builtins) {
    if (existingIds.has(builtin.id)) continue
    insertAssistant({
      ...builtin,
      isDefault: builtin.id === 'default' ? !hasDefault : false,
      sortIndex: nextSort++
    })
    existingIds.add(builtin.id)
    if (builtin.id === 'default' && !hasDefault) hasDefault = true
  }

  existing = listAssistants()
  const defaults = existing.filter((a) => a.isDefault)
  if (defaults.length === 0) {
    const fallback = existing.find((a) => a.id === 'default') ?? existing[0]
    if (fallback) setDefaultAssistant(fallback.id)
  } else if (defaults.length > 1) {
    const keep = defaults.find((a) => a.id === 'default') ?? defaults[0]
    setDefaultAssistant(keep.id)
  }

  return listAssistants()
}
