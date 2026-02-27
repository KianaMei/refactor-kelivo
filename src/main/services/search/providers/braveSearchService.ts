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
import type { SearchApiKeyConfig, SearchLoadBalanceStrategy } from '../../../../shared/types'
import { selectSearchApiKey } from '../searchKeyHelper'

/** Brave 配置 */
export interface BraveConfig {
  /** API Key */
  apiKey: string
  id?: string
  apiKeys?: SearchApiKeyConfig[]
  strategy?: SearchLoadBalanceStrategy
}

const BASE_URL = 'https://api.search.brave.com/res/v1'

/**
 * Brave 搜索服务
 */
export class BraveSearchService extends SearchService {
  readonly name = 'Brave'
  readonly type = 'brave'

  private apiKey: string
  private serviceId: string
  private apiKeys: SearchApiKeyConfig[] | undefined
  private strategy: SearchLoadBalanceStrategy | undefined

  constructor(config: BraveConfig) {
    super()
    this.serviceId = config.id ?? ''
    this.apiKey = config.apiKey ?? ''
    this.apiKeys = config.apiKeys
    this.strategy = config.strategy
  }

  isAvailable(): boolean {
    const hasMultiKey = this.apiKeys?.some(k => k.isEnabled && k.key.trim())
    return !!(hasMultiKey || this.apiKey)
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const opts = mergeSearchOptions(options)
    const key = selectSearchApiKey(this.serviceId, this.apiKey, this.apiKeys, this.strategy)

    const params = new URLSearchParams({
      q: query,
      count: String(opts.resultSize)
    })

    const response = await fetch(`${BASE_URL}/web/search?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': key
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
