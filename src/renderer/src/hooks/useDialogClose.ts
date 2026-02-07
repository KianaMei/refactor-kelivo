import { useEffect } from 'react'

/**
 * ESC 键 + 鼠标返回侧键关闭弹窗 / 返回上一级。
 * 所有 modal / dialog / context menu 统一使用。
 *
 * 鼠标侧键:
 * - button 3 = XButton1 (后退键，多数鼠标)
 * - button 4 = XButton2 (前进键)
 */
export function useDialogClose(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }

    const handleMouse = (e: MouseEvent) => {
      // button 3 = 鼠标后退侧键 (XButton1)
      if (e.button === 3) {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }

    // 使用 capture 阶段确保优先捕获
    document.addEventListener('keydown', handleKey, true)
    document.addEventListener('mouseup', handleMouse, true)

    return () => {
      document.removeEventListener('keydown', handleKey, true)
      document.removeEventListener('mouseup', handleMouse, true)
    }
  }, [active, onClose])
}
