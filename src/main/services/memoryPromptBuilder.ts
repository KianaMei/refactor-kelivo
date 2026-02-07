/**
 * 记忆提示词构建器
 * 构建 Assistant 记忆相关的系统提示词
 */

import type { DbMemory } from '../../shared/db-types'

/** 记忆工具使用指南 */
const MEMORY_TOOL_GUIDE = `
## Memory Tool
你是一个无状态的大模型，你无法存储记忆，因此为了记住信息，你需要使用**记忆工具**。
你可以使用 \`create_memory\`, \`edit_memory\`, \`delete_memory\` 工具创建、更新或删除记忆。
- 如果记忆中没有相关信息，请使用 create_memory 创建一条新的记录。
- 如果已有相关记录，请使用 edit_memory 更新内容。
- 若记忆过时或无用，请使用 delete_memory 删除。
这些记忆会自动包含在未来的对话上下文中，在<memories>标签内。
请勿在记忆中存储敏感信息，敏感信息包括：用户的民族、宗教信仰、性取向、政治观点及党派归属、性生活、犯罪记录等。
在与用户聊天过程中，你可以像一个私人秘书一样**主动的**记录用户相关的信息到记忆里，包括但不限于：
- 用户昵称/姓名
- 年龄/性别/兴趣爱好
- 计划事项等
- 聊天风格偏好
- 工作相关
- 首次聊天时间
- ...
请主动调用工具记录，而不是需要用户请求。
记忆如果包含日期信息，请包含在内，请使用绝对时间格式，并且当前时间是 {currentTime}。
无需告知用户你已更改记忆记录，也不要在对话中直接显示记忆内容，除非用户主动请求。
相似或相关的记忆应合并为一条记录，而不要重复记录，过时记录应删除。
你可以在和用户闲聊的时候暗示用户你能记住东西。
`

/**
 * 构建记忆系统提示词
 *
 * @param memories 该 assistant 的所有记忆记录
 * @returns 完整的 memory 提示词字符串，包含记忆列表和工具使用指南
 */
export function buildMemoriesPrompt(memories: DbMemory[]): string {
  const lines: string[] = []

  lines.push('## Memories')
  lines.push('These are memories that you can reference in the future conversations.')
  lines.push('<memories>')

  for (const m of memories) {
    lines.push('<record>')
    lines.push(`<id>${m.id}</id>`)
    lines.push(`<content>${m.content}</content>`)
    lines.push('</record>')
  }

  lines.push('</memories>')

  // 替换时间占位符
  const currentTime = new Date().toISOString()
  const guide = MEMORY_TOOL_GUIDE.replace('{currentTime}', currentTime)
  lines.push(guide)

  return lines.join('\n')
}

/**
 * 构建最近对话提示词
 *
 * @param chatTitles 最近对话的标题列表
 * @returns 完整的最近对话提示词字符串
 */
export function buildRecentChatsPrompt(chatTitles: string[]): string {
  if (chatTitles.length === 0) {
    return ''
  }

  const lines: string[] = []

  lines.push('## 最近的对话')
  lines.push('这是用户最近的一些对话，你可以参考这些对话了解用户偏好。')
  lines.push('<recent_chats>')

  for (const title of chatTitles) {
    lines.push('<conversation>')
    lines.push(`  <title>${title}</title>`)
    lines.push('</conversation>')
  }

  lines.push('</recent_chats>')

  return lines.join('\n')
}

/** 最近对话信息 */
export interface RecentChatInfo {
  title: string
  summary?: string
  timestamp?: string
}

/**
 * 构建带摘要的最近对话提示词
 *
 * @param chats 最近对话信息列表（包含标题、摘要和时间戳）
 * @returns 格式化的最近对话提示词字符串
 */
export function buildRecentChatsPromptWithSummary(chats: RecentChatInfo[]): string {
  if (chats.length === 0) {
    return ''
  }

  const lines: string[] = []

  lines.push('<recent_chats>')
  lines.push('这是用户最近的一些对话标题和摘要，你可以参考这些内容了解用户偏好和关注点')

  for (const chat of chats) {
    lines.push('<conversation>')

    // 格式: timestamp: title || summary
    const timestamp = chat.timestamp ?? ''
    const title = chat.title ?? ''
    const summary = chat.summary ?? ''

    if (summary) {
      lines.push(`  ${timestamp}: ${title} || ${summary}`)
    } else {
      lines.push(`  ${timestamp}: ${title}`)
    }

    lines.push('</conversation>')
  }

  lines.push('</recent_chats>')

  return lines.join('\n')
}

/**
 * 追加内容到系统消息
 *
 * 如果 messages 已有系统消息，则追加到现有内容后面
 * 否则插入新的系统消息到列表开头
 *
 * @param messages API 消息列表
 * @param content 要追加的内容
 */
export function appendToSystemMessage(
  messages: Array<{ role: string; content: string }>,
  content: string
): void {
  if (!content.trim()) {
    return
  }

  if (messages.length > 0 && messages[0].role === 'system') {
    messages[0].content = (messages[0].content || '') + '\n\n' + content
  } else {
    messages.unshift({ role: 'system', content })
  }
}
