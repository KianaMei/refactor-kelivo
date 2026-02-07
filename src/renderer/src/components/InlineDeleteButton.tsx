/**
 * 原地二次确认删除按钮
 * 第一次点击显示确认状态，3秒后自动恢复或第二次点击执行删除
 */
import { useState, useEffect, useRef } from 'react'
import { Trash2, Check, X } from 'lucide-react'

interface Props {
  /** 执行删除的回调 */
  onDelete: () => void
  /** 按钮尺寸 */
  size?: number
  /** 自定义类名 */
  className?: string
  /** 确认超时时间（毫秒），默认 3000 */
  timeout?: number
  /** 是否禁用 */
  disabled?: boolean
  /** 标题提示 */
  title?: string
  /** 变体：icon-only 仅图标，text 带文字 */
  variant?: 'icon' | 'text'
  /** 文字标签（variant='text' 时使用） */
  label?: string
  /** 确认文字（variant='text' 时使用） */
  confirmLabel?: string
}

export function InlineDeleteButton({
  onDelete,
  size = 16,
  className = '',
  timeout = 3000,
  disabled = false,
  title = '删除',
  variant = 'icon',
  label = '删除',
  confirmLabel = '确认删除'
}: Props) {
  const [confirming, setConfirming] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function handleClick() {
    if (disabled) return
    if (confirming) {
      // 执行删除
      if (timerRef.current) clearTimeout(timerRef.current)
      setConfirming(false)
      onDelete()
    } else {
      // 进入确认状态
      setConfirming(true)
      timerRef.current = setTimeout(() => setConfirming(false), timeout)
    }
  }

  function handleCancel(e: React.MouseEvent) {
    e.stopPropagation()
    if (timerRef.current) clearTimeout(timerRef.current)
    setConfirming(false)
  }

  if (variant === 'text') {
    // 带文字的版本（用于菜单项）
    if (confirming) {
      return (
        <div className={`inlineDeleteConfirm ${className}`}>
          <button
            type="button"
            className="contextMenuItem contextMenuItemDanger"
            onClick={handleClick}
            disabled={disabled}
          >
            <Check size={14} />
            <span>{confirmLabel}</span>
          </button>
          <button
            type="button"
            className="contextMenuItem"
            onClick={handleCancel}
          >
            <X size={14} />
            <span>取消</span>
          </button>
        </div>
      )
    }
    return (
      <button
        type="button"
        className={`contextMenuItem contextMenuItemDanger ${className}`}
        onClick={handleClick}
        disabled={disabled}
      >
        <Trash2 size={14} />
        <span>{label}</span>
      </button>
    )
  }

  // 仅图标的版本（用于工具栏）
  if (confirming) {
    return (
      <div className={`inlineDeleteConfirm ${className}`}>
        <button
          type="button"
          className="msgActionBtn msgActionBtnDanger"
          onClick={handleClick}
          title="确认删除"
          disabled={disabled}
        >
          <Check size={size} />
        </button>
        <button
          type="button"
          className="msgActionBtn"
          onClick={handleCancel}
          title="取消"
        >
          <X size={size} />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      className={`msgActionBtn ${className}`}
      onClick={handleClick}
      title={title}
      disabled={disabled}
    >
      <Trash2 size={size} />
    </button>
  )
}

/**
 * 通用删除按钮（适用于各种 UI 风格）
 */
interface GenericDeleteButtonProps {
  onDelete: () => void
  timeout?: number
  disabled?: boolean
  /** 正常状态的渲染 */
  children: React.ReactNode
  /** 确认状态的渲染 */
  confirmRender: (onConfirm: () => void, onCancel: () => void) => React.ReactNode
}

export function GenericDeleteButton({
  onDelete,
  timeout = 3000,
  disabled = false,
  children,
  confirmRender
}: GenericDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function startConfirm() {
    if (disabled) return
    setConfirming(true)
    timerRef.current = setTimeout(() => setConfirming(false), timeout)
  }

  function handleConfirm() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setConfirming(false)
    onDelete()
  }

  function handleCancel() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setConfirming(false)
  }

  if (confirming) {
    return <>{confirmRender(handleConfirm, handleCancel)}</>
  }

  return (
    <span onClick={startConfirm} style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {children}
    </span>
  )
}
