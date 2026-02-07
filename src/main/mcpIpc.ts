/**
 * MCP IPC
 * - 目前先实现“同步工具列表”（对齐 Flutter：refreshTools）
 * - 连接/调用工具后续再扩展
 */

import { ipcMain } from 'electron'

import type { McpToolConfig, McpListToolsResponse } from '../shared/types'
import { loadConfig } from './configStore'
import { listMcpTools } from './services/mcp/mcpClient'

export const MCP_CHANNELS = {
  LIST_TOOLS: 'mcp:listTools'
} as const

export function registerMcpIpc(): void {
  ipcMain.handle(MCP_CHANNELS.LIST_TOOLS, async (_event, serverId: string): Promise<McpListToolsResponse> => {
    try {
      const cfg = await loadConfig()
      const server = (cfg.mcpServers ?? []).find((s) => s.id === serverId)
      if (!server) return { success: false, error: '未找到 MCP 服务器' }

      const result = await listMcpTools({
        transport: server.transport,
        url: server.url,
        headers: server.headers ?? {}
      })

      return {
        success: true,
        tools: result.tools.map((t) => ({
          name: t.name,
          description: t.description,
          schema: t.inputSchema
        }))
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

