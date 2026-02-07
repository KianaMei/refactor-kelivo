/**
 * 消息全文搜索对话框
 * 使用 SQLite FTS5 进行高速全文搜索
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, MessageSquare, ArrowRight } from 'lucide-react'
import type { MessageSearchResult } from '../../../../shared/db-types'

interface Props {
  open: boolean
  onClose: () => void
  onSelectConversation: (conversationId: string, messageId: string) => void
}

export function MessageSearchDialog(props: Props) {
  const { open, onClose, onSelectConversation } = props
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MessageSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 打开时聚焦输入框
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
      setQuery('')
      setResults([])
      setSelectedIndex(0)
    }
  }, [open])

  // 搜索防抖
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setIsSearching(true)
    try {
      const res = await window.api.db.messages.search(q.trim())
      setResults(res)
      setSelectedIndex(0)
    } catch (err) {
      console.error('Search failed:', err)
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, doSearch])

  // 键盘导航
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      const r = results[selectedIndex]
      onSelectConversation(r.message.conversationId, r.message.id)
      onClose()
    }
  }

  // 点击外部关闭
  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  // 高亮匹配文本
  function highlightMatch(text: string, q: string): React.ReactNode {
    if (!q.trim()) return text
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="searchHighlight">{part}</mark> : part
    )
  }

  // 截取上下文
  function getContext(content: string, q: string, maxLen = 120): string {
    const idx = content.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return content.slice(0, maxLen) + (content.length > maxLen ? '...' : '')
    const start = Math.max(0, idx - 40)
    const end = Math.min(content.length, idx + q.length + 80)
    let result = content.slice(start, end)
    if (start > 0) result = '...' + result
    if (end < content.length) result = result + '...'
    return result
  }

  if (!open) return null

  return createPortal(
    <div className="searchDialogBackdrop" onClick={handleBackdropClick}>
      <div className="searchDialog frosted" onKeyDown={handleKeyDown}>
        {/* 搜索输入 */}
        <div className="searchDialogHeader">
          <Search size={18} className="searchDialogIcon" />
          <input
            ref={inputRef}
            className="searchDialogInput"
            placeholder="搜索消息内容..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="searchDialogClear" onClick={() => setQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* 搜索结果 */}
        <div className="searchDialogResults">
          {isSearching ? (
            <div className="searchDialogEmpty">搜索中...</div>
          ) : results.length === 0 ? (
            <div className="searchDialogEmpty">
              {query.trim() ? '无匹配结果' : '输入关键词搜索消息'}
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.message.id}
                type="button"
                className={`searchResultItem ${i === selectedIndex ? 'selected' : ''}`}
                onClick={() => {
                  onSelectConversation(r.message.conversationId, r.message.id)
                  onClose()
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div className="searchResultHeader">
                  <MessageSquare size={14} />
                  <span className="searchResultConv">{r.conversationTitle || '未命名对话'}</span>
                  <ArrowRight size={12} className="searchResultArrow" />
                </div>
                <div className="searchResultContent">
                  {highlightMatch(getContext(r.message.content, query), query)}
                </div>
                <div className="searchResultMeta">
                  {r.message.role === 'user' ? '我' : '助手'} · {formatTime(r.message.createdAt)}
                </div>
              </button>
            ))
          )}
        </div>

        {/* 底部提示 */}
        <div className="searchDialogFooter">
          <span><kbd>↑↓</kbd> 选择</span>
          <span><kbd>Enter</kbd> 跳转</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>,
    document.body
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
