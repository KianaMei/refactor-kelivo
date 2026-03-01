/**
 * Prompt-based Tool Use Adapter
 *
 * 通过系统提示词注入工具定义 + XML 标签解析实现工具调用。
 * 适用于不支持原生 function calling 的模型，或用户选择 prompt 模式时。
 * 对齐 Flutter 版 prompt_tool_adapter.dart
 */

import type {
  ChatStreamChunk,
  ChatMessage,
  ToolDefinition,
  OnToolCallFn,
  ToolCallInfo,
  ToolResultInfo,
  RoundUsage
} from '../../chatStream'
import type { SendStreamParams, UserImage } from '../adapterParams'
import { sendMessageStream } from '../chatApiService'
import { buildPromptToolSystemPrompt, buildToolResultMessage } from '../../promptToolUse/promptToolUseService'
import { XmlTagExtractor, toolUseToXml } from '../../promptToolUse/xmlTagExtractor'
import type { ParsedToolUse } from '../../promptToolUse/xmlTagExtractor'

export interface PromptToolSendParams {
  config: SendStreamParams['config']
  modelId: string
  messages: ChatMessage[]
  userImages?: UserImage[]
  thinkingBudget?: number
  temperature?: number
  topP?: number
  maxTokens?: number
  maxToolLoopIterations?: number
  tools: ToolDefinition[]
  onToolCall: OnToolCallFn
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
  signal?: AbortSignal
}

/**
 * Prompt 模式流式请求处理器
 *
 * 1. 将工具定义注入系统提示词（XML 格式）
 * 2. 不传 tools 参数给底层 API
 * 3. 流式解析模型输出中的 <tool_use> 标签
 * 4. 检测到工具调用后自动执行，并将结果回传
 * 5. 循环直到模型不再输出工具调用或达到最大迭代次数
 */
