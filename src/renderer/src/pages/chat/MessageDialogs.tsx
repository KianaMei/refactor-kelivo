/**
 * 消息操作对话框组件
 * 包括：选择复制、分享、编辑、网页视图渲染
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Copy, Check, FileText, FileJson, Image, Maximize2, Minimize2, Save } from 'lucide-react'
import { MarkdownView } from '../../components/MarkdownView'
import type { ChatMessage } from './MessageBubble'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  title: string
  width?: number
}

/** 通用对话框 */
function Dialog({ open, onClose, children, title, width = 500 }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function handleClickOutside(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEsc)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="dialogOverlay">
      <div ref={dialogRef} className="dialogContent" style={{ width }}>
        <div className="dialogHeader">
          <span className="dialogTitle">{title}</span>
          <button type="button" className="dialogCloseBtn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="dialogBody">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}

interface SelectCopyDialogProps {
  open: boolean
  onClose: () => void
  message: ChatMessage
}

/** 选择复制对话框 */
export function SelectCopyDialog({ open, onClose, message }: SelectCopyDialogProps) {
  const [copied, setCopied] = useState(false)

  function handleCopyAll() {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onClose={onClose} title="选择复制" width={720}>
      <div
        className="selectCopyContent"
        style={{
          height: 'calc(70vh - 120px)',
          minHeight: 300,
          maxHeight: 600,
          overflow: 'auto',
          padding: 16,
          background: 'var(--surface-2)',
          borderRadius: 8,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 14,
          lineHeight: 1.6,
          userSelect: 'text'
        }}
      >
        {message.content}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleCopyAll}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? '已复制' : '复制全部'}
        </button>
      </div>
    </Dialog>
  )
}

interface EditDialogProps {
  open: boolean
  onClose: () => void
  message: ChatMessage
  onSave: (newContent: string) => void
}

/** 编辑消息对话框 */
export function EditBottomSheet({ open, onClose, message, onSave }: EditDialogProps) {
  const [content, setContent] = useState(message.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setContent(message.content)
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [open, message.content])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onClose])

  function handleSave() {
    const trimmed = content.trim()
    if (trimmed && trimmed !== message.content) {
      onSave(trimmed)
    }
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave()
    }
  }

  if (!open) return null

  const hasChanges = content.trim() !== message.content

  return createPortal(
    <div className="dialogOverlay">
      <div ref={dialogRef} className="dialogContent" style={{ width: 640 }}>
        <div className="dialogHeader">
          <span className="dialogTitle">编辑消息</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={!hasChanges}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px' }}
            >
              <Save size={14} />
              保存
            </button>
            <button type="button" className="dialogCloseBtn" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="dialogBody" style={{ padding: 12 }}>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息内容..."
            style={{
              width: '100%',
              height: 'calc(50vh - 80px)',
              minHeight: 200,
              maxHeight: 400,
              padding: 12,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--surface-2)',
              color: 'var(--text-1)',
              fontSize: 14,
              lineHeight: 1.6,
              resize: 'vertical',
              outline: 'none'
            }}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
            Ctrl+Enter 保存 · Esc 取消
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

interface ShareDialogProps {
  open: boolean
  onClose: () => void
  message: ChatMessage
}

