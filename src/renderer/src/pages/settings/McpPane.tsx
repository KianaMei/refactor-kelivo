import { useState } from 'react'
import {
  Plus, Server, Trash2, RefreshCw, Settings2, CheckCircle, XCircle, Loader,
  Variable, Terminal, Globe, Radio, Wrench, Info, AlertTriangle, ChevronDown, ChevronUp
} from 'lucide-react'

type McpServerType = 'stdio' | 'sse' | 'websocket'

interface McpTool {
  name: string
  description?: string
}

interface McpServer {
  id: string
  name: string
  type: McpServerType
  // Stdio 配置
  command: string
  args: string[]
  // SSE/WebSocket 配置
  url: string
  // 通用
  env: Record<string, string>
  enabled: boolean
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error?: string
  // 运行时信息
  version?: string
  tools: McpTool[]
}

const SERVER_TYPE_LABELS: Record<McpServerType, { label: string; icon: React.ReactNode; description: string }> = {
  stdio: { label: 'Stdio', icon: <Terminal size={14} />, description: '通过标准输入输出通信（本地进程）' },
  sse: { label: 'SSE', icon: <Globe size={14} />, description: '通过 Server-Sent Events 通信（HTTP）' },
  websocket: { label: 'WebSocket', icon: <Radio size={14} />, description: '通过 WebSocket 通信' },
}

