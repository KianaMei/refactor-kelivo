import { useRef, useState } from 'react'
import { DEFAULT_TRANSLATE_PROMPT } from '../../../../shared/types'
import type { AppConfig, AssistantConfig } from '../../../../shared/types'
import type { ChatMessage as ChatStreamMessage } from '../../../../shared/chatStream'
import { rendererSendMessageStream } from '../../lib/chatService'
import type { ChatMessage } from './MessageBubble'

interface Deps {
  activeConvId: string
  activeAssistant: AssistantConfig | null
  config: AppConfig
  setMessagesByConv: React.Dispatch<React.SetStateAction<Record<string, ChatMessage[]>>>
}

export function useMessageTranslation(deps: Deps) {
  const { activeConvId, activeAssistant, config, setMessagesByConv } = deps
  const [translatingMsgId, setTranslatingMsgId] = useState<string | null>(null)
  const translationAbortRef = useRef<AbortController | null>(null)

  function setMessageTranslationExpanded(msgId: string, expanded: boolean) {
    setMessagesByConv((prev) => {
      const list = prev[activeConvId] ?? []
      return {
        ...prev,
        [activeConvId]: list.map((m) =>
          m.id === msgId ? { ...m, translationExpanded: expanded } : m
        )
      }
    })
    void window.api.db.messages.update(msgId, { translationExpanded: expanded })
      .catch(err => console.error('[useMessageTranslation] update translationExpanded failed:', err))
  }

  async function handleTranslateMessage(msg: ChatMessage) {
    if (translatingMsgId) return

    if (msg.translation) {
      const nextExpanded = msg.translationExpanded === false
      setMessageTranslationExpanded(msg.id, nextExpanded)
      return
    }

    const assistant = activeAssistant
    const appConfig = await window.api.config.get()
    const providerId =
      appConfig.translateModelProvider ??
      assistant?.boundModelProvider ??
      appConfig.currentModelProvider
    const modelId =
      appConfig.translateModelId ??
      assistant?.boundModelId ??
      appConfig.currentModelId

    if (!providerId || !modelId) return

    setTranslatingMsgId(msg.id)

    try {
      const sourceText = String(msg.content ?? '')
      const targetLang = /[\u4e00-\u9fff]/.test(sourceText)
        ? 'English'
        : 'Simplified Chinese'
      const promptTemplate = appConfig.translatePrompt ?? config.translatePrompt ?? DEFAULT_TRANSLATE_PROMPT
      const translatePrompt = promptTemplate
        .replaceAll('{source_text}', sourceText)
        .replaceAll('{target_lang}', targetLang)

      setMessagesByConv((prev) => {
        const list = prev[activeConvId] ?? []
        return {
          ...prev,
          [activeConvId]: list.map((m) =>
            m.id === msg.id ? { ...m, translation: '翻译中...', translationExpanded: true } : m
          )
        }
      })

      const providerConfig = appConfig.providerConfigs[providerId]
      if (!providerConfig) throw new Error(`Provider ${providerId} not configured`)
      const translationMaxTokens =
        assistant?.maxTokens && assistant.maxTokens > 0
          ? assistant.maxTokens
          : 4096

      const ac = new AbortController()
      translationAbortRef.current = ac

      const generator = rendererSendMessageStream({
        config: providerConfig,
        modelId,
        messages: [{ role: 'user', content: translatePrompt }] as ChatStreamMessage[],
        temperature: 0.3,
        maxTokens: translationMaxTokens,
        signal: ac.signal
      })

      let translationContent = ''
      for await (const chunk of generator) {
        if (chunk.content) {
          translationContent += chunk.content
          const content = translationContent
          setMessagesByConv((prev) => {
            const list = prev[activeConvId] ?? []
            return {
              ...prev,
              [activeConvId]: list.map((m) =>
                m.id === msg.id ? { ...m, translation: content, translationExpanded: true } : m
              )
            }
          })
        }
      }

      void window.api.db.messages.update(msg.id, {
        translation: translationContent,
        translationExpanded: true
      }).catch(err => console.error('[useMessageTranslation] update translation failed:', err))
    } catch (e) {
      console.error('Translation failed:', e)
    } finally {
      translationAbortRef.current = null
      setTranslatingMsgId(null)
    }
  }

  return { translatingMsgId, handleTranslateMessage, setMessageTranslationExpanded } as const
}
