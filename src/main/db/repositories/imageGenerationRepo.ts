import { getDb } from '../database'
import type {
  FalSeedreamEditOptions,
  ImageInputSource,
  ImageStudioJob,
  ImageStudioJobStatus,
  ImageStudioOutput,
  ImageStudioProviderType,
  ImageStudioListRequest
} from '../../../shared/imageStudio'
import { safeUuid } from '../../../shared/utils'

interface ImageGenerationRow {
  id: string
  provider_id: string
  provider_type: string
  status: string
  prompt: string
  input_sources_json: string
  request_options_json: string
  queue_request_id: string | null
  status_url: string | null
  response_url: string | null
  cancel_url: string | null
  logs_json: string
  error_message: string | null
  created_at: number
  updated_at: number
  finished_at: number | null
}

interface ImageGenerationOutputRow {
  id: string
  generation_id: string
  output_index: number
  remote_url: string | null
  local_path: string | null
  content_type: string | null
  width: number | null
  height: number | null
  file_size: number | null
  created_at: number
}

export interface CreateImageGenerationInput {
  id: string
  providerId: string
  providerType: ImageStudioProviderType
  status: ImageStudioJobStatus
  prompt: string
  inputSources: ImageInputSource[]
  requestOptions: FalSeedreamEditOptions
  queueRequestId?: string | null
  statusUrl?: string | null
  responseUrl?: string | null
  cancelUrl?: string | null
  logs?: string[]
  errorMessage?: string | null
  createdAt?: number
  updatedAt?: number
  finishedAt?: number | null
}

export interface UpdateImageGenerationInput {
  status?: ImageStudioJobStatus
  prompt?: string
  inputSources?: ImageInputSource[]
  requestOptions?: FalSeedreamEditOptions
  queueRequestId?: string | null
  statusUrl?: string | null
  responseUrl?: string | null
  cancelUrl?: string | null
  logs?: string[]
  errorMessage?: string | null
  updatedAt?: number
  finishedAt?: number | null
}

export interface CreateImageGenerationOutputInput {
  id?: string
  outputIndex: number
  remoteUrl?: string | null
  localPath?: string | null
  contentType?: string | null
  width?: number | null
  height?: number | null
  fileSize?: number | null
  createdAt?: number
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as T
    return parsed
  } catch {
    return fallback
  }
}

function rowToOutput(row: ImageGenerationOutputRow): ImageStudioOutput {
  return {
    id: row.id,
    generationId: row.generation_id,
    outputIndex: row.output_index,
    remoteUrl: row.remote_url,
    localPath: row.local_path,
    contentType: row.content_type,
    width: row.width,
    height: row.height,
    fileSize: row.file_size,
    createdAt: row.created_at
  }
}

function rowToJob(row: ImageGenerationRow, outputs: ImageStudioOutput[]): ImageStudioJob {
  const inputSources = safeJsonParse<ImageInputSource[]>(row.input_sources_json, [])
  const requestOptions = safeJsonParse<FalSeedreamEditOptions>(row.request_options_json, {})
  const logs = safeJsonParse<string[]>(row.logs_json, [])

  return {
    id: row.id,
    providerId: row.provider_id,
    providerType: row.provider_type as ImageStudioProviderType,
    status: row.status as ImageStudioJobStatus,
    prompt: row.prompt,
    inputSources,
    requestOptions,
    queueRequestId: row.queue_request_id,
    statusUrl: row.status_url,
    responseUrl: row.response_url,
    cancelUrl: row.cancel_url,
    logs,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
    outputs
  }
}

function listOutputsByGenerationIds(generationIds: string[]): Map<string, ImageStudioOutput[]> {
  const map = new Map<string, ImageStudioOutput[]>()
  if (generationIds.length === 0) return map

  const db = getDb()
  const placeholders = generationIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT * FROM image_generation_outputs
       WHERE generation_id IN (${placeholders})
       ORDER BY generation_id ASC, output_index ASC`
    )
    .all(...generationIds) as ImageGenerationOutputRow[]

  for (const row of rows) {
    const output = rowToOutput(row)
    const list = map.get(output.generationId) ?? []
    list.push(output)
    map.set(output.generationId, list)
  }

  return map
}

export function createImageGeneration(input: CreateImageGenerationInput): ImageStudioJob {
  const db = getDb()
  const now = Date.now()

  db.prepare(
    `INSERT INTO image_generations (
      id,
      provider_id,
      provider_type,
      status,
      prompt,
      input_sources_json,
      request_options_json,
      queue_request_id,
      status_url,
      response_url,
      cancel_url,
      logs_json,
      error_message,
      created_at,
      updated_at,
      finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.providerId,
    input.providerType,
    input.status,
    input.prompt,
    JSON.stringify(input.inputSources ?? []),
    JSON.stringify(input.requestOptions ?? {}),
    input.queueRequestId ?? null,
    input.statusUrl ?? null,
    input.responseUrl ?? null,
    input.cancelUrl ?? null,
    JSON.stringify(input.logs ?? []),
    input.errorMessage ?? null,
    input.createdAt ?? now,
    input.updatedAt ?? now,
    input.finishedAt ?? null
  )

  return getImageGeneration(input.id)!
}

