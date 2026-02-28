import type { AssistantConfig, AssistantMemory, AssistantRegexRule } from '../../../../shared/types'
import type { DbAssistant } from '../../../../shared/db-types'
import type { ChatMessageInput } from '../../../../shared/chat'
import type { ChatMessage } from './MessageBubble'

export type RuntimeAssistant = AssistantConfig | DbAssistant

export function getDefaultAssistantId<T extends RuntimeAssistant>(assistants: T[]): string | null {
  const defaultAssistant = assistants.find((a) => a.isDefault)
  if (defaultAssistant) return defaultAssistant.id
  return assistants[0]?.id ?? null
}

export function getEffectiveAssistant<T extends RuntimeAssistant>(
  assistants: T[],
  assistantId?: string | null
): T | null {
  if (assistantId) {
    const direct = assistants.find((a) => a.id === assistantId)
    if (direct) return direct
  }
  const defId = getDefaultAssistantId(assistants)
  if (defId) {
    return assistants.find((a) => a.id === defId) ?? null
  }
  return null
}

export function applyMessageTemplate(template: string, message: string): string {
  const t = (template ?? '').trim()
  if (!t) return message
  if (t.includes('{{ message }}')) return t.split('{{ message }}').join(message)
  return t + '\n' + message
}

export function applyAssistantRegex(
  content: string,
  role: 'user' | 'assistant',
  rules: AssistantRegexRule[] | undefined,
  mode: 'display' | 'request'
): string {
  if (!rules || rules.length === 0) return content
  let out = content
  for (const r of rules) {
    if (!r || !r.enabled) continue
    const visualOnly = !!r.visualOnly
    const replaceOnly = !!r.replaceOnly && !visualOnly
    if (visualOnly && mode !== 'display') continue
    if (replaceOnly && mode !== 'request') continue
    if (r.scopes && r.scopes.length > 0 && !r.scopes.includes(role)) continue
    try {
      const re = new RegExp(r.pattern, 'g')
      out = out.replace(re, r.replacement ?? '')
    } catch {
      // 忽略非法正则，避免影响主流程
    }
  }
  return out
}

export function buildChatRequestMessages(args: {
  assistant: RuntimeAssistant | null
  history: ChatMessage[]
  userInput: string
  memories?: AssistantMemory[]
  recentChats?: Array<{ title: string; timestamp?: string }>
}): ChatMessageInput[] {
  const { assistant, history, userInput, memories = [], recentChats = [] } = args

  const rules = assistant?.regexRules
  const template = assistant?.messageTemplate ?? '{{ message }}'

  let userContent = applyAssistantRegex(
    applyMessageTemplate(template, userInput),
    'user',
    rules,
    'request'
  )
  // 防御：避免把空消息发给模型（会触发 400 empty_content）
  if (!userContent.trim()) {
    const fallback = String(userInput ?? '').trim()
    if (!fallback) {
      throw new Error('用户消息为空，无法发送请求')
    }
    userContent = fallback
  }

  const raw = [
    ...history.map((m) => ({
      role: m.role,
      content: applyAssistantRegex(m.content, m.role, rules, 'request')
    })),
    { role: 'user' as const, content: userContent }
  ].filter((m) => m.content.trim().length > 0)

  const limited = (() => {
    if (!assistant?.limitContextMessages) return raw
    const n = Math.max(0, Math.min(512, assistant.contextMessageSize ?? 64))
    // 如果 n <= 0，禁用限制，返回所有消息（至少要包含当前用户输入）
    if (n <= 0) return raw
    return raw.slice(Math.max(0, raw.length - n))
  })()

  const sysParts: string[] = []
  const sys0 = (assistant?.systemPrompt ?? '').trim()
  if (sys0) sysParts.push(sys0)
  if (assistant?.enableMemory && memories.length > 0) {
    sysParts.push(buildMemoriesPrompt(memories))
  }
  if (assistant?.enableRecentChatsReference && recentChats.length > 0) {
    sysParts.push(buildRecentChatsPrompt(recentChats))
  }

  const sys = sysParts.join('\n\n').trim()
  if (!sys) return limited
  return [{ role: 'system', content: sys }, ...limited]
}

export function buildMemoriesPrompt(memories: AssistantMemory[]): string {
  const buf: string[] = []
  buf.push('## Memories')
  buf.push('These are memories that you can reference in future conversations.')
  buf.push('<memories>')
  for (const m of memories) {
    if (!m.content || !m.content.trim()) continue
    buf.push('<record>')
    buf.push(`<id>${m.id}</id>`)
    buf.push(`<content>${m.content}</content>`)
    buf.push('</record>')
  }
  buf.push('</memories>')
  return buf.join('\n')
}

export function buildRecentChatsPrompt(chats: Array<{ title: string; timestamp?: string }>): string {
  if (!chats || chats.length === 0) return ''
  const buf: string[] = []
  buf.push('<recent_chats>')
  buf.push('这是用户最近的一些对话标题，你可以参考这些内容了解用户偏好和关注点。')
  for (const c of chats) {
    const ts = (c.timestamp ?? '').trim()
    const title = (c.title ?? '').trim()
    if (!title) continue
    buf.push(ts ? `  ${ts}: ${title}` : `  ${title}`)
  }
  buf.push('</recent_chats>')
  return buf.join('\n')
}

export function buildCustomHeaders(assistant: RuntimeAssistant | null): Record<string, string> | undefined {
  const list = assistant?.customHeaders ?? []
  const out: Record<string, string> = {}
  for (const h of list) {
    const k = (h?.name ?? '').trim()
    const v = (h?.value ?? '').trim()
    if (!k || !v) continue
    out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

export function buildCustomBody(assistant: RuntimeAssistant | null): Record<string, unknown> | undefined {
  const list = assistant?.customBody ?? []
  const out: Record<string, unknown> = {}
  for (const kv of list) {
    const k = (kv?.key ?? '').trim()
    const raw = (kv?.value ?? '').trim()
    if (!k || !raw) continue
    try {
      out[k] = JSON.parse(raw)
    } catch {
      out[k] = raw
    }
  }
  return Object.keys(out).length ? out : undefined
}
