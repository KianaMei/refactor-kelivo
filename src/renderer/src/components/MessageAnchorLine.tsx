/**
 * 消息锚点导航 - Cherry Studio 风格
 * 显示在消息区域右侧的锚点列表，鼠标悬停时展开显示消息预览
 */
import { memo, useState, useCallback, useMemo, useRef } from 'react'
import { ChevronsDown } from 'lucide-react'
// import type { DbMessage } from '../../../shared/db-types'
import type { UserAvatarType } from '../../../shared/types'
import { BrandAvatar } from '../pages/settings/providers/components/BrandAvatar'

export interface AnchorMessage {
  id: string
  role: string
  content: string
  modelId?: string | null
}

interface Props {
  messages: AnchorMessage[]
  onScrollToMessage: (messageId: string) => void
  onScrollToBottom: () => void
  // 用户头像
  userName?: string
  userAvatarType?: UserAvatarType
  userAvatarValue?: string
  // 助手头像
  assistantName?: string
  assistantAvatar?: string
  useAssistantAvatar?: boolean
}

function MessageAnchorLineInner({
  messages,
  onScrollToMessage,
  onScrollToBottom,
  userName = '你',
  userAvatarType = 'initial',
  userAvatarValue = '',
  assistantName,
  assistantAvatar,
  useAssistantAvatar = false
}: Props) {
  // 计算用户头像路径
  const userAvatarPath = useMemo(() => {
    if (userAvatarType === 'emoji') return userAvatarValue
    if (userAvatarType === 'url' || userAvatarType === 'file') return userAvatarValue
    return undefined // initial 类型不需要路径
  }, [userAvatarType, userAvatarValue])

  // 计算助手头像路径
  const assistantAvatarPath = useMemo(() => {
    if (!useAssistantAvatar || !assistantAvatar) return undefined
    return assistantAvatar
  }, [useAssistantAvatar, assistantAvatar])
  const [mouseY, setMouseY] = useState<number | null>(null)
  const [listOffsetY, setListOffsetY] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 计算距离鼠标位置的值（用于缩放/透明度效果）
  const calculateValueByDistance = useCallback((index: number, maxValue: number) => {
    if (mouseY === null || !listRef.current) return 0
    const items = listRef.current.children
    if (index >= items.length) return 0
    const item = items[index] as HTMLElement
    const rect = item.getBoundingClientRect()
    const listRect = listRef.current.getBoundingClientRect()
    const centerY = rect.top + rect.height / 2 - listRect.top
    const distance = Math.abs(centerY - mouseY)
    const maxDistance = 100
    return Math.max(0, maxValue * (1 - distance / maxDistance))
  }, [mouseY])

  // 获取消息预览文本
  const getMessagePreview = useCallback((content: string) => {
    if (!content) return ''
    const cleaned = content
      .replace(/```[\s\S]*?```/g, '[代码]')
      .replace(/`[^`]+`/g, '[代码]')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*_~>-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    return cleaned.length > 50 ? `${cleaned.substring(0, 50)}...` : cleaned
  }, [])

  // 处理鼠标移动
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!listRef.current || !containerRef.current) return
    const listRect = listRef.current.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    const listHeight = listRect.height
    const containerHeight = containerRect.height

    setMouseY(e.clientY - listRect.top)

    // 智能列表定位（当列表比容器高时）
    if (listHeight > containerHeight) {
      const mousePositionRatio = (e.clientY - containerRect.top) / containerHeight
      const maxOffset = (containerHeight - listHeight) / 2 - 20
      setListOffsetY(-maxOffset + mousePositionRatio * (maxOffset * 2))
    } else {
      setListOffsetY(0)
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setMouseY(null)
    setListOffsetY(0)
    setIsHovered(false)
  }, [])

  // 过滤出用户和助手消息
  const filteredMessages = useMemo(() =>
    messages.filter(m => m.role === 'user' || m.role === 'assistant'),
    [messages]
  )

  if (filteredMessages.length === 0) return null

  return (
    <div
      ref={containerRef}
      className={`messageAnchorLine ${isHovered ? 'messageAnchorLineHovered' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      <div
        ref={listRef}
        className="messageAnchorList"
        style={{ transform: `translateY(${listOffsetY}px)` }}
      >
        {/* 滚动到底部按钮 */}
        <div
          className="messageAnchorItem"
          onClick={onScrollToBottom}
          style={{
            opacity: mouseY !== null ? 0.5 + calculateValueByDistance(0, 0.5) : 0.4,
          }}
        >
          <div className="messageAnchorTextContainer" style={{ opacity: isHovered ? 1 : 0 }}>
            {/* 空，底部按钮不显示文字 */}
          </div>
          <div
            className="messageAnchorAvatar messageAnchorAvatarBottom"
            style={{
              width: 10 + calculateValueByDistance(0, 8),
              height: 10 + calculateValueByDistance(0, 8),
            }}
          >
            <ChevronsDown size={12 + calculateValueByDistance(0, 6)} />
          </div>
        </div>

        {/* 消息项（倒序显示 - 最新的在底部） */}
        {[...filteredMessages].reverse().map((msg, index) => {
          const itemIndex = index + 1
          const opacity = mouseY !== null ? 0.5 + calculateValueByDistance(itemIndex, 0.5) : 0.4
          const scale = 1 + calculateValueByDistance(itemIndex, 0.3)
          const avatarSize = 10 + calculateValueByDistance(itemIndex, 8)
          const preview = getMessagePreview(msg.content)
          const displayName = msg.role === 'user' ? userName : (assistantName || msg.modelId || 'Assistant')

          return (
            <div
              key={msg.id}
              className="messageAnchorItem"
              onClick={() => onScrollToMessage(msg.id)}
              style={{ opacity }}
            >
              {/* 文字内容（仅悬停时显示） */}
              <div
                className="messageAnchorTextContainer"
                style={{
                  opacity: isHovered ? 1 : 0,
                  transform: `scale(${scale})`,
                }}
              >
                <div className="messageAnchorUserName">{displayName}</div>
                {preview && <div className="messageAnchorPreview">{preview}</div>}
              </div>

              {/* 头像 */}
              <div
                className={`messageAnchorAvatar ${msg.role === 'user' ? 'messageAnchorAvatarUser' : 'messageAnchorAvatarAssistant'}`}
                style={{
                  width: avatarSize,
                  height: avatarSize,
                  transform: `scale(${scale})`,
                }}
              >
                {msg.role === 'user' ? (
                  <BrandAvatar
                    name={userName}
                    size={avatarSize}
                    customAvatarPath={userAvatarPath}
                    fill
                  />
                ) : (
                  <BrandAvatar
                    name={assistantName || msg.modelId || 'Assistant'}
                    size={avatarSize}
                    customAvatarPath={assistantAvatarPath}
                    fill
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const MessageAnchorLine = memo(MessageAnchorLineInner)
