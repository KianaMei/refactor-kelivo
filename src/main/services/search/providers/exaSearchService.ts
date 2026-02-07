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

/** Exa 配置 */
export interface ExaConfig {
  /** API Key */
  apiKey: string
  /** 自定义 Base URL (可选) */
  baseUrl?: string
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

  constructor(config: ExaConfig) {
    super()
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const opts = mergeSearchOptions(options)

    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
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