export function updateImageGeneration(id: string, input: UpdateImageGenerationInput): ImageStudioJob | null {
  const db = getDb()
  const sets: string[] = []
  const args: unknown[] = []

  if (input.status !== undefined) {
    sets.push('status = ?')
    args.push(input.status)
  }
  if (input.prompt !== undefined) {
    sets.push('prompt = ?')
    args.push(input.prompt)
  }
  if (input.inputSources !== undefined) {
    sets.push('input_sources_json = ?')
    args.push(JSON.stringify(input.inputSources))
  }
  if (input.requestOptions !== undefined) {
    sets.push('request_options_json = ?')
    args.push(JSON.stringify(input.requestOptions))
  }
  if (input.queueRequestId !== undefined) {
    sets.push('queue_request_id = ?')
    args.push(input.queueRequestId)
  }
  if (input.statusUrl !== undefined) {
    sets.push('status_url = ?')
    args.push(input.statusUrl)
  }
  if (input.responseUrl !== undefined) {
    sets.push('response_url = ?')
    args.push(input.responseUrl)
  }
  if (input.cancelUrl !== undefined) {
    sets.push('cancel_url = ?')
    args.push(input.cancelUrl)
  }
  if (input.logs !== undefined) {
    sets.push('logs_json = ?')
    args.push(JSON.stringify(input.logs))
  }
  if (input.errorMessage !== undefined) {
    sets.push('error_message = ?')
    args.push(input.errorMessage)
  }
  if (input.finishedAt !== undefined) {
    sets.push('finished_at = ?')
    args.push(input.finishedAt)
  }

  sets.push('updated_at = ?')
  args.push(input.updatedAt ?? Date.now())

  args.push(id)
  db.prepare(`UPDATE image_generations SET ${sets.join(', ')} WHERE id = ?`).run(...args)

  return getImageGeneration(id)
}

export function appendImageGenerationLog(id: string, message: string): ImageStudioJob | null {
  const current = getImageGeneration(id)
  if (!current) return null

  const logs = [...(current.logs ?? []), message]
  return updateImageGeneration(id, { logs })
}

export function addImageGenerationOutputs(
  generationId: string,
  outputs: CreateImageGenerationOutputInput[]
): ImageStudioOutput[] {
  const db = getDb()
  const now = Date.now()

  const stmt = db.prepare(
    `INSERT INTO image_generation_outputs (
      id,
      generation_id,
      output_index,
      remote_url,
      local_path,
      content_type,
      width,
      height,
      file_size,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  for (const output of outputs) {
    stmt.run(
      output.id ?? safeUuid(),
      generationId,
      output.outputIndex,
      output.remoteUrl ?? null,
      output.localPath ?? null,
      output.contentType ?? null,
      output.width ?? null,
      output.height ?? null,
      output.fileSize ?? null,
      output.createdAt ?? now
    )
  }

  return listImageGenerationOutputs(generationId)
}

export function listImageGenerationOutputs(generationId: string): ImageStudioOutput[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT * FROM image_generation_outputs
       WHERE generation_id = ?
       ORDER BY output_index ASC`
    )
    .all(generationId) as ImageGenerationOutputRow[]

  return rows.map(rowToOutput)
}

export function getImageGenerationOutput(outputId: string): ImageStudioOutput | null {
  const db = getDb()
  const row = db
    .prepare('SELECT * FROM image_generation_outputs WHERE id = ?')
    .get(outputId) as ImageGenerationOutputRow | undefined

  if (!row) return null
  return rowToOutput(row)
}

export function deleteImageGenerationOutput(outputId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM image_generation_outputs WHERE id = ?').run(outputId)
}

export function getImageGeneration(id: string): ImageStudioJob | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM image_generations WHERE id = ?').get(id) as ImageGenerationRow | undefined
  if (!row) return null

  const outputs = listImageGenerationOutputs(id)
  return rowToJob(row, outputs)
}

export function listImageGenerations(params: ImageStudioListRequest = {}): ImageStudioJob[] {
  const db = getDb()
  const conditions: string[] = []
  const args: unknown[] = []

  if (params.status && params.status !== 'all') {
    conditions.push('status = ?')
    args.push(params.status)
  }

  if (params.providerId) {
    conditions.push('provider_id = ?')
    args.push(params.providerId)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = typeof params.limit === 'number' ? Math.min(200, Math.max(1, Math.round(params.limit))) : 100
  const offset = typeof params.offset === 'number' ? Math.max(0, Math.round(params.offset)) : 0

  const rows = db
    .prepare(
      `SELECT * FROM image_generations
       ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...args, limit, offset) as ImageGenerationRow[]

  const outputsByGeneration = listOutputsByGenerationIds(rows.map((row) => row.id))
  return rows.map((row) => rowToJob(row, outputsByGeneration.get(row.id) ?? []))
}

export function deleteImageGeneration(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM image_generations WHERE id = ?').run(id)
}
