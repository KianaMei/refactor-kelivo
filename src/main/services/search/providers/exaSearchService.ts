/**
 * Exa 搜索服务
 * https://exa.ai/
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

/** Exa 配置 */
export interface ExaConfig {
  /** API Key */
  apiKey: string
  /** 自定义 Base URL (可选) */
  baseUrl?: string
  id?: string
  apiKeys?: SearchApiKeyConfig[]
  strategy?: SearchLoadBalanceStrategy
}

const DEFAULT_BASE_URL = 'https://api.exa.ai'

/**
 * Exa 搜索服务
 */
export class ExaSearchService extends SearchService {
  readonly name = 'Exa'
  readonly type = 'exa'

  private apiKey: string
  private baseUrl: string
  private serviceId: string
  private apiKeys: SearchApiKeyConfig[] | undefined
  private strategy: SearchLoadBalanceStrategy | undefined

  constructor(config: ExaConfig) {
    super()
    this.serviceId = config.id ?? ''
    this.apiKey = config.apiKey ?? ''
    this.apiKeys = config.apiKeys
    this.strategy = config.strategy
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL
  }

  isAvailable(): boolean {
    const hasMultiKey = this.apiKeys?.some(k => k.isEnabled && k.key.trim())
    return !!(hasMultiKey || this.apiKey)
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const opts = mergeSearchOptions(options)
    const key = selectSearchApiKey(this.serviceId, this.apiKey, this.apiKeys, this.strategy)

    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key
      },
      body: JSON.stringify({
        query,
        numResults: opts.resultSize,
        contents: {
          text: { maxCharacters: 1000 }
        }
      }),
      signal: AbortSignal.timeout(opts.timeout)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Exa API error: ${response.status} - ${error}`)
    }

    const data = (await response.json()) as ExaResponse

    const items: SearchResultItem[] = (data.results || []).map((r, index) => ({
      title: r.title || '',
      url: r.url || '',
      text: r.text || r.snippet || '',
      id: r.id,
      index
    }))

    return { items }
  }
}

/** Exa API 响应类型 */
interface ExaResponse {
  results: Array<{
    id?: string
    url?: string
    title?: string
    text?: string
    snippet?: string
  }>
}
