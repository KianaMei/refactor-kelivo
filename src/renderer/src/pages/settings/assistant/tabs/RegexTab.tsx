import { useMemo, useState } from 'react'
import { ArrowLeftRight, Eye, EyeOff, Plus, Settings2, Trash2 } from 'lucide-react'

import type { AssistantConfig, AssistantRegexRule, AssistantRegexScope } from '../../../../../../shared/types'

function safeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function validateRegex(pattern: string): string | null {
  const p = pattern.trim()
  if (!p) return '正则不能为空'
  try {
    // eslint-disable-next-line no-new
    new RegExp(p)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : '正则无效'
  }
}

export function RegexTab(props: {
  assistant: AssistantConfig
  onPatch: (patch: Partial<AssistantConfig>) => void
}) {
  const { assistant, onPatch } = props

  const rules = assistant.regexRules ?? []

  const [editing, setEditing] = useState<{
    open: boolean
    id: string | null
    name: string
    pattern: string
    replacement: string
    scopes: Set<AssistantRegexScope>
    visualOnly: boolean
    replaceOnly: boolean
  }>({
    open: false,
    id: null,
    name: '',
    pattern: '',
    replacement: '',
    scopes: new Set<AssistantRegexScope>(['assistant']),
    visualOnly: false,
    replaceOnly: false
  })

  const regexErr = useMemo(() => validateRegex(editing.pattern), [editing.pattern])
  const canSave = useMemo(() => !regexErr, [regexErr])

  const openAdd = () => {
    setEditing({
      open: true,
      id: null,
      name: '',
      pattern: '',
      replacement: '',
      scopes: new Set<AssistantRegexScope>(['assistant']),
      visualOnly: false,
      replaceOnly: false
    })
  }

  const openEdit = (r: AssistantRegexRule) => {
    setEditing({
      open: true,
      id: r.id,
      name: r.name,
      pattern: r.pattern,
      replacement: r.replacement,
      scopes: new Set(r.scopes ?? []),
      visualOnly: r.visualOnly,
      replaceOnly: !!r.replaceOnly
    })
  }

  const save = () => {
    if (!canSave) return
    const next = [...rules]
    const updated: AssistantRegexRule = {
      id: editing.id ?? safeId('regex'),
      name: editing.name.trim() || '未命名规则',
      pattern: editing.pattern,
      replacement: editing.replacement,
      scopes: Array.from(editing.scopes),
      visualOnly: editing.visualOnly,
      replaceOnly: editing.visualOnly ? false : editing.replaceOnly,
      enabled: editing.id ? (rules.find((x) => x.id === editing.id)?.enabled ?? true) : true
    }
    if (editing.id) {
      const idx = next.findIndex((x) => x.id === editing.id)
      if (idx >= 0) next[idx] = updated
    } else {
      next.push(updated)
    }
    onPatch({ regexRules: next })
    setEditing((s) => ({ ...s, open: false }))
  }

  const remove = (id: string) => {
    onPatch({ regexRules: rules.filter((x) => x.id !== id) })
  }

  const toggleEnabled = (id: string) => {
    onPatch({
      regexRules: rules.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x))
    })
  }

  const move = (id: string, dir: -1 | 1) => {
    const idx = rules.findIndex((x) => x.id === id)
    if (idx < 0) return
    const to = idx + dir
    if (to < 0 || to >= rules.length) return
    const next = [...rules]
    const tmp = next[idx]
    next[idx] = next[to]
    next[to] = tmp
    onPatch({ regexRules: next })
  }

  return (
    <div className="assistantBasicRoot">
      <div className="assistantTabCard">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <ArrowLeftRight size={16} />
          <div style={{ fontWeight: 800 }}>正则规则</div>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm btn-ghost" onClick={openAdd} style={{ gap: 6 }}>
            <Plus size={14} />
            添加规则
          </button>
        </div>

        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
          用正则表达式批量改写消息内容。可选“仅视觉”（仅展示层生效）或“仅请求”（仅发送给模型时生效）。
        </div>

        {rules.length === 0 ? (
          <div style={{ padding: 12, opacity: 0.7 }}>暂无规则</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rules.map((r, idx) => (
              <div key={r.id} className="assistantItemCard">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 800 }}>{r.name || '未命名规则'}</div>
                  {r.visualOnly ? (
                    <span className="primary-capsule" style={{ opacity: 0.9 }}>仅视觉</span>
                  ) : null}
                  {r.replaceOnly ? (
                    <span className="primary-capsule" style={{ opacity: 0.9 }}>仅请求</span>
                  ) : null}
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    {r.scopes?.length ? r.scopes.join(',') : '未选择范围'}
                  </span>
                  <div style={{ flex: 1 }} />
                  <button type="button" className={`toggle ${r.enabled ? 'toggleOn' : ''}`} onClick={() => toggleEnabled(r.id)} title="启用/禁用">
                    <div className="toggleThumb" />
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={idx === 0} onClick={() => move(r.id, -1)}>上移</button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={idx === rules.length - 1} onClick={() => move(r.id, 1)}>下移</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => openEdit(r)}>
                    <Settings2 size={14} />
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(r.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8, whiteSpace: 'pre-wrap' }}>
                  <div><strong>Pattern：</strong><code>{r.pattern}</code></div>
                  <div style={{ marginTop: 6 }}><strong>Replace：</strong><code>{r.replacement}</code></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing.open && (
        <div className="modalOverlay" onMouseDown={() => setEditing((s) => ({ ...s, open: false }))}>
          <div className="modalSurface frosted" style={{ width: 640, padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>{editing.id ? '编辑规则' : '添加规则'}</div>

            <label className="input-label">规则名称</label>
            <input
              className="input"
              style={{ width: '100%' }}
              value={editing.name}
              onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))}
              placeholder="例如：移除 think 标签"
            />

            <div style={{ height: 10 }} />

            <label className="input-label">正则表达式</label>
            <input
              className="input"
              style={{ width: '100%' }}
              value={editing.pattern}
              onChange={(e) => setEditing((s) => ({ ...s, pattern: e.target.value }))}
              placeholder="例如：<think>[\\s\\S]*?<\\/think>"
              autoFocus
            />
            {regexErr ? <div style={{ marginTop: 6, color: '#ef4444', fontSize: 12 }}>{regexErr}</div> : null}

            <div style={{ height: 10 }} />

            <label className="input-label">替换内容</label>
            <input
              className="input"
              style={{ width: '100%' }}
              value={editing.replacement}
              onChange={(e) => setEditing((s) => ({ ...s, replacement: e.target.value }))}
              placeholder="支持 $1 $2... 捕获组"
            />

            <div style={{ height: 12 }} />

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="input-label">影响范围</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className={`seg-btn ${editing.scopes.has('user') ? 'active' : ''}`}
                    onClick={() => setEditing((s) => {
                      const next = new Set(s.scopes)
                      if (next.has('user')) next.delete('user')
                      else next.add('user')
                      return { ...s, scopes: next }
                    })}
                  >
                    用户
                  </button>
                  <button
                    type="button"
                    className={`seg-btn ${editing.scopes.has('assistant') ? 'active' : ''}`}
                    onClick={() => setEditing((s) => {
                      const next = new Set(s.scopes)
                      if (next.has('assistant')) next.delete('assistant')
                      else next.add('assistant')
                      return { ...s, scopes: next }
                    })}
                  >
                    助手
                  </button>
                </div>
              </div>

              <div style={{ width: 180 }}>
                <label className="input-label">仅视觉</label>
                <button
                  type="button"
                  className={`btn ${editing.visualOnly ? 'btn-primary' : ''}`}
                  style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                  onClick={() => setEditing((s) => ({ ...s, visualOnly: !s.visualOnly, replaceOnly: s.visualOnly ? s.replaceOnly : false }))}
                >
                  {editing.visualOnly ? <Eye size={16} /> : <EyeOff size={16} />}
                  {editing.visualOnly ? '开启' : '关闭'}
                </button>
              </div>

              <div style={{ width: 180 }}>
                <label className="input-label">仅请求</label>
                <button
                  type="button"
                  className={`btn ${editing.replaceOnly ? 'btn-primary' : ''}`}
                  style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                  onClick={() => setEditing((s) => ({ ...s, replaceOnly: !s.replaceOnly, visualOnly: s.replaceOnly ? s.visualOnly : false }))}
                >
                  <ArrowLeftRight size={16} />
                  {editing.replaceOnly ? '开启' : '关闭'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" className="btn" onClick={() => setEditing((s) => ({ ...s, open: false }))}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={!canSave}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
