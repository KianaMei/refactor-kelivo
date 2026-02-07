/**
 * 侧边栏拖动调整宽度的 handle
 * 对齐 Flutter Kelivo 的 sidebar_resize_handle.dart
 */
import { useState, useCallback, useEffect } from 'react'

interface Props {
  visible: boolean
  onDrag: (deltaX: number) => void
  onDragEnd?: () => void
  side?: 'left' | 'right' // 控制拖动方向
}

export function SidebarResizeHandle(props: Props) {
  const { visible, onDrag, onDragEnd, side = 'left' } = props
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e: MouseEvent) => {
      // 根据 side 方向调整 delta
      const delta = side === 'left' ? e.movementX : -e.movementX
      onDrag(delta)
    }

    const handleMouseUp = () => {
      setDragging(false)
      onDragEnd?.()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, onDrag, onDragEnd, side])

  if (!visible) return null

  return (
    <div
      className={`sidebarResizeHandle ${hovered || dragging ? 'sidebarResizeHandleActive' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={handleMouseDown}
    >
      <div className="sidebarResizeHandleLine" />
    </div>
  )
}
