import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Edit, Plus, RefreshCw, Terminal, Trash2, X } from 'lucide-react'

import type { AppConfig, McpServerConfig, McpToolConfig, McpTransportType } from '../../../../shared/types'

type McpStatus = 'idle' | 'connecting' | 'connected' | 'error'

function isRecord(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

import { safeUuid } from '../../../../shared/utils'

function normalizeTransport(v: unknown): McpTransportType {
  if (v === 'sse' || v === 'http' || v === 'stdio' || v === 'inmemory') return v
  return 'http'
}

function countEnabledTools(tools: McpToolConfig[] | undefined): { enabled: number; total: number } {
  const list = tools ?? []
  return { enabled: list.filter((t) => t.enabled).length, total: list.length }
}

function transportLabel(t: McpTransportType): string {
  if (t === 'sse') return 'SSE'
  if (t === 'http') return 'HTTP'
  if (t === 'stdio') return 'STDIO'
  return 'INMEMORY'
}

function humanizeErr(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

function mergeToolsFromServer(existing: McpToolConfig[], incoming: Array<{ name: string; description?: string; schema?: Record<string, unknown> }>): McpToolConfig[] {
  const byName = new Map<string, McpToolConfig>()
  for (const t of existing ?? []) byName.set(t.name, t)
  return incoming.map((t) => {
    const prev = byName.get(t.name)
    return {
      name: t.name,
      description: t.description,
      enabled: prev?.enabled ?? true,
      schema: t.schema,
    }
  })
}

type ParamSpec = { name: string; required: boolean; type?: string }

function schemaToParams(schema: unknown): ParamSpec[] {
  if (!schema || typeof schema !== 'object') return []
  const obj = schema as Record<string, unknown>
  const props = obj.properties && typeof obj.properties === 'object' ? (obj.properties as Record<string, unknown>) : null
  if (!props) return []
  const required = new Set<string>(Array.isArray(obj.required) ? (obj.required as unknown[]).filter((x): x is string => typeof x === 'string') : [])

  const out: ParamSpec[] = []
  for (const [k, v] of Object.entries(props)) {
    if (typeof k !== 'string') continue
    const vv = v as Record<string, unknown> | null | undefined
    const type = typeof vv?.type === 'string' ? vv.type : undefined
    out.push({ name: k, required: required.has(k), type })
  }
  return out
}

function exportServersAsUiJson(servers: McpServerConfig[]): string {
  const mcpServers: Record<string, any> = {}
  for (const s of servers) {
    const type = s.transport === 'http' ? 'streamableHttp' : s.transport === 'sse' ? 'sse' : 'inmemory'
    mcpServers[s.id] = {
      name: s.name,
      type,
      description: '',
      isActive: s.enabled,
      ...(s.transport === 'inmemory' ? {} : { baseUrl: s.url }),
      ...((s.transport !== 'inmemory' && s.headers && Object.keys(s.headers).length) ? { headers: s.headers } : {})
    }
  }
  return JSON.stringify({ mcpServers }, null, 2)
}

export function McpPane(props: { config: AppConfig; onSave: (next: AppConfig) => Promise<void> }) {
  const { config, onSave } = props

  const servers = useMemo(() => config.mcpServers ?? [], [config.mcpServers])

  // 对齐 Flutter：启用的 server 默认视为“已连接”（真正连通性在点击“重新连接/同步工具”时校验）
  const [statusById, setStatusById] = useState<Record<string, McpStatus>>({})
  const [errorById, setErrorById] = useState<Record<string, string | undefined>>({})

  useEffect(() => {
    setStatusById((prev) => {
      const next: Record<string, McpStatus> = { ...prev }
      for (const s of servers) {
        if (!next[s.id]) next[s.id] = s.enabled ? 'connected' : 'idle'
      }
      // 清理已删除的
      for (const id of Object.keys(next)) {
        if (!servers.some((s) => s.id === id)) delete next[id]
      }
      return next
    })
    setErrorById((prev) => {
      const next: Record<string, string | undefined> = { ...prev }
      for (const id of Object.keys(next)) {
        if (!servers.some((s) => s.id === id)) delete next[id]
      }
      return next
    })
  }, [servers])

  const [editOpen, setEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [jsonOpen, setJsonOpen] = useState(false)

  const [errorDialog, setErrorDialog] = useState<{ open: boolean; title: string; message: string }>(() => ({
    open: false,
    title: '',
    message: ''
  }))

  async function syncTools(serverId: string) {
    setStatusById((prev) => ({ ...prev, [serverId]: 'connecting' }))
    setErrorById((prev) => ({ ...prev, [serverId]: undefined }))
    try {
      const res = await window.api.mcp.listTools(serverId)
      if (!res.success) throw new Error(res.error)

      const now = new Date().toISOString()
      const nextServers = servers.map((s) => {
        if (s.id !== serverId) return s
        const merged = mergeToolsFromServer(s.tools ?? [], res.tools)
        return { ...s, tools: merged, updatedAt: now }
      })
      await onSave({ ...config, mcpServers: nextServers })

      setStatusById((prev) => ({ ...prev, [serverId]: 'connected' }))
    } catch (e) {
      const msg = humanizeErr(e)
      setStatusById((prev) => ({ ...prev, [serverId]: 'error' }))
      setErrorById((prev) => ({ ...prev, [serverId]: msg }))
    }
  }

  async function deleteServer(serverId: string) {
    const nextServers = servers.filter((s) => s.id !== serverId)
    await onSave({ ...config, mcpServers: nextServers })
    setStatusById((prev) => {
      const next = { ...prev }
      delete next[serverId]
      return next
    })
    setErrorById((prev) => {
      const next = { ...prev }
      delete next[serverId]
      return next
    })
  }

  function openAdd() {
    setEditingId(null)
    setEditOpen(true)
  }

  function openEdit(id: string) {
    setEditingId(id)
    setEditOpen(true)
  }

  async function upsertServer(next: McpServerConfig) {
    const now = new Date().toISOString()
    const exists = servers.some((s) => s.id === next.id)
    const normalized: McpServerConfig = {
      ...next,
      transport: normalizeTransport(next.transport),
      createdAt: exists ? next.createdAt : (next.createdAt || now),
      updatedAt: now
    }
    const nextServers = exists ? servers.map((s) => (s.id === normalized.id ? normalized : s)) : [normalized, ...servers]
    await onSave({ ...config, mcpServers: nextServers })
    setStatusById((prev) => ({ ...prev, [normalized.id]: normalized.enabled ? 'connected' : 'idle' }))
  }

  async function replaceAllFromJson(raw: string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      throw new Error(`JSON 解析失败：${humanizeErr(e)}`)
    }

    const existingById = new Map<string, McpServerConfig>()
    for (const s of servers) existingById.set(s.id, s)

    const now = new Date().toISOString()

    let nextServers: McpServerConfig[] = []

    // 1) Internal format (array of servers)
    if (Array.isArray(parsed)) {
      nextServers = parsed.map((it: any) => {
        const id = typeof it?.id === 'string' && it.id ? it.id : safeUuid()
        const prev = existingById.get(id)
        const name = typeof it?.name === 'string' ? it.name : (prev?.name ?? 'MCP')
        const transport = normalizeTransport(it?.transport)
        const enabled = typeof it?.enabled === 'boolean' ? it.enabled : (prev?.enabled ?? true)
        const url0 = typeof it?.url === 'string' ? it.url : (prev?.url ?? '')
        const url = transport === 'inmemory' ? '' : url0
        const headers = it?.headers && typeof it.headers === 'object' ? (it.headers as Record<string, string>) : (prev?.headers ?? {})
        const tools = Array.isArray(it?.tools) ? (it.tools as McpToolConfig[]) : (prev?.tools ?? [])
        return {
          id,
          name,
          transport,
          enabled,
          url,
          headers,
          tools,
          createdAt: typeof it?.createdAt === 'string' ? it.createdAt : (prev?.createdAt ?? now),
          updatedAt: now
        }
      })
    } else if (isRecord(parsed)) {
      // 2) Flutter UI JSON: { mcpServers: { id: { name, type, isActive, baseUrl, headers } } }
      // 3) Direct map: { id: { ... } }
      const root = parsed as Record<string, any>
      const usingNested = isRecord(root.mcpServers)
      const map = (usingNested ? (root.mcpServers as Record<string, any>) : null) ?? root
      if (!isRecord(map)) {
        throw new Error('JSON 格式错误：需要是数组，或包含 mcpServers 的对象')
      }
      if (!usingNested) {
        const ok = Object.values(map).every((v) => isRecord(v))
        if (!ok) throw new Error('JSON 格式错误：需要是 { mcpServers: { ... } } 或 { id: { ... } }')
      }

      nextServers = Object.entries(map).map(([id, cfgAny]) => {
        const cfg = isRecord(cfgAny) ? (cfgAny as Record<string, any>) : {}
        const prev = existingById.get(id)

        const name = (typeof cfg.name === 'string' ? cfg.name : undefined) ?? (prev?.name ?? 'MCP')
        const enabledRaw = cfg.isActive ?? cfg.enabled
        const enabled = typeof enabledRaw === 'boolean' ? enabledRaw : (prev?.enabled ?? true)

        const typeRaw = String(cfg.type ?? cfg.transport ?? '').toLowerCase()
        const transport: McpTransportType =
          typeRaw === 'inmemory'
            ? 'inmemory'
            : typeRaw.includes('http')
              ? 'http'
              : typeRaw === 'sse'
                ? 'sse'
                : (prev?.transport ?? 'http')

        const urlRaw = (typeof cfg.baseUrl === 'string' ? cfg.baseUrl : undefined) ?? (typeof cfg.url === 'string' ? cfg.url : undefined) ?? (prev?.url ?? '')
        const url = transport === 'inmemory' ? '' : urlRaw

        const headers = isRecord(cfg.headers) ? (cfg.headers as Record<string, string>) : (prev?.headers ?? {})

        // Flutter JSON 不包含 tools：尽量保留已有 tools（若用户提供 tools 字段则用之）
        const tools = Array.isArray(cfg.tools) ? (cfg.tools as McpToolConfig[]) : (prev?.tools ?? [])

        return {
          id,
          name,
          transport,
          enabled,
          url,
          headers,
          tools,
          createdAt: prev?.createdAt ?? now,
          updatedAt: now
        }
      })
    } else {
      throw new Error('JSON 格式错误：需要是数组，或包含 mcpServers 的对象')
    }

    await onSave({ ...config, mcpServers: nextServers })
  }

  return (
    <div style={s.root}>
      <div style={s.headerRow}>
        <div style={s.headerTitle}>MCP</div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm" onClick={() => setJsonOpen(true)} title="JSON 编辑">
          <Edit size={14} />
          JSON
        </button>
        <button type="button" className="btn btn-sm btn-primary" onClick={openAdd} title="添加 MCP 服务器">
          <Plus size={14} />
          添加
        </button>
      </div>

      <div className="settingsCard" style={{ padding: 0 }}>
        {servers.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', opacity: 0.7 }}>暂无 MCP 服务器</div>
        ) : (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {servers.map((sv) => (
              <McpServerCard
                key={sv.id}
                server={sv}
                status={statusById[sv.id] ?? (sv.enabled ? 'connected' : 'idle')}
                error={errorById[sv.id]}
                onEdit={() => openEdit(sv.id)}
                onReconnect={() => void syncTools(sv.id)}
                onDelete={() => void deleteServer(sv.id)}
                onShowError={(msg) => setErrorDialog({ open: true, title: '连接错误', message: msg || '未提供错误详情' })}
              />
            ))}
          </div>
        )}
      </div>

      <McpServerEditModal
        open={editOpen}
        server={editingId ? servers.find((s) => s.id === editingId) ?? null : null}
        onClose={() => setEditOpen(false)}
        onSave={(next) => void upsertServer(next).then(() => setEditOpen(false))}
        onSyncTools={(id) => void syncTools(id)}
      />

      <McpJsonEditModal
        open={jsonOpen}
        value={exportServersAsUiJson(servers)}
        onClose={() => setJsonOpen(false)}
        onSave={(raw) => void replaceAllFromJson(raw).then(() => setJsonOpen(false)).catch((e) => setErrorDialog({ open: true, title: '保存失败', message: humanizeErr(e) }))}
      />

      <ErrorDetailsModal open={errorDialog.open} title={errorDialog.title} message={errorDialog.message} onClose={() => setErrorDialog((p) => ({ ...p, open: false }))} />
    </div>
  )
}

function McpServerCard(props: {
  server: McpServerConfig
  status: McpStatus
  error?: string
  onEdit: () => void
  onReconnect: () => void
  onDelete: () => void
  onShowError: (msg?: string) => void
}) {
  const { server: s0 } = props
  const [expanded, setExpanded] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const s = s0
  const toolsCount = countEnabledTools(s.tools ?? [])

  const statusText = props.status === 'connected' ? '已连接' : props.status === 'connecting' ? '连接中…' : '未连接'
  const statusColor = props.status === 'connected' ? '#16a34a' : props.status === 'connecting' ? 'var(--primary)' : '#ef4444'

  const showError = props.status === 'error' && !!props.error

  return (
    <div style={sCard.root}>
      <div
        role="button"
        tabIndex={0}
        style={sCard.topRow}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setExpanded((v) => !v)
        }}
      >
        <div style={sCard.iconWrap}>
          <div style={sCard.iconBox}>
            <Terminal size={18} style={{ color: 'var(--primary)' }} />
          </div>
          {props.status === 'connecting' ? (
            <div className="spin" style={sCard.statusSpinner} />
          ) : (
            <div style={{ ...sCard.statusDot, background: s.enabled ? statusColor : 'var(--border)' }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
          <div style={sCard.tagsRow}>
            <Tag text={statusText} color={statusColor} />
            <Tag text={transportLabel(s.transport)} />
            <Tag text={`工具: ${toolsCount.enabled}/${toolsCount.total}`} />
            {!s.enabled && <Tag text="已禁用" />}
          </div>
          {showError && (
            <div style={sCard.errorRow}>
              <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 700 }}>连接失败</span>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onShowError(props.error)
                }}
              >
                详情
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              props.onEdit()
            }}
            title="编辑"
          >
            <Edit size={14} />
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              props.onReconnect()
            }}
            title="重新连接/同步工具"
          >
            <RefreshCw size={14} className={props.status === 'connecting' ? 'spin' : ''} />
          </button>
          {confirmingDelete ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setConfirmingDelete(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => {
                  props.onDelete()
                  setConfirmingDelete(false)
                }}
              >
                确认删除
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={(e) => {
                e.stopPropagation()
                setConfirmingDelete(true)
              }}
              title="删除"
            >
              <Trash2 size={14} />
            </button>
          )}
          <div style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={sCard.expandBody}>
          <DetailRow label="URL" value={s.url || '-'} />
          <DetailRow label="Headers" value={s.headers && Object.keys(s.headers).length ? `${Object.keys(s.headers).length} custom headers` : '-'} />

          <div style={{ height: 10 }} />
          <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.8 }}>工具（{s.tools.length}）</div>
          <div style={{ height: 8 }} />

          {s.tools.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.6, fontStyle: 'italic' }}>暂无工具，点击右上角刷新可同步</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {s.tools.map((t) => (
                <div key={t.name} style={sCard.toolItem}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontWeight: 800, color: 'var(--primary)' }}>{t.name}</div>
                    {!t.enabled && <span style={sCard.toolDisabled}>已禁用</span>}
                  </div>
                  {t.description ? <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{t.description}</div> : null}

                  {t.schema ? (
                    (() => {
                      const params = schemaToParams(t.schema)
                      if (params.length === 0) return null
                      return (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>输入参数</div>
                          <div style={{ height: 4 }} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {params.map((p) => (
                              <div key={p.name} style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                                <span style={{ fontFamily: 'var(--code-font-family, ui-monospace, monospace)', opacity: 0.9 }}>
                                  {p.name}{p.required ? <span style={{ color: '#ef4444' }}>*</span> : null}
                                </span>
                                <span style={{ opacity: 0.6 }}>{p.type ?? 'any'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Switch(props: { checked: boolean; onChange: (v: boolean) => void; size?: 'normal' | 'small' }) {
  const isSmall = props.size === 'small'
  const width = isSmall ? 36 : 44
  const height = isSmall ? 20 : 24
  const thumbSize = isSmall ? 14 : 18
  const offset = isSmall ? 3 : 3
  const travel = width - thumbSize - offset * 2

  return (
    <button
      type="button"
      onClick={() => props.onChange(!props.checked)}
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: height / 2,
        border: 'none',
        background: props.checked ? 'var(--primary)' : 'var(--border)',
        cursor: 'pointer',
        transition: 'background 0.2s ease',
        flexShrink: 0,
        padding: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: offset,
          left: offset,
          width: thumbSize,
          height: thumbSize,
          borderRadius: thumbSize / 2,
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          transition: 'transform 0.2s ease',
          transform: props.checked ? `translateX(${travel}px)` : 'translateX(0)',
        }}
      />
    </button>
  )
}

function CustomSelect(props: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = props.options.find((o) => o.value === props.value)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => !props.disabled && setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 12px',
          fontSize: 14,
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          cursor: props.disabled ? 'not-allowed' : 'pointer',
          opacity: props.disabled ? 0.5 : 1,
          textAlign: 'left',
        }}
      >
        <span style={{ flex: 1 }}>{selected?.label ?? '请选择'}</span>
        <ChevronDown
          size={16}
          style={{
            color: 'var(--text-3)',
            transition: 'transform 0.2s ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
          }}
        />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 100,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            overflow: 'hidden',
          }}
        >
          {props.options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                props.onChange(opt.value)
                setOpen(false)
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                padding: '10px 12px',
                fontSize: 14,
                border: 'none',
                background: opt.value === props.value ? 'var(--primary-bg)' : 'transparent',
                color: opt.value === props.value ? 'var(--primary)' : 'var(--text)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (opt.value !== props.value) {
                  e.currentTarget.style.background = 'var(--hover-bg)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = opt.value === props.value ? 'var(--primary-bg)' : 'transparent'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SegmentedControl(props: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div
      style={{
        display: 'flex',
        padding: 3,
        borderRadius: 8,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
      }}
    >
      {props.options.map((opt) => {
        const isActive = opt.value === props.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => props.onChange(opt.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 6,
              border: 'none',
              background: isActive ? 'var(--surface)' : 'transparent',
              color: isActive ? 'var(--text)' : 'var(--text-3)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function Tag(props: { text: string; color?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        border: '1px solid var(--border)',
        fontSize: 11,
        fontWeight: 700,
        color: props.color ?? 'var(--text-2)',
        background: 'color-mix(in srgb, var(--surface-2) 55%, transparent)'
      }}
    >
      {props.text}
    </span>
  )
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, marginBottom: 4 }}>
      <div style={{ width: 62, opacity: 0.6 }}>{props.label}</div>
      <div style={{ flex: 1, opacity: 0.85, fontFamily: 'var(--code-font-family, ui-monospace, monospace)' }}>{props.value}</div>
    </div>
  )
}

function McpServerEditModal(props: {
  open: boolean
  server: McpServerConfig | null
  onClose: () => void
  onSave: (next: McpServerConfig) => void
  onSyncTools: (serverId: string) => void
}) {
  const { open, server, onClose, onSave } = props
  const isEdit = !!server

  const [draftId, setDraftId] = useState<string>(() => server?.id ?? safeUuid())
  const [enabled, setEnabled] = useState(true)
  const [name, setName] = useState('')
  const [transport, setTransport] = useState<McpTransportType>('http')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState<Array<{ k: string; v: string }>>([])
  const [tools, setTools] = useState<McpToolConfig[]>([])
  const [tab, setTab] = useState<'basic' | 'tools'>('basic')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setErr(null)
    setTab('basic')
    setDraftId(server?.id ?? safeUuid())
    setEnabled(server?.enabled ?? true)
    setName(server?.name ?? '')
    setTransport(server?.transport ?? 'http')
    setUrl(server?.url ?? '')
    setHeaders(Object.entries(server?.headers ?? {}).map(([k, v]) => ({ k, v })))
    setTools(server?.tools ?? [])
  }, [open, server])

  if (!open) return null

  const serverId = draftId

  function validate(): string | null {
    if (transport !== 'inmemory' && !url.trim()) return '请输入服务器地址'
    return null
  }

  function handleSave() {
    const v = validate()
    if (v) { setErr(v); return }
    const now = new Date().toISOString()
    const hdr: Record<string, string> = {}
    for (const h of headers) {
      const k = h.k.trim()
      if (!k) continue
      hdr[k] = h.v.trim()
    }
    onSave({
      id: serverId,
      name: name.trim() || 'MCP',
      enabled,
      transport,
      url: url.trim(),
      headers: hdr,
      tools,
      createdAt: server?.createdAt ?? now,
      updatedAt: now
    })
  }

  return (
    <div className="modalOverlay" onMouseDown={onClose}>
      <div className="modalSurface frosted" style={sModal.surface} onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={sModal.header}>
          <div style={sModal.headerLeft}>
            <div style={sModal.iconBox}>
              <Terminal size={20} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <div style={sModal.title}>{isEdit ? '编辑 MCP 服务器' : '添加 MCP 服务器'}</div>
              <div style={sModal.subtitle}>配置 Model Context Protocol 服务器连接</div>
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} style={{ padding: 8 }}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={sModal.tabBar}>
          <div style={sModal.tabGroup}>
            <button
              type="button"
              style={{ ...sModal.tab, ...(tab === 'basic' ? sModal.tabActive : {}) }}
              onClick={() => setTab('basic')}
            >
              基础设置
            </button>
            {isEdit && (
              <button
                type="button"
                style={{ ...sModal.tab, ...(tab === 'tools' ? sModal.tabActive : {}) }}
                onClick={() => setTab('tools')}
              >
                工具管理
              </button>
            )}
          </div>
          {isEdit && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => props.onSyncTools(serverId)}
              title="从服务器同步工具列表"
            >
              <RefreshCw size={14} />
              同步工具
            </button>
          )}
        </div>

        {/* Error */}
        {err && (
          <div style={sModal.errorBox}>
            <span style={{ fontSize: 13 }}>{err}</span>
          </div>
        )}

        {/* Content */}
        <div style={sModal.content}>
          {tab === 'basic' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* 名称 + 启用状态 */}
              <div style={sModal.field}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={sModal.label}>名称</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: enabled ? 'var(--primary)' : 'var(--text-3)' }}>
                      {enabled ? '已启用' : '已禁用'}
                    </span>
                    <Switch checked={enabled} onChange={setEnabled} size="small" />
                  </div>
                </div>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="输入服务器名称"
                  style={sModal.input}
                />
              </div>

              {/* 传输类型 */}
              <div style={sModal.field}>
                <label style={sModal.label}>传输类型</label>
                <SegmentedControl
                  value={transport}
                  onChange={(v) => setTransport(normalizeTransport(v))}
                  options={[
                    { value: 'http', label: 'HTTP' },
                    { value: 'sse', label: 'SSE' },
                    { value: 'stdio', label: 'Stdio' },
                  ]}
                />
              </div>

              {/* 服务器地址 - stdio/inmemory 模式不显示 */}
              {transport !== 'inmemory' && transport !== 'stdio' && (
                <div style={sModal.field}>
                  <label style={sModal.label}>服务器地址</label>
                  <input
                    className="input"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder={transport === 'sse' ? 'http://localhost:3000/sse' : 'http://localhost:3000/mcp'}
                    style={sModal.input}
                  />
                  {transport === 'sse' && (
                    <div style={sModal.fieldNote}>SSE 连接可能需要多次尝试</div>
                  )}
                </div>
              )}

              {/* Stdio 命令 */}
              {transport === 'stdio' && (
                <div style={sModal.field}>
                  <label style={sModal.label}>启动命令</label>
                  <input
                    className="input"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="npx -y @anthropic/mcp-server"
                    style={sModal.input}
                  />
                  <div style={sModal.fieldNote}>通过 stdio 与本地进程通信</div>
                </div>
              )}

              {/* 分割线 */}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

              {/* 自定义请求头 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <label style={sModal.label}>自定义请求头</label>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setHeaders((prev) => [...prev, { k: '', v: '' }])}
                    style={{ padding: '4px 10px', fontSize: 12 }}
                  >
                    <Plus size={12} />
                    添加
                  </button>
                </div>
                {headers.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '8px 0' }}>
                    暂无自定义请求头
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {headers.map((h, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          className="input"
                          value={h.k}
                          onChange={(e) => setHeaders((prev) => prev.map((x, i) => (i === idx ? { ...x, k: e.target.value } : x)))}
                          placeholder="Header 名称"
                          style={{ ...sModal.input, flex: 1 }}
                        />
                        <input
                          className="input"
                          value={h.v}
                          onChange={(e) => setHeaders((prev) => prev.map((x, i) => (i === idx ? { ...x, v: e.target.value } : x)))}
                          placeholder="Header 值"
                          style={{ ...sModal.input, flex: 2 }}
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setHeaders((prev) => prev.filter((_, i) => i !== idx))}
                          style={{ padding: 6, color: 'var(--text-3)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <label style={sModal.label}>
                  可用工具
                  {tools.length > 0 && (
                    <span style={{ marginLeft: 8, color: 'var(--text-3)', fontWeight: 400 }}>
                      {tools.filter(t => t.enabled).length}/{tools.length} 已启用
                    </span>
                  )}
                </label>
              </div>
              {tools.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '20px 0', textAlign: 'center' }}>
                  暂无工具，点击上方「同步工具」获取
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tools.map((t, idx) => (
                    <div
                      key={t.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--surface-2)',
                        opacity: t.enabled ? 1 : 0.6,
                      }}
                    >
                      <Switch
                        checked={t.enabled}
                        onChange={(v) => setTools((prev) => prev.map((x, i) => (i === idx ? { ...x, enabled: v } : x)))}
                        size="small"
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: t.enabled ? 'var(--primary)' : 'var(--text-2)' }}>
                          {t.name}
                        </div>
                        {t.description && (
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={sModal.footer}>
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            {isEdit ? '保存更改' : '创建服务器'}
          </button>
        </div>
      </div>
    </div>
  )
}

const sModal: Record<string, React.CSSProperties> = {
  surface: {
    width: 520,
    maxWidth: '94vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: 'var(--primary-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text)',
  },
  subtitle: {
    fontSize: 12,
    color: 'var(--text-3)',
    marginTop: 2,
  },
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
  },
  tabGroup: {
    display: 'flex',
    gap: 4,
    padding: 4,
    borderRadius: 8,
    background: 'var(--surface-2)',
  },
  tab: {
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-2)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  tabActive: {
    background: 'var(--surface)',
    color: 'var(--text)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  errorBox: {
    margin: '12px 20px 0',
    padding: '10px 14px',
    borderRadius: 8,
    background: 'var(--danger-bg)',
    border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
    color: 'var(--danger)',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 20,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text)',
  },
  input: {
    padding: '10px 12px',
    fontSize: 14,
    borderRadius: 8,
  },
  fieldNote: {
    fontSize: 11,
    color: 'var(--text-3)',
    marginTop: 4,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '12px 20px',
    borderTop: '1px solid var(--border)',
    background: 'var(--surface)',
  },
}

function McpJsonEditModal(props: { open: boolean; value: string; onClose: () => void; onSave: (raw: string) => void }) {
  const { open, value, onClose, onSave } = props
  const [raw, setRaw] = useState(value)
  const [err, setErr] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    setRaw(value)
    setErr(null)
    setTimeout(() => taRef.current?.focus(), 0)
  }, [open, value])

  if (!open) return null

  return (
    <div className="modalOverlay" onMouseDown={onClose}>
      <div className="modalSurface frosted" style={{ width: 900, maxWidth: '92vw', padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 900 }}>MCP JSON</div>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm" onClick={onClose}>
            <X size={14} />
            关闭
          </button>
        </div>
        <textarea
          ref={taRef}
          className="input"
          style={{ width: '100%', height: '60vh', fontFamily: 'var(--code-font-family, ui-monospace, monospace)', fontSize: 12 }}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        {err && <div style={{ marginTop: 8, color: '#ef4444', fontSize: 12 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setErr(null)
              try {
                JSON.parse(raw)
              } catch (e) {
                setErr(humanizeErr(e))
                return
              }
              onSave(raw)
            }}
          >
            保存并应用
          </button>
        </div>
      </div>
    </div>
  )
}

function ErrorDetailsModal(props: { open: boolean; title: string; message: string; onClose: () => void }) {
  if (!props.open) return null
  return (
    <div className="modalOverlay" onMouseDown={props.onClose}>
      <div className="modalSurface frosted" style={{ width: 560, maxWidth: '92vw', padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>{props.title}</div>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm" onClick={props.onClose}>
            <X size={14} />
            关闭
          </button>
        </div>
        <div className="settingsCard" style={{ padding: 12 }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--code-font-family, ui-monospace, monospace)', fontSize: 12 }}>
            {props.message}
          </pre>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: {
    padding: 16,
    maxWidth: 960,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 900
  }
}

const sCard: Record<string, React.CSSProperties> = {
  root: {
    borderRadius: 16,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    overflow: 'hidden'
  },
  topRow: {
    width: '100%',
    padding: 12,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer'
  },
  iconWrap: {
    position: 'relative',
    flexShrink: 0
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 12,
    height: 12,
    borderRadius: 999,
    border: '2px solid var(--surface)'
  },
  statusSpinner: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 12,
    height: 12,
    borderRadius: 999,
    border: '2px solid var(--primary)',
    borderTopColor: 'transparent',
  },
  tagsRow: {
    marginTop: 8,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6
  },
  expandBody: {
    borderTop: '1px solid var(--border)',
    padding: 12,
  },
  errorRow: {
    marginTop: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  toolItem: {
    padding: 12,
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--surface-2)'
  },
  toolDisabled: {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    opacity: 0.75
  }
}
