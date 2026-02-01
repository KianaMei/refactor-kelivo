import { useRef } from 'react'
import { useDialogClose } from '../../../../hooks/useDialogClose'

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  position,
  onConfirm,
  onCancel
}: {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  position?: { x: number; y: number }
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useDialogClose(open, onCancel)

  if (!open) return null

  // 计算对话框位置，让删除按钮靠近鼠标点击位置
  // 对话框约 320x180，删除按钮在右下角，所以需要向左上偏移
  const dialogStyle: React.CSSProperties = position
    ? {
        position: 'fixed',
        // 向左偏移，让右侧删除按钮靠近鼠标
        left: Math.max(10, Math.min(position.x - 280, window.innerWidth - 340)),
        // 向上偏移，让底部按钮靠近鼠标
        top: Math.max(10, Math.min(position.y - 140, window.innerHeight - 200))
      }
    : {}

  return (
    <div
      className="confirm-dialog-overlay"
      onClick={onCancel}
      style={position ? { alignItems: 'flex-start', justifyContent: 'flex-start' } : {}}
    >
      <div
        ref={dialogRef}
        className="confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
      >
        <div className="confirm-dialog-title">{title}</div>
        <div className="confirm-dialog-message">{message}</div>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-btn cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button type="button" className={`confirm-dialog-btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

