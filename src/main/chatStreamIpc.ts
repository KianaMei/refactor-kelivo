/**
 * Chat Stream IPC
 * 将 ChatApiService 通过 IPC 暴露给 renderer 进程
 */

import { ipcMain, BrowserWindow } from 'electron'
import type { ProviderConfigV2 } from '../shared/types'
import type { ChatMessage, ToolDefinition, ChatStreamChunk } from '../shared/chatStream'
import { sendMessageStream } from './api/chatApiService'
import { getConfigStore } from './configStore'

// IPC 频道名称
export const CHAT_STREAM_CHANNELS = {
  /** 开始流式聊天请求 */
  START: 'chat:stream:start',
  /** 流式数据 chunk */
  CHUNK: 'chat:stream:chunk',
  /** 流式完成 */
  DONE: 'chat:stream:done',
  /** 流式错误 */
  ERROR: 'chat:stream:error',
  /** 中止流式请求 */
  ABORT: 'chat:stream:abort'
} as const

/** 流式请求参数 (从 renderer 发送) */
export interface ChatStreamRequest {
  /** 请求 ID (用于匹配响应) */
  requestId: string
  /** Provider ID */
  providerId: string
  /** 模型 ID */
  modelId: string
  /** 消息列表 */
  messages: ChatMessage[]
  /** 用户附加的图片路径 */
  userImagePaths?: string[]
  /** 思考预算 */
  thinkingBudget?: number
  /** 温度 */
  temperature?: number
  /** Top P */
  topP?: number
  /** 最大输出 tokens */
  maxTokens?: number
  /** 工具列表 */
  tools?: ToolDefinition[]
  /** 额外请求头 */
  extraHeaders?: Record<string, string>
  /** 额外请求体参数 */
  extraBody?: Record<string, unknown>
}

// 存储活跃的 AbortController
const activeRequests = new Map<string, AbortController>()

/**
 * 注册 Chat Stream IPC 处理器
 */
export function registerChatStreamIpc(): void {
  // 处理开始流式请求
  ipcMain.on(CHAT_STREAM_CHANNELS.START, async (event, request: ChatStreamRequest) => {
    const { requestId, providerId, modelId, messages, ...params } = request
    const sender = event.sender

    // 创建 AbortController
    const abortController = new AbortController()
    activeRequests.set(requestId, abortController)

    try {
      // 获取 provider 配置
      const configStore = getConfigStore()
      const appConfig = configStore.get()
      const providerConfig = appConfig.providerConfigs[providerId]

      if (!providerConfig) {
        sender.send(CHAT_STREAM_CHANNELS.ERROR, {
          requestId,
          error: `Provider not found: ${providerId}`
        })
        return
      }

      // 发送流式请求
      for await (const chunk of sendMessageStream({
        config: providerConfig,
        modelId,
        messages,
        ...params,
        signal: abortController.signal
      })) {
        // 检查 sender 是否还有效
        if (sender.isDestroyed()) {
          break
        }

        // 发送 chunk
        sender.send(CHAT_STREAM_CHANNELS.CHUNK, {
          requestId,
          chunk
        })

        if (chunk.isDone) {
          sender.send(CHAT_STREAM_CHANNELS.DONE, { requestId })
          break
        }
      }
    } catch (error) {
      // 检查是否是中止错误
      if (error instanceof Error && error.name === 'AbortError') {
        // 已中止，不发送错误
        return
      }

      // 发送错误
      if (!sender.isDestroyed()) {
        sender.send(CHAT_STREAM_CHANNELS.ERROR, {
          requestId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    } finally {
      activeRequests.delete(requestId)
    }
  })

  // 处理中止请求
  ipcMain.on(CHAT_STREAM_CHANNELS.ABORT, (event, requestId: string) => {
    const controller = activeRequests.get(requestId)
    if (controller) {
      controller.abort()
      activeRequests.delete(requestId)
    }
  })
}

/**
 * 清理所有活跃的请求 (在窗口关闭时调用)
 */
export function cleanupChatStreamRequests(): void {
  for (const [requestId, controller] of activeRequests) {
    controller.abort()
  }
  activeRequests.clear()
}

/**
 * 在 preload 中暴露给 renderer 的 API
 */
export const chatStreamPreloadApi = {
  /**
   * 发送流式聊天请求
   */
  sendStream: (
    request: Omit<ChatStreamRequest, 'requestId'>,
    onChunk: (chunk: ChatStreamChunk) => void,
    onDone: () => void,
    onError: (error: string) => void
  ): { abort: () => void } => {
    const requestId = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`

    // 这个函数应该在 preload 中实现
    // 这里只是类型定义
    return { abort: () => {} }
  }
}
