/**
 * Brave 搜索服务
 * https://brave.com/search/api/
 */

import {
  SearchService,
  SearchResult,
  SearchResultItem,
  SearchOptions,
  mergeSearchOptions
} from '../searchService'

/** Brave 配置 */
export interface BraveConfig {
  /** API Key */
  apiKey: string
}

const BASE_URL = 'https://api.search.brave.com/res/v1'

/**
 * Brave 搜索服务
 */
export class BraveSearchService extends SearchService {
  readonly name = 'Brave'
  readonly type = 'brave'

  private apiKey: string

  constructor(config: BraveConfig) {
    super()
    this.apiKey = config.apiKey
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const opts = mergeSearchOptions(options)

    const params = new URLSearchParams({
      q: query,
      count: String(opts.resultSize)
    })

    const response = await fetch(`${BASE_URL}/web/search?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': this.apiKey
      },
      signal: AbortSignal.timeout(opts.timeout)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Brave API error: ${response.status} - ${error}`)
    }

    const data = (await response.json()) as BraveResponse

    const items: SearchResultItem[] = (data.web?.results || []).map((r, index) => ({
      title: r.title || '',
      url: r.url || '',
      text: r.description || '',
      index
    }))

    return { items }
  }
}

/** Brave API 响应类型 */
interface BraveResponse {
  web?: {
    results: Array<{
      title?: string
      url?: string
      description?: string
    }>
  }
}
