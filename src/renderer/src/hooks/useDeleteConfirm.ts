/**
 * 删除二次确认 Hook
 * 提供一个简单的确认状态管理
 */
import { useState, useRef, useEffect, useCallback } from 'react'

interface UseDeleteConfirmOptions {
  /** 确认超时时间（毫秒），默认 3000 */
  timeout?: number
}

interface UseDeleteConfirmReturn {
  /** 是否处于确认状态 */
  confirming: boolean
  /** 当前确认的项目 ID（用于区分多个删除目标） */
  confirmingId: string | null
  /** 开始确认（第一次点击） */
  startConfirm: (id: string) => void
  /** 执行删除（确认点击） */
  confirmDelete: (id: string, onDelete: () => void) => void
  /** 取消确认 */
  cancelConfirm: () => void
  /** 检查某个 ID 是否在确认中 */
  isConfirming: (id: string) => boolean
  /** 统一的删除处理函数：第一次点击开始确认，第二次执行删除 */
  handleDelete: (id: string, onDelete: () => void) => void
}

export function useDeleteConfirm(options: UseDeleteConfirmOptions = {}): UseDeleteConfirmReturn {
  const { timeout = 3000 } = options
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 清理 timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const startConfirm = useCallback((id: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setConfirmingId(id)
    timerRef.current = setTimeout(() => setConfirmingId(null), timeout)
  }, [timeout])

  const cancelConfirm = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setConfirmingId(null)
  }, [])

  const confirmDelete = useCallback((id: string, onDelete: () => void) => {
    if (confirmingId === id) {
      if (timerRef.current) clearTimeout(timerRef.current)
      setConfirmingId(null)
      onDelete()
    }
  }, [confirmingId])

  const isConfirming = useCallback((id: string) => confirmingId === id, [confirmingId])

  const handleDelete = useCallback((id: string, onDelete: () => void) => {
    if (confirmingId === id) {
      // 已在确认状态，执行删除
      if (timerRef.current) clearTimeout(timerRef.current)
      setConfirmingId(null)
      onDelete()
    } else {
      // 开始确认
      if (timerRef.current) clearTimeout(timerRef.current)
      setConfirmingId(id)
      timerRef.current = setTimeout(() => setConfirmingId(null), timeout)
    }
  }, [confirmingId, timeout])

  return {
    confirming: confirmingId !== null,
    confirmingId,
    startConfirm,
    confirmDelete,
    cancelConfirm,
    isConfirming,
    handleDelete
  }
}
