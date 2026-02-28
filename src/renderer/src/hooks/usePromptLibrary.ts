/**
 * 提示词库 Hook
 *
 * 封装 window.api.promptLibrary 的前端状态管理，
 * 提供增删改查、收藏切换、搜索等能力。
 *
 * 数据一次性全量拉取，Tab 切换和收藏过滤在客户端完成，零延迟。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PromptLibraryItem } from '../../../shared/promptLibrary'

interface UsePromptLibraryReturn {
    /** 当前列表（按 updatedAt 倒序，已按 tab/搜索过滤） */
    items: PromptLibraryItem[]
    /** 是否正在加载 */
    loading: boolean
    /** 当前搜索词 */
    searchQuery: string
    /** 当前是否只看收藏 */
    favoritesOnly: boolean
    /** 总数（全部，不受 tab 过滤影响） */
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
    const [allItems, setAllItems] = useState<PromptLibraryItem[]>([])
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

    // 只依赖 searchQuery，不依赖 favoritesOnly —— tab 切换不触发请求
    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const res = await window.api.promptLibrary.list({
                search: searchQuery || undefined,
                limit: 500
            })
            if (!mountedRef.current) return
            if (res.success) {
                setAllItems(res.items ?? [])
                setTotal(res.total ?? 0)
            }
        } finally {
            if (mountedRef.current) setLoading(false)
        }
    }, [searchQuery])

    useEffect(() => {
        void refresh()
    }, [refresh])

    // 客户端过滤：切 tab 即时生效，零闪烁
    const items = useMemo(
        () => (favoritesOnly ? allItems.filter((i) => i.isFavorite) : allItems),
        [allItems, favoritesOnly]
    )

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
            const item = allItems.find((i) => i.id === id)
            if (!item) return
            const newFav = !item.isFavorite
            // 乐观更新：原地翻转收藏状态，不改变顺序
            setAllItems((prev) =>
                prev.map((i) => (i.id === id ? { ...i, isFavorite: newFav } : i))
            )
            await window.api.promptLibrary.update(id, { isFavorite: newFav })
        },
        [allItems]
    )

    const removeItem = useCallback(
        async (id: string) => {
            // 乐观删除
            setAllItems((prev) => prev.filter((i) => i.id !== id))
            setTotal((prev) => Math.max(0, prev - 1))
            await window.api.promptLibrary.delete(id)
        },
        []
    )

    const clearHistory = useCallback(async () => {
        // 乐观清除：只保留收藏项
        setAllItems((prev) => prev.filter((i) => i.isFavorite))
        setTotal((prev) => {
            const favCount = allItems.filter((i) => i.isFavorite).length
            return Math.min(prev, favCount)
        })
        await window.api.promptLibrary.clear()
    }, [allItems])

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
