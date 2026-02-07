import type { AssistantConfig, McpServerConfig } from '../../../../../../shared/types'

export function McpTab(props: {
  assistant: AssistantConfig
  servers: McpServerConfig[]
  onPatch: (patch: Partial<AssistantConfig>) => void
}) {
  const { assistant, servers, onPatch } = props
  const available = servers.filter((s) => s.enabled)

  if (available.length === 0) {
    return (
      <div className="assistantBasicRoot">
        <div className="assistantTabCard">
          <div style={{ fontSize: 12, opacity: 0.75, padding: '2px 0', lineHeight: 1.6 }}>
            暂无可用的 MCP 服务器。请先在“设置 → MCP”中添加并启用服务器。
          </div>
        </div>
      </div>
    )
  }

  function toggleServer(serverId: string) {
    const set = new Set<string>(assistant.mcpServerIds ?? [])
    if (set.has(serverId)) set.delete(serverId)
    else set.add(serverId)
    onPatch({ mcpServerIds: Array.from(set) })
  }

  return (
    <div className="assistantBasicRoot">
      <div className="assistantTabCard">
        <div className="assistantTabCardTitleRow">
          <div className="assistantTabCardTitle">MCP</div>
        </div>
        <div className="assistantTabCardDesc">选择当前助手可使用的 MCP 服务器（仅影响该助手）</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {available.map((s) => {
            const enabledTools = s.tools.filter((t) => t.enabled).length
            const totalTools = s.tools.length
            const selected = assistant.mcpServerIds?.includes(s.id) ?? false
            const transport = (s.transport ?? 'http').toUpperCase()
            return (
              <button
                key={s.id}
                type="button"
                className={`btn ${selected ? 'btn-primary' : 'btn-ghost'}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  textAlign: 'left',
                  gap: 10
                }}
                onClick={() => toggleServer(s.id)}
                title={selected ? '点击取消选择' : '点击选择'}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <span style={badge}>{transport}</span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                    工具：{enabledTools}/{totalTools}
                  </div>
                </div>
                <span style={{ fontSize: 12, opacity: 0.9 }}>{selected ? '已选择' : '未选择'}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const badge: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 6px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  opacity: 0.8,
}
