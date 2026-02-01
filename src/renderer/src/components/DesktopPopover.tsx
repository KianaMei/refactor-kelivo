/**
 * 通用桌面 Popover 弹出层
 * 对齐 Flutter Kelivo 的 desktop_popover.dart
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  children: ReactNode
  minWidth?: number
  maxHeight?: number
}

export function DesktopPopover({ anchorRef, open, onClose, children, minWidth = 280, maxHeight = 480 }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open || !anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    // 弹出在按钮上方
    setPos({
      top: rect.top,
      left: rect.left
    })
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  if (!open || !pos) return null

  // 计算弹出位置：在锚点上方，左对齐
  const style: React.CSSProperties = {
    position: 'fixed',
    bottom: window.innerHeight - pos.top + 6,
    left: pos.left,
    minWidth,
    maxHeight,
    zIndex: 9999,
    overflow: 'auto',
    borderRadius: 12,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    animation: 'popoverIn 0.15s ease-out'
  }

  return (
    <div ref={popoverRef} style={style} className="frosted">
      {children}
    </div>
  )
}
