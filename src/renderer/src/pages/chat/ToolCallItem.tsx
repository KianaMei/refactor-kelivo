/**
 * 工具调用卡片组件
 * 可折叠面板，展示工具调用的输入参数和执行结果
 */
import { useState, useMemo } from 'react'
import {
  ChevronRight,
  Globe,
  Search,
  Library,
  Pencil,
  Trash2,
  Image,
  Wrench,
  Loader2,
  ExternalLink,
  Code,
  LayoutList
} from 'lucide-react'

export interface ToolCallData {
  id: string
  name: string
  arguments?: Record<string, unknown>
  status: 'pending' | 'running' | 'done' | 'error'
  result?: string
}

// ─── 工具元信息 ───

interface ToolMeta {
  icon: React.ReactNode
  label: string
  params?: string
}

export function resolveToolMeta(tc: ToolCallData): ToolMeta {
  const args = tc.arguments ?? {}
  switch (tc.name) {
    case 'web_search':
      return {
        icon: <Globe size={14} />,
        label: 'Web Search',
        params: str(args.query)
      }
    case 'builtin_search':
      return {
        icon: <Search size={14} />,
        label: 'Built-in Search',
        params: str(args.query)
      }
    case 'create_memory':
      return {
        icon: <Library size={14} />,
        label: 'Create Memory',
        params: str(args.title || args.content)?.slice(0, 60)
      }
    case 'edit_memory':
      return {
        icon: <Pencil size={14} />,
        label: 'Edit Memory',
        params: str(args.id || args.title)
      }
    case 'delete_memory':
      return {
        icon: <Trash2 size={14} />,
        label: 'Delete Memory',
        params: str(args.id)
      }
    case 'get_sticker':
      return {
        icon: <Image size={14} />,
        label: 'Get Sticker',
        params: str(args.name || args.keyword)
      }
    default:
      return {
        icon: <Wrench size={14} />,
        label: tc.name,
        params: undefined
      }
  }
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  return s || undefined
}

// ─── 搜索结果解析（JSON + XML） ───

interface ParsedSearchItem {
  title: string
  url: string
  snippet: string
}

function parseSearchResults(raw: string): ParsedSearchItem[] {
  // 尝试 JSON
  try {
    const obj = JSON.parse(raw)
    const arr = Array.isArray(obj.items) ? obj.items : []
    return arr
      .filter((it: Record<string, unknown>) => it && typeof it.title === 'string')
      .map((it: Record<string, unknown>) => ({
        title: String(it.title ?? ''),
        url: String(it.url ?? ''),
        snippet: String(it.snippet ?? it.text ?? '')
      }))
  } catch {
    // 不是 JSON，尝试 XML
  }

  // 解析 XML: <result index="N"><title>...</title><url>...</url><snippet>...</snippet></result>
  const items: ParsedSearchItem[] = []
  const resultRegex = /<result[^>]*>([\s\S]*?)<\/result>/g
  let m: RegExpExecArray | null
  while ((m = resultRegex.exec(raw)) !== null) {
    const block = m[1]
    const title = xmlTag(block, 'title')
    const url = xmlTag(block, 'url')
    const snippet = xmlTag(block, 'snippet')
    if (title || url) {
      items.push({
        title: decodeXmlEntities(title),
        url: decodeXmlEntities(url),
        snippet: decodeXmlEntities(snippet)
      })
    }
  }
  return items
}

function xmlTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))
  return m ? m[1].trim() : ''
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

// ─── 结果统计 ───

function resultStats(tc: ToolCallData): string | undefined {
  if (!tc.result) return undefined
  if (tc.name === 'web_search' || tc.name === 'builtin_search') {
    const items = parseSearchResults(tc.result)
    if (items.length > 0) return `${items.length} results`
    return undefined
  }
  const lines = tc.result.split('\n').length
  if (lines > 1) return `${lines} lines`
  return undefined
}

// ─── 输入参数展示 ───