export async function* sendPromptToolStream(
  params: PromptToolSendParams
): AsyncGenerator<ChatStreamChunk> {
  const {
    config,
    modelId,
    messages,
    userImages,
    thinkingBudget,
    temperature,
    topP,
    maxTokens,
    maxToolLoopIterations = 10,
    tools,
    onToolCall,
    extraHeaders,
    extraBody,
    signal
  } = params

  // 提取用户原始 system prompt 并构建增强版
  let userSystemPrompt = ''
  const enhancedMessages: ChatMessage[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      userSystemPrompt = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    } else {
      enhancedMessages.push({ ...msg })
    }
  }

  const enhancedSystemPrompt = buildPromptToolSystemPrompt({
    userSystemPrompt,
    tools
  })

  const messagesWithPrompt: ChatMessage[] = [
    { role: 'system', content: enhancedSystemPrompt },
    ...enhancedMessages
  ]

  let currentMessages = messagesWithPrompt
  let totalToolCallCount = 0
  const roundUsages: RoundUsage[] = []

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (totalToolCallCount >= maxToolLoopIterations) break

    const extractor = new XmlTagExtractor()
    let accumulatedContent = ''
    let detectedToolCall: ParsedToolUse | null = null

    // 底层请求 —— 不传 tools/onToolCall，工具逻辑由本适配器处理
    const stream = sendMessageStream({
      config,
      modelId,
      messages: currentMessages,
      userImages: totalToolCallCount === 0 ? userImages : undefined,
      thinkingBudget,
      temperature,
      topP,
      maxTokens,
      maxToolLoopIterations,
      tools: undefined,
      onToolCall: undefined,
      extraHeaders,
      extraBody,
      signal
    })

    let lastUsage: ChatStreamChunk['usage']
    let lastTotalTokens = 0

    for await (const chunk of stream) {
      if (chunk.usage) lastUsage = chunk.usage
      lastTotalTokens = chunk.totalTokens

      if (chunk.isDone) {
        // 流结束 —— 检查是否有待处理的工具调用
        if (detectedToolCall) {
          // yield 工具调用事件
          const callInfo: ToolCallInfo = {
            id: detectedToolCall.id,
            name: detectedToolCall.name,
            arguments: detectedToolCall.arguments
          }
          yield {
            content: '',
            isDone: false,
            totalTokens: lastTotalTokens,
            usage: lastUsage,
            toolCalls: [callInfo]
          }

          // 执行工具
          const result = await onToolCall(detectedToolCall.name, detectedToolCall.arguments)

          // yield 工具结果事件
          const resultInfo: ToolResultInfo = {
            id: detectedToolCall.id,
            name: detectedToolCall.name,
            arguments: detectedToolCall.arguments,
            content: result
          }
          yield {
            content: '',
            isDone: false,
            totalTokens: lastTotalTokens,
            usage: lastUsage,
            toolResults: [resultInfo]
          }

          // 构建工具结果消息
          const toolResultMsg = buildToolResultMessage({
            toolName: detectedToolCall.name,
            result
          })

          // 追加 assistant 消息（包含 XML 工具调用）和 user 消息（包含工具结果）
          currentMessages = [
            ...currentMessages,
            { role: 'assistant', content: accumulatedContent + toolUseToXml(detectedToolCall) },
            { role: 'user', content: toolResultMsg }
          ]

          // 记录本轮 usage
          if (lastUsage) {
            roundUsages.push({
              promptTokens: lastUsage.promptTokens,
              completionTokens: lastUsage.completionTokens,
              cachedTokens: lastUsage.cachedTokens,
              totalTokens: lastUsage.totalTokens
            })
            lastUsage.roundUsages = roundUsages
          }

          // 重置状态，进入下一轮
          totalToolCallCount++
          detectedToolCall = null
          accumulatedContent = ''
          break
        } else {
          // 记录本轮 usage
          if (lastUsage) {
            roundUsages.push({
              promptTokens: lastUsage.promptTokens,
              completionTokens: lastUsage.completionTokens,
              cachedTokens: lastUsage.cachedTokens,
              totalTokens: lastUsage.totalTokens
            })
            lastUsage.roundUsages = roundUsages
          }
          // 无工具调用，完成
          yield {
            content: '',
            isDone: true,
            totalTokens: lastTotalTokens,
            usage: lastUsage
          }
          return
        }
      }

      // 处理内容 —— 通过 XML 提取器
      if (chunk.content) {
        const results = extractor.processChunk(chunk.content)

        for (const result of results) {
          if (result.isTagContent) {
            // tool_use 标签内容 —— 解析
            const parsed = XmlTagExtractor.parseToolUse(result.content)
            if (parsed) {
              detectedToolCall = parsed
            }
          } else {
            // 普通内容 —— 透传
            if (result.content) {
              accumulatedContent += result.content
              yield {
                content: result.content,
                reasoning: chunk.reasoning,
                isDone: false,
                totalTokens: lastTotalTokens,
                usage: lastUsage
              }
            }
          }
        }
      } else if (chunk.reasoning) {
        // 推理内容透传
        yield {
          content: '',
          reasoning: chunk.reasoning,
          isDone: false,
          totalTokens: lastTotalTokens,
          usage: lastUsage
        }
      }
    }

    // 如果本轮没有检测到工具调用，结束
    if (detectedToolCall === null && totalToolCallCount > 0) {
      return
    }
  }

  // 到达工具调用上限后，发一次不带工具定义的请求，让模型基于已有结果生成回复
  const finalMessages: ChatMessage[] = [
    { role: 'system', content: userSystemPrompt || '' },
    ...currentMessages.filter(m => m.role !== 'system')
  ]

  const finalStream = sendMessageStream({
    config,
    modelId,
    messages: finalMessages,
    thinkingBudget,
    temperature,
    topP,
    maxTokens,
    maxToolLoopIterations,
    tools: undefined,
    onToolCall: undefined,
    extraHeaders,
    extraBody,
    signal
  })

  let finalUsage: ChatStreamChunk['usage']
  try {
    for await (const chunk of finalStream) {
      if (chunk.usage) finalUsage = chunk.usage
      if (chunk.content || chunk.reasoning) {
        yield {
          content: chunk.content,
          reasoning: chunk.reasoning,
          isDone: false,
          totalTokens: chunk.totalTokens,
          usage: chunk.usage
        }
      }
      if (chunk.isDone) break
    }
  } catch {
    // 最终请求失败时静默处理
  }

  if (finalUsage) {
    roundUsages.push({
      promptTokens: finalUsage.promptTokens,
      completionTokens: finalUsage.completionTokens,
      cachedTokens: finalUsage.cachedTokens,
      totalTokens: finalUsage.totalTokens
    })
    finalUsage.roundUsages = roundUsages
  }

  yield {
    content: '',
    isDone: true,
    totalTokens: 0,
    usage: finalUsage
  }
}
