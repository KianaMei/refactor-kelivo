/**
 * 底部工具面板
 * 对齐 Flutter Kelivo 的 bottom_tools_sheet.dart
 * 移动端点击"更多"按钮弹出
 */
import { createPortal } from 'react-dom'
import {
  Image, Camera, FileUp, Eraser, FileText, RefreshCw, Zap, GraduationCap, X
} from 'lucide-react'

interface Props {
  onClose: () => void
  onPickPhotos?: () => void
  onPickCamera?: () => void
  onUploadFiles?: () => void
  onClearContext?: () => void
  clearContextLabel?: string
  onMaxTokens?: () => void
  onToolLoop?: () => void
  onQuickPhrase?: () => void
  onLearningMode?: () => void
  learningModeActive?: boolean
}

export function BottomToolsSheet(props: Props) {
  const {
    onClose,
    onPickPhotos,
    onPickCamera,
    onUploadFiles,
    onClearContext,
    clearContextLabel = '清除上下文',
    onMaxTokens,
    onToolLoop,
    onQuickPhrase,
    onLearningMode,
    learningModeActive = false
  } = props

  const tools = [
    { icon: <Image size={20} />, label: '相册', onClick: onPickPhotos },
    { icon: <Camera size={20} />, label: '相机', onClick: onPickCamera },
    { icon: <FileUp size={20} />, label: '文件', onClick: onUploadFiles },
    { icon: <Eraser size={20} />, label: clearContextLabel, onClick: onClearContext },
    { icon: <FileText size={20} />, label: '最大 Tokens', onClick: onMaxTokens },
    { icon: <RefreshCw size={20} />, label: '工具循环', onClick: onToolLoop },
    { icon: <Zap size={20} />, label: '快捷短语', onClick: onQuickPhrase },
    {
      icon: <GraduationCap size={20} />,
      label: '学习模式',
      onClick: onLearningMode,
      active: learningModeActive
    }
  ].filter((t) => t.onClick)

  return createPortal(
    <div className="bottomSheetOverlay" onMouseDown={onClose}>
      <div
        className="bottomSheet surface frosted"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 拖拽条 */}
        <div className="bottomSheetHandle" />

        {/* 工具网格 */}
        <div className="bottomToolsGrid">
          {tools.map((t, i) => (
            <button
              key={i}
              type="button"
              className={`bottomToolItem ${t.active ? 'bottomToolItemActive' : ''}`}
              onClick={() => {
                t.onClick?.()
                onClose()
              }}
            >
              <div className="bottomToolIcon">{t.icon}</div>
              <div className="bottomToolLabel">{t.label}</div>
            </button>
          ))}
        </div>

        {/* 关闭按钮 */}
        <button type="button" className="bottomSheetClose" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
    </div>,
    document.body
  )
}
