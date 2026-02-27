/**
 * 提示词库（历史 & 收藏）共享类型
 */

export interface PromptLibraryItem {
    id: string
    prompt: string
    isFavorite: boolean
    /** 使用次数 */
    useCount: number
    createdAt: number
    updatedAt: number
}

export interface PromptLibraryCreateInput {
    prompt: string
    isFavorite?: boolean
}

export interface PromptLibraryUpdateInput {
    prompt?: string
    isFavorite?: boolean
}

export interface PromptLibraryListRequest {
    /** 仅收藏 */
    favoritesOnly?: boolean
    /** 搜索关键字 */
    search?: string
    limit?: number
    offset?: number
}

export interface PromptLibraryListResult {
    success: boolean
    items?: PromptLibraryItem[]
    total?: number
    error?: string
}

export interface PromptLibrarySingleResult {
    success: boolean
    item?: PromptLibraryItem | null
    error?: string
}

export interface PromptLibraryDeleteResult {
    success: boolean
    error?: string
}
