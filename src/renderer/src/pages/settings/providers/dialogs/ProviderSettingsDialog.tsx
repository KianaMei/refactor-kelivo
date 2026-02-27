import { useState } from 'react'
import type { ProviderConfigV2 } from '../../../../../../shared/types'
import { CustomSelect } from '../../../../components/ui/CustomSelect'
import { useDialogClose } from '../../../../hooks/useDialogClose'

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI Chat' },
  { value: 'openai_response', label: 'OpenAI Response' },
  { value: 'google', label: 'Google AI' },
  { value: 'claude', label: 'Anthropic Claude' }
]

export function ProviderSettingsDialog({
  open,
  provider,
  onSave,
  onClose
}: {
  open: boolean
  provider: ProviderConfigV2
  onSave: (updated: ProviderConfigV2) => Promise<void>
  onClose: () => void
}) {
  // 设置状态
  const [providerType, setProviderType] = useState(provider.providerType || 'openai')
  const [multiKeyEnabled, setMultiKeyEnabled] = useState(provider.multiKeyEnabled || false)
  const [vertexAI, setVertexAI] = useState(provider.vertexAI || false)
  const [proxyEnabled, setProxyEnabled] = useState(provider.proxyEnabled || false)
  const [proxyHost, setProxyHost] = useState(provider.proxyHost || '')
  const [proxyPort, setProxyPort] = useState(provider.proxyPort || '8080')
  const [proxyUsername, setProxyUsername] = useState(provider.proxyUsername || '')
  const [proxyPassword, setProxyPassword] = useState(provider.proxyPassword || '')

  useDialogClose(open, onClose)

  if (!open) return null

  // 保存更改
  const saveField = async (updates: Partial<ProviderConfigV2>) => {
    await onSave({
      ...provider,
      ...updates,
      updatedAt: new Date().toISOString()
    })
  }

  // 行布局
  const SettingRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0' }}>
      <span style={{ flex: 1, fontSize: 14, color: 'var(--text)' }}>{label}</span>
      <div style={{ width: 240 }}>{children}</div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 500, maxHeight: '80vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{provider.name || provider.id}</h3>
          <button type="button" className="close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '8px 16px 16px' }}>
          {/* 供应商类型 */}
          <SettingRow label="供应商类型">
            <CustomSelect
              value={providerType}
              onChange={(val) => {
                const v = val as 'openai' | 'openai_response' | 'google' | 'claude'
                setProviderType(v)
                void saveField({ providerType: v, useResponseApi: v === 'openai_response' })
              }}
              options={PROVIDER_TYPES}
              className="input-detail"
              width="100%"
            />
          </SettingRow>

          {/* 多 Key 模式 */}
          <SettingRow label="多 Key 模式">
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={multiKeyEnabled}
                  onChange={(e) => {
                    setMultiKeyEnabled(e.target.checked)
                    void saveField({ multiKeyEnabled: e.target.checked })
                  }}
                />
                <span className="slider"></span>
              </label>
            </div>
          </SettingRow>

          {/* Vertex AI (仅 Google) */}
          {providerType === 'google' && (
            <SettingRow label="使用 Vertex AI">
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={vertexAI}
                    onChange={(e) => {
                      setVertexAI(e.target.checked)
                      void saveField({ vertexAI: e.target.checked })
                    }}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </SettingRow>
          )}

          {/* 网络代理 */}
          <SettingRow label="网络代理">
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={proxyEnabled}
                  onChange={(e) => {
                    setProxyEnabled(e.target.checked)
                    void saveField({ proxyEnabled: e.target.checked })
                  }}
                />
                <span className="slider"></span>
              </label>
            </div>
          </SettingRow>

          {/* 代理设置详情 */}
          {proxyEnabled && (
            <div
              style={{
                background: 'var(--bg-2)',
                borderRadius: 8,
                padding: 12,
                marginTop: 8
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
                  主机地址
                </label>
                <input
                  className="input-detail"
                  value={proxyHost}
                  onChange={(e) => setProxyHost(e.target.value)}
                  onBlur={() => void saveField({ proxyHost })}
                  placeholder="127.0.0.1"
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
                  端口
                </label>
                <input
                  className="input-detail"
                  value={proxyPort}
                  onChange={(e) => setProxyPort(e.target.value)}
                  onBlur={() => void saveField({ proxyPort })}
                  placeholder="8080"
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
                  用户名（可选）
                </label>
                <input
                  className="input-detail"
                  value={proxyUsername}
                  onChange={(e) => setProxyUsername(e.target.value)}
                  onBlur={() => void saveField({ proxyUsername })}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
                  密码（可选）
                </label>
                <input
                  className="input-detail"
                  type="password"
                  value={proxyPassword}
                  onChange={(e) => setProxyPassword(e.target.value)}
                  onBlur={() => void saveField({ proxyPassword })}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
