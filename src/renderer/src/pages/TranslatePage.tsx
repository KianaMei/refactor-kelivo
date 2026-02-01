import { useEffect, useMemo, useRef, useState } from 'react'

import type { ChatMessageInput } from '../../../shared/chat'
import type { AppConfig } from '../../../shared/types'

type Lang = { code: string; label: string }

const languages: Lang[] = [
  { code: 'en', label: '英语' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁体中文' },
  { code: 'ja', label: '日语' },
  { code: 'ko', label: '韩语' },
  { code: 'fr', label: '法语' },
  { code: 'de', label: '德语' },
  { code: 'es', label: '西班牙语' },
  { code: 'it', label: '意大利语' }
]

export function TranslatePage(props: { config: AppConfig; onOpenDefaultModelSettings: () => void }) {
  const [source, setSource] = useState('')
  const [output, setOutput] = useState('')
  const [target, setTarget] = useState<string>('en')
  const [isTranslating, setIsTranslating] = useState(false)
  const streamingRef = useRef<{ streamId: string } | null>(null)

  const model = useMemo(() => {
    const providerId = props.config.translateModelProvider ?? props.config.currentModelProvider
    const modelId = props.config.translateModelId ?? props.config.currentModelId
    const provider = providerId ? props.config.providerConfigs[providerId] ?? null : null
    return { providerId, modelId, provider }
  }, [props.config])

  useEffect(() => {
    const offChunk = window.api.chat.onChunk((evt) => {
      const st = streamingRef.current
      if (!st || st.streamId !== evt.streamId) return
      if (evt.chunk.content) setOutput((prev) => prev + evt.chunk.content)
      if (evt.chunk.isDone) {
        streamingRef.current = null
        setIsTranslating(false)
      }
    })
    const offError = window.api.chat.onError((evt) => {
      const st = streamingRef.current
      if (!st || st.streamId !== evt.streamId) return
      setOutput((prev) => (prev ? prev + '\n\n' : '') + `【错误】${evt.message}`)
      streamingRef.current = null
      setIsTranslating(false)
    })
    return () => {
      offChunk()
      offError()
    }
  }, [])

  async function translate() {
    const text = source.trim()
    if (!text) return
    if (isTranslating) return
    if (!model.providerId || !model.modelId) {
      setOutput('请先配置翻译/对话默认模型。')
      props.onOpenDefaultModelSettings()
      return
    }

    setOutput('')
    setIsTranslating(true)
    const langName = languages.find((l) => l.code === target)?.label ?? target
    const prompt = `请把下面文本翻译成${langName}，只输出翻译结果：\n\n${text}`
    const messages: ChatMessageInput[] = [{ role: 'user', content: prompt }]

    try {
      const streamId = await window.api.chat.startStream({
        providerId: model.providerId,
        modelId: model.modelId,
        messages
      })
      streamingRef.current = { streamId }
    } catch (e) {
      setOutput(`【错误】${e instanceof Error ? e.message : String(e)}`)
      setIsTranslating(false)
    }
  }

  function stop() {
    const st = streamingRef.current
    if (!st) return
    void window.api.chat.abort(st.streamId)
  }

  return (
    <div style={styles.root}>
      <div className="chatTopBar frosted">
        <div style={{ fontWeight: 700 }}>翻译</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          模型：{model.provider ? model.provider.name : '未设置'} {model.modelId ? `· ${model.modelId}` : ''}
        </div>
      </div>

      <div style={styles.body}>
        <div style={styles.left}>
          <div style={styles.panelHeader} className="frosted">
            <div style={{ fontWeight: 700 }}>原文</div>
            <div style={{ flex: 1 }} />
            <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            {isTranslating ? (
              <button type="button" className="btn" onClick={stop}>
                停止
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => void translate()}>
                翻译
              </button>
            )}
          </div>
          <textarea style={styles.textarea} value={source} onChange={(e) => setSource(e.target.value)} />
        </div>

        <div style={styles.right}>
          <div style={styles.panelHeader} className="frosted">
            <div style={{ fontWeight: 700 }}>译文</div>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="btn"
              onClick={() => void navigator.clipboard.writeText(output)}
              disabled={!output}
            >
              复制
            </button>
          </div>
          <textarea style={styles.textarea} value={output} readOnly />
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, any> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column' },
  body: { flex: 1, display: 'flex', minHeight: 0 },
  left: { flex: 1, borderRight: '1px solid var(--border)', minWidth: 0, display: 'flex', flexDirection: 'column' },
  right: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  panelHeader: {
    height: 44,
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 12px'
  },
  textarea: {
    flex: 1,
    minHeight: 0,
    padding: 12,
    border: 'none',
    outline: 'none',
    resize: 'none',
    background: 'transparent',
    color: 'var(--text)',
    font: 'inherit',
    lineHeight: 1.5
  }
}
