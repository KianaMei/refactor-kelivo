import { useState } from 'react'
import type { ChatMessage } from './MessageBubble'

export function useMessageTTS() {
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null)

  function handleSpeakMessage(msg: ChatMessage) {
    if (!('speechSynthesis' in window)) return

    if (speakingMsgId === msg.id) {
      window.speechSynthesis.cancel()
      setSpeakingMsgId(null)
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(msg.content)
    utterance.lang = 'zh-CN'
    utterance.onend = () => setSpeakingMsgId(null)
    utterance.onerror = () => setSpeakingMsgId(null)
    setSpeakingMsgId(msg.id)
    window.speechSynthesis.speak(utterance)
  }

  return { speakingMsgId, handleSpeakMessage } as const
}
