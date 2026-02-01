import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import type { ProviderConfigV2 } from '../../../../../../shared/types'
import { encodeProvider } from '../../../../../../shared/providerCodec'
import { useDialogClose } from '../../../../hooks/useDialogClose'

export function ShareProviderDialog({
  open,
  provider,
  onClose
}: {
  open: boolean
  provider: ProviderConfigV2
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [qrError, setQrError] = useState(false)

  // 全量编码
  const shareCode = useMemo(() => encodeProvider(provider), [provider])

  // 生成 QR 码（全量字段可能太长，超出 QR 容量则跳过）
  useEffect(() => {
    if (!open || !shareCode) return
    setQrError(false)
    QRCode.toDataURL(shareCode, {
      width: 180,
      margin: 2,
      errorCorrectionLevel: 'L',
      color: { dark: '#000', light: '#fff' }
    })
      .then(setQrDataUrl)
      .catch(() => setQrError(true))
  }, [open, shareCode])

  useDialogClose(open, onClose)

  if (!open) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Copy failed:', e)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: 420, maxHeight: '80vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 16 }}>分享供应商</h3>
          <button type="button" className="close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
            复制下方编码，可在 Kelivo（Flutter / Electron）中导入此供应商的完整配置。
          </p>

          {/* QR Code */}
          {!qrError && (
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                border: '1px solid var(--border)',
                textAlign: 'center'
              }}
            >
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Code" style={{ width: 180, height: 180 }} />
              ) : (
                <div
                  style={{
                    width: 180,
                    height: 180,
                    margin: '0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#999'
                  }}
                >
                  生成中...
                </div>
              )}
            </div>
          )}

          {qrError && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12, textAlign: 'center' }}>
              配置数据较大，无法生成二维码，请使用复制编码方式分享。
            </div>
          )}

          {/* 编码文本 */}
          <div
            style={{
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              wordBreak: 'break-all',
              marginBottom: 16,
              maxHeight: 120,
              overflow: 'auto',
              fontFamily: 'monospace'
            }}
          >
            {shareCode}
          </div>

          {/* 统计信息 */}
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>
            包含: {provider.models?.length || 0} 个模型
            {provider.multiKeyEnabled && provider.apiKeys?.length ? `, ${provider.apiKeys.length} 个 API Key` : ''}
            {provider.proxyEnabled ? ', 代理配置' : ''}
          </div>

          {/* 操作按钮 */}
          <button type="button" className="desk-button primary" style={{ width: '100%' }} onClick={handleCopy}>
            {copied ? '已复制!' : '复制编码'}
          </button>
        </div>
      </div>
    </div>
  )
}
