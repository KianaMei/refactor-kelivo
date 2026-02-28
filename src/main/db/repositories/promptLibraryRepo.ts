import { getDb } from '../database'
import type {
    PromptLibraryItem,
    PromptLibraryCreateInput,
    PromptLibraryUpdateInput,
    PromptLibraryListRequest
} from '../../../shared/promptLibrary'
import { safeUuid } from '../../../shared/utils'

interface PromptLibraryRow {
    id: string
    prompt: string
    is_favorite: number
    use_count: number
    created_at: number
    updated_at: number
}

function rowToItem(row: PromptLibraryRow): PromptLibraryItem {
    return {
        id: row.id,
        prompt: row.prompt,
        isFavorite: row.is_favorite === 1,
        useCount: row.use_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

/**
 * 创建提示词（去重：若 prompt 相同则更新 use_count 和时间戳）
 */
export function createPromptLibraryItem(input: PromptLibraryCreateInput): PromptLibraryItem {
    const db = getDb()
    const now = Date.now()
    const trimmed = input.prompt.trim()

    // 去重：如果已有相同 prompt，更新 use_count 和 updated_at
    const existing = db
        .prepare('SELECT * FROM prompt_library WHERE prompt = ?')
        .get(trimmed) as PromptLibraryRow | undefined

    if (existing) {
        db.prepare(
            'UPDATE prompt_library SET use_count = use_count + 1, updated_at = ? WHERE id = ?'
        ).run(now, existing.id)

        return rowToItem({
            ...existing,
            use_count: existing.use_count + 1,
            updated_at: now
        })
    }

    const id = safeUuid()
    db.prepare(
        `INSERT INTO prompt_library (id, prompt, is_favorite, use_count, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`
    ).run(id, trimmed, input.isFavorite ? 1 : 0, now, now)

    return {
        id,
        prompt: trimmed,
        isFavorite: input.isFavorite ?? false,
        useCount: 1,
        createdAt: now,
        updatedAt: now
    }
}

/**
 * 更新提示词（修改文本/切换收藏）
 */
export function updatePromptLibraryItem(
    id: string,
    input: PromptLibraryUpdateInput
): PromptLibraryItem | null {
    const db = getDb()
    const now = Date.now()

    const setClauses: string[] = []
    const params: unknown[] = []

    if (input.prompt !== undefined) {
        setClauses.push('prompt = ?')
        params.push(input.prompt.trim())
        setClauses.push('updated_at = ?')
        params.push(now)
    }
    if (input.isFavorite !== undefined) {
        setClauses.push('is_favorite = ?')
        params.push(input.isFavorite ? 1 : 0)
    }

    if (setClauses.length === 0) return getPromptLibraryItem(id)

    params.push(id)

    db.prepare(`UPDATE prompt_library SET ${setClauses.join(', ')} WHERE id = ?`).run(...params)

    return getPromptLibraryItem(id)
}

/**
 * 获取单条
 */
export function getPromptLibraryItem(id: string): PromptLibraryItem | null {
    const db = getDb()
    const row = db
        .prepare('SELECT * FROM prompt_library WHERE id = ?')
        .get(id) as PromptLibraryRow | undefined

    return row ? rowToItem(row) : null
}

/**
 * 列表查询（支持搜索、收藏过滤、分页）
 */
export function listPromptLibraryItems(
    params: PromptLibraryListRequest = {}
): { items: PromptLibraryItem[]; total: number } {
    const db = getDb()

    const conditions: string[] = []
    const values: unknown[] = []

    if (params.favoritesOnly) {
        conditions.push('is_favorite = 1')
    }

    if (params.search) {
        conditions.push('prompt LIKE ?')
        values.push(`%${params.search}%`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRow = db
        .prepare(`SELECT COUNT(*) AS cnt FROM prompt_library ${whereClause}`)
        .get(...values) as { cnt: number }
    const total = countRow.cnt

    const limit = params.limit ?? 200
    const offset = params.offset ?? 0

    const rows = db
        .prepare(
            `SELECT * FROM prompt_library ${whereClause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
        )
        .all(...values, limit, offset) as PromptLibraryRow[]

    return {
        items: rows.map(rowToItem),
        total
    }
}

/**
 * 删除单条
 */
export function deletePromptLibraryItem(id: string): void {
    const db = getDb()
    db.prepare('DELETE FROM prompt_library WHERE id = ?').run(id)
}

/**
 * 清空全部非收藏历史
 */
export function clearNonFavoritePrompts(): number {
    const db = getDb()
    const result = db.prepare('DELETE FROM prompt_library WHERE is_favorite = 0').run()
    return result.changes
}
