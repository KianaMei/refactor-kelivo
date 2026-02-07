import type { Conversation } from './ConversationSidebar'
import type { ChatMessage } from './MessageBubble'

export function createDemoConversations(): Conversation[] {
  return [
    { id: 'c1', title: '新对话', updatedAt: Date.now(), assistantCount: 1 },
    { id: 'c2', title: '示例：代码渲染', updatedAt: Date.now() - 1000 * 60 * 20, assistantCount: 1 }
  ]
}

export function createDemoMessagesByConv(): Record<string, ChatMessage[]> {
  return {
    c1: [
      {
        id: 'm_welcome',
        role: 'assistant',
        content: 'Kelivo（重构版）已启动。先把 UI 与 Flutter 版对齐，然后接入真实后端与流式输出。',
        ts: Date.now() - 1000 * 10
      }
    ],
    c2: [
      {
        id: 'm_code_user',
        role: 'user',
        content: '请渲染一段 TypeScript 代码块。',
        ts: Date.now() - 1000 * 60 * 10
      },
      {
        id: 'm_code_assistant',
        role: 'assistant',
        content: '```ts\nexport function add(a: number, b: number) {\n  return a + b\n}\n```\n\n这是一个简单的加法函数示例。',
        ts: Date.now() - 1000 * 60 * 9,
        usage: { promptTokens: 45, completionTokens: 32, totalTokens: 77 }
      }
    ]
  }
}

export const DEMO_QUICK_PHRASES = [
  { id: 'qp-1', title: '继续', content: '请继续' },
  { id: 'qp-2', title: '总结', content: '请总结上面的内容' },
  { id: 'qp-3', title: '翻译中文', content: '请将上面的内容翻译成中文' }
]

