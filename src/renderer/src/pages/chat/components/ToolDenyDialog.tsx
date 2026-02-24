/**
 * ToolDenyDialog — 拒绝工具调用时的原因输入框
 */
import { useState } from 'react'

interface ToolDenyDialogProps {
  open: boolean
  onClose: () => void
  onDeny: (reason?: string) => void
}

export function ToolDenyDialog({ open, onClose, onDeny }: ToolDenyDialogProps) {
  const [reason, setReason] = useState('')

  if (!open) return null

  return (
    <div className="cotDenyOverlay" onClick={onClose}>
      <div className="cotDenyDialog" onClick={(e) => e.stopPropagation()}>
        <div className="cotDenyTitle">拒绝原因（可选）</div>
        <textarea
          className="cotDenyInput"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="输入拒绝原因..."
          rows={3}
        />
        <div className="cotDenyActions">
          <button type="button" className="cotDenyCancel" onClick={onClose}>取消</button>
          <button
            type="button"
            className="cotDenyConfirm"
            onClick={() => {
              onDeny(reason.trim() || undefined)
              setReason('')
            }}
          >
            确认拒绝
          </button>
        </div>
      </div>
    </div>
  )
}
