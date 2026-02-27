/**
 * 提示词历史 & 收藏面板
 *
 * 两个 Tab：全部历史 / 收藏；支持搜索、点击复用、⭐ 收藏切换、删除、清空非收藏。
 */
import { useState, useRef, useEffect } from 'react'
import { Search, Star, Trash2, X, Clock, Eraser } from 'lucide-react'
import type { PromptLibraryItem } from '../../../shared/promptLibrary'

interface Props {
    items: PromptLibraryItem[]
    loading: boolean
    searchQuery: string
    favoritesOnly: boolean
    total: number
    onSearchChange: (query: string) => void
    onFavoritesOnlyChange: (v: boolean) => void
    onSelect: (prompt: string) => void
    onToggleFavorite: (id: string) => void
    onDelete: (id: string) => void
    onClearHistory: () => void
    onClose: () => void
}

function timeAgo(timestamp: number): string {
    const diffMs = Date.now() - timestamp
    const seconds = Math.floor(diffMs / 1000)
    if (seconds < 60) return '刚刚'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}分钟前`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}小时前`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}天前`
    const months = Math.floor(days / 30)
    return `${months}个月前`
}

export function PromptHistoryPanel(props: Props) {
    const {
        items,
        loading,
        searchQuery,
        favoritesOnly,
        total,
        onSearchChange,
        onFavoritesOnlyChange,
        onSelect,
        onToggleFavorite,
        onDelete,
        onClearHistory,
        onClose
    } = props

    const searchRef = useRef<HTMLInputElement>(null)
    const [confirmClear, setConfirmClear] = useState(false)

    useEffect(() => {
        const t = setTimeout(() => searchRef.current?.focus(), 50)
        return () => clearTimeout(t)
    }, [])

    return (
        <div className="phPanel">
            {/* Header */}
            <div className="phHeader">
                <span className="phTitle">提示词库</span>
                <span className="phCount">{total} 条</span>
                <button className="phCloseBtn" type="button" onClick={onClose}>
                    <X size={14} />
                </button>
            </div>

            {/* Tabs + Search row */}
            <div className="phToolbar">
                <div className="phTabs">
                    <button
                        type="button"
                        className={`phTab ${!favoritesOnly ? 'is-active' : ''}`}
                        onClick={() => onFavoritesOnlyChange(false)}>
                        <Clock size={12} />
                        全部
                    </button>
                    <button
                        type="button"
                        className={`phTab ${favoritesOnly ? 'is-active' : ''}`}
                        onClick={() => onFavoritesOnlyChange(true)}>
                        <Star size={12} />
                        收藏
                    </button>
                </div>

                <div className="phSearch">
                    <Search size={12} className="phSearchIcon" />
                    <input
                        ref={searchRef}
                        className="phSearchInput"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="搜索..."
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            className="phSearchClear"
                            onClick={() => onSearchChange('')}>
                            <X size={10} />
                        </button>
                    )}
                </div>
            </div>

            {/* List */}
            <div className="phList">
                {loading ? (
                    <div className="phEmpty">加载中...</div>
                ) : items.length === 0 ? (
                    <div className="phEmpty">
                        {searchQuery ? '没有匹配的提示词' : favoritesOnly ? '暂无收藏' : '暂无历史提示词'}
                    </div>
                ) : (
                    items.map((item) => (
                        <div
                            key={item.id}
                            className="phItem"
                            onClick={() => onSelect(item.prompt)}
                            title={item.prompt}>
                            <div className="phItemBody">
                                <div className="phItemText">{item.prompt}</div>
                                <div className="phItemMeta">
                                    <span>{timeAgo(item.updatedAt)}</span>
                                    {item.useCount > 1 && <span>· 用了 {item.useCount} 次</span>}
                                </div>
                            </div>
                            <div className="phItemActions" onClick={(e) => e.stopPropagation()}>
                                <button
                                    type="button"
                                    className={`phItemBtn ${item.isFavorite ? 'is-fav' : ''}`}
                                    onClick={() => onToggleFavorite(item.id)}
                                    title={item.isFavorite ? '取消收藏' : '收藏'}>
                                    <Star size={12} fill={item.isFavorite ? 'currentColor' : 'none'} />
                                </button>
                                <button
                                    type="button"
                                    className="phItemBtn is-del"
                                    onClick={() => onDelete(item.id)}
                                    title="删除">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            {!favoritesOnly && items.length > 0 && (
                <div className="phFooter">
                    {confirmClear ? (
                        <div className="phClearConfirm">
                            <span>清空非收藏历史？</span>
                            <button
                                type="button"
                                className="phClearBtn is-danger"
                                onClick={() => {
                                    onClearHistory()
                                    setConfirmClear(false)
                                }}>
                                确认
                            </button>
                            <button
                                type="button"
                                className="phClearBtn"
                                onClick={() => setConfirmClear(false)}>
                                取消
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="phClearTrigger"
                            onClick={() => setConfirmClear(true)}>
                            <Eraser size={10} />
                            清空历史
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
