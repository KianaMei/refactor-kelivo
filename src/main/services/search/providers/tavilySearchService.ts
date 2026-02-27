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
import type { SearchApiKeyConfig, SearchLoadBalanceStrategy } from '../../../../shared/types'
import { selectSearchApiKey } from '../searchKeyHelper'

/** Tavily 配置 */
export interface TavilyConfig {
  apiKey: string
  depth?: 'basic' | 'advanced'
  id?: string
  apiKeys?: SearchApiKeyConfig[]
  strategy?: SearchLoadBalanceStrategy
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
  private serviceId: string
  private apiKeys: SearchApiKeyConfig[] | undefined
  private strategy: SearchLoadBalanceStrategy | undefined

  constructor(config: TavilyConfig) {
    super()
    this.serviceId = config.id ?? ''
    this.apiKey = config.apiKey ?? ''
    this.apiKeys = config.apiKeys
    this.strategy = config.strategy
    this.depth = config.depth || 'advanced'
  }

  isAvailable(): boolean {
    const hasMultiKey = this.apiKeys?.some(k => k.isEnabled && k.key.trim())
    return !!(hasMultiKey || this.apiKey)
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const opts = mergeSearchOptions(options)
    const key = selectSearchApiKey(this.serviceId, this.apiKey, this.apiKeys, this.strategy)

    const response = await fetch(`${BASE_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: key,
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