/** 分享对话框 - 支持复制和导出 */
export function ShareDialog({ open, onClose, message }: ShareDialogProps) {
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [includeReasoning, setIncludeReasoning] = useState(true)
  const [includeToolCalls, setIncludeToolCalls] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const hasReasoning = Boolean(message.reasoning)
  const hasToolCalls = Boolean(message.toolCalls?.length)

  const getExportContent = useCallback(() => {
    let result = message.content
    if (includeReasoning && message.reasoning) {
      result = `<思考过程>\n${message.reasoning}\n</思考过程>\n\n${result}`
    }
    if (includeToolCalls && message.toolCalls?.length) {
      const toolsText = message.toolCalls
        .map(t => `- ${t.name}: ${t.status}${t.result ? ` → ${t.result}` : ''}`)
        .join('\n')
      result = `${result}\n\n<工具调用>\n${toolsText}\n</工具调用>`
    }
    return result
  }, [message, includeReasoning, includeToolCalls])

  const getMarkdownContent = useCallback(() => {
    const roleLabel = message.role === 'user' ? '用户' : '助手'
    const timestamp = new Date().toLocaleString('zh-CN')
    let content = `# ${roleLabel}消息\n\n**时间**: ${timestamp}\n\n---\n\n`

    if (includeReasoning && message.reasoning) {
      content += `## 思考过程\n\n${message.reasoning}\n\n---\n\n`
    }
    content += `## 回复内容\n\n${message.content}`
    if (includeToolCalls && message.toolCalls?.length) {
      content += `\n\n---\n\n## 工具调用\n\n`
      content += message.toolCalls
        .map(t => `- **${t.name}** (${t.status})${t.result ? `\n  结果: ${t.result}` : ''}`)
        .join('\n')
    }
    return content
  }, [message, includeReasoning, includeToolCalls])

  const getJsonContent = useCallback(() => {
    const data: Record<string, unknown> = {
      role: message.role,
      content: message.content,
      exportedAt: new Date().toISOString()
    }
    if (includeReasoning && message.reasoning) {
      data.reasoning = message.reasoning
    }
    if (includeToolCalls && message.toolCalls?.length) {
      data.toolCalls = message.toolCalls
    }
    return JSON.stringify(data, null, 2)
  }, [message, includeReasoning, includeToolCalls])

  function handleCopy() {
    navigator.clipboard.writeText(getExportContent())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleExportMarkdown() {
    setExporting(true)
    try {
      const result = await window.api.dialog.saveFile({
        defaultPath: `message-${Date.now()}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (!result.canceled && result.filePath) {
        await window.api.dialog.writeFile(result.filePath, Buffer.from(getMarkdownContent(), 'utf-8'))
      }
    } finally {
      setExporting(false)
    }
  }

  async function handleExportJson() {
    setExporting(true)
    try {
      const result = await window.api.dialog.saveFile({
        defaultPath: `message-${Date.now()}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (!result.canceled && result.filePath) {
        await window.api.dialog.writeFile(result.filePath, Buffer.from(getJsonContent(), 'utf-8'))
      }
    } finally {
      setExporting(false)
    }
  }

  async function handleExportImage() {
    if (!contentRef.current) return
    setExporting(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(contentRef.current, {
        backgroundColor: '#1a1a1a',
        scale: 2
      })
      const dataUrl = canvas.toDataURL('image/png')
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '')

      const result = await window.api.dialog.saveFile({
        defaultPath: `message-${Date.now()}.png`,
        filters: [{ name: 'PNG Image', extensions: ['png'] }]
      })
      if (!result.canceled && result.filePath) {
        await window.api.dialog.writeFile(result.filePath, Buffer.from(base64Data, 'base64'))
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="分享 / 导出" width={520}>
      {/* 内容预览 */}
      <div
        ref={contentRef}
        style={{
          maxHeight: 180,
          overflow: 'auto',
          padding: 12,
          background: 'var(--surface-2)',
          borderRadius: 8,
          fontSize: 13,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          marginBottom: 12
        }}
      >
        <div style={{ color: 'var(--text-3)', fontSize: 11, marginBottom: 6 }}>
          {message.role === 'user' ? '用户' : '助手'}
        </div>
        {getExportContent().slice(0, 500)}{getExportContent().length > 500 ? '...' : ''}
      </div>

      {/* 导出选项 */}
      {(hasReasoning || hasToolCalls) && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 16 }}>
          {hasReasoning && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeReasoning}
                onChange={(e) => setIncludeReasoning(e.target.checked)}
              />
              包含思考过程
            </label>
          )}
          {hasToolCalls && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeToolCalls}
                onChange={(e) => setIncludeToolCalls(e.target.checked)}
              />
              包含工具调用
            </label>
          )}
        </div>
      )}

      {/* 导出按钮 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={handleCopy}
          disabled={exporting}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', fontSize: 13 }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? '已复制' : '复制'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleExportMarkdown}
          disabled={exporting}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', fontSize: 13 }}
        >
          <FileText size={14} />
          Markdown
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleExportJson}
          disabled={exporting}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', fontSize: 13 }}
        >
          <FileJson size={14} />
          JSON
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleExportImage}
          disabled={exporting}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', fontSize: 13 }}
        >
          <Image size={14} />
          图片
        </button>
      </div>
    </Dialog>
  )
}

interface WebViewDialogProps {
  open: boolean
  onClose: () => void
  message: ChatMessage
}

/** 网页视图渲染对话框 */
export function WebViewDialog({ open, onClose, message }: WebViewDialogProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false)
        } else {
          onClose()
        }
      }
    }
    function handleClickOutside(e: MouseEvent) {
      if (!isFullscreen && dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEsc)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, isFullscreen, onClose])

  if (!open) return null

  const dialogStyle: React.CSSProperties = isFullscreen
    ? {
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        borderRadius: 0,
        zIndex: 10001
      }
    : {
        width: 800,
        height: 600
      }

  return createPortal(
    <div className="dialogOverlay" style={isFullscreen ? { zIndex: 10000 } : undefined}>
      <div ref={dialogRef} className="dialogContent" style={dialogStyle}>
        <div className="dialogHeader">
          <span className="dialogTitle">网页视图渲染</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="dialogCloseBtn"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button type="button" className="dialogCloseBtn" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="dialogBody" style={{ padding: 0, height: 'calc(100% - 40px)' }}>
          <div
            style={{
              height: '100%',
              overflow: 'auto',
              padding: 20,
              background: 'var(--surface-1)',
            }}
          >
            <MarkdownView content={message.content} />
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
