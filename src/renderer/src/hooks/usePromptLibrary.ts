/**
 * 提示词库 Hook
 *
 * 封装 window.api.promptLibrary 的前端状态管理，
 * 提供增删改查、收藏切换、搜索等能力。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PromptLibraryItem } from '../../../shared/promptLibrary'

interface UsePromptLibraryReturn {
    /** 当前列表（按 updatedAt 倒序） */
    items: PromptLibraryItem[]
    /** 是否正在加载 */
    loading: boolean
    /** 当前搜索词 */
    searchQuery: string
    /** 当前是否只看收藏 */
    favoritesOnly: boolean
    /** 总数 */
    total: number
    /** 设置搜索词 */
    setSearchQuery: (q: string) => void
    /** 切换只看收藏 */
    setFavoritesOnly: (v: boolean) => void
    /** 添加提示词（去重） */
    addPrompt: (prompt: string) => Promise<void>
    /** 切换收藏 */
    toggleFavorite: (id: string) => Promise<void>
    /** 删除单条 */
    removeItem: (id: string) => Promise<void>
    /** 清空非收藏历史 */
    clearHistory: () => Promise<void>
    /** 刷新列表 */
    refresh: () => Promise<void>
}

export function usePromptLibrary(): UsePromptLibraryReturn {
    const [items, setItems] = useState<PromptLibraryItem[]>([])
    const [loading, setLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [favoritesOnly, setFavoritesOnly] = useState(false)
    const [total, setTotal] = useState(0)
    const mountedRef = useRef(true)

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const res = await window.api.promptLibrary.list({
                favoritesOnly,
                search: searchQuery || undefined,
                limit: 500
            })
            if (!mountedRef.current) return
            if (res.success) {
                setItems(res.items ?? [])
                setTotal(res.total ?? 0)
            }
        } finally {
            if (mountedRef.current) setLoading(false)
        }
    }, [favoritesOnly, searchQuery])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const addPrompt = useCallback(
        async (prompt: string) => {
            const trimmed = prompt.trim()
            if (!trimmed) return
            await window.api.promptLibrary.create({ prompt: trimmed })
            void refresh()
        },
        [refresh]
    )

    const toggleFavorite = useCallback(
        async (id: string) => {
            const item = items.find((i) => i.id === id)
            if (!item) return
            await window.api.promptLibrary.update(id, { isFavorite: !item.isFavorite })
            void refresh()
        },
        [items, refresh]
    )

    const removeItem = useCallback(
        async (id: string) => {
            await window.api.promptLibrary.delete(id)
            void refresh()
        },
        [refresh]
    )

    const clearHistory = useCallback(async () => {
        await window.api.promptLibrary.clear()
        void refresh()
    }, [refresh])

    return {
        items,
        loading,
        searchQuery,
        favoritesOnly,
        total,
        setSearchQuery,
        setFavoritesOnly,
        addPrompt,
        toggleFavorite,
        removeItem,
        clearHistory,
        refresh
    }
}
