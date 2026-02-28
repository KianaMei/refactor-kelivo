/**
 * 搜索 IPC
 * 将搜索服务通过 IPC 暴露给 renderer 进程
 */

import { ipcMain } from 'electron'
import {
  searchManager,
  createSearchService
} from './services/search'
import { formatSearchResultsXml, formatSearchResultsMarkdown } from './services/search/searchService'
import { IpcChannel } from '../shared/ipc'
import { type SearchRequest, type SearchResponse, type SearchServiceConfigUnion } from '../shared/search'
export { type SearchRequest, type SearchResponse }

/**
 * 注册搜索 IPC 处理器
 */
export function registerSearchIpc(): void {
  // 执行搜索
  ipcMain.handle(
    IpcChannel.SearchExecute,
    async (_event, request: SearchRequest): Promise<SearchResponse> => {
      const { query, options, serviceId, format } = request

      if (!query?.trim()) {
        return { success: false, error: 'Query is required' }
      }

      try {
        const result = await searchManager.search(query, {
          ...options,
          serviceId
        })

        let formatted: string | undefined

        if (format === 'xml') {
          formatted = formatSearchResultsXml(result)
        } else if (format === 'markdown') {
          formatted = formatSearchResultsMarkdown(result)
        }

        return {
          success: true,
          data: {
            ...result,
            formatted
          }
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  // 获取可用服务列表
  ipcMain.handle(IpcChannel.SearchListProviders, (): Array<{
    id: string
    name: string
    type: string
  }> => {
    return searchManager.getAvailable()
  })

  // 注册搜索服务
  ipcMain.handle(
    IpcChannel.SearchRegister,
    (_event, id: string, config: SearchServiceConfigUnion, isDefault?: boolean): boolean => {
      try {
        const service = createSearchService(config)
        searchManager.register(id, service, isDefault)
        return true
      } catch (error) {
        console.error('Failed to register search service:', error)
        return false
      }
    }
  )

  // 注销搜索服务
  ipcMain.handle(IpcChannel.SearchUnregister, (_event, id: string): boolean => {
    return searchManager.unregister(id)
  })

  // 设置默认服务
  ipcMain.handle(IpcChannel.SearchSetDefault, (_event, id: string): boolean => {
    return searchManager.setDefault(id)
  })
}

/** 搜索 preload API 类型定义 */
export interface SearchPreloadApi {
  search: (request: SearchRequest) => Promise<SearchResponse>
  listProviders: () => Promise<Array<{ id: string; name: string; type: string }>>
  register: (id: string, config: SearchServiceConfigUnion, isDefault?: boolean) => Promise<boolean>
  unregister: (id: string) => Promise<boolean>
  setDefault: (id: string) => Promise<boolean>
}

/**
 * 创建 preload API 实现
 */
export function createSearchPreloadApi(ipcRenderer: Electron.IpcRenderer): SearchPreloadApi {
  return {
    search: (request) => ipcRenderer.invoke(IpcChannel.SearchExecute, request),
    listProviders: () => ipcRenderer.invoke(IpcChannel.SearchListProviders),
    register: (id, config, isDefault) =>
      ipcRenderer.invoke(IpcChannel.SearchRegister, id, config, isDefault),
    unregister: (id) => ipcRenderer.invoke(IpcChannel.SearchUnregister, id),
    setDefault: (id) => ipcRenderer.invoke(IpcChannel.SearchSetDefault, id)
  }
}
