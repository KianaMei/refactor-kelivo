import type { ProviderConfigV2 } from '../../../../../shared/types'
import { BrandAvatar } from './components/BrandAvatar'

export function ProviderCard({
  provider,
  isEnabled,
  isSelected,
  selectionMode,
  onToggleSelect,
  onClick,
  onToggleEnabled,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragging
}: {
  provider: ProviderConfigV2
  isEnabled: boolean
  isSelected: boolean
  selectionMode: boolean
  onToggleSelect: () => void
  onClick: () => void
  onToggleEnabled: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent) => void
  isDragging: boolean
}) {
  // 竖向卡片布局 - 复刻 Kelivo
  const avatarSize = 120
  const nameSize = 13

  return (
    <div
      className={`provider-card ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{
        position: 'relative',
        borderRadius: 12,
        border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
        padding: '10px 10px 10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.15s ease'
      }}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      onClick={onClick}
    >
      {/* 选择模式复选框 - 左上角 */}
      {selectionMode && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            zIndex: 2
          }}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => {}}
            style={{
              width: 16,
              height: 16,
              accentColor: 'var(--primary)',
              cursor: 'pointer'
            }}
          />
        </div>
      )}

      {/* 头像 - 方形，填满宽度 */}
      <div style={{ borderRadius: 12, overflow: 'hidden', width: '100%', aspectRatio: '1' }}>
        <BrandAvatar name={provider.name} size={999} customAvatarPath={provider.customAvatarPath} square fill />
      </div>

      {/* 名称 */}
      <div
        style={{
          fontSize: nameSize,
          fontWeight: 600,
          lineHeight: 1.3,
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
          padding: '0 4px'
        }}
      >
        {provider.name}
      </div>

      {/* 开关 + 状态文字 */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}
        onClick={(e) => {
          e.stopPropagation()
          onToggleEnabled()
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: isEnabled ? '#22c55e' : '#ef4444'
          }}
        >
          {isEnabled ? '已启用' : '已禁用'}
        </span>
        <label className="ios-switch">
          <input type="checkbox" checked={isEnabled} onChange={() => {}} />
          <span className="ios-slider" />
        </label>
      </div>
    </div>
  )
}

