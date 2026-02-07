/**
 * 对话摘要服务
 * 生成和管理对话摘要
 */

import type { DbMessage, DbConversation } from '../../shared/db-types'
import { generateText } from '../api/chatApiService'
import * as conversationRepo from '../db/repositories/conversationRepo'
import { loadConfig } from '../configStore'

/** 摘要生成配置 */
export interface SummaryConfig {
  /** 触发摘要的最小消息数 */
  minMessages: number
  /** 摘要更新的消息数阈值（新增多少消息后重新生成） */
  updateThreshold: number
  /** 摘要最大长度 */
  maxLength: number
}

/** 默认摘要配置 */
export const DEFAULT_SUMMARY_CONFIG: SummaryConfig = {
  minMessages: 10,
  updateThreshold: 5,
  maxLength: 500
}

/** 摘要生成提示词 */
const SUMMARY_PROMPT = `请为以下对话生成一个简洁的摘要，用于帮助理解对话的主题和关键内容。
摘要要求：
1. 使用中文
2. 简洁明了，不超过 150 字
3. 包含对话的主要话题和关键结论
4. 不要使用"用户"、"助手"等称呼，直接描述内容

对话内容：
{messages}

请直接输出摘要，不需要任何前缀或标签。`

/**
 * 检查是否需要更新摘要
 *
 * @param conversation 对话
 * @param currentMessageCount 当前消息数
 * @param config 摘要配置
 */
export function shouldUpdateSummary(
  conversation: DbConversation,
  currentMessageCount: number,
  config: SummaryConfig = DEFAULT_SUMMARY_CONFIG
): boolean {
  // 消息数不足
  if (currentMessageCount < config.minMessages) {
    return false
  }

  // 从未生成过摘要
  if (!conversation.summary || conversation.lastSummarizedMessageCount === 0) {
    return true
  }

  // 新增消息数超过阈值
  const newMessages = currentMessageCount - conversation.lastSummarizedMessageCount
  return newMessages >= config.updateThreshold
}

/**
 * 格式化消息用于摘要生成
 */
function formatMessagesForSummary(messages: DbMessage[], maxMessages = 20): string {
  // 取最近的消息
  const recent = messages.slice(-maxMessages)

  return recent
    .map((m) => {
      const role = m.role === 'assistant' ? 'A' : 'Q'
      // 截断过长的内容
      const content = m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content
      return `${role}: ${content}`
    })
    .join('\n\n')
}

/**
 * 生成对话摘要
 *
 * @param params 参数
 * @returns 生成的摘要，失败返回 null
 */
export async function generateSummary(params: {
  messages: DbMessage[]
  providerId?: string
  modelId?: string
}): Promise<string | null> {
  const { messages } = params

  if (messages.length === 0) {
    return null
  }

  try {
    // 获取配置
    const appConfig = await loadConfig()

    // 使用指定的或默认的 provider/model
    const providerId = params.providerId ?? Object.keys(appConfig.providerConfigs)[0]
    const providerConfig = appConfig.providerConfigs[providerId]

    if (!providerConfig) {
      console.error('No provider config found for summary generation')
      return null
    }

    // 使用配置中的第一个模型或指定的模型
    const modelId = params.modelId ?? providerConfig.models?.[0] ?? 'gpt-4o-mini'

    // 格式化消息
    const formattedMessages = formatMessagesForSummary(messages)
    const prompt = SUMMARY_PROMPT.replace('{messages}', formattedMessages)

    // 生成摘要
    const summary = await generateText({
      config: providerConfig,
      modelId,
      prompt
    })

    return summary?.trim() || null
  } catch (error) {
    console.error('Failed to generate summary:', error)
    return null
  }
}

/**
 * 更新对话摘要
 *
 * @param params 参数
 * @returns 更新后的对话，失败返回 null
 */
export async function updateConversationSummary(params: {
  conversationId: string
  messages: DbMessage[]
  providerId?: string
  modelId?: string
  forceUpdate?: boolean
  config?: SummaryConfig
}): Promise<DbConversation | null> {
  const { conversationId, messages, forceUpdate = false, config = DEFAULT_SUMMARY_CONFIG } = params

  // 获取对话
  const conversation = conversationRepo.getConversation(conversationId)
  if (!conversation) {
    return null
  }

  // 检查是否需要更新
  if (!forceUpdate && !shouldUpdateSummary(conversation, messages.length, config)) {
    return conversation
  }

  // 生成摘要
  const summary = await generateSummary({
    messages,
    providerId: params.providerId,
    modelId: params.modelId
  })

  if (!summary) {
    return conversation
  }

  // 更新对话
  return conversationRepo.updateConversation(conversationId, {
    summary,
    lastSummarizedMessageCount: messages.length
  })
}

/**
 * 批量获取对话摘要信息
 * 用于构建最近对话提示词
 */
export function getConversationsWithSummary(
  conversations: DbConversation[],
  limit = 10
): Array<{ title: string; summary?: string; timestamp?: string }> {
  return conversations.slice(0, limit).map((c) => ({
    title: c.title,
    summary: c.summary ?? undefined,
    timestamp: new Date(c.updatedAt).toISOString().split('T')[0]
  }))
}
