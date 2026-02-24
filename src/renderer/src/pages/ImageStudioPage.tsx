import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Link2,
  Loader2,
  Maximize2,
  Play,
  Save,
  Square,
  Trash2,
  Upload,
  Wand2,
  X
} from 'lucide-react'
import { toast } from 'sonner'

import type { AppConfig } from '../../../shared/types'
import { useConfirm } from '../hooks/useConfirm'
import { CustomSelect } from '../components/ui/CustomSelect'
import {
  FAL_SEEDREAM_IMAGE_SIZE_PRESETS,
  normalizeFalSeedreamEditOptions,
  type FalSeedreamEditOptions,
  type FalSeedreamImageSize,
  type FalSeedreamImageSizePreset,
  type ImageInputSource,
  type ImageStudioJob,
  type ImageStudioJobStatus,
  type ImageStudioOutput
} from '../../../shared/imageStudio'

interface Props {
  config: AppConfig
  onSave: (next: AppConfig) => Promise<void>
}

type InputDraft = ImageInputSource & { previewUrl?: string }

const MAX_INPUT_IMAGES = 10
const MAX_TOTAL_IMAGES = 15
const HISTORY_COLLAPSED_STORAGE_KEY = 'kelivo:imageStudio:historyCollapsed'

const IMAGE_SIZE_LABELS: Record<FalSeedreamImageSizePreset, string> = {
  square_hd: 'square_hd',
  square: 'square',
  portrait_4_3: 'portrait_4_3',
  portrait_16_9: 'portrait_16_9',
  landscape_4_3: 'landscape_4_3',
  landscape_16_9: 'landscape_16_9',
  auto_2K: 'auto_2K',
  auto_4K: 'auto_4K'
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function statusLabel(status: ImageStudioJobStatus): string {
  if (status === 'queued') return '排队中'
  if (status === 'in_progress') return '执行中'
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  return '已取消'
}

function statusClassName(status: ImageStudioJobStatus): string {
  if (status === 'queued') return 'imageStudioStatus--queued'
  if (status === 'in_progress') return 'imageStudioStatus--inProgress'
  if (status === 'completed') return 'imageStudioStatus--completed'
  if (status === 'failed') return 'imageStudioStatus--failed'
  return 'imageStudioStatus--cancelled'
}

function kelivoFileUrl(localPath: string): string {
  return `kelivo-file:///${encodeURI(localPath.replace(/\\/g, '/'))}`
}

function outputSrc(output: ImageStudioOutput): string | null {
  if (output.localPath) return kelivoFileUrl(output.localPath)
  if (output.remoteUrl) return output.remoteUrl
  return null
}

function outputName(output: ImageStudioOutput): string {
  if (output.localPath) {
    const parts = output.localPath.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] ?? `${output.generationId}_${output.outputIndex}.png`
  }
  if (!output.remoteUrl) return `${output.generationId}_${output.outputIndex}.png`

  try {
    const url = new URL(output.remoteUrl)
    return url.pathname.split('/').pop() ?? `${output.generationId}_${output.outputIndex}.png`
  } catch {
    return `${output.generationId}_${output.outputIndex}.png`
  }
}

function initialImageState(options: Required<FalSeedreamEditOptions>) {
  if (typeof options.imageSize === 'string') {
    return { mode: 'preset' as const, preset: options.imageSize, width: 2560, height: 1440 }
  }

  return {
    mode: 'custom' as const,
    preset: 'landscape_16_9' as FalSeedreamImageSizePreset,
    width: Math.max(1, Math.round(options.imageSize.width)),
    height: Math.max(1, Math.round(options.imageSize.height))
  }
}

function briefPrompt(prompt: string): string {
  const value = prompt.trim()
  return value || '(空 Prompt)'
}

function inputPreviewSrc(input: ImageInputSource): string | null {
  if (input.preparedDataUrl && input.preparedDataUrl.startsWith('data:')) return input.preparedDataUrl
  if (input.type === 'url') return input.value
  if (input.type === 'localPath' && input.value) {
    // 兼容历史记录里 value 可能就是 data/http（主进程存储时会剥离 preparedDataUrl）。
    if (input.value.startsWith('data:') || input.value.startsWith('http://') || input.value.startsWith('https://')) {
      return input.value
    }
    return kelivoFileUrl(input.value)
  }
  return null
}

function jobThumbSrc(job: ImageStudioJob): string | null {
  const output = job.outputs[0]
  if (!output) return null
  return outputSrc(output)
}

function ensureFileHasImageExtension(fileName: string): string {
  const trimmed = fileName.trim()
  let base = trimmed

  // Lightbox 里 title 可能是 URL；优先取最后一段路径作为文件名。
  try {
    const u = new URL(trimmed)
    base = u.pathname.split('/').pop() || u.hostname
  } catch {
    // ignore
  }

  base = base
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()

  if (!base) base = 'image'
  if (base.length > 120) base = base.slice(0, 120)

  if (/\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i.test(base)) return base
  return `${base}.png`
}

type HistoryRailProps = {
  rightJobs: ImageStudioJob[]
  currentJobId: string | null
  historyLoading: boolean
  isRunning: boolean
  onNew: () => void
  onSelect: (job: ImageStudioJob) => void
  onDelete: (job: ImageStudioJob) => void
}

