import { useCallback, useMemo, useState } from 'react'
import type { ProviderConfigV2 } from '../../../../../../shared/types'
import { useDialogClose } from '../../../../hooks/useDialogClose'

export function ExportProviderDialog({
  open,
  providers,
  providersOrder,
  onClose
}: {
  open: boolean
  providers: Record<string, ProviderConfigV2>
  providersOrder: string[]
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  console.log('[ExportProviderDialog] render with open:', open)
  useDialogClose(open, onClose)

  const sortedProviders = useMemo(() => {
    const seen = new Set<string>()
    const list: ProviderConfigV2[] = []
    for (const id of providersOrder) {
      const p = providers[id]
      if (!p) continue
      seen.add(id)
      list.push(p)
    }
    for (const [id, p] of Object.entries(providers)) {
      if (!seen.has(id)) list.push(p)
    }
    return list
  }, [providers, providersOrder])

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === sortedProviders.length) return new Set()
      return new Set(sortedProviders.map((p) => p.id))
    })
  }, [sortedProviders])

  const handleExport = useCallback(async () => {
    if (selected.size === 0) return
    setError(null)
    setBusy(true)
    try {
      const toExport = sortedProviders.filter((p) => selected.has(p.id))

      // 1. 打包
      const buffer = await window.api.providerBundle.export(toExport)

      // 2. 选择保存路径
      const result = await window.api.dialog.saveFile({
        defaultPath: `kelivo-providers-${toExport.length}.kelivo`,
        filters: [{ name: 'Kelivo 供应商包', extensions: ['kelivo'] }]
      })
      if (result.canceled || !result.filePath) {
        setBusy(false)
        return
      }

      // 3. 写入文件
      await window.api.dialog.writeFile(result.filePath, buffer)

      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [selected, sortedProviders, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 16 }}>导出供应商到文件</h3>
          <button type="button" className="close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '12px 16px 0', fontSize: 13, color: 'var(--text-2)' }}>
          选择要导出的供应商，将打包为 .kelivo 文件（含头像）。
        </div>

        {error && (
          <div style={{ padding: '8px 16px', color: 'var(--danger)', fontSize: 13 }}>{error}</div>
        )}

        {/* 全选 */}
        <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={selected.size === sortedProviders.length && sortedProviders.length > 0}
              onChange={toggleAll}
            />
            全选 ({selected.size}/{sortedProviders.length})
          </label>
        </div>

        {/* 供应商列表 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
          {sortedProviders.map((p) => (
            <label
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                fontSize: 13
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggleOne(p.id)}
              />
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: 500 }}>{p.name}</span>
                <span style={{ color: 'var(--text-3)', marginLeft: 8, fontSize: 12 }}>
                  {p.models.length} 个模型
                  {p.customAvatarPath ? ' · 含头像' : ''}
                </span>
              </span>
              {!p.enabled && (
                <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-2)', borderRadius: 4, padding: '1px 6px' }}>
                  已禁用
                </span>
              )}
            </label>
          ))}
        </div>

        {/* 底部按钮 */}
        <div style={{ padding: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="desk-button" onClick={onClose}>取消</button>
          <button
            type="button"
            className="desk-button primary"
            disabled={busy || selected.size === 0}
            onClick={() => void handleExport()}
          >
            {busy ? '导出中...' : `导出 ${selected.size} 个供应商`}
          </button>
        </div>
      </div>
    </div>
  )
}
