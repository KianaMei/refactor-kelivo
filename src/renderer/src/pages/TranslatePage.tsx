/**
 * 翻译页面
 * 对齐 Flutter Kelivo 的 desktop_translate_page.dart
 * 双栏布局：左侧输入，右侧输出
 * 控制栏：语言下拉 + 翻译按钮（居中），复制按钮（右侧）
 * 顶栏右侧：可点击的模型胶囊（品牌图标 + 模型名），点击弹出 ModelSelectPopover
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Languages, ChevronDown, Copy, Eraser, Square, Check, Bot } from 'lucide-react'

import type { ChatMessage as ChatStreamMessage } from '../../../shared/chatStream'
import type { AppConfig, ProviderConfigV2 } from '../../../shared/types'
import { useConfig } from '../contexts/ConfigContext'
import { DEFAULT_TRANSLATE_PROMPT } from '../../../shared/types'
import { isAbortError } from '../../../shared/streamingHttpClient'
import { rendererSendMessageStream } from '../lib/chatService'
import { getBrandIcon } from '../utils/brandAssets'
import { DesktopPopover } from '../components/DesktopPopover'
import { ModelSelectPopover } from '../components/ModelSelectPopover'

type Lang = { code: string; flag: string; label: string }

const languages: Lang[] = [
  { code: 'zh-CN', flag: '🇨🇳', label: '简体中文' },
  { code: 'en', flag: '🇺🇸', label: '英语' },
  { code: 'zh-TW', flag: '🇹🇼', label: '繁体中文' },
  { code: 'ja', flag: '🇯🇵', label: '日语' },
  { code: 'ko', flag: '🇰🇷', label: '韩语' },
  { code: 'fr', flag: '🇫🇷', label: '法语' },
  { code: 'de', flag: '🇩🇪', label: '德语' },
  { code: 'es', flag: '🇪🇸', label: '西班牙语' },
  { code: 'it', flag: '🇮🇹', label: '意大利语' }
]

export function TranslatePage(props: {
  onOpenDefaultModelSettings: () => void
}) {
  const { config, updateConfig } = useConfig()
  const [source, setSource] = useState('')
  const [output, setOutput] = useState('')
  const [targetLang, setTargetLang] = useState<Lang>(languages[1])
  const [isTranslating, setIsTranslating] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const streamingRef = useRef<AbortController | null>(null)

  const modelBtnRef = useRef<HTMLButtonElement>(null)

  const model = useMemo(() => {
    const providerId =
      config.translateModelProvider ?? config.currentModelProvider
    const modelId =
      config.translateModelId ?? config.currentModelId
    const provider = providerId
      ? (config.providerConfigs[providerId] ?? null)
      : null
    return { providerId, modelId, provider }
  }, [config])

  const providers = useMemo<ProviderConfigV2[]>(() => {
    return Object.values(config.providerConfigs).filter(
      (p): p is ProviderConfigV2 => !!p && Array.isArray(p.models) && p.models.length > 0
    )
  }, [config.providerConfigs])

  // Set default language based on system locale
  useEffect(() => {
    const lang = navigator.language.toLowerCase()
    if (lang.startsWith('zh')) {
      setTargetLang(languages.find((l) => l.code === 'en') ?? languages[1])
    } else {
      setTargetLang(languages.find((l) => l.code === 'zh-CN') ?? languages[0])
    }
  }, [])

  const handleSelectModel = useCallback(
    async (providerId: string, modelId: string) => {
      await updateConfig({
        ...config,
        translateModelProvider: providerId,
        translateModelId: modelId
      })
    },
    [config, updateConfig]
  )

  const translate = useCallback(async () => {
    const text = source.trim()
    if (!text || isTranslating) return
    if (!model.providerId || !model.modelId || !model.provider) {
      setOutput('请先配置翻译/对话默认模型。')
      props.onOpenDefaultModelSettings()
      return
    }

    const promptTemplate = config.translatePrompt ?? DEFAULT_TRANSLATE_PROMPT
    const prompt = promptTemplate
      .replaceAll('{source_text}', text)
      .replaceAll('{target_lang}', targetLang.label)

    setOutput('')
    setIsTranslating(true)

    const ac = new AbortController()
    streamingRef.current = ac

    try {
      const messages: ChatStreamMessage[] = [{ role: 'user', content: prompt }]
      const generator = rendererSendMessageStream({
        config: model.provider,
        modelId: model.modelId,
        messages,
        signal: ac.signal
      })
      for await (const chunk of generator) {
        if (chunk.content) {
          setOutput((prev) => {
            if (!prev) return chunk.content!.replace(/^\s+/, '')
            return prev + chunk.content
          })
        }
      }
    } catch (e) {
      if (!isAbortError(e)) {
        setOutput((prev) => (prev ? prev + '\n\n' : '') + `[error] ${e instanceof Error ? e.message : String(e)}`)
      }
    } finally {
      streamingRef.current = null
      setIsTranslating(false)
    }
  }, [source, isTranslating, model, targetLang, props])

  const stop = useCallback(() => {
    streamingRef.current?.abort()
  }, [])

  const clearAll = useCallback(() => {
    streamingRef.current?.abort()
    streamingRef.current = null
    setIsTranslating(false)
    setSource('')
    setOutput('')
  }, [])

  const copyOutput = useCallback(() => {
    if (!output) return
    void navigator.clipboard.writeText(output)
  }, [output])

  // Brand icon for current model
  const brandIcon = model.modelId ? getBrandIcon(model.modelId) : null

  return (
    <div style={s.root}>
      {/* Top bar - model capsule on right (clickable) */}
      <div className="chatTopBar frosted">
        <div style={{ flex: 1 }} />
        <button
          ref={modelBtnRef}
          type="button"
          className="chatTopBarModelCapsule"
          onClick={() => {
            if (!isTranslating) setModelPickerOpen(true)
          }}
          style={{ opacity: isTranslating ? 0.5 : 1 }}
        >
          {brandIcon ? (
            <img src={brandIcon} alt="" style={{ width: 18, height: 18 }} />
          ) : (
            <Bot size={18} style={{ opacity: 0.6 }} />
          )}
          <span className="chatTopBarModelText">
            {model.modelId ?? '未设置'}{model.provider ? <span className="chatTopBarModelProvider"> | {model.provider.name}</span> : null}
          </span>
        </button>
      </div>

      {/* Model select popover */}
      <DesktopPopover
        anchorRef={modelBtnRef}
        open={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
        minWidth={600}
        maxHeight={600}
        placement="below"
      >
        <ModelSelectPopover
          providers={providers}
          currentProviderId={model.providerId ?? undefined}
          currentModelId={model.modelId ?? undefined}
          onSelect={(pid, mid) => void handleSelectModel(pid, mid)}
          onClose={() => setModelPickerOpen(false)}
        />
      </DesktopPopover>

      {/* Control row: language dropdown + translate button (center), copy (right) */}
      <div style={s.controlRow}>
        <div style={{ flex: 1 }} />
        <div style={s.controlCenter}>
          {/* Language dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              style={s.langBtn}
              onClick={() => setMenuOpen(!menuOpen)}
              disabled={isTranslating}
            >
              <span style={{ fontSize: 16 }}>{targetLang.flag}</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{targetLang.label}</span>
              <ChevronDown
                size={14}
                style={{
                  opacity: 0.6,
                  transform: menuOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s'
                }}
              />
            </button>
            {menuOpen && (
              <>
                <div style={s.menuBackdrop} onClick={() => setMenuOpen(false)} />
                <div style={s.langMenu}>
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      style={{
                        ...s.langMenuItem,
                        fontWeight: lang.code === targetLang.code ? 600 : 400,
                        color:
                          lang.code === targetLang.code
                            ? 'var(--primary)'
                            : 'var(--text)'
                      }}
                      onClick={() => {
                        setTargetLang(lang)
                        setMenuOpen(false)
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{lang.flag}</span>
                      <span>{lang.label}</span>
                      {lang.code === targetLang.code && (
                        <Check size={14} style={{ color: 'var(--primary)' }} />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Translate / Stop button */}
          <button
            type="button"
            style={s.translateBtn}
            onClick={isTranslating ? stop : () => void translate()}
          >
            {isTranslating ? (
              <>
                <Square size={16} />
                <span>停止</span>
              </>
            ) : (
              <>
                <Languages size={16} />
                <span>翻译</span>
              </>
            )}
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn"
            onClick={copyOutput}
            disabled={!output}
          >
            复制
          </button>
        </div>
      </div>

      {/* Two panes */}
      <div style={s.panes}>
        <PaneContainer
          actionIcon={<Eraser size={15} />}
          actionLabel="清除"
          onAction={clearAll}
        >
          <textarea
            style={s.textarea}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="输入要翻译的文本..."
          />
        </PaneContainer>
        <div style={{ width: 1, background: 'var(--border)' }} />
        <PaneContainer
          actionIcon={<Copy size={15} />}
          actionLabel="复制"
          onAction={copyOutput}
        >
          <textarea
            style={s.textarea}
            value={output}
            readOnly
            placeholder="翻译结果..."
          />
        </PaneContainer>
      </div>
    </div>
  )
}

