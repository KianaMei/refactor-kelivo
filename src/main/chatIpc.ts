import { ipcMain } from 'electron'
import crypto from 'crypto'

import { IpcChannel } from '../shared/ipc'
import type { ChatMessageInput, ChatStreamStartParams } from '../shared/chat'
import { loadConfig } from './configStore'
import { isAbortError, joinUrl, safeReadText } from './http'

type StreamState = {
  controller: AbortController
}

const streams = new Map<string, StreamState>()

export function registerChatIpc(): void {
  ipcMain.handle(IpcChannel.ChatStreamStart, async (event, params: ChatStreamStartParams) => {
    const streamId = safeUuid()
    const controller = new AbortController()
    streams.set(streamId, { controller })

    void runStream(event.sender, streamId, params, controller.signal)
    return streamId
  })

  ipcMain.handle(IpcChannel.ChatStreamAbort, async (_event, streamId: string) => {
    const st = streams.get(streamId)
    if (!st) return
    st.controller.abort()
  })

  // 测试连接 - 发送一个简单的非流式请求验证连接
  ipcMain.handle(IpcChannel.ChatTest, async (_event, params: { providerId: string; modelId: string }) => {
    const cfg = await loadConfig()
    const provider = cfg.providerConfigs[params.providerId]
    if (!provider) {
      throw new Error(`未找到供应商：${params.providerId}`)
    }

    if ((provider.providerType ?? 'openai') !== 'openai') {
      throw new Error(`当前暂不支持该供应商类型：${provider.providerType ?? 'unknown'}`)
    }

    const url = joinUrl(provider.baseUrl, provider.chatPath ?? '/chat/completions')
    const apiKey = provider.apiKey
    if (!apiKey) throw new Error('该供应商未配置 API Key')

    // 发送一个简单的测试请求（非流式，max_tokens=1）
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒超时

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: params.modelId,
          messages: [{ role: 'user', content: 'Hi' }],
          stream: false,
          max_tokens: 1
        }),
        signal: controller.signal
      })

      if (!resp.ok) {
        const text = await safeReadText(resp)
        throw new Error(`HTTP ${resp.status}: ${text}`)
      }

      // 成功 - 不需要返回任何内容
    } finally {
      clearTimeout(timeoutId)
    }
  })
}

function safeUuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}

async function runStream(
  sender: Electron.WebContents,
  streamId: string,
  params: ChatStreamStartParams,
  signal: AbortSignal
): Promise<void> {
  try {
    const cfg = await loadConfig()
    const provider = cfg.providerConfigs[params.providerId]
    if (!provider) {
      throw new Error(`未找到供应商：${params.providerId}`)
    }

    // 先实现 OpenAI-compatible（旧版里也属于 openai 分支）；Claude/Gemini 适配后续补齐。
    if ((provider.providerType ?? 'openai') !== 'openai') {
      throw new Error(`当前暂不支持该供应商类型：${provider.providerType ?? 'unknown'}`)
    }

    const url = joinUrl(provider.baseUrl, provider.chatPath ?? '/chat/completions')
    const apiKey = provider.apiKey
    if (!apiKey) throw new Error('该供应商未配置 API Key')

    for await (const delta of openaiChatCompletionsStream(
      {
        url,
        apiKey,
        modelId: params.modelId,
        messages: params.messages,
        temperature: params.temperature,
        topP: params.topP,
        maxTokens: params.maxTokens
      },
      signal
    )) {
      if (sender.isDestroyed()) return
      sender.send(IpcChannel.ChatStreamChunk, {
        streamId,
        chunk: { content: delta, isDone: false }
      })
    }

    if (!sender.isDestroyed()) {
      sender.send(IpcChannel.ChatStreamChunk, {
        streamId,
        chunk: { content: '', isDone: true }
      })
    }
  } catch (err) {
    if (isAbortError(err)) {
      if (!sender.isDestroyed()) {
        sender.send(IpcChannel.ChatStreamChunk, {
          streamId,
          chunk: { content: '', isDone: true }
        })
      }
      return
    }
    if (!sender.isDestroyed()) {
      sender.send(IpcChannel.ChatStreamError, {
        streamId,
        message: err instanceof Error ? err.message : String(err)
      })
    }
  } finally {
    streams.delete(streamId)
  }
}

async function* openaiChatCompletionsStream(
  input: {
    url: string
    apiKey: string
    modelId: string
    messages: ChatMessageInput[]
    temperature?: number
    topP?: number
    maxTokens?: number
  },
  signal: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const resp = await fetch(input.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: input.modelId,
      messages: input.messages,
      stream: true,
      temperature: input.temperature,
      top_p: input.topP,
      max_tokens: input.maxTokens
    }),
    signal
  })

  if (!resp.ok) {
    const text = await safeReadText(resp)
    throw new Error(`HTTP ${resp.status}: ${text}`)
  }

  if (!resp.body) throw new Error('上游未返回 body（无法流式读取）')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    while (true) {
      const idx = buf.indexOf('\n')
      if (idx < 0) break
      const rawLine = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      const line = rawLine.trim()
      if (!line) continue
      if (!line.startsWith('data:')) continue
      const data = line.slice('data:'.length).trim()
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data) as any
        const delta = json?.choices?.[0]?.delta
        const content = typeof delta?.content === 'string' ? delta.content : ''
        if (content) yield content
      } catch {
        // 忽略单条解析失败（避免一条坏包导致整条流中断）
      }
    }
  }
}
