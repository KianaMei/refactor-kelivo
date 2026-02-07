/**
 * 通用桌面 Popover 弹出层
 * 对齐 Flutter Kelivo 的 desktop_popover.dart
 * 在锚点按钮正上方弹出，毛玻璃背景
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  children: ReactNode
  minWidth?: number
  maxHeight?: number
  /** 弹出方向：above 在锚点上方，below 在锚点下方 */
  placement?: 'above' | 'below'
}

export function DesktopPopover({ anchorRef, open, onClose, children, minWidth = 420, maxHeight = 480, placement = 'above' }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    // 延迟添加，避免触发按钮的 click 被捕获
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKey)
    }, 10)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  if (!open || !anchorRef.current) return null

  const anchor = anchorRef.current.getBoundingClientRect()
  // 居中于锚点，clamp 到视口
  let left = anchor.left + anchor.width / 2 - minWidth / 2
  if (left < 12) left = 12
  if (left + minWidth > window.innerWidth - 12) left = window.innerWidth - 12 - minWidth

  // 根据 placement 计算垂直位置
  const positionStyle: React.CSSProperties =
    placement === 'below'
      ? { top: anchor.bottom + 8 } // 锚点下方
      : { bottom: window.innerHeight - anchor.top + 8 } // 锚点上方

  const popover = (
    <div
      ref={popoverRef}
      className="desktopPopover"
      style={{
        position: 'fixed',
        left,
        ...positionStyle,
        minWidth,
        maxHeight,
        zIndex: 99999
      }}
    >
      {children}
    </div>
  )

  return createPortal(popover, document.body)
}
