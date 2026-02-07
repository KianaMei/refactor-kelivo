import { useMemo, useState } from 'react'
import { Search, Zap, MessageSquare, Settings } from 'lucide-react'
import type { QuickPhrase } from '../../../shared/types'

interface Props {
  phrases: QuickPhrase[]
  onSelect: (phrase: QuickPhrase) => void
  onManage?: () => void
}

export function QuickPhraseMenu({ phrases, onSelect, onManage }: Props) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return phrases
    const s = search.toLowerCase()
    return phrases.filter(
      (p) => p.title.toLowerCase().includes(s) || p.content.toLowerCase().includes(s)
    )
  }, [phrases, search])

  return (
    <div className="w-[320px] bg-popover rounded-2xl border shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">快捷短语</span>
        </div>
        {onManage && (
          <button
            onClick={onManage}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="管理短语"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索短语..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-muted border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* List */}
      <div className="max-h-[320px] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            未找到短语
          </div>
        ) : (
          filtered.map((phrase) => (
            <button
              key={phrase.id}
              onClick={() => onSelect(phrase)}
              className="w-full px-4 py-2.5 text-left hover:bg-muted/60 transition-colors flex items-start gap-3"
            >
              {phrase.isGlobal ? (
                <Zap className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              ) : (
                <MessageSquare className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{phrase.title}</div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {phrase.content}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
