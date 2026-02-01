import { useEffect, useState } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // 初始化获取最大化状态
    window.api.window.isMaximized().then(setIsMaximized)

    // 监听最大化状态变化
    const unsubscribe = window.api.window.onMaximizedChange(setIsMaximized)
    return unsubscribe
  }, [])

  return (
    <div className="title-bar">
      {/* 左侧：应用图标和名称 */}
      <div className="title-bar-left">
        <img src="/icons/kelivo.png" alt="Kelivo" className="title-bar-icon" />
        <span className="title-bar-title">Kelivo</span>
      </div>

      {/* 中间：可拖拽区域 */}
      <div className="title-bar-drag" />

      {/* 右侧：窗口控制按钮 */}
      <div className="title-bar-controls">
        <button
          type="button"
          className="title-bar-btn"
          onClick={() => window.api.window.minimize()}
          title="最小化"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          className="title-bar-btn"
          onClick={() => window.api.window.maximize()}
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? <Copy size={14} /> : <Square size={14} />}
        </button>
        <button
          type="button"
          className="title-bar-btn close"
          onClick={() => window.api.window.close()}
          title="关闭"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
