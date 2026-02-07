/**
 * 对话标题服务
 * - 用 AI 总结对话内容生成短标题
 * - 对齐 Flutter 版本 side_drawer.dart 的“重新生成标题”逻辑
 */

import { app } from 'electron'

import type { AppConfig } from '../../shared/types'
import { DEFAULT_TITLE_PROMPT } from '../../shared/types'
import type { DbConversation, DbMessage } from '../../shared/db-types'
import { generateText } from '../api/chatApiService'
import { loadConfig } from '../configStore'
import * as conversationRepo from '../db/repositories/conversationRepo'
import * as messageRepo from '../db/repositories/messageRepo'

function resolveLocale(cfg: AppConfig): string {
  const lang = cfg.display?.language ?? 'system'
  if (lang && lang !== 'system') return lang
  try {
    return app.getLocale() || 'en-US'
  } catch {
    return 'en-US'
  }
}

function formatMessagesForTitle(messages: DbMessage[], maxMessages = 4): string {
  const recent = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0)
    .slice(-maxMessages)

  return recent
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n\n')
}

function buildTitlePrompt(params: { template: string; locale: string; content: string }): string {
  const { template, locale, content } = params
  const hasLocale = template.includes('{locale}')
  const hasContent = template.includes('{content}')

  let prompt = template
  if (hasLocale) prompt = prompt.replaceAll('{locale}', locale)

  if (hasContent) {
    prompt = prompt.replaceAll('{content}', content)
  } else {
    // 兼容用户自定义 Prompt 未包含 {content} 的情况：
    // 仍然把对话内容附在末尾，避免模型只“总结提示词本身”。
    prompt = `${prompt.trimEnd()}\n\n<content>\n${content}\n</content>`
  }

  return prompt
}

async function generateConversationTitle(params: {
  cfg: AppConfig
  messages: DbMessage[]
}): Promise<string | null> {
  const { cfg, messages } = params

  const providerId = cfg.titleModelProvider ?? cfg.currentModelProvider
  const modelId = cfg.titleModelId ?? cfg.currentModelId
  if (!providerId || !modelId) {
    throw new Error('未配置标题生成模型（请在“设置 > 默认模型”中配置）')
  }

  const providerConfig = cfg.providerConfigs[providerId]
  if (!providerConfig) {
    throw new Error(`标题生成模型的 Provider 不存在：${providerId}`)
  }

  const content = formatMessagesForTitle(messages)
  if (!content.trim()) return null

  const locale = resolveLocale(cfg)
  const template = (cfg.titlePrompt ?? '').trim() || DEFAULT_TITLE_PROMPT
  const prompt = buildTitlePrompt({ template, locale, content })

  const title = (await generateText({ config: providerConfig, modelId, prompt })).trim()
  return title || null
}

/**
 * 重新生成对话标题，并写回 DB
 *
 * @returns 更新后的对话；若标题未生成则返回原对话；若对话不存在返回 null
 */
export async function regenerateConversationTitle(conversationId: string): Promise<DbConversation | null> {
  const conv = conversationRepo.getConversation(conversationId)
  if (!conv) return null

  const cfg = await loadConfig()
  const messages = messageRepo.listMessages(conversationId)

  const title = await generateConversationTitle({ cfg, messages })
  if (!title) return conv

  return conversationRepo.updateConversation(conversationId, { title }) ?? conv
}