/** Pane with hover-reveal action button (matches Flutter _PaneContainer) */
function PaneContainer(props: {
  children: React.ReactNode
  actionIcon: React.ReactNode
  actionLabel: string
  onAction: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={s.pane}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {props.children}
      <button
        type="button"
        style={{
          ...s.paneAction,
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? 'auto' : 'none'
        }}
        onClick={props.onAction}
      >
        {props.actionIcon}
        <span>{props.actionLabel}</span>
      </button>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column'
  },
  controlRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    gap: 12
  },
  controlCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: 12
  },
  langBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    cursor: 'pointer',
    transition: 'border-color 0.15s'
  },
  menuBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 99
  },
  langMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    minWidth: 160,
    maxHeight: 300,
    overflowY: 'auto',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    padding: '4px 0',
    zIndex: 100
  },
  langMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 14,
    textAlign: 'left' as const,
    transition: 'background 0.1s'
  },
  translateBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 18px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'background 0.15s'
  },
  panes: {
    flex: 1,
    display: 'flex',
    minHeight: 0
  },
  pane: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0
  },
  textarea: {
    flex: 1,
    minHeight: 0,
    padding: '12px 16px',
    border: 'none',
    outline: 'none',
    resize: 'none',
    background: 'transparent',
    color: 'var(--text)',
    font: 'inherit',
    fontSize: 15,
    lineHeight: 1.5
  },
  paneAction: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--surface-3)',
    color: 'var(--text-2)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'opacity 0.15s, background 0.15s'
  }
}