function HistoryRail(props: HistoryRailProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(HISTORY_COLLAPSED_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [collapsed])

  return (
    <aside className={`csPaintingsList ${collapsed ? 'is-collapsed' : ''}`} aria-label="历史缩略图">
      <button
        className="csHistoryToggleBtn csTip"
        data-tip={collapsed ? '展开历史' : '折叠历史'}
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}>
        {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>

      <div className="csPaintingsListBody" aria-hidden={collapsed}>
        <button className="csNewPaintingButton" type="button" onClick={props.onNew} title="新建">
          +
        </button>
        <div className="csThumbList">
          {props.rightJobs.length === 0 ? (
            <div className="csThumbEmpty">{props.historyLoading ? '加载中...' : '暂无'}</div>
          ) : (
            props.rightJobs.map((job) => {
              const src = jobThumbSrc(job)
              const selected = props.currentJobId === job.id
              return (
                <div key={job.id} className="csThumbWrap">
                  <button
                    type="button"
                    className={`csThumb ${selected ? 'selected' : ''}`}
                    onClick={() => {
                      if (collapsed) return
                      if (props.isRunning) return
                      if (props.currentJobId === job.id) return
                      props.onSelect(job)
                    }}
                    title={`${briefPrompt(job.prompt)} · ${statusLabel(job.status)}`}>
                    {src ? (
                      <img className="csThumbImg" src={src} alt={briefPrompt(job.prompt)} loading="lazy" decoding="async" />
                    ) : null}
                  </button>

                  <button
                    className="csThumbDelete csTip"
                    data-tip="删除"
                    type="button"
                    onClick={(event) => {
                      if (collapsed) return
                      event.stopPropagation()
                      props.onDelete(job)
                    }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </aside>
  )
}

export function ImageStudioPage(props: Props) {
  const confirm = useConfirm()
  const providers = props.config.imageStudio.providers
  const defaultProviderId = props.config.imageStudio.defaultProviderId
  const defaultOptions = normalizeFalSeedreamEditOptions(props.config.imageStudio.uiDefaults.falSeedreamEditOptions)
  const defaultImage = initialImageState(defaultOptions)
  const defaultPrompt = props.config.imageStudio.uiDefaults.prompt

  const [providerId, setProviderId] = useState<string>(defaultProviderId)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [apiKeyDraftDirty, setApiKeyDraftDirty] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [prompt, setPrompt] = useState(defaultPrompt)
  const [inputs, setInputs] = useState<InputDraft[]>([])
  const [urlInput, setUrlInput] = useState('')

  const [options, setOptions] = useState<Required<FalSeedreamEditOptions>>(defaultOptions)
  const [sizeMode, setSizeMode] = useState<'preset' | 'custom'>(defaultImage.mode)
  const [sizePreset, setSizePreset] = useState<FalSeedreamImageSizePreset>(defaultImage.preset)
  const [customWidth, setCustomWidth] = useState(defaultImage.width)
  const [customHeight, setCustomHeight] = useState(defaultImage.height)

  const [history, setHistory] = useState<ImageStudioJob[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [currentJob, setCurrentJob] = useState<ImageStudioJob | null>(null)
  const [focusedOutputId, setFocusedOutputId] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<{ src: string; title: string; outputId?: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; src: string; title: string; outputId?: string } | null>(null)
  const [promptEditorOpen, setPromptEditorOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const promptEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const currentJobRef = useRef<ImageStudioJob | null>(null)
  const refreshRunningJobInFlightRef = useRef(false)
  const refreshRunningJobAtRef = useRef(0)
  const apiKeyProviderIdRef = useRef<string | null>(null)

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === providerId) ?? providers[0],
    [providers, providerId]
  )

  const isPlaceholder = selectedProvider?.type === 'openrouter_seedream_placeholder'

  const focusedOutput = useMemo(() => {
    if (!currentJob || currentJob.outputs.length === 0) return null
    return currentJob.outputs.find((output) => output.id === focusedOutputId) ?? currentJob.outputs[0]
  }, [currentJob, focusedOutputId])

  const focusedOutputIndex = useMemo(() => {
    if (!currentJob || currentJob.outputs.length === 0) return 0
    const idx = currentJob.outputs.findIndex((output) => output.id === focusedOutputId)
    return idx >= 0 ? idx : 0
  }, [currentJob, focusedOutputId])

  const focusedOutputSrc = focusedOutput ? outputSrc(focusedOutput) : null

  const previewOutputIndex = useMemo(() => {
    if (!previewImage?.outputId) return 0
    if (!currentJob || currentJob.outputs.length === 0) return 0
    const idx = currentJob.outputs.findIndex((output) => output.id === previewImage.outputId)
    return idx >= 0 ? idx : 0
  }, [previewImage, currentJob])

  const isRunning = currentJob?.status === 'queued' || currentJob?.status === 'in_progress'
  const isBusy = submitting || isRunning

  const navigatePreviewOutput = useCallback(
    (step: -1 | 1) => {
      if (!previewImage?.outputId) return
      if (!currentJob || currentJob.outputs.length <= 1) return

      const idx = currentJob.outputs.findIndex((output) => output.id === previewImage.outputId)
      if (idx < 0) return

      const nextIndex = (idx + step + currentJob.outputs.length) % currentJob.outputs.length
      const nextOutput = currentJob.outputs[nextIndex]
      if (!nextOutput) return

      const src = outputSrc(nextOutput)
      if (!src) return

      setFocusedOutputId(nextOutput.id)
      setPreviewImage({ src, title: outputName(nextOutput), outputId: nextOutput.id })
    },
    [previewImage, currentJob]
  )

  useEffect(() => {
    currentJobRef.current = currentJob
  }, [currentJob])

  const refreshRunningJob = useCallback(async () => {
    const job = currentJobRef.current
    if (!job) return
    if (job.status !== 'queued' && job.status !== 'in_progress') return

    const now = Date.now()
    if (refreshRunningJobInFlightRef.current) return
    if (now - refreshRunningJobAtRef.current < 800) return

    refreshRunningJobInFlightRef.current = true
    refreshRunningJobAtRef.current = now

    try {
      const res = await window.api.imageStudio.historyGet(job.id)
      if (!res.success) return
      const loaded = res.job ?? null
      if (!loaded) return

      setCurrentJob(loaded)
      setHistory((prev) => {
        const idx = prev.findIndex((item) => item.id === loaded.id)
        if (idx === -1) return [loaded, ...prev]
        const next = [...prev]
        next[idx] = loaded
        return next
      })
    } finally {
      refreshRunningJobInFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState !== 'visible') return
      void refreshRunningJob()
    }

    window.addEventListener('focus', onResume)
    document.addEventListener('visibilitychange', onResume)
    return () => {
      window.removeEventListener('focus', onResume)
      document.removeEventListener('visibilitychange', onResume)
    }
  }, [refreshRunningJob])

  useEffect(() => {
    if (!promptEditorOpen) return
    // 打开后聚焦，便于连续输入。
    const t = window.setTimeout(() => {
      const el = promptEditorRef.current
      if (!el) return
      el.focus()
      try {
        el.setSelectionRange(el.value.length, el.value.length)
      } catch {
        // ignore
      }
    }, 0)
    return () => window.clearTimeout(t)
  }, [promptEditorOpen])

  const rightJobs = useMemo(() => {
    const items: ImageStudioJob[] = []
    if (currentJob) items.push(currentJob)
    items.push(...history.filter((job) => job.id !== currentJob?.id))
    items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    return items
  }, [currentJob, history])

  useEffect(() => {
    const next = providers.find((provider) => provider.id === providerId) ?? providers[0]
    if (!next) return

    // 切换供应商时，直接以配置为准，避免串 Key；其余情况下避免覆盖用户正在输入但尚未保存的 Key。
    const providerChanged = apiKeyProviderIdRef.current !== next.id
    if (providerChanged) {
      apiKeyProviderIdRef.current = next.id
      setApiKeyDraft(next.apiKey ?? '')
      setApiKeyDraftDirty(false)
      return
    }

    if (apiKeyDraftDirty) return
    const nextKey = next.apiKey ?? ''
    setApiKeyDraft((prev) => (prev === nextKey ? prev : nextKey))
  }, [providers, providerId, apiKeyDraftDirty])

  useEffect(() => {
    setProviderId(props.config.imageStudio.defaultProviderId)
  }, [props.config.imageStudio.defaultProviderId])

  useEffect(() => {
    if (!settingsOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen])

  const openImageMenu = useCallback((event: React.MouseEvent, src: string, title: string, meta?: { outputId?: string }) => {
    event.preventDefault()

    // 预估菜单尺寸，避免贴边溢出。
    const MENU_W = 210
    const MENU_H = meta?.outputId ? 170 : 132
    const M = 8
    const x = Math.max(M, Math.min(event.clientX, window.innerWidth - MENU_W - M))
    const y = Math.max(M, Math.min(event.clientY, window.innerHeight - MENU_H - M))

    setContextMenu({ x, y, src, title, ...(meta?.outputId ? { outputId: meta.outputId } : {}) })
  }, [])

  const closeImageMenu = useCallback(() => setContextMenu(null), [])

  const copyImageToClipboard = useCallback(async (src: string) => {
    try {
      const resp = await fetch(src)
      if (!resp.ok) throw new Error(`复制失败（HTTP ${resp.status}）`)

      const blob = await resp.blob()
      const ClipboardItemCtor = (globalThis as any).ClipboardItem as any

      if (navigator.clipboard?.write && ClipboardItemCtor && blob.size > 0) {
        const mime = blob.type || 'image/png'
        await navigator.clipboard.write([new ClipboardItemCtor({ [mime]: blob })])
        toast.success('已复制图片')
        return
      }

      await navigator.clipboard.writeText(src)
      toast.success('已复制图片链接')
    } catch (err) {
      try {
        await navigator.clipboard.writeText(src)
        toast.success('已复制图片链接')
        return
      } catch {
        // ignore
      }

      toast.error(err instanceof Error ? err.message : '复制失败')
    }
  }, [])

  const copyLinkToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('已复制链接')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '复制失败')
    }
  }, [])

  const saveImageAs = useCallback(async (src: string, suggestedName: string) => {
    try {
      const safeName = ensureFileHasImageExtension(suggestedName)
      const picker = await window.api.dialog.saveFile({
        defaultPath: safeName,
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
      })
      if (picker.canceled || !picker.filePath) return

      const resp = await fetch(src)
      if (!resp.ok) {
        throw new Error(`下载失败（HTTP ${resp.status}）`)
      }

      const bytes = new Uint8Array(await resp.arrayBuffer())
      await window.api.dialog.writeFile(picker.filePath, bytes as any)
      toast.success('已保存图片')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存图片失败')
    }
  }, [])

  useEffect(() => {
    if (!contextMenu) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeImageMenu()
    }

    const onScroll = () => closeImageMenu()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [contextMenu, closeImageMenu])

  const persistImageStudio = useCallback(
    async (patch: Partial<AppConfig['imageStudio']>) => {
      await props.onSave({
        ...props.config,
        imageStudio: {
          ...props.config.imageStudio,
          ...patch
        }
      })
    },
    [props]
  )

  const saveProviderPatch = useCallback(
    async (targetId: string, patch: Partial<AppConfig['imageStudio']['providers'][number]>) => {
      const nextProviders = props.config.imageStudio.providers.map((provider) =>
        provider.id === targetId ? { ...provider, ...patch } : provider
      )
      await persistImageStudio({ providers: nextProviders })
    },
    [persistImageStudio, props.config.imageStudio.providers]
  )

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await window.api.imageStudio.historyList({ status: 'all', limit: 100, offset: 0 })
      if (!res.success) {
        toast.error(res.error ?? '加载历史失败')
        return
      }
      setHistory(res.jobs ?? [])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  function hydrateDraftFromJob(job: ImageStudioJob) {
    setPrompt(job.prompt ?? '')
    const nextOptions = normalizeFalSeedreamEditOptions(job.requestOptions ?? {})
    setOptions(nextOptions)

    const nextImageState = initialImageState(nextOptions)
    setSizeMode(nextImageState.mode)
    setSizePreset(nextImageState.preset)
    setCustomWidth(nextImageState.width)
    setCustomHeight(nextImageState.height)

    setInputs(
      (job.inputSources ?? []).map((source) => ({
        ...source,
        previewUrl: inputPreviewSrc(source) ?? undefined
      }))
    )

    setUrlInput('')
  }

  function resetDraftToDefaults() {
    // “新建”更符合用户预期：清空当前结果，但保留提示词/参考图/参数，便于快速迭代。
    setUrlInput('')
    setCurrentJob(null)
    setFocusedOutputId(null)
  }

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  useEffect(() => {
    const unsubscribe = window.api.imageStudio.onEvent((event) => {
      if (event.type === 'failed' && event.message) {
        toast.error(event.message)
      }

      if (event.job) {
        const job = event.job
        startTransition(() => {
          setCurrentJob((prev) => (prev && prev.id === job.id ? job : prev))
          setHistory((prev) => {
            const idx = prev.findIndex((item) => item.id === job.id)
            if (idx === -1) return [job, ...prev]
            const next = [...prev]
            next[idx] = job
            return next
          })
        })
        return
      }

      if (event.outputs) {
        const outputs = event.outputs
        const gid = event.generationId

        startTransition(() => {
          setCurrentJob((prev) => (prev && prev.id === gid ? { ...prev, outputs } : prev))
          setHistory((prev) => {
            const idx = prev.findIndex((item) => item.id === gid)
            if (idx === -1) return prev
            const next = [...prev]
            next[idx] = { ...next[idx], outputs }
            return next
          })
        })
        return
      }

      if (event.status) {
        const gid = event.generationId
        const status = event.status
        startTransition(() => {
          setCurrentJob((prev) => (prev && prev.id === gid ? { ...prev, status } : prev))
          setHistory((prev) => {
            const idx = prev.findIndex((item) => item.id === gid)
            if (idx === -1) return prev
            const next = [...prev]
            next[idx] = { ...next[idx], status }
            return next
          })
        })
      }
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!currentJob || currentJob.outputs.length === 0) {
      setFocusedOutputId(null)
      return
    }
    if (!focusedOutputId || !currentJob.outputs.some((output) => output.id === focusedOutputId)) {
      setFocusedOutputId(currentJob.outputs[0].id)
    }
  }, [currentJob, focusedOutputId])

  useEffect(() => {
    if (!previewImage) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewImage(null)
        return
      }

      if (!previewImage.outputId) return
      if (!currentJob || currentJob.outputs.length <= 1) return

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        navigatePreviewOutput(-1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        navigatePreviewOutput(1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [previewImage, currentJob, navigatePreviewOutput])

  function buildImageSize(): FalSeedreamImageSize {
    if (sizeMode === 'preset') return sizePreset
    return {
      width: Math.max(1, Math.round(customWidth || 1)),
      height: Math.max(1, Math.round(customHeight || 1))
    }
  }

  async function onProviderChange(next: string) {
    setProviderId(next)
    const normalized = next === 'openrouter_seedream' ? 'openrouter_seedream' : 'fal_seedream'
    await persistImageStudio({ defaultProviderId: normalized })
  }

  async function persistApiKey(showToast: boolean) {
    if (!selectedProvider) return
    try {
      await saveProviderPatch(selectedProvider.id, { apiKey: apiKeyDraft })
      setApiKeyDraftDirty(false)
      if (showToast) toast.success('API Key 已保存')
    } catch (error) {
      toast.error(String(error))
    }
  }

  function addUrl() {
    const value = urlInput.trim()
    if (!value) return

    if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('data:')) {
      toast.error('URL 必须以 http://、https:// 或 data: 开头')
      return
    }

    if (inputs.length >= MAX_INPUT_IMAGES) {
      toast.error(`输入图最多 ${MAX_INPUT_IMAGES} 张`)
      return
    }

    setInputs((prev) => [...prev, { id: crypto.randomUUID(), type: 'url', value, previewUrl: value }])
    setUrlInput('')
  }

  async function addFiles(files: File[]) {
    if (files.length === 0) return

    if (inputs.length + files.length > MAX_INPUT_IMAGES) {
      toast.error(`输入图最多 ${MAX_INPUT_IMAGES} 张`)
      return
    }

    try {
      const drafts = await Promise.all(
        files.map(async (file) => {
          const rawPath = (file as File & { path?: string }).path ?? ''
          const localPath =
            rawPath && !/^[a-zA-Z]:\\fakepath\\/i.test(rawPath) ? rawPath : ''

          if (localPath) {
            return {
              id: crypto.randomUUID(),
              type: 'localPath' as const,
              value: localPath,
              fileName: file.name,
              previewUrl: kelivoFileUrl(localPath)
            }
          }

          // 兜底：拿不到本地路径时才转 DataURL，避免把大图 Base64 常驻内存（会明显拖慢渲染与历史切换）。
          const preview = await readFileAsDataUrl(file)
           return {
             id: crypto.randomUUID(),
             type: 'url' as const,
             value: preview,
             fileName: file.name,
             previewUrl: preview
           }
         })
       )
      setInputs((prev) => [...prev, ...drafts])
    } catch (error) {
      toast.error(String(error))
    }
  }

  async function onPickFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    try {
      await addFiles(files)
    } finally {
      event.target.value = ''
    }
  }

  async function onDropFiles(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    const files = Array.from(event.dataTransfer?.files ?? [])
    void addFiles(files)
  }

  function removeInput(id: string) {
    setInputs((prev) => prev.filter((item) => item.id !== id))
  }

  function moveInput(index: number, step: -1 | 1) {
    setInputs((prev) => {
      const nextIndex = index + step
      if (nextIndex < 0 || nextIndex >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  function randomSeed() {
    setOptions((prev) => ({ ...prev, seed: Math.floor(Math.random() * 2147483647) }))
  }

  function openPreview(src: string, title: string, meta?: { outputId?: string }) {
    setPreviewImage({ src, title, ...(meta?.outputId ? { outputId: meta.outputId } : {}) })
  }

  function onPrevOutput() {
    if (!currentJob || currentJob.outputs.length <= 1) return
    const idx = focusedOutputIndex
    const next = (idx - 1 + currentJob.outputs.length) % currentJob.outputs.length
    setFocusedOutputId(currentJob.outputs[next].id)
  }

  function onNextOutput() {
    if (!currentJob || currentJob.outputs.length <= 1) return
    const idx = focusedOutputIndex
    const next = (idx + 1) % currentJob.outputs.length
    setFocusedOutputId(currentJob.outputs[next].id)
  }

  async function submitJob() {
    if (!selectedProvider) return

    if (isPlaceholder) {
      toast.error('当前供应商为占位实现，暂不支持执行生成。')
      return
    }

    if (!prompt.trim()) {
      toast.error('请输入提示词')
      return
    }

    if (inputs.length === 0) {
      toast.error('请先添加参考图')
      return
    }

    const apiKeyFromDraft = apiKeyDraft.trim()
    const apiKeyFromConfig = (selectedProvider.apiKey ?? '').trim()
    const apiKeyForSubmit = apiKeyFromDraft || apiKeyFromConfig

    if (!apiKeyForSubmit) {
      toast.error(`请先填写 ${selectedProvider.name} 的 API Key。`)
      return
    }

    const nextOptions = normalizeFalSeedreamEditOptions({ ...options, imageSize: buildImageSize() })
    const maxPossibleOutputs = nextOptions.numImages * nextOptions.maxImages
    const maxPossibleTotal = inputs.length + maxPossibleOutputs

    if (maxPossibleTotal > MAX_TOTAL_IMAGES) {
      const outputBudget = Math.max(0, MAX_TOTAL_IMAGES - inputs.length)
      const maxImagesAllowed = Math.max(1, Math.floor(outputBudget / Math.max(1, nextOptions.numImages)))
      toast.error(
        `总图上限为 ${MAX_TOTAL_IMAGES}（输入+输出）。你当前输入 ${inputs.length} 张；num_images=${nextOptions.numImages} 且 max_images=${nextOptions.maxImages} 时，最大输出=${maxPossibleOutputs} 张，最大总图=${maxPossibleTotal}/${MAX_TOTAL_IMAGES}。\n` +
          `建议：将 max_images 降到 ≤ ${Math.min(6, maxImagesAllowed)}，或减少参考图/num_images；如果你只想“固定输出 ${nextOptions.numImages} 张”，请把 max_images 设为 1。`
      )
      return
    }

    if (typeof nextOptions.imageSize === 'object') {
      const width = nextOptions.imageSize.width
      const height = nextOptions.imageSize.height
      const edgeRangeValid = width >= 1920 && width <= 4096 && height >= 1920 && height <= 4096
      const pixelRangeValid = width * height >= 2560 * 1440 && width * height <= 4096 * 4096
      if (!edgeRangeValid && !pixelRangeValid) {
        toast.error('自定义尺寸不符合 fal 文档限制')
        return
      }
    }

    setSubmitting(true)
    try {
      // 不阻塞生成：默认参数保存失败不影响本次提交。
      void persistImageStudio({
        uiDefaults: {
          ...props.config.imageStudio.uiDefaults,
          prompt,
          falSeedreamEditOptions: nextOptions
        }
      }).catch(() => undefined)

      const payloadInputs: ImageInputSource[] = inputs.map((item) => ({
        id: item.id,
        type: item.type,
        value: item.value,
        ...(item.fileName ? { fileName: item.fileName } : {}),
        ...(item.preparedDataUrl ? { preparedDataUrl: item.preparedDataUrl } : {})
      }))

      const res = await window.api.imageStudio.submit({
        providerId: selectedProvider.id,
        ...(apiKeyFromDraft ? { apiKey: apiKeyFromDraft } : {}),
        prompt,
        inputs: payloadInputs,
        falSeedreamEditOptions: nextOptions
      })

      if (!res.success || !res.job) {
        toast.error(res.error ?? '提交失败')
        return
      }

      setCurrentJob(res.job)
      setHistory((prev) => {
        const idx = prev.findIndex((job) => job.id === res.job!.id)
        if (idx === -1) return [res.job!, ...prev]
        const next = [...prev]
        next[idx] = res.job!
        return next
      })
      setPromptEditorOpen(false)
      toast.success('任务已提交')
    } catch (err) {
      toast.error(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelJob() {
    if (!currentJob) return
    const res = await window.api.imageStudio.cancel(currentJob.id)
    if (!res.success) {
      toast.error(res.error ?? '取消失败')
      return
    }
    toast.success('已发起取消')
  }

  async function deleteJob(job: ImageStudioJob) {
    const ok = await confirm({
      title: '删除历史记录',
      message: '确认删除该任务记录，并删除本地输出文件吗？',
      confirmText: '删除',
      cancelText: '取消',
      danger: true
    })
    if (!ok) return

    const res = await window.api.imageStudio.historyDelete({ generationId: job.id, deleteFiles: true })
    if (!res.success) {
      toast.error(res.error ?? '删除失败')
      return
    }

    if (currentJob?.id === job.id) {
      setCurrentJob(null)
      setFocusedOutputId(null)
    }

    if (previewImage?.outputId && job.outputs.some((out) => out.id === previewImage.outputId)) {
      setPreviewImage(null)
    }

    setHistory((prev) => prev.filter((item) => item.id !== job.id))
    toast.success('已删除')
  }

  async function deleteOutput(outputId: string) {
    const ok = await confirm({
      title: '删除图片',
      message: '确认删除这张输出图片吗？本地文件也会删除。',
      confirmText: '删除',
      cancelText: '取消',
      danger: true
    })
    if (!ok) return

    const outputDeleteFn = (window.api.imageStudio as any).outputDelete as
      | undefined
      | ((request: { outputId: string; deleteFile?: boolean }) => Promise<{ success: boolean; job?: ImageStudioJob | null; error?: string }>)

    if (typeof outputDeleteFn !== 'function') {
      toast.error('删除接口未就绪：请重启应用（或重新执行 build/start）后再试。')
      return
    }

    let res: { success: boolean; job?: ImageStudioJob | null; error?: string }
    try {
      res = await outputDeleteFn({ outputId, deleteFile: true })
    } catch (err) {
      toast.error(String(err))
      return
    }

    if (!res.success) {
      toast.error(res.error ?? '删除失败')
      return
    }

    const nextJob = res.job ?? null

    if (nextJob) {
      setCurrentJob((prev) => (prev && prev.id === nextJob.id ? nextJob : prev))
      setHistory((prev) => {
        const idx = prev.findIndex((item) => item.id === nextJob.id)
        if (idx === -1) return [nextJob, ...prev]
        const next = [...prev]
        next[idx] = nextJob
        return next
      })
    } else {
      // 兜底：若主进程未返回 job，则在渲染层做一次本地移除，避免 UI 卡住。
      setCurrentJob((prev) => {
        if (!prev) return prev
        const nextOutputs = prev.outputs.filter((out) => out.id !== outputId)
        if (nextOutputs.length === prev.outputs.length) return prev
        return { ...prev, outputs: nextOutputs }
      })
      setHistory((prev) =>
        prev.map((job) => {
          const nextOutputs = job.outputs.filter((out) => out.id !== outputId)
          if (nextOutputs.length === job.outputs.length) return job
          return { ...job, outputs: nextOutputs }
        })
      )
    }

    if (previewImage?.outputId === outputId) {
      setPreviewImage(null)
    }

    toast.success('已删除图片')
  }

  const statusText = currentJob ? `${statusLabel(currentJob.status)} · ${currentJob.id.slice(0, 8)}` : '暂无任务'

  return (
    <>
        <div className="imageStudioCherryRoot csPaintContainer">
          <div className="csPaintContent">
            {/* 统一的隐藏文件选择器：让参考图在任意面板状态下都能上传 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(event) => void onPickFiles(event)}
            />

            {!settingsOpen ? (
              <button
                className="csSettingsTrigger"
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={false}
                aria-controls="imageStudioSettingsPanel">
                <span className="csSettingsTriggerText">{selectedProvider?.name ?? '配置'}</span>
                <ChevronDown size={14} className="csSettingsTriggerChevron" />
              </button>
            ) : null}

          {settingsOpen ? (
            <div className="csSettingsPanelOverlay imageStudioCherryRoot" onMouseDown={() => setSettingsOpen(false)}>
              <div
                id="imageStudioSettingsPanel"
                className="csSettingsPanel"
                role="dialog"
                aria-modal="true"
                aria-label="绘画配置"
                onMouseDown={(event) => event.stopPropagation()}>
                <div className="csSettingsPanelHeader">
                  <button
                    className="csSettingsPanelPill"
                    type="button"
                    onClick={() => setSettingsOpen(false)}
                    title="收起 (Esc)">
                    <span className="csSettingsPanelPillText">{selectedProvider?.name ?? '配置'}</span>
                    <ChevronUp size={14} className="csSettingsPanelPillChevron" />
                  </button>
                  <div className="csSettingsPanelHeaderActions">
                    <button className="csIconBtn" type="button" onClick={() => setSettingsOpen(false)} title="关闭 (Esc)">
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="csSettingsPanelBody">
                  <div className="csSettingsPanelColumns">
                    <div className="csSettingsPanelLeft">
                      <section className="csSettingsGroup" aria-label="供应商与 Key">
                        <div className="csSettingsGroupHeader">
                          <div className="csSettingsGroupTitle">账号</div>
                          <div className="csSettingsGroupMeta">供应商 / Key</div>
                        </div>
                        <div className="csSettingsGroupBody">
                          <div className="csLabel">供应商</div>
                          <CustomSelect
                            className="csControl csSelectTrigger"
                            value={selectedProvider?.id ?? ''}
                            options={providers.map((provider) => ({ value: provider.id, label: provider.name }))}
                            onChange={(value) => void onProviderChange(value)}
                            placeholder="选择供应商"
                          />
                          {isPlaceholder ? (
                            <div className="csHint csHintWarn">OpenRouter 当前为占位实现，可保存 Key，暂不支持生成。</div>
                          ) : (
                            <div className="csHint">fal.ai 当前为真实通道，支持提交、取消与历史。</div>
                          )}

                          <div className="csLabel">API Key</div>
                          <div className="csRow">
                            <input
                              className="csControl csGrow"
                              type={showApiKey ? 'text' : 'password'}
                              value={apiKeyDraft}
                              onChange={(event) => {
                                setApiKeyDraftDirty(true)
                                setApiKeyDraft(event.target.value)
                              }}
                              onBlur={() => void persistApiKey(false)}
                              placeholder="输入供应商 API Key"
                            />
                            <button
                              className="csIconBtn csTip"
                              data-tip={showApiKey ? '隐藏' : '显示'}
                              type="button"
                              onClick={() => setShowApiKey((prev) => !prev)}>
                              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                            <button
                              className="csIconBtn csTip"
                              data-tip="保存 Key"
                              type="button"
                              onClick={() => void persistApiKey(true)}>
                              <Save size={16} />
                            </button>
                          </div>
                          <div className="csHint">失焦也会自动保存。</div>
                        </div>
                      </section>

                      <section className="csSettingsGroup is-grow" aria-label="fal 参数">
                        <div className="csSettingsGroupHeader">
                          <div className="csSettingsGroupTitle">fal 参数</div>
                          <div className="csSettingsGroupMeta">Seedream v4.5</div>
                        </div>
                        <div className="csSettingsGroupBody">
                        <div className="csLabel">image_size</div>
                        <div className="csGrid2">
                          <CustomSelect
                            className="csControl csSelectTrigger"
                            value={sizeMode}
                            options={[
                              { value: 'preset', label: '预设' },
                              { value: 'custom', label: '自定义' }
                            ]}
                            onChange={(value) => setSizeMode(value as 'preset' | 'custom')}
                          />

                          {sizeMode === 'preset' ? (
                            <CustomSelect
                              className="csControl csSelectTrigger"
                              value={sizePreset}
                              options={FAL_SEEDREAM_IMAGE_SIZE_PRESETS.map((preset) => ({
                                value: preset,
                                label: IMAGE_SIZE_LABELS[preset]
                              }))}
                              onChange={(value) => setSizePreset(value as FalSeedreamImageSizePreset)}
                            />
                          ) : (
                            <div className="csGrid2">
                              <input
                                className="csControl"
                                type="number"
                                min={1}
                                value={customWidth}
                                onChange={(event) => setCustomWidth(Number(event.target.value || 0))}
                                placeholder="width"
                              />
                              <input
                                className="csControl"
                                type="number"
                                min={1}
                                value={customHeight}
                                onChange={(event) => setCustomHeight(Number(event.target.value || 0))}
                                placeholder="height"
                              />
                            </div>
                          )}
                        </div>

                        <div className="csField">
                          <div className="csLabelRow">
                            <span className="csLabelInline">num_images</span>
                            <span className="csHint">{options.numImages}</span>
                          </div>
                          <input
                            className="csRange"
                            type="range"
                            min={1}
                            max={6}
                            value={options.numImages}
                            onChange={(event) =>
                              setOptions((prev) => ({
                                ...prev,
                                numImages: Math.max(1, Math.min(6, Math.round(Number(event.target.value || 1))))
                              }))
                            }
                          />
                        </div>

                        <div className="csGrid2">
                          <div className="csField">
                            <div className="csLabelRow">
                              <span
                                className="csLabelInline"
                                title="max_images > 1 时启用多图生成：每次 generation 可能返回 1~max_images 张；总共执行 num_images 次 generation；总输出范围 num_images~(num_images*max_images)。总图量限制按最大可能输出计算。">
                                max_images
                              </span>
                              <span className="csHint">{options.maxImages}</span>
                            </div>
                            <input
                              className="csControl"
                              type="number"
                              min={1}
                              max={6}
                              value={options.maxImages}
                              onChange={(event) =>
                                setOptions((prev) => ({
                                  ...prev,
                                  maxImages: Math.max(1, Math.min(6, Math.round(Number(event.target.value || 1))))
                                }))
                              }
                            />
                          </div>

                          <div className="csField">
                            <div className="csLabelInline">seed</div>
                            <div className="csRow">
                              <input
                                className="csControl csGrow"
                                type="number"
                                min={0}
                                max={2147483647}
                                value={options.seed}
                                onChange={(event) =>
                                  setOptions((prev) => ({
                                    ...prev,
                                    seed: Math.max(0, Math.min(2147483647, Math.round(Number(event.target.value || 0))))
                                  }))
                                }
                              />
                              <button className="csIconBtn" type="button" onClick={randomSeed} title="随机种子">
                                <Wand2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div
                          className="csHint csHintBlock"
                          title="输出范围（不含输入图）：num_images ~ (num_images*max_images)；总图量限制按最大可能输出计算。">
                          输出范围：{options.numImages}~{options.numImages * options.maxImages} 张；最大总图：{inputs.length} +{' '}
                          {options.numImages * options.maxImages} = {inputs.length + options.numImages * options.maxImages} / {MAX_TOTAL_IMAGES}
                        </div>

                        <div className="csField">
                          <div className="csLabel">enhance_prompt_mode</div>
                          <CustomSelect
                            className="csControl csSelectTrigger"
                            value={options.enhancePromptMode}
                            options={[
                              { value: 'standard', label: 'standard（默认）' },
                              { value: 'fast', label: 'fast（更快）' }
                            ]}
                            onChange={(value) =>
                              setOptions((prev) => ({
                                ...prev,
                                enhancePromptMode: value === 'fast' ? 'fast' : 'standard'
                              }))
                            }
                          />
                        </div>

                        <div className="csSwitchRow">
                          <span className="csLabelInline">sync_mode</span>
                          <input
                            type="checkbox"
                            className="csToggle"
                            checked={options.syncMode}
                            onChange={(event) => setOptions((prev) => ({ ...prev, syncMode: event.target.checked }))}
                          />
                        </div>

                        <div className="csSwitchRow csSwitchRowAccent">
                          <span className="csLabelInline">enable_safety_checker</span>
                          <input
                            type="checkbox"
                            className="csToggle"
                            checked={options.enableSafetyChecker}
                            onChange={(event) => setOptions((prev) => ({ ...prev, enableSafetyChecker: event.target.checked }))}
                          />
                        </div>
                      </div>
                    </section>
                    </div>

                    {/* 参考图在左侧常驻 Dock 中维护：这里不重复展示，避免「同一份内容两套 UI」造成割裂与卡顿。 */}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

            {/* 左侧参考图常驻：输出图不必占满，参考图更醒目 */}
            <aside className="csRefDock" aria-label="参考图">
              <div className="csRefDockHeader">
                <div className="csRefDockTitle">参考图</div>
                <div className="csRefDockMeta">
                  {inputs.length}/{MAX_INPUT_IMAGES}
                </div>
              </div>

              <button
                className="csRefDropzone"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={onDropFiles}
                title="点击或拖拽上传图片（支持多选）">
                <div className="csRefDropzoneInner">
                  <ImagePlus size={28} />
                  <div className="csRefDropzoneText">点击或拖拽上传图片</div>
                  <div className="csRefDropzoneSub">支持多张图片选择</div>
                </div>
              </button>

              <div className="csRow">
                <input
                  className="csControl csGrow"
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                  placeholder="粘贴图片 URL（https://... 或 data:...）"
                />
                <button className="csIconBtn" type="button" onClick={addUrl} title="添加 URL">
                  <Link2 size={16} />
                </button>
              </div>

              <div className="csRefList" aria-label="参考图列表">
                {inputs.length === 0 ? (
                  <div className="csHint">暂无参考图</div>
                ) : (
                  inputs.map((item, index) => {
                    const src = item.previewUrl
                    const title = item.fileName ?? item.value
                    return (
                      <div key={item.id} className="csRefItem">
                        <button
                          className="csRefThumb"
                          type="button"
                          disabled={!src}
                          onClick={() => src && openPreview(src, title)}
                          onContextMenu={(event) => src && openImageMenu(event, src, title)}
                          title={title}>
                          {src ? (
                            <img className="csRefThumbImg" src={src} alt={title} loading="lazy" decoding="async" />
                          ) : (
                            <div className="csRefThumbEmpty">
                              <ImagePlus size={16} />
                            </div>
                          )}
                        </button>

                        <div className="csRefMeta">
                          <div className="csRefName" title={title}>
                            {item.fileName ?? (item.type === 'localPath' ? '本地图片' : '图片 URL')}
                          </div>
                          <div className="csRefSub" title={item.value}>
                            {item.type === 'localPath' ? item.value : item.value.replace(/^data:[^,]+,.{0,12}.*/i, 'data:…')}
                          </div>
                        </div>

                        <div className="csRefActions" aria-label="参考图操作">
                          <button
                            className="csMiniIconBtn csTip"
                            data-tip="下载"
                            type="button"
                            onClick={() => src && void saveImageAs(src, item.fileName ?? `reference_${index + 1}.png`)}
                            disabled={!src}>
                            <Download size={14} />
                          </button>
                          <button
                            className="csMiniIconBtn csTip"
                            data-tip="上移"
                            type="button"
                            onClick={() => moveInput(index, -1)}
                            disabled={index === 0}>
                            <ChevronUp size={14} />
                          </button>
                          <button
                            className="csMiniIconBtn csTip"
                            data-tip="下移"
                            type="button"
                            onClick={() => moveInput(index, 1)}
                            disabled={index === inputs.length - 1}>
                            <ChevronDown size={14} />
                          </button>
                          <button
                            className="csMiniIconBtn csMiniIconBtnDanger csTip"
                            data-tip="删除"
                            type="button"
                            onClick={() => removeInput(item.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </aside>

          <main className="csPaintMain">
            <section className="csArtboard" aria-label="输出图">
              <div className={`csArtboardInner ${isBusy ? 'is-dim' : ''}`}>
                {focusedOutput && focusedOutputSrc ? (
                  <div className="csArtboardImageContainer">
                    {currentJob && currentJob.outputs.length > 1 ? (
                      <button className="csNavButton csNavButton--left" type="button" onClick={onPrevOutput} aria-label="上一张">
                        ←
                      </button>
                    ) : null}

                    <button
                      className="csArtboardImageButton"
                      type="button"
                      onClick={() => openPreview(focusedOutputSrc, outputName(focusedOutput), { outputId: focusedOutput.id })}
                      onContextMenu={(event) =>
                        openImageMenu(event, focusedOutputSrc, outputName(focusedOutput), { outputId: focusedOutput.id })
                      }>
                      <img className="csArtboardImage" src={focusedOutputSrc} alt={outputName(focusedOutput)} decoding="async" />
                    </button>

                    <div className="csArtboardTools" aria-label="输出图操作">
                      <div className="csArtboardBadge" title="输出数量">
                        {(currentJob?.outputs.length ?? 1).toString()}张
                      </div>
                      <div className="csArtboardToolsRight">
                        <button
                          className="csArtboardToolBtn"
                          type="button"
                          onClick={() => void saveImageAs(focusedOutputSrc, outputName(focusedOutput))}
                          title="下载">
                          <Download size={16} />
                        </button>
                        <button
                          className="csArtboardToolBtn csArtboardToolBtnDanger csTip"
                          data-tip="删除"
                          type="button"
                          onClick={() => void deleteOutput(focusedOutput.id)}
                          >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {currentJob && currentJob.outputs.length > 1 ? (
                      <button className="csNavButton csNavButton--right" type="button" onClick={onNextOutput} aria-label="下一张">
                        →
                      </button>
                    ) : null}

                    {currentJob && currentJob.outputs.length > 1 ? (
                      <div className="csImageCounter">
                        {focusedOutputIndex + 1} / {currentJob.outputs.length}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="csArtboardPlaceholder">
                    <ImagePlus size={18} />
                    <div>暂无输出图片</div>
                  </div>
                )}
              </div>

              {isBusy ? (
                <div className="csLoadingOverlay">
                  <div className="csSpinner" />
                  <div className="csLoadingText">{isRunning ? statusText : '提交中...'}</div>
                  {isRunning ? (
                    <button className="csCancelBtn" type="button" onClick={() => void cancelJob()}>
                      <Square size={14} />
                      取消
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="csInputContainer" aria-label="提示词">
              <button
                className="csPromptExpandBtn"
                type="button"
                onClick={() => setPromptEditorOpen(true)}
                disabled={isRunning}
                title="放大编辑提示词">
                <Maximize2 size={16} />
              </button>
              <textarea
                className="csTextarea"
                value={prompt}
                disabled={isRunning}
                spellCheck={false}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={isRunning ? '生成中...' : submitting ? '提交中...' : '输入提示词（Ctrl+Enter 生成）'}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault()
                    void submitJob()
                  }
                }}
              />

              <button
                className="csPromptGenerateBtn"
                type="button"
                onClick={() => void submitJob()}
                disabled={submitting || isPlaceholder || isRunning}
                title={isPlaceholder ? '占位供应商不可生成' : '开始生成'}>
                {submitting ? <Loader2 size={16} className="spinning" /> : <Play size={16} />}
              </button>
            </section>
          </main>

          <HistoryRail
            rightJobs={rightJobs}
            currentJobId={currentJob?.id ?? null}
            historyLoading={historyLoading}
            isRunning={isRunning}
            onNew={resetDraftToDefaults}
            onSelect={(job) => {
              // 历史列表已包含完整 Job（含 inputs/options），切换时避免额外 IPC/DB 读取，减少卡顿。
              startTransition(() => {
                setCurrentJob(job)
                hydrateDraftFromJob(job)
              })
            }}
            onDelete={(job) => void deleteJob(job)}
          />
        </div>
      </div>

      {promptEditorOpen ? (
        <div className="csPromptModal imageStudioCherryRoot" onMouseDown={() => setPromptEditorOpen(false)}>
          <div className="csPromptModalInner" onMouseDown={(event) => event.stopPropagation()}>
            <div className="csPromptModalHeader">
              <div className="csPromptModalTitle">提示词</div>
              <div className="csPromptModalActions">
                <button
                  className="csIconBtn"
                  type="button"
                  onClick={() => void submitJob()}
                  disabled={submitting || isPlaceholder || isRunning}
                  title={isPlaceholder ? '占位供应商不可生成' : '开始生成 (Ctrl+Enter)'}>
                  {submitting ? <Loader2 size={16} className="spinning" /> : <Play size={16} />}
                </button>
                <button className="csIconBtn" type="button" onClick={() => setPromptEditorOpen(false)} title="关闭 (Esc)">
                  <X size={16} />
                </button>
              </div>
            </div>

            <textarea
              ref={promptEditorRef}
              className="csPromptModalTextarea"
              value={prompt}
              disabled={isRunning}
              spellCheck={false}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={isRunning ? '生成中...' : submitting ? '提交中...' : '输入提示词（Ctrl+Enter 生成）'}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setPromptEditorOpen(false)
                  return
                }
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault()
                  void submitJob()
                }
              }}
            />

            <div className="csPromptModalFooter">
              <div className="csPromptModalHint">Ctrl+Enter 生成，Esc 关闭</div>
              <div className="csPromptModalHint">{prompt.trim().length} 字</div>
            </div>
          </div>
        </div>
      ) : null}

      {previewImage ? (
        <div className="csLightbox imageStudioCherryRoot" onClick={() => setPreviewImage(null)}>
          <div className="csLightboxInner" onClick={(event) => event.stopPropagation()}>
            <div className="csLightboxHeader">
              <div className="csLightboxTitle" title={previewImage.title}>
                {previewImage.title}
              </div>
              <div className="csLightboxHeaderActions">
                {previewImage.outputId ? (
                  <button
                    className="csIconBtn csIconBtnDanger csTip"
                    data-tip="删除"
                    type="button"
                    onClick={() => void deleteOutput(previewImage.outputId!)}
                    >
                    <Trash2 size={16} />
                  </button>
                ) : null}
                <button
                  className="csIconBtn"
                  type="button"
                  onClick={() => void saveImageAs(previewImage.src, previewImage.title)}
                  title="下载">
                  <Download size={16} />
                </button>
                <button className="csIconBtn" type="button" onClick={() => setPreviewImage(null)} title="关闭">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="csLightboxBody">
              {previewImage.outputId && currentJob && currentJob.outputs.length > 1 ? (
                <>
                  <button
                    className="csNavButton csNavButton--left"
                    type="button"
                    onClick={() => navigatePreviewOutput(-1)}
                    aria-label="上一张 (←)">
                    ←
                  </button>
                  <button
                    className="csNavButton csNavButton--right"
                    type="button"
                    onClick={() => navigatePreviewOutput(1)}
                    aria-label="下一张 (→)">
                    →
                  </button>
                  <div className="csImageCounter">
                    {previewOutputIndex + 1} / {currentJob.outputs.length}
                  </div>
                </>
              ) : null}
              <img
                src={previewImage.src}
                alt={previewImage.title}
                className="csLightboxImage"
                decoding="async"
                onContextMenu={(event) =>
                  openImageMenu(event, previewImage.src, previewImage.title, { outputId: previewImage.outputId })
                }
              />
            </div>
          </div>
        </div>
      ) : null}

      {contextMenu ? (
        <div className="csContextMenuOverlay imageStudioCherryRoot" onMouseDown={closeImageMenu}>
          <div
            className="csContextMenu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="csContextMenuItem"
              onClick={() => {
                closeImageMenu()
                void saveImageAs(contextMenu.src, contextMenu.title)
              }}>
              <Download size={16} />
              保存图片...
            </button>
            <button
              type="button"
              className="csContextMenuItem"
              onClick={() => {
                closeImageMenu()
                void copyImageToClipboard(contextMenu.src)
              }}>
              <Copy size={16} />
              复制图片
            </button>
            <button
              type="button"
              className="csContextMenuItem"
              onClick={() => {
                closeImageMenu()
                void copyLinkToClipboard(contextMenu.src)
              }}>
              <Link2 size={16} />
              复制链接
            </button>
            {contextMenu.outputId ? (
              <button
                type="button"
                className="csContextMenuItem csContextMenuItemDanger"
                onClick={() => {
                  const outputId = contextMenu.outputId!
                  closeImageMenu()
                  void deleteOutput(outputId)
                }}>
                <Trash2 size={16} />
                删除这张
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
