/**
 * 搜索服务工厂
 * 创建和管理搜索服务实例
 */

import { SearchService, type SearchOptions, type SearchResult } from './searchService'
import { ExaSearchService } from './providers/exaSearchService'
import { TavilySearchService } from './providers/tavilySearchService'
import { BraveSearchService } from './providers/braveSearchService'
import { DuckDuckGoSearchService } from './providers/duckduckgoSearchService'
import type {
  SearchServiceConfigUnion,
  ExaConfig,
  TavilyConfig,
  BraveConfig,
  DuckDuckGoConfig
} from '../../../shared/search'

// 重新导出类型以便兼容
export type { SearchServiceConfigUnion }

/**
 * 创建搜索服务实例
 */
export function createSearchService(config: SearchServiceConfigUnion): SearchService {
  switch (config.type) {
    case 'exa':
      return new ExaSearchService(config)
    case 'tavily':
      return new TavilySearchService(config)
    case 'brave':
      return new BraveSearchService(config)
    case 'duckduckgo':
      return new DuckDuckGoSearchService(config)
    default:
      throw new Error(`Unknown search service type: ${(config as { type: string }).type}`)
  }
}

/** 搜索服务管理器 */
class SearchServiceManager {
  private services = new Map<string, SearchService>()
  private defaultServiceId: string | null = null

  /**
   * 注册搜索服务
   */
  register(id: string, service: SearchService, isDefault = false): void {
    this.services.set(id, service)
    if (isDefault || this.defaultServiceId === null) {
      this.defaultServiceId = id
    }
  }

  /**
   * 注销搜索服务
   */
  unregister(id: string): boolean {
    const deleted = this.services.delete(id)
    if (deleted && this.defaultServiceId === id) {
      this.defaultServiceId = this.services.keys().next().value ?? null
    }
    return deleted
  }

  /**
   * 获取搜索服务
   */
  get(id: string): SearchService | undefined {
    return this.services.get(id)
  }

  /**
   * 获取默认搜索服务
   */
  getDefault(): SearchService | undefined {
    return this.defaultServiceId ? this.services.get(this.defaultServiceId) : undefined
  }

  /**
   * 设置默认搜索服务
   */
  setDefault(id: string): boolean {
    if (this.services.has(id)) {
      this.defaultServiceId = id
      return true
    }
    return false
  }

  /**
   * 获取所有可用的搜索服务
   */
  getAvailable(): Array<{ id: string; name: string; type: string }> {
    return Array.from(this.services.entries())
      .filter(([, service]) => service.isAvailable())
      .map(([id, service]) => ({
        id,
        name: service.name,
        type: service.type
      }))
  }

  /**
   * 使用指定或默认服务执行搜索
   */
  async search(
    query: string,
    options?: SearchOptions & { serviceId?: string }
  ): Promise<SearchResult> {
    const { serviceId, ...searchOptions } = options || {}

    const service = serviceId ? this.get(serviceId) : this.getDefault()

    if (!service) {
      throw new Error(serviceId ? `Search service not found: ${serviceId}` : 'No search service available')
    }

    if (!service.isAvailable()) {
      throw new Error(`Search service ${service.name} is not available (missing configuration)`)
    }

    return service.search(query, searchOptions)
  }

  /**
   * 清空所有服务
   */
  clear(): void {
    this.services.clear()
    this.defaultServiceId = null
  }
}

// 全局搜索服务管理器
export const searchManager = new SearchServiceManager()

// 默认注册 DuckDuckGo（无需配置）
searchManager.register('duckduckgo', new DuckDuckGoSearchService(), true)

// Re-export
export { SearchService, SearchResult, SearchOptions }
export { ExaSearchService, type ExaConfig }
export { TavilySearchService, type TavilyConfig }
export { BraveSearchService, type BraveConfig }
export { DuckDuckGoSearchService, type DuckDuckGoConfig }
