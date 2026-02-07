/**
 * 记忆工具处理器
 * 处理 LLM 的记忆工具调用
 */

import type { ToolDefinition } from '../../shared/chatStream'
import * as memoryRepo from '../db/repositories/memoryRepo'

/** 记忆工具定义 */
export const MEMORY_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_memory',
      description: 'create a memory record',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The content of the memory record'
          }
        },
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_memory',
      description: 'update a memory record',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            description: 'The id of the memory record'
          },
          content: {
            type: 'string',
            description: 'The content of the memory record'
          }
        },
        required: ['id', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_memory',
      description: 'delete a memory record',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            description: 'The id of the memory record'
          }
        },
        required: ['id']
      }
    }
  }
]

/** 记忆工具名称集合 */
export const MEMORY_TOOL_NAMES = new Set(['create_memory', 'edit_memory', 'delete_memory'])

/**
 * 检查是否为记忆工具
 */
export function isMemoryTool(toolName: string): boolean {
  return MEMORY_TOOL_NAMES.has(toolName)
}

/** 记忆工具调用结果 */
export interface MemoryToolResult {
  success: boolean
  content?: string
  error?: string
}

/**
 * 处理记忆工具调用
 *
 * @param params 工具调用参数
 * @returns 工具调用结果，如果不是记忆工具返回 null
 */
export async function handleMemoryToolCall(params: {
  toolName: string
  args: Record<string, unknown>
  assistantId: string
}): Promise<MemoryToolResult | null> {
  const { toolName, args, assistantId } = params

  if (!isMemoryTool(toolName)) {
    return null // 不是记忆工具
  }

  try {
    switch (toolName) {
      case 'create_memory': {
        const content = String(args.content ?? '').trim()
        if (!content) {
          return { success: false, error: 'Content is required' }
        }

        const memory = memoryRepo.createMemory({ assistantId, content })
        return { success: true, content: memory.content }
      }

      case 'edit_memory': {
        const id = Number(args.id)
        const content = String(args.content ?? '').trim()

        if (!Number.isInteger(id) || id <= 0) {
          return { success: false, error: 'Valid id is required' }
        }
        if (!content) {
          return { success: false, error: 'Content is required' }
        }

        const memory = memoryRepo.updateMemory(id, content)
        if (!memory) {
          return { success: false, error: `Memory with id ${id} not found` }
        }
        return { success: true, content: memory.content }
      }

      case 'delete_memory': {
        const id = Number(args.id)

        if (!Number.isInteger(id) || id <= 0) {
          return { success: false, error: 'Valid id is required' }
        }

        const deleted = memoryRepo.deleteMemory(id)
        if (!deleted) {
          return { success: false, error: `Memory with id ${id} not found` }
        }
        return { success: true, content: 'deleted' }
      }

      default:
        return null
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * 格式化记忆工具结果为字符串
 * 用于返回给 LLM
 */
export function formatMemoryToolResult(result: MemoryToolResult): string {
  if (result.success) {
    return result.content ?? 'success'
  } else {
    return `Error: ${result.error ?? 'unknown error'}`
  }
}

/**
 * 获取 assistant 的所有记忆
 */
export function getMemoriesForAssistant(assistantId: string) {
  return memoryRepo.listMemories(assistantId)
}
