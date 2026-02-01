import { useEffect, useState } from 'react'
import type { ProviderConfigV2 } from '../../../../../../shared/types'
import { useDialogClose } from '../../../../hooks/useDialogClose'

type TestState = 'idle' | 'loading' | 'success' | 'error'

export function ConnectionTestDialog({
  open,
  provider,
  onClose
}: {
  open: boolean
  provider: ProviderConfigV2
  onClose: () => void
}) {
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [testState, setTestState] = useState<TestState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useDialogClose(open, onClose)

  // 初始化时选择第一个模型
  useEffect(() => {
    if (open) {
      setTestState('idle')
      setErrorMessage('')
      const models = provider.models || []
      if (models.length > 0) {
        setSelectedModelId(models[0])
      } else {
        setSelectedModelId('')
      }
    }
  }, [open, provider.models])

  // 执行测试
  const handleTest = async () => {
    if (!selectedModelId) return

    setTestState('loading')
    setErrorMessage('')

    try {
      // 调用 API 测试连接
      await window.api.chat.test(provider.id, selectedModelId)
      setTestState('success')
    } catch (e) {
      setTestState('error')
      setErrorMessage(e instanceof Error ? e.message : String(e))
    }
  }

  if (!open) return null

  const models = provider.models || []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-surface" style={{ width: 400, padding: 0 }} onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)'
          }}
        >
          <button type="button" className="toolbar-icon-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <h4 style={{ flex: 1, textAlign: 'center', margin: 0, fontSize: 16, fontWeight: 600 }}>测试连接</h4>
          <div style={{ width: 36 }} />
        </div>

        {/* 内容 */}
        <div style={{ padding: '20px' }}>
          {/* 模型选择 */}
          <div style={{ marginBottom: 16 }}>
            <label className="input-label">选择模型</label>
            {models.length === 0 ? (
              <div
                style={{
                  padding: '12px',
                  background: 'var(--surface-2)',
                  borderRadius: 10,
                  color: 'var(--text-3)',
                  fontSize: 13,
                  textAlign: 'center'
                }}
              >
                暂无模型，请先获取或添加模型
              </div>
            ) : (
              <select
                className="input-detail"
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                disabled={testState === 'loading'}
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 测试状态显示 */}
          {testState === 'loading' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '16px',
                background: 'var(--surface-2)',
                borderRadius: 10,
                marginBottom: 16
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2"
                className="spinning"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span style={{ color: 'var(--text-2)', fontSize: 14 }}>正在测试连接...</span>
            </div>
          )}

          {testState === 'success' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '16px',
                background: 'var(--success-bg)',
                borderRadius: 10,
                marginBottom: 16
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="m9 11 3 3L22 4" />
              </svg>
              <span style={{ color: 'var(--success)', fontSize: 14, fontWeight: 500 }}>连接成功</span>
            </div>
          )}

          {testState === 'error' && (
            <div
              style={{
                padding: '16px',
                background: 'var(--danger-bg)',
                borderRadius: 10,
                marginBottom: 16
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--danger)"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="m15 9-6 6M9 9l6 6" />
                </svg>
                <span style={{ color: 'var(--danger)', fontSize: 14, fontWeight: 500 }}>连接失败</span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--danger)',
                  opacity: 0.8,
                  wordBreak: 'break-all'
                }}
              >
                {errorMessage}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8
          }}
        >
          <button className="desk-button" onClick={onClose}>
            关闭
          </button>
          <button className="desk-button filled" disabled={!selectedModelId || testState === 'loading'} onClick={handleTest}>
            {testState === 'loading' ? '测试中...' : '测试'}
          </button>
        </div>
      </div>
    </div>
  )
}

