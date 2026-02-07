import { Plus, Trash2 } from 'lucide-react'

import type { AssistantConfig, AssistantCustomBodyParam, AssistantCustomHeader } from '../../../../../../shared/types'

export function CustomRequestTab(props: {
  assistant: AssistantConfig
  onPatch: (patch: Partial<AssistantConfig>) => void
}) {
  const { assistant, onPatch } = props

  const headers = assistant.customHeaders ?? []
  const body = assistant.customBody ?? []

  const addHeader = () => {
    const next: AssistantCustomHeader[] = [...headers, { name: '', value: '' }]
    onPatch({ customHeaders: next })
  }

  const updateHeader = (idx: number, patch: Partial<AssistantCustomHeader>) => {
    const next = headers.map((h, i) => (i === idx ? { ...h, ...patch } : h))
    onPatch({ customHeaders: next })
  }

  const removeHeader = (idx: number) => {
    const next = headers.filter((_, i) => i !== idx)
    onPatch({ customHeaders: next })
  }

  const addBody = () => {
    const next: AssistantCustomBodyParam[] = [...body, { key: '', value: '' }]
    onPatch({ customBody: next })
  }

  const updateBody = (idx: number, patch: Partial<AssistantCustomBodyParam>) => {
    const next = body.map((b, i) => (i === idx ? { ...b, ...patch } : b))
    onPatch({ customBody: next })
  }

  const removeBody = (idx: number) => {
    const next = body.filter((_, i) => i !== idx)
    onPatch({ customBody: next })
  }

  return (
    <div className="assistantBasicRoot">
      <div className="assistantTabCard">
        <div className="assistantTabCardTitleRow">
          <div className="assistantTabCardTitle">自定义请求头</div>
        </div>
        <div className="assistantTabCardDesc">
          用于对 OpenAI-compatible 请求追加 Header（例如：X-Proxy、X-Region）。空项会被忽略。
        </div>

        <button type="button" className="btn btn-sm btn-ghost" onClick={addHeader} style={{ gap: 6 }}>
          <Plus size={14} />
          添加 Header
        </button>

        <div style={{ height: 10 }} />

        {headers.length === 0 ? (
          <div style={{ padding: 10, opacity: 0.7 }}>暂无 Header</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {headers.map((h, idx) => (
              <div key={idx} className="assistantItemCard">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    placeholder="Header 名称"
                    value={h.name}
                    onChange={(e) => updateHeader(idx, { name: e.target.value })}
                  />
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => removeHeader(idx)} title="删除">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ height: 8 }} />
                <input
                  className="input"
                  style={{ width: '100%' }}
                  placeholder="Header 值"
                  value={h.value}
                  onChange={(e) => updateHeader(idx, { value: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="assistantTabCard">
        <div className="assistantTabCardTitleRow">
          <div className="assistantTabCardTitle">自定义请求体参数</div>
        </div>
        <div className="assistantTabCardDesc">
          用于对请求 body 追加字段（例如：user、metadata 等）。值按字符串注入，必要时请填写 JSON 字符串。
        </div>

        <button type="button" className="btn btn-sm btn-ghost" onClick={addBody} style={{ gap: 6 }}>
          <Plus size={14} />
          添加参数
        </button>

        <div style={{ height: 10 }} />

        {body.length === 0 ? (
          <div style={{ padding: 10, opacity: 0.7 }}>暂无参数</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {body.map((b, idx) => (
              <div key={idx} className="assistantItemCard">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    placeholder="Key"
                    value={b.key}
                    onChange={(e) => updateBody(idx, { key: e.target.value })}
                  />
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => removeBody(idx)} title="删除">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ height: 8 }} />
                <textarea
                  className="input"
                  style={{ width: '100%', height: 96, resize: 'vertical' }}
                  placeholder="Value（可多行）"
                  value={b.value}
                  onChange={(e) => updateBody(idx, { value: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
