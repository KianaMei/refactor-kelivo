/**
 * 迷你地图弹窗 - 消息导航
 * 对齐 Flutter Kelivo 的 mini_map_sheet.dart
 */
import { User, Bot, ChevronRight } from 'lucide-react'

export interface MiniMapMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  ts: number
}

interface Props {
  messages: MiniMapMessage[]
  currentMessageId?: string
  onJumpTo: (id: string) => void
}

function getPreview(content: string, maxLen = 50): string {
  const clean = content.replace(/[\n\r]+/g, ' ').trim()
  return clean.length > maxLen ? clean.slice(0, maxLen) + '...' : clean
}

export function MiniMapPopover(props: Props) {
  const { messages, currentMessageId, onJumpTo } = props

  if (messages.length === 0) {
    return (
      <div className="miniMapPopover">
        <div className="miniMapEmpty">暂无消息</div>
      </div>
    )
  }

  return (
    <div className="miniMapPopover">
      <div className="miniMapHeader">
        <span style={{ fontWeight: 600, fontSize: 14 }}>消息导航</span>
        <span className="miniMapCount">{messages.length} 条消息</span>
      </div>
      <div className="miniMapList">
        {messages.map((m, i) => {
          const isActive = m.id === currentMessageId
          return (
            <button
              key={m.id}
              type="button"
              className={`miniMapItem ${isActive ? 'miniMapItemActive' : ''}`}
              onClick={() => onJumpTo(m.id)}
            >
              <div className="miniMapItemIcon">
                {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div className="miniMapItemContent">
                <div className="miniMapItemIndex">#{i + 1}</div>
                <div className="miniMapItemPreview">{getPreview(m.content)}</div>
              </div>
              <ChevronRight size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
