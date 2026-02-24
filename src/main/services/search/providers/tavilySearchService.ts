/**
 * Tavily 搜索服务
 * https://tavily.com/
 */

import {
  SearchService,
  SearchResult,
  SearchResultItem,
  SearchOptions,
  mergeSearchOptions
} from '../searchService'

/** Tavily 配置 */
export interface TavilyConfig {
  apiKey: string
  depth?: 'basic' | 'advanced'
}

const BASE_URL = 'https://api.tavily.com'

/**
 * Tavily 搜索服务
 */
export class TavilySearchService extends SearchService {
  readonly name = 'Tavily'
  readonly type = 'tavily'

  private apiKey: string
  private depth: string

  constructor(config: TavilyConfig) {
    super()
    this.apiKey = config.apiKey
    this.depth = config.depth || 'advanced'
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const opts = mergeSearchOptions(options)

    const response = await fetch(`${BASE_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: opts.resultSize,
        search_depth: this.depth,
        include_answer: true,
        include_raw_content: false
      }),
      signal: AbortSignal.timeout(opts.timeout)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Tavily API error: ${response.status} - ${error}`)
    }

    const data = (await response.json()) as TavilyResponse

    const items: SearchResultItem[] = (data.results || []).map((r, index) => ({
      title: r.title || '',
      url: r.url || '',
      text: r.content || '',
      index
    }))

    return {
      answer: data.answer || undefined,
      items
    }
  }
}

/** Tavily API 响应类型 */
interface TavilyResponse {
  answer?: string
  results: Array<{
    title?: string
    url?: string
    content?: string
    score?: number
  }>
}