export function McpPane() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [envDraft, setEnvDraft] = useState({ key: '', value: '' })
  const [toolsExpanded, setToolsExpanded] = useState(false)
  const [errorDetailOpen, setErrorDetailOpen] = useState(false)

  function addServer(type: McpServerType = 'stdio') {
    const id = `mcp_${Date.now()}`
    const srv: McpServer = {
      id,
      name: '新服务器',
      type,
      command: type === 'stdio' ? 'npx' : '',
      args: type === 'stdio' ? ['-y', '@modelcontextprotocol/server-example'] : [],
      url: type !== 'stdio' ? 'http://localhost:3000/sse' : '',
      env: {},
      enabled: true,
      status: 'disconnected',
      tools: [],
    }
    setServers((prev) => [...prev, srv])
    setSelectedId(id)
  }

  function updateServer(id: string, patch: Partial<McpServer>) {
    setServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function deleteServer(id: string) {
    setServers((prev) => prev.filter((s) => s.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function addEnvVar(serverId: string) {
    if (!envDraft.key.trim()) return
    const srv = servers.find((s) => s.id === serverId)
    if (!srv) return
    updateServer(serverId, { env: { ...srv.env, [envDraft.key.trim()]: envDraft.value } })
    setEnvDraft({ key: '', value: '' })
  }

  function removeEnvVar(serverId: string, key: string) {
    const srv = servers.find((s) => s.id === serverId)
    if (!srv) return
    const next = { ...srv.env }
    delete next[key]
    updateServer(serverId, { env: next })
  }

  async function reconnect(id: string) {
    updateServer(id, { status: 'connecting', error: undefined })
    // 模拟连接
    await new Promise((r) => setTimeout(r, 1500))
    // 模拟成功，添加一些示例工具
    updateServer(id, {
      status: 'connected',
      version: '1.0.0',
      tools: [
        { name: 'read_file', description: '读取文件内容' },
        { name: 'write_file', description: '写入文件内容' },
        { name: 'list_directory', description: '列出目录内容' },
      ]
    })
  }

  async function disconnect(id: string) {
    updateServer(id, { status: 'disconnected', tools: [], version: undefined })
  }

  const selected = servers.find((s) => s.id === selectedId)

  return (
    <div style={s.root}>
      <div style={s.header}>MCP</div>

      {/* 服务器列表 */}
      <div className="settingsCard">
        <div style={{ ...s.cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>MCP 服务器</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-sm" onClick={() => addServer('stdio')} style={{ gap: 4 }}>
              <Terminal size={13} />
              Stdio
            </button>
            <button type="button" className="btn btn-sm" onClick={() => addServer('sse')} style={{ gap: 4 }}>
              <Globe size={13} />
              SSE
            </button>
            <button type="button" className="btn btn-sm" onClick={() => addServer('websocket')} style={{ gap: 4 }}>
              <Radio size={13} />
              WS
            </button>
          </div>
        </div>

        {servers.length === 0 ? (
          <div style={s.empty}>
            <Server size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div style={{ fontSize: 13 }}>暂无 MCP 服务器</div>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>点击上方按钮添加不同类型的服务器</div>
          </div>
        ) : (
          <div style={s.serverGrid}>
            {servers.map((srv) => (
              <button
                key={srv.id}
                type="button"
                className={`btn btn-ghost ${selectedId === srv.id ? 'segmentedItemActive' : ''}`}
                style={s.serverItem}
                onClick={() => setSelectedId(selectedId === srv.id ? null : srv.id)}
              >
                <StatusIcon status={srv.status} />
                <span style={{ flex: 1, textAlign: 'left' }}>{srv.name}</span>
                <span style={s.serverTypeBadge}>
                  {SERVER_TYPE_LABELS[srv.type].icon}
                  {SERVER_TYPE_LABELS[srv.type].label}
                </span>
                {srv.tools.length > 0 && (
                  <span style={s.toolsBadge}>
                    <Wrench size={11} />
                    {srv.tools.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 服务器配置 */}
      {selected && (
        <>
          <div className="settingsCard">
            <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Settings2 size={15} />
              {selected.name}
              {selected.version && (
                <span style={{ fontSize: 11, opacity: 0.5, fontWeight: 400 }}>v{selected.version}</span>
              )}
            </div>

            <div style={s.labeledRow}>
              <span style={s.rowLabel}>名称</span>
              <input
                className="input"
                style={{ width: 200 }}
                value={selected.name}
                onChange={(e) => updateServer(selected.id, { name: e.target.value })}
              />
            </div>
            <div style={s.divider} />

            <div style={s.labeledRow}>
              <span style={s.rowLabel}>类型</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['stdio', 'sse', 'websocket'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`btn btn-sm ${selected.type === t ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => updateServer(selected.id, { type: t })}
                    style={{ gap: 4, padding: '6px 10px' }}
                  >
                    {SERVER_TYPE_LABELS[t].icon}
                    {SERVER_TYPE_LABELS[t].label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '4px 0 8px' }}>
              {SERVER_TYPE_LABELS[selected.type].description}
            </div>
            <div style={s.divider} />

            {selected.type === 'stdio' ? (
              <>
                <div style={s.labeledRow}>
                  <span style={s.rowLabel}>命令</span>
                  <input
                    className="input"
                    style={{ width: 200 }}
                    placeholder="npx"
                    value={selected.command}
                    onChange={(e) => updateServer(selected.id, { command: e.target.value })}
                  />
                </div>
                <div style={s.divider} />

                <div style={s.labeledRow}>
                  <span style={s.rowLabel}>参数</span>
                  <input
                    className="input"
                    style={{ width: 280 }}
                    placeholder="-y @modelcontextprotocol/server-example"
                    value={selected.args.join(' ')}
                    onChange={(e) => updateServer(selected.id, { args: e.target.value.split(' ').filter(Boolean) })}
                  />
                </div>
              </>
            ) : (
              <div style={s.labeledRow}>
                <span style={s.rowLabel}>URL</span>
                <input
                  className="input"
                  style={{ width: 320 }}
                  placeholder={selected.type === 'sse' ? 'http://localhost:3000/sse' : 'ws://localhost:3000/ws'}
                  value={selected.url}
                  onChange={(e) => updateServer(selected.id, { url: e.target.value })}
                />
              </div>
            )}
            <div style={s.divider} />

            <div style={s.labeledRow}>
              <span style={s.rowLabel}>启用</span>
              <button
                type="button"
                className={`toggle ${selected.enabled ? 'toggleOn' : ''}`}
                onClick={() => updateServer(selected.id, { enabled: !selected.enabled })}
              >
                <div className="toggleThumb" />
              </button>
            </div>
            <div style={s.divider} />

            {/* 状态 */}
            <div style={s.labeledRow}>
              <span style={s.rowLabel}>状态</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <StatusIcon status={selected.status} />
                <span style={{ fontSize: 13 }}>{statusLabel(selected.status)}</span>
              </div>
            </div>

            {selected.error && (
              <div style={s.errorBanner}>
                <AlertTriangle size={14} />
                <span style={{ flex: 1 }}>{selected.error.length > 50 ? selected.error.slice(0, 50) + '...' : selected.error}</span>
                {selected.error.length > 50 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setErrorDetailOpen(true)}
                    style={{ padding: 4 }}
                  >
                    <Info size={12} />
                  </button>
                )}
              </div>
            )}

            <div style={s.divider} />

            <div style={{ padding: '8px 0', display: 'flex', gap: 8 }}>
              {selected.status === 'connected' ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => disconnect(selected.id)}
                  style={{ gap: 4 }}
                >
                  <XCircle size={13} />
                  断开连接
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => reconnect(selected.id)}
                  disabled={selected.status === 'connecting'}
                  style={{ gap: 4 }}
                >
                  <RefreshCw size={13} className={selected.status === 'connecting' ? 'spin' : ''} />
                  {selected.status === 'connecting' ? '连接中...' : '连接'}
                </button>
              )}
              <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteServer(selected.id)} style={{ gap: 4 }}>
                <Trash2 size={13} />
                删除
              </button>
            </div>
          </div>

          {/* 工具列表 */}
          {selected.tools.length > 0 && (
            <div className="settingsCard">
              <button
                type="button"
                style={{ ...s.cardTitle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'none', border: 'none', padding: 0, width: '100%' }}
                onClick={() => setToolsExpanded(!toolsExpanded)}
              >
                <Wrench size={15} />
                可用工具
                <span style={{ fontSize: 12, opacity: 0.6, fontWeight: 400 }}>({selected.tools.length})</span>
                <div style={{ flex: 1 }} />
                {toolsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {toolsExpanded && (
                <div style={s.toolsList}>
                  {selected.tools.map((tool) => (
                    <div key={tool.name} style={s.toolItem}>
                      <code style={s.toolName}>{tool.name}</code>
                      {tool.description && (
                        <span style={s.toolDesc}>{tool.description}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 环境变量 */}
          <div className="settingsCard">
            <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Variable size={15} />
              环境变量
            </div>

            {Object.entries(selected.env).length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {Object.entries(selected.env).map(([k, v]) => (
                  <div key={k} style={s.envRow}>
                    <code style={s.envKey}>{k}</code>
                    <code style={s.envValue}>{v.length > 20 ? v.slice(0, 20) + '...' : v}</code>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => removeEnvVar(selected.id, k)}
                      style={{ padding: 4 }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                className="input"
                style={{ width: 120 }}
                placeholder="KEY"
                value={envDraft.key}
                onChange={(e) => setEnvDraft({ ...envDraft, key: e.target.value })}
              />
              <input
                className="input"
                style={{ width: 180 }}
                placeholder="value"
                value={envDraft.value}
                onChange={(e) => setEnvDraft({ ...envDraft, value: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-sm"
                disabled={!envDraft.key.trim()}
                onClick={() => addEnvVar(selected.id)}
                style={{ gap: 4 }}
              >
                <Plus size={13} />
              </button>
            </div>

            <div style={s.hint}>
              为 MCP 服务器进程设置环境变量，通常用于传递 API Key 等敏感信息。
            </div>
          </div>
        </>
      )}

      {/* 说明 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>说明</div>
        <div style={s.hint}>
          <p>MCP (Model Context Protocol) 允许 AI 调用外部工具和数据源。</p>
          <p><strong>Stdio</strong>：本地进程，通过标准输入输出通信，最常用。</p>
          <p><strong>SSE</strong>：远程服务器，通过 HTTP Server-Sent Events 通信。</p>
          <p><strong>WebSocket</strong>：远程服务器，通过 WebSocket 双向通信。</p>
        </div>
      </div>

      {/* 错误详情弹窗 */}
      {errorDetailOpen && selected?.error && (
        <div style={s.modalOverlay} onClick={() => setErrorDetailOpen(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <AlertTriangle size={16} style={{ color: '#ef4444' }} />
              <span style={{ fontWeight: 700 }}>错误详情</span>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setErrorDetailOpen(false)}>
                关闭
              </button>
            </div>
            <div style={s.modalBody}>
              <pre style={s.errorPre}>{selected.error}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: McpServer['status'] }) {
  switch (status) {
    case 'connected':
      return <CheckCircle size={14} style={{ color: '#22c55e' }} />
    case 'connecting':
      return <Loader size={14} className="spin" style={{ color: 'var(--primary)' }} />
    case 'error':
      return <XCircle size={14} style={{ color: '#ef4444' }} />
    default:
      return <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--muted-2, #999)', opacity: 0.4 }} />
  }
}

function statusLabel(status: McpServer['status']): string {
  switch (status) {
    case 'connected': return '已连接'
    case 'connecting': return '连接中...'
    case 'error': return '错误'
    default: return '未连接'
  }
}

const s: Record<string, React.CSSProperties> = {
  root: { padding: 20, maxWidth: 640, margin: '0 auto' },
  header: { fontSize: 16, fontWeight: 700, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: 700, marginBottom: 10 },
  labeledRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0',
    gap: 12,
  },
  rowLabel: { fontSize: 14, flex: 1 },
  divider: { height: 1, background: 'var(--border)', margin: '4px 0', opacity: 0.5 },
  hint: { fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)', marginTop: 8 },
  empty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '32px 20px',
    color: 'var(--text-secondary)',
  },
  serverGrid: { display: 'flex', flexDirection: 'column' as const, gap: 3 },
  serverItem: { justifyContent: 'flex-start', gap: 10, padding: '10px 12px' },
  serverTypeBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    opacity: 0.6,
    padding: '2px 6px',
    background: 'var(--surface)',
    borderRadius: 4,
  },
  toolsBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 11,
    padding: '2px 6px',
    background: 'var(--primary-2)',
    color: 'var(--primary)',
    borderRadius: 4,
  },
  envRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 0',
    fontSize: 12,
  },
  envKey: {
    background: 'var(--surface, #f5f5f5)',
    padding: '2px 6px',
    borderRadius: 3,
    fontWeight: 600,
  },
  envValue: {
    flex: 1,
    opacity: 0.7,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 6,
    color: '#ef4444',
    fontSize: 12,
    margin: '4px 0',
  },
  toolsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    marginTop: 8,
  },
  toolItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 8px',
    background: 'var(--surface)',
    borderRadius: 6,
  },
  toolName: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--primary)',
  },
  toolDesc: {
    fontSize: 11,
    opacity: 0.7,
  },
  modalOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    width: 500,
    maxWidth: 'calc(100vw - 48px)',
    maxHeight: 'calc(100vh - 48px)',
    background: 'var(--panel)',
    borderRadius: 12,
    border: '1px solid var(--border)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
  },
  modalBody: {
    padding: 16,
    overflow: 'auto',
  },
  errorPre: {
    margin: 0,
    padding: 12,
    background: 'var(--surface)',
    borderRadius: 6,
    fontSize: 12,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    color: '#ef4444',
  },
}
