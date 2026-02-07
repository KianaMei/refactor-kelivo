/**
 * DuckDuckGo 搜索服务
 * 使用 HTML 解析方式，无需 API Key
 */

import {
  SearchService,
  SearchResult,
  SearchResultItem,
  SearchOptions,
  mergeSearchOptions
} from '../searchService'

/** DuckDuckGo 配置 */
export interface DuckDuckGoConfig {
  /** 地区代码 (默认 'wt-wt' 表示全球) */
  region?: string
}

const BASE_URL = 'https://html.duckduckgo.com/html/'

/**
 * DuckDuckGo 搜索服务
 * 使用 HTML 接口，无需 API Key
 */
export class DuckDuckGoSearchService extends SearchService {
  readonly name = 'DuckDuckGo'
  readonly type = 'duckduckgo'

  private region: string

  constructor(config: DuckDuckGoConfig = {}) {
    super()
    this.region = config.region || 'wt-wt'
  }

  isAvailable(): boolean {
    return true // 无需 API Key
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const opts = mergeSearchOptions(options)

    const formData = new URLSearchParams({
      q: query,
      kl: this.region
    })

    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: formData,
      signal: AbortSignal.timeout(opts.timeout)
    })

    if (!response.ok) {
      throw new Error(`DuckDuckGo error: ${response.status}`)
    }

    const html = await response.text()
    const items = this.parseResults(html, opts.resultSize)

    return { items }
  }

  /**
   * 解析 DuckDuckGo HTML 结果
   */
  private parseResults(html: string, limit: number): SearchResultItem[] {
    const items: SearchResultItem[] = []

    // 简单的正则解析
    // DuckDuckGo HTML 结构: <a class="result__a" href="...">title</a>
    // <a class="result__snippet">snippet</a>

    // 匹配结果块
    const resultRegex = /<div class="result[^"]*"[^>]*>[\s\S]*?<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)<\/a>/g

    let match
    while ((match = resultRegex.exec(html)) !== null && items.length < limit) {
      const [, url, title, snippet] = match

      if (url && title) {
        // 解码 DuckDuckGo 的重定向 URL
        const realUrl = this.decodeRedirectUrl(url)

        items.push({
          title: this.decodeHtmlEntities(title.trim()),
          url: realUrl,
          text: this.decodeHtmlEntities(snippet?.trim() || ''),
          index: items.length
        })
      }
    }

    // 如果正则没匹配到，尝试更宽松的匹配
    if (items.length === 0) {
      const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g

      while ((match = linkRegex.exec(html)) !== null && items.length < limit) {
        const [, url, title] = match
        if (url && title && !url.includes('duckduckgo.com')) {
          const realUrl = this.decodeRedirectUrl(url)
          items.push({
            title: this.decodeHtmlEntities(title.trim()),
            url: realUrl,
            text: '',
            index: items.length
          })
        }
      }
    }

    return items
  }

  /**
   * 解码 DuckDuckGo 重定向 URL
   */
  private decodeRedirectUrl(url: string): string {
    // DuckDuckGo 使用 //duckduckgo.com/l/?uddg=<encoded_url> 格式
    const uddgMatch = url.match(/uddg=([^&]+)/)
    if (uddgMatch) {
      try {
        return decodeURIComponent(uddgMatch[1])
      } catch {
        return url
      }
    }
    return url
  }

  /**
   * 解码 HTML 实体
   */
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
