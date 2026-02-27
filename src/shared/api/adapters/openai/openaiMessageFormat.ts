import type { ChatMessage, ChatMessagePart } from '../../../chatStream'
import type { UserImage } from '../../chatApiService'

interface ParsedTextContent {
  text: string
  imageDataUrls: string[]
}

interface NormalizedContent {
  text: string
  imageUrls: string[]
}

const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)\s]+)\)/g
const CUSTOM_IMAGE_RE = /\[image:\s*(data:image\/[a-zA-Z0-9.+-]+;base64,[^\]\s]+)\s*\]/g

function parseTextContent(raw: string): ParsedTextContent {
  const imageDataUrls: string[] = []

  const stripByRegex = (source: string, re: RegExp): string => {
    return source.replace(re, (_m, dataUrl: string) => {
      if (dataUrl) imageDataUrls.push(String(dataUrl))
      return ''
    })
  }

  let text = stripByRegex(raw, MARKDOWN_IMAGE_RE)
  text = stripByRegex(text, CUSTOM_IMAGE_RE)
  text = text.replace(/\n{3,}/g, '\n\n').trim()

  return { text, imageDataUrls }
}

function normalizeMessageContent(message: ChatMessage): NormalizedContent {
  if (typeof message.content === 'string') {
    const parsed = parseTextContent(message.content)
    return { text: parsed.text, imageUrls: parsed.imageDataUrls }
  }

  const textParts: string[] = []
  const imageUrls: string[] = []
  for (const part of message.content) {
    const p = part as ChatMessagePart
    if (p.type === 'text' && typeof p.text === 'string') {
      textParts.push(p.text)
      continue
    }
    if (p.type === 'image_url') {
      const url = p.image_url?.url
      if (typeof url === 'string' && url) {
        imageUrls.push(url)
      }
    }
  }

  return {
    text: textParts.join('\n').trim(),
    imageUrls
  }
}

function isLastUserMessage(messages: ChatMessage[], index: number): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return i === index
    }
  }
  return false
}

function buildDataUrlImageParts(userImages: UserImage[] | undefined): string[] {
  if (!userImages || userImages.length === 0) return []
  const out: string[] = []
  for (const img of userImages) {
    if (!img?.mime || !img?.base64) continue
    out.push(`data:${img.mime};base64,${img.base64}`)
  }
  return out
}

export function buildChatCompletionsMessages(
  messages: ChatMessage[],
  userImages?: UserImage[]
): Array<Record<string, unknown>> {
  const extraUserImages = buildDataUrlImageParts(userImages)
  const out: Array<Record<string, unknown>> = []

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const role = m.role
    const normalized = normalizeMessageContent(m)

    if (role === 'tool') {
      out.push({
        role: 'tool',
        content: normalized.text,
        ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
        ...(m.name && { name: m.name })
      })
      continue
    }

    const imageUrls = [...normalized.imageUrls]
    if (role === 'user' && isLastUserMessage(messages, i)) {
      imageUrls.push(...extraUserImages)
    }

    const hasImages = imageUrls.length > 0
    const contentBlocks: Array<Record<string, unknown>> = []
    if (normalized.text) {
      contentBlocks.push({ type: 'text', text: normalized.text })
    }
    if (hasImages) {
      for (const url of imageUrls) {
        contentBlocks.push({ type: 'image_url', image_url: { url } })
      }
    }

    const base: Record<string, unknown> = { role }
    if (hasImages || Array.isArray(m.content)) {
      base.content = contentBlocks
    } else {
      base.content = normalized.text
    }

    if (role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      base.tool_calls = m.tool_calls
    }

    out.push(base)
  }

  return out
}

export function buildResponsesInputPayload(
  messages: ChatMessage[],
  userImages?: UserImage[]
): { input: Array<Record<string, unknown>>; instructions: string } {
  const input: Array<Record<string, unknown>> = []
  const extraUserImages = buildDataUrlImageParts(userImages)
  let instructions = ''

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const role = m.role
    const normalized = normalizeMessageContent(m)

    if (role === 'system') {
      if (normalized.text) {
        instructions = instructions ? `${instructions}\n\n${normalized.text}` : normalized.text
      }
      continue
    }

    if (role === 'tool') {
      if (m.tool_call_id) {
        input.push({
          type: 'function_call_output',
          call_id: m.tool_call_id,
          output: normalized.text
        })
      } else {
        input.push({ role: 'tool', content: normalized.text })
      }
      continue
    }

    const imageUrls = [...normalized.imageUrls]
    if (role === 'user' && isLastUserMessage(messages, i)) {
      imageUrls.push(...extraUserImages)
    }

    if (role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      if (normalized.text || imageUrls.length > 0) {
        const parts: Array<Record<string, unknown>> = []
        if (normalized.text) {
          parts.push({ type: 'output_text', text: normalized.text })
        }
        for (const url of imageUrls) {
          parts.push({ type: 'output_image', image_url: url })
        }
        input.push({ role: 'assistant', content: parts })
      }

      for (const tool of m.tool_calls) {
        input.push({
          type: 'function_call',
          call_id: tool.id,
          name: tool.function.name,
          arguments: tool.function.arguments
        })
      }
      continue
    }

    if (imageUrls.length > 0 || Array.isArray(m.content)) {
      const parts: Array<Record<string, unknown>> = []
      if (normalized.text) {
        parts.push({ type: role === 'user' ? 'input_text' : 'output_text', text: normalized.text })
      }
      for (const url of imageUrls) {
        parts.push({ type: role === 'user' ? 'input_image' : 'output_image', image_url: url })
      }
      input.push({ role, content: parts })
    } else {
      input.push({ role, content: normalized.text })
    }
  }

  return { input, instructions }
}
