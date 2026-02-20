/**
 * DuckDuckGo 搜索服务
 *
 * 使用 Electron net.fetch（Chromium 网络栈）发请求，
 * 自动管理 cookies，无需手动提取和传递。
 *
 * 流程：
 *   1. POST https://duckduckgo.com  → 获取 vqd token（cookies 自动保存）
 *   2. GET  https://links.duckduckgo.com/d.js?q=...&vqd=...  → JSON 结果
 */

import { net } from 'electron'
import {
  SearchService,
  SearchResult,
  SearchResultItem,
  SearchOptions,
  mergeSearchOptions
} from '../searchService'
import type { DuckDuckGoConfig } from '../../../../shared/search'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * DuckDuckGo 搜索服务
 */
export class DuckDuckGoSearchService extends SearchService {
  readonly name = 'DuckDuckGo'
  readonly type = 'duckduckgo'

  private region: string
  private safeSearch: string
  private timeRange: string

  constructor(config: DuckDuckGoConfig = {}) {
    super()
    this.region = config.region || 'wt-wt'
    this.safeSearch = config.safeSearch || 'moderate'
    this.timeRange = config.timeRange || ''
  }

  isAvailable(): boolean {
    return true
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const opts = mergeSearchOptions(options)

    // 1. 获取 vqd token（net.fetch 自动保存 cookies）
    const vqd = await this.getVqd(query, opts.timeout)

    // safeSearch: off=-2, moderate=-1, strict=1
    const safeSearchMap: Record<string, string> = { off: '-2', moderate: '-1', strict: '1' }
    const p = safeSearchMap[this.safeSearch] ?? '-1'

    // 2. 用 vqd 查询 JSON API（cookies 自动携带）
    const params = new URLSearchParams({
      q: query,
      kl: this.region,
      l: this.region,
      vqd,
      o: 'json',
      sp: '0',
      p,
      ex: '-1'
    })

    if (this.timeRange) {
      params.set('df', this.timeRange)
    }

    const resp = await net.fetch(`https://links.duckduckgo.com/d.js?${params}`, {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://duckduckgo.com/'
      },
      signal: AbortSignal.timeout(opts.timeout)
    })

    if (!resp.ok) {
      throw new Error(`DuckDuckGo search error: ${resp.status}`)
    }

    const body = await resp.text()
    const items = this.parseJsonResults(body, opts.resultSize)

    if (items.length > 0) {
      return { items }
    }

    // JSON API 无结果，回退到 HTML
    const fallback = await this.searchHtmlFallback(query, opts)

    if (fallback.items.length > 0) {
      return fallback
    }

    throw new Error(
      `DuckDuckGo: 0 results. JSON body=${body.length} chars, query="${query}"`
    )
  }

  // ─── vqd token ───

  private async getVqd(query: string, timeout: number): Promise<string> {
    const resp = await net.fetch('https://duckduckgo.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT
      },
      body: new URLSearchParams({ q: query }).toString(),
      signal: AbortSignal.timeout(timeout)
    })

    const vqdHeader = resp.headers.get('x-vqd-4')
    if (vqdHeader) return vqdHeader

    const html = await resp.text()
    const m = html.match(/vqd=["']?([^"'&\s]+)/)
    if (m) return m[1]

    throw new Error('Failed to obtain DuckDuckGo vqd token')
  }

  // ─── JSON 结果解析 ───

  private parseJsonResults(body: string, limit: number): SearchResultItem[] {
    let data: Record<string, unknown>

    try {
      data = JSON.parse(body)
    } catch {
      const jsonMatch = body.match(/DDG\.\w+\.load\(\s*'d'\s*,\s*(\{[\s\S]*\})\s*\)/)
      if (jsonMatch) {
        try {
          data = JSON.parse(jsonMatch[1])
        } catch {
          return []
        }
      } else {
        return []
      }
    }

    const results = Array.isArray(data.results) ? data.results : []
    const items: SearchResultItem[] = []

    for (const r of results) {
      if (!r || typeof r !== 'object') continue
      const rec = r as Record<string, unknown>

      const title = String(rec.t ?? rec.title ?? '').trim()
      const url = String(rec.u ?? rec.url ?? '').trim()
      const snippet = String(rec.a ?? rec.snippet ?? rec.body ?? '').trim()

      if (!title && !url) continue
      if (url.includes('duckduckgo.com/y.js')) continue
      if (!url.startsWith('http')) continue

      items.push({
        title: this.stripHtmlTags(this.decodeHtmlEntities(title)),
        url,
        text: this.stripHtmlTags(this.decodeHtmlEntities(snippet)),
        index: items.length
      })

      if (items.length >= limit) break
    }

    return items
  }

  // ─── HTML 回退 ───

  private async searchHtmlFallback(
    query: string,
    opts: Required<SearchOptions>
  ): Promise<SearchResult> {
    const resp = await net.fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT
      },
      body: new URLSearchParams({ q: query, kl: this.region, ...(this.timeRange ? { df: this.timeRange } : {}) }).toString(),
      signal: AbortSignal.timeout(opts.timeout)
    })

    if (!resp.ok) {
      throw new Error(`DuckDuckGo HTML fallback error: ${resp.status}`)
    }

    const html = await resp.text()
    return { items: this.parseHtmlResults(html, opts.resultSize) }
  }

  private parseHtmlResults(html: string, limit: number): SearchResultItem[] {
    const titleRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
    const titles: Array<{ url: string; raw: string; end: number }> = []
    let m: RegExpExecArray | null
    while ((m = titleRegex.exec(html)) !== null) {
      titles.push({ url: m[1], raw: m[2], end: m.index + m[0].length })
    }

    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    const snippets: Array<{ raw: string; pos: number }> = []
    while ((m = snippetRegex.exec(html)) !== null) {
      snippets.push({ raw: m[1], pos: m.index })
    }

    const items: SearchResultItem[] = []
    let si = 0

    for (const t of titles) {
      if (items.length >= limit) break
      const title = this.stripHtmlTags(t.raw).trim()
      if (!t.url || !title) continue

      while (si < snippets.length && snippets[si].pos < t.end) si++
      const snippet = si < snippets.length ? snippets[si] : undefined

      items.push({
        title: this.decodeHtmlEntities(title),
        url: this.decodeRedirectUrl(t.url),
        text: snippet ? this.decodeHtmlEntities(this.stripHtmlTags(snippet.raw).trim()) : '',
        index: items.length
      })

      if (snippet) si++
    }

    return items
  }

  // ─── 工具方法 ───

  private decodeRedirectUrl(url: string): string {
    const m = url.match(/uddg=([^&]+)/)
    if (m) {
      try {
        return decodeURIComponent(m[1])
      } catch {
        return url
      }
    }
    return url
  }

  private stripHtmlTags(text: string): string {
    return text.replace(/<[^>]*>/g, '')
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
  }
}