function ToolCallArgs({ args }: { args?: Record<string, unknown> }) {
  if (!args || Object.keys(args).length === 0) return null

  return (
    <div className="tcArgs">
      {Object.entries(args).map(([key, value]) => (
        <div key={key} className="tcArgRow">
          <span className="tcArgKey">{key}</span>
          <span className="tcArgValue">{String(value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── 结果内容渲染 ───

export function ToolResultContent({ tc }: { tc: ToolCallData }) {
  if (!tc.result) return null

  if (tc.name === 'web_search' || tc.name === 'builtin_search') {
    return <SearchResultView raw={tc.result} args={tc.arguments} />
  }

  return <PlainResultView text={tc.result} />
}

function SearchResultView({ raw, args }: { raw: string; args?: Record<string, unknown> }) {
  const [viewMode, setViewMode] = useState<'cards' | 'raw'>('cards')
  const items = useMemo(() => parseSearchResults(raw), [raw])

  return (
    <div>
      <ToolCallArgs args={args} />

      {items.length > 0 && (
        <div className="tcViewToggle">
          <button
            className={`tcViewBtn ${viewMode === 'cards' ? 'tcViewBtnActive' : ''}`}
            onClick={() => setViewMode('cards')}
            title="Card view"
          >
            <LayoutList size={12} />
          </button>
          <button
            className={`tcViewBtn ${viewMode === 'raw' ? 'tcViewBtnActive' : ''}`}
            onClick={() => setViewMode('raw')}
            title="Raw view"
          >
            <Code size={12} />
          </button>
        </div>
      )}

      {viewMode === 'cards' && items.length > 0 ? (
        <div className="tcResultList">
          {items.map((item, i) => (
            <a
              key={i}
              className="tcResultItem"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              title={item.url}
            >
              <div className="tcResultTitle">
                <span>{item.title}</span>
                <ExternalLink size={10} className="tcResultLinkIcon" />
              </div>
              {item.snippet && (
                <div className="tcResultSnippet">{item.snippet}</div>
              )}
            </a>
          ))}
        </div>
      ) : (
        <PlainResultView text={raw} />
      )}
    </div>
  )
}

function PlainResultView({ text }: { text: string }) {
  const formatted = useMemo(() => {
    try {
      const obj = JSON.parse(text)
      return JSON.stringify(obj, null, 2)
    } catch {
      return text
    }
  }, [text])

  return (
    <pre className="tcResultPlain">{formatted}</pre>
  )
}

// ─── 主组件 ───

export function ToolCallItem({ tc }: { tc: ToolCallData }) {
  const [expanded, setExpanded] = useState(false)
  const meta = resolveToolMeta(tc)
  const stats = resultStats(tc)
  const isLoading = tc.status === 'running' || tc.status === 'pending'
  const hasContent = !!tc.result || (tc.arguments && Object.keys(tc.arguments).length > 0)
  const canExpand = hasContent && !isLoading

  const toggle = () => {
    if (canExpand) setExpanded((v) => !v)
  }

  return (
    <div className={`tcItem tcItem-${tc.status}`}>
      <div
        className={`tcHeader ${canExpand ? 'tcHeaderClickable' : ''}`}
        onClick={toggle}
      >
        <span className={`tcChevron ${expanded ? 'tcChevronOpen' : ''} ${!canExpand ? 'tcChevronHidden' : ''}`}>
          <ChevronRight size={14} />
        </span>

        <span className="tcIcon">
          {isLoading ? <Loader2 size={14} className="tcSpin" /> : meta.icon}
        </span>

        <span className="tcLabel">{meta.label}</span>

        {meta.params && (
          <span className="tcParams" title={meta.params}>{meta.params}</span>
        )}

        {stats && <span className="tcStats">{stats}</span>}

        {tc.status === 'error' && (
          <span className="tcError">Error</span>
        )}
      </div>

      {canExpand && expanded && (
        <div className="tcContent">
          <ToolResultContent tc={tc} />
        </div>
      )}
    </div>
  )
}
