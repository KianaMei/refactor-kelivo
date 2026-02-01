/**
 * MCP 服务器弹出层
 * 对齐 Flutter Kelivo 的 mcp_servers_popover.dart
 */
import { Hammer } from 'lucide-react'

export interface McpServerInfo {
  id: string
  name: string
  toolCount: number
  enabled: boolean
}

interface Props {
  servers: McpServerInfo[]
  onToggleServer: (id: string) => void
  toolCallMode: 'native' | 'prompt'
  onToolCallModeChange: (mode: 'native' | 'prompt') => void
}

export function McpServersPopover({ servers, onToggleServer, toolCallMode, onToolCallModeChange }: Props) {
  const totalTools = servers.filter((s) => s.enabled).reduce((a, s) => a + s.toolCount, 0)

  return (
    <div style={{ padding: 16, minWidth: 300 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ padding: 6, borderRadius: 8, background: 'var(--primary-bg)', display: 'flex' }}>
          <Hammer size={16} style={{ color: 'var(--primary)' }} />
        </div>
        <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
          MCP 服务器
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{totalTools} 工具</span>
      </div>

      {/* Tool call mode */}
      <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 8, background: 'var(--surface-2)', marginBottom: 14 }}>
        {(['native', 'prompt'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onToolCallModeChange(mode)}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: 6,
              padding: '6px 0',
              fontSize: 12,
              fontWeight: toolCallMode === mode ? 600 : 500,
              color: toolCallMode === mode ? '#fff' : 'var(--text-3)',
              background: toolCallMode === mode ? 'var(--primary)' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {mode === 'native' ? '原生调用' : 'Prompt 调用'}
          </button>
        ))}
      </div>

      {/* Server list */}
      {servers.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          暂无 MCP 服务器
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {servers.map((s) => (
            <div
              key={s.id}
              className="tool-tile"
              style={{ cursor: 'pointer', opacity: s.enabled ? 1 : 0.5 }}
              onClick={() => onToggleServer(s.id)}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.toolCount} 工具</div>
              </div>
              <div
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  background: s.enabled ? 'var(--primary)' : 'var(--surface-2)',
                  position: 'relative',
                  transition: 'background 0.2s'
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: 2,
                    left: s.enabled ? 18 : 2,
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
