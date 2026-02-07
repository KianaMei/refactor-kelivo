import { Settings2 } from 'lucide-react'

import type { AssistantConfig } from '../../../shared/types'
import { BrandAvatar } from '../pages/settings/providers/components/BrandAvatar'

export function AssistantSelectPopover(props: {
  assistants: AssistantConfig[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: () => void
  onManage?: () => void
}) {
  const { assistants, activeId, onSelect, onClose, onManage } = props

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={{ fontWeight: 800 }}>选择助手</div>
        <div style={{ flex: 1 }} />
        {onManage ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onManage} style={{ gap: 6 }}>
            <Settings2 size={14} />
            管理
          </button>
        ) : null}
        <button type="button" className="btn btn-sm" onClick={onClose}>关闭</button>
      </div>

      <div style={s.list}>
        {assistants.map((a) => (
          <button
            key={a.id}
            type="button"
            className="btn btn-ghost"
            style={{
              ...s.item,
              background: a.id === activeId ? 'var(--primary-2)' : 'transparent',
              borderColor: a.id === activeId ? 'var(--primary-3)' : 'transparent'
            }}
            onClick={() => {
              onSelect(a.id)
              onClose()
            }}
          >
            <BrandAvatar name={a.name} size={22} customAvatarPath={a.avatar} />
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontWeight: 700 }}>{a.name}</div>
              {a.boundModelId ? <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{a.boundModelId}</div> : null}
            </div>
            {a.isDefault ? <span style={s.badgePrimary}>默认</span> : null}
            {!a.deletable ? <span style={s.badge}>内置</span> : null}
          </button>
        ))}
        {assistants.length === 0 ? (
          <div style={{ padding: 12, opacity: 0.6, textAlign: 'center' }}>暂无助手</div>
        ) : null}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: {
    width: 360
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)'
  },
  list: {
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 420,
    overflow: 'auto'
  },
  item: {
    justifyContent: 'flex-start',
    gap: 10,
    padding: '10px 10px',
    border: '1px solid transparent',
    borderRadius: 12
  },
  badge: {
    fontSize: 10,
    padding: '2px 6px',
    background: 'var(--surface-2)',
    borderRadius: 999,
    opacity: 0.85
  },
  badgePrimary: {
    fontSize: 10,
    padding: '2px 6px',
    background: 'var(--primary-2)',
    color: 'var(--primary)',
    borderRadius: 999
  }
}
