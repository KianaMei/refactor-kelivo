/**
 * MCP IPC
 * - 目前先实现“同步工具列表”（对齐 Flutter：refreshTools�? * - 连接/调用工具后续再扩�? */

import { ipcMain } from 'electron'

import type {
  McpListToolsResponse,
  McpCallToolRequest,
  McpCallToolResponse
} from '../shared/types'
import { loadConfig } from './configStore'
import { listMcpTools, callMcpTool } from './services/mcp/mcpClient'

export const MCP_CHANNELS = {
  LIST_TOOLS: 'mcp:listTools',
  CALL_TOOL: 'mcp:callTool'
} as const

export function registerMcpIpc(): void {
  ipcMain.handle(MCP_CHANNELS.LIST_TOOLS, async (_event, serverId: string): Promise<McpListToolsResponse> => {
    try {
      const cfg = await loadConfig()
      const server = (cfg.mcpServers ?? []).find((s) => s.id === serverId)
      if (!server) return { success: false, error: 'MCP server not found' }

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

  ipcMain.handle(MCP_CHANNELS.CALL_TOOL, async (_event, req: McpCallToolRequest): Promise<McpCallToolResponse> => {
    try {
      const serverId = String(req.serverId ?? '').trim()
      const toolName = String(req.toolName ?? '').trim()
      if (!serverId) return { success: false, error: 'serverId is required' }
      if (!toolName) return { success: false, error: 'toolName is required' }

      const cfg = await loadConfig()
      const server = (cfg.mcpServers ?? []).find((s) => s.id === serverId)
      if (!server) return { success: false, error: 'MCP server not found' }
      if (!server.enabled) return { success: false, error: 'MCP server is disabled' }

      const localTool = (server.tools ?? []).find((t) => t.name === toolName)
      if (localTool && !localTool.enabled) {
        return { success: false, error: `MCP tool is disabled: ${toolName}` }
      }

      const result = await callMcpTool({
        transport: server.transport,
        url: server.url,
        headers: server.headers ?? {},
        toolName,
        args: req.arguments
      })

      return {
        success: true,
        content: result.content,
        isError: result.isError
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}
