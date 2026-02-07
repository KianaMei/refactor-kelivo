/**
 * Search related types shared between main and renderer
 */

export const SEARCH_CHANNELS = {
    SEARCH: 'search:execute',
    GET_PROVIDERS: 'search:getProviders',
    REGISTER_PROVIDER: 'search:registerProvider',
    UNREGISTER_PROVIDER: 'search:unregisterProvider',
    SET_DEFAULT_PROVIDER: 'search:setDefaultProvider'
} as const

export interface SearchRequest {
    query: string
    serviceId?: string
    options?: {
        resultSize?: number
        timeout?: number
    }
    format?: 'json' | 'xml' | 'markdown'
}

export interface SearchResultItem {
    title: string
    url: string
    text: string
    index?: number
}

export interface SearchResponse {
    success: boolean
    data?: {
        answer?: string
        items: SearchResultItem[]
        formatted?: string
    }
    error?: string
}

// Search Configs
export interface ExaConfig {
    apiKey: string
    baseUrl?: string
}

export interface TavilyConfig {
    apiKey: string
}

export interface BraveConfig {
    apiKey: string
}

export interface DuckDuckGoConfig {
    region?: string
}

export type SearchServiceConfigUnion =
    | ({ type: 'exa' } & ExaConfig)
    | ({ type: 'tavily' } & TavilyConfig)
    | ({ type: 'brave' } & BraveConfig)
    | ({ type: 'duckduckgo' } & DuckDuckGoConfig)
