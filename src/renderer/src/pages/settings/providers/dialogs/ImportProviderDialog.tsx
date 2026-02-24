import { useState, useCallback } from 'react'
import { decodeProviders, type ImportedProvider } from '../../../../../../shared/providerCodec'
import { useDialogClose } from '../../../../hooks/useDialogClose'

type Step = 'input' | 'preview'

export function ImportProviderDialog({
  open,
  existingIds,
  onImport,
  onClose
}: {
  open: boolean
  existingIds: Set<string>
  onImport: (providers: ImportedProvider[]) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>('input')
  const [inputText, setInputText] = useState('')
  const [parsed, setParsed] = useState<ImportedProvider[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const handleDialogClose = useCallback(() => {
    if (step === 'preview') {
      setStep('input')
    } else {
      setStep('input')
      setInputText('')
      setParsed([])
      setErrors([])
      setSelected(new Set())
      onClose()
    }
  }, [step, onClose])

  useDialogClose(open, handleDialogClose)

  if (!open) return null

  const handleParse = () => {
    const result = decodeProviders(inputText)
    setParsed(result.providers)
    setErrors(result.errors)
    if (result.providers.length > 0) {
      setSelected(new Set(result.providers.map((_, i) => i)))
      setStep('preview')
    }
  }

  const handleConfirm = () => {
    const toImport = parsed.filter((_, i) => selected.has(i))
    if (toImport.length > 0) {
      onImport(toImport)
    }
    handleReset()
    onClose()
  }

  const handleReset = () => {
    setStep('input')
    setInputText('')
    setParsed([])
    setErrors([])
    setSelected(new Set())
  }

  const toggleSelect = (idx: number) => {
    const next = new Set(selected)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    setSelected(next)
  }

  return (
    <div className="modal-overlay" onClick={() => { handleReset(); onClose() }}>
      <div
        className="modal-content"
        style={{ width: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 16 }}>
            {step === 'input' ? '导入供应商' : '确认导入'}
          </h3>
          <button type="button" className="close-btn" onClick={() => { handleReset(); onClose() }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
          {step === 'input' && (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
                粘贴供应商编码（kelivo-provider: 格式），支持多行批量导入。
              </p>

              <textarea
                style={{
                  width: '100%',
                  height: 180,
                  resize: 'vertical',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-2)',
                  color: 'var(--text)',
                  outline: 'none'
                }}
                placeholder="kelivo-provider:eyJ..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                autoFocus
              />

              {errors.length > 0 && parsed.length === 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
                  {errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </>
          )}

          {step === 'preview' && (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
                解析到 {parsed.length} 个供应商，选择要导入的：
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {parsed.map((item, idx) => {
                  const conflict = existingIds.has(item.config.id)
                  return (
                    <label
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: selected.has(idx) ? 'var(--surface-2)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 0.15s'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(idx)}
                        onChange={() => toggleSelect(idx)}
                        style={{ width: 16, height: 16, flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {item.config.name}
                          {conflict && (
                            <span style={{
                              marginLeft: 8,
                              fontSize: 11,
                              color: 'var(--warning, #f59e0b)',
                              background: 'rgba(245,158,11,0.12)',
                              padding: '1px 6px',
                              borderRadius: 4
                            }}>
                              已存在，将覆盖
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                          {item.config.baseUrl}
                          {item.config.models?.length ? ` · ${item.config.models.length} 个模型` : ''}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>

              {errors.length > 0 && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-3)' }}>
                  {errors.length} 条记录解析失败：
                  {errors.map((e, i) => <div key={i} style={{ color: 'var(--danger)' }}>{e}</div>)}
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部按钮 */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8
        }}>
          {step === 'input' && (
            <>
              <button type="button" className="desk-button" onClick={() => { handleReset(); onClose() }}>
                取消
              </button>
              <button
                type="button"
                className="desk-button primary"
                disabled={!inputText.trim()}
                onClick={handleParse}
              >
                解析
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button type="button" className="desk-button" onClick={() => setStep('input')}>
                返回
              </button>
              <button
                type="button"
                className="desk-button primary"
                disabled={selected.size === 0}
                onClick={handleConfirm}
              >
                导入 {selected.size} 个
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
