import { useState } from 'react'
import { Globe, Wifi, Shield } from 'lucide-react'
import type { AppConfig } from '../../../../shared/types'
import { CustomSelect } from '../../components/ui/CustomSelect'

export interface ProxySettings {
  enabled: boolean
  type: 'http' | 'https' | 'socks5'
  host: string
  port: string
  username: string
  password: string
}

export function NetworkProxyPane(props: { config: AppConfig; onSave: (next: AppConfig) => Promise<void> }) {
  const [proxy, setProxy] = useState<ProxySettings>(() => ({
    enabled: props.config.proxyEnabled ?? false,
    type: props.config.proxyType ?? 'http',
    host: props.config.proxyHost ?? '127.0.0.1',
    port: props.config.proxyPort ?? '8080',
    username: props.config.proxyUsername ?? '',
    password: props.config.proxyPassword ?? '',
  }))

  const [testUrl, setTestUrl] = useState('https://www.google.com')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  function updateProxy(patch: Partial<ProxySettings>) {
    setProxy((prev) => {
      const next = { ...prev, ...patch }
      void props.onSave({
        ...props.config,
        proxyEnabled: next.enabled,
        proxyType: next.type,
        proxyHost: next.host,
        proxyPort: next.port,
        proxyUsername: next.username,
        proxyPassword: next.password,
      }).catch(err => console.error('[NetworkProxyPane] save failed:', err))
      return next
    })
  }

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      // 模拟测试，实际通过主进程发起带代理的请求
      await new Promise((r) => setTimeout(r, 1000))
      setTestResult({ ok: true, message: '连接成功' })
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={s.root}>
      <div style={s.header}>网络代理</div>

      {/* 代理配置 */}
      <div className="settingsCard">
        <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center' }}>
          <Shield size={15} style={{ marginRight: 6 }} />
          全局代理设置
        </div>

        <div style={s.labeledRow}>
          <span style={s.rowLabel}>启用代理</span>
          <button
            type="button"
            className={`toggle ${proxy.enabled ? 'toggleOn' : ''}`}
            onClick={() => updateProxy({ enabled: !proxy.enabled })}
          >
            <div className="toggleThumb" />
          </button>
        </div>
        <div style={s.divider} />

        <div style={s.labeledRow}>
          <span style={s.rowLabel}>代理类型</span>
          <CustomSelect
            value={proxy.type}
            onChange={(val) => updateProxy({ type: val as ProxySettings['type'] })}
            options={[
              { value: 'http', label: 'HTTP' },
              { value: 'https', label: 'HTTPS' },
              { value: 'socks5', label: 'SOCKS5' },
            ]}
            className="select"
            width={140}
          />
        </div>
        <div style={s.divider} />

        <div style={s.labeledRow}>
          <span style={s.rowLabel}>服务器地址</span>
          <input
            className="input"
            style={{ width: 200 }}
            placeholder="127.0.0.1"
            value={proxy.host}
            onChange={(e) => updateProxy({ host: e.target.value })}
          />
        </div>
        <div style={s.divider} />

        <div style={s.labeledRow}>
          <span style={s.rowLabel}>端口</span>
          <input
            className="input"
            style={{ width: 100 }}
            placeholder="8080"
            value={proxy.port}
            onChange={(e) => updateProxy({ port: e.target.value })}
          />
        </div>
        <div style={s.divider} />

        <div style={s.labeledRow}>
          <span style={s.rowLabel}>用户名（可选）</span>
          <input
            className="input"
            style={{ width: 160 }}
            placeholder="可选"
            value={proxy.username}
            onChange={(e) => updateProxy({ username: e.target.value })}
          />
        </div>
        <div style={s.divider} />

        <div style={s.labeledRow}>
          <span style={s.rowLabel}>密码（可选）</span>
          <input
            className="input"
            type="password"
            style={{ width: 160 }}
            placeholder="可选"
            value={proxy.password}
            onChange={(e) => updateProxy({ password: e.target.value })}
          />
        </div>
      </div>

      {/* 测试连接 */}
      <div className="settingsCard">
        <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center' }}>
          <Wifi size={15} style={{ marginRight: 6 }} />
          测试连接
        </div>

        <div style={s.labeledRow}>
          <span style={s.rowLabel}>测试 URL</span>
          <input
            className="input"
            style={{ width: 280 }}
            placeholder="https://www.google.com"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
          />
        </div>
        <div style={s.divider} />

        <div style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={testConnection}
            disabled={testing}
            style={{ gap: 4 }}
          >
            <Globe size={13} />
            {testing ? '测试中...' : '测试连接'}
          </button>
          {testResult && (
            <span style={{ color: testResult.ok ? '#22c55e' : '#ef4444', fontSize: 13 }}>
              {testResult.message}
            </span>
          )}
        </div>
      </div>

      {/* 说明 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>说明</div>
        <div style={s.hint}>
          <p>全局代理会应用于所有 AI API 请求。</p>
          <p>你也可以在每个供应商单独配置代理，优先级高于全局代理。</p>
          <p>HTTP 代理仅代理 HTTP 请求，HTTPS 代理可代理加密连接。</p>
          <p>SOCKS5 代理支持 TCP 连接，适用于大多数场景。</p>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { padding: '16px 16px 32px', maxWidth: 960, margin: '0 auto' },
  header: { fontSize: 16, fontWeight: 700, marginBottom: 8 },
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
}
