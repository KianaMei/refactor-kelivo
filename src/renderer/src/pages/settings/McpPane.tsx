import { useState } from 'react'
import { Plus, Server, Trash2, RefreshCw, Settings2, CheckCircle, XCircle, Loader } from 'lucide-react'

interface McpServer {
  id: string
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error?: string
}

const defaultServers: McpServer[] = []

export function McpPane() {
  const [servers, setServers] = useState<McpServer[]>(defaultServers)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  function addServer() {
    const id = `mcp_${Date.now()}`
    const newServer: McpServer = {
      id,
      name: '新服务器',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-example'],
      env: {},
      enabled: true,
      status: 'disconnected'
    }
    setServers((prev) => [...prev, newServer])
    setSelectedId(id)
  }

  function updateServer(id: string, patch: Partial<McpServer>) {
    setServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function deleteServer(id: string) {
    setServers((prev) => prev.filter((s) => s.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  async function reconnect(id: string) {
    updateServer(id, { status: 'connecting', error: undefined })
    // TODO: 通过 IPC 调用主进程启动 MCP 服务器
    await new Promise((r) => setTimeout(r, 1500))
    updateServer(id, { status: 'connected' })
  }

  const selectedServer = servers.find((s) => s.id === selectedId)

  function getStatusIcon(status: McpServer['status']) {
    switch (status) {
      case 'connected':
        return <CheckCircle size={14} style={{ color: '#22c55e' }} />
      case 'connecting':
        return <Loader size={14} className="spin" style={{ color: 'var(--primary)' }} />
      case 'error':
        return <XCircle size={14} style={{ color: '#ef4444' }} />
      default:
        return <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--muted-2)' }} />
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>MCP</div>
      <div style={styles.divider} />

      <div className="settingsCard">
        <div style={{ ...styles.cardTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>MCP 服务器</span>
          <button type="button" className="btn" style={{ padding: '6px 10px' }} onClick={addServer}>
            <Plus size={14} />
            添加
          </button>
        </div>

        {servers.length === 0 ? (
          <div style={styles.empty}>
            <Server size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
            <div>暂无 MCP 服务器</div>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>点击上方"添加"按钮配置</div>
          </div>
        ) : (
          <div style={styles.serverList}>
            {servers.map((srv) => (
              <button
                key={srv.id}
                type="button"
                className={`btn btn-ghost ${selectedId === srv.id ? 'segmentedItemActive' : ''}`}
                style={styles.serverItem}
                onClick={() => setSelectedId(srv.id)}
              >
                {getStatusIcon(srv.status)}
                <span style={{ flex: 1, textAlign: 'left' }}>{srv.name}</span>
                <span style={{ fontSize: 11, opacity: 0.6 }}>{srv.command}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedServer && (
        <div className="settingsCard">
          <div style={{ ...styles.cardTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings2 size={16} />
            {selectedServer.name}
          </div>

          <LabeledRow label="名称">
            <input
              className="input"
              style={{ width: 200 }}
              value={selectedServer.name}
              onChange={(e) => updateServer(selectedServer.id, { name: e.target.value })}
            />
          </LabeledRow>

          <RowDivider />

          <LabeledRow label="命令">
            <input
              className="input"
              style={{ width: 200 }}
              placeholder="npx"
              value={selectedServer.command}
              onChange={(e) => updateServer(selectedServer.id, { command: e.target.value })}
            />
          </LabeledRow>

          <RowDivider />

          <LabeledRow label="参数">
            <input
              className="input"
              style={{ width: 280 }}
              placeholder="-y @modelcontextprotocol/server-example"
              value={selectedServer.args.join(' ')}
              onChange={(e) => updateServer(selectedServer.id, { args: e.target.value.split(' ').filter(Boolean) })}
            />
          </LabeledRow>

          <RowDivider />

          <LabeledRow label="启用">
            <button
              type="button"
              className={`toggle ${selectedServer.enabled ? 'toggleOn' : ''}`}
              onClick={() => updateServer(selectedServer.id, { enabled: !selectedServer.enabled })}
            >
              <div className="toggleThumb" />
            </button>
          </LabeledRow>

          <RowDivider />

          <LabeledRow label="状态">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {getStatusIcon(selectedServer.status)}
              <span style={{ fontSize: 13 }}>
                {selectedServer.status === 'connected'
                  ? '已连接'
                  : selectedServer.status === 'connecting'
                    ? '连接中...'
                    : selectedServer.status === 'error'
                      ? '错误'
                      : '未连接'}
              </span>
            </div>
          </LabeledRow>

          {selectedServer.error && (
            <>
              <RowDivider />
              <div style={{ padding: '8px 4px', color: '#ef4444', fontSize: 13 }}>{selectedServer.error}</div>
            </>
          )}

          <RowDivider />

          <div style={{ padding: '8px 4px', display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => reconnect(selectedServer.id)}
              disabled={selectedServer.status === 'connecting'}
            >
              <RefreshCw size={14} />
              重新连接
            </button>
            <button type="button" className="btn btn-danger" onClick={() => deleteServer(selectedServer.id)}>
              <Trash2 size={14} />
              删除
            </button>
          </div>
        </div>
      )}

      <div className="settingsCard">
        <div style={styles.cardTitle}>说明</div>
        <div style={styles.note}>
          <p>• MCP (Model Context Protocol) 允许 AI 调用外部工具和服务。</p>
          <p>• 配置服务器后，AI 可以在对话中使用其提供的工具。</p>
          <p>• 服务器命令通常是 npx、node 或其他可执行程序。</p>
        </div>
      </div>
    </div>
  )
}

function RowDivider() {
  return <div style={styles.rowDivider} />
}

function LabeledRow(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.labeledRow}>
      <div style={styles.rowLabel}>{props.label}</div>
      <div style={styles.rowTrailing}>{props.children}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: '16px 16px 32px',
    maxWidth: 800,
    margin: '0 auto'
  },
  header: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 8
  },
  divider: {
    height: 1,
    background: 'var(--border)',
    marginBottom: 12
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 8,
    padding: '0 4px'
  },
  rowDivider: {
    height: 1,
    background: 'var(--border)',
    margin: '4px 8px',
    opacity: 0.5
  },
  labeledRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 4px',
    gap: 12
  },
  rowLabel: {
    fontSize: 14,
    flex: 1
  },
  rowTrailing: {
    flexShrink: 0
  },
  note: {
    fontSize: 13,
    lineHeight: 1.8,
    opacity: 0.8,
    padding: '4px'
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    opacity: 0.7
  },
  serverList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  serverItem: {
    justifyContent: 'flex-start',
    gap: 10,
    padding: '10px 12px'
  }
}
