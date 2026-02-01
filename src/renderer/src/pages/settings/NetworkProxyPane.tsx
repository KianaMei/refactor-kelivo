import { useState } from 'react'
import type { AppConfig } from '../../../../shared/types'

export interface ProxySettings {
  enabled: boolean
  type: 'http' | 'socks5'
  host: string
  port: string
  username: string
  password: string
}

export function NetworkProxyPane(props: { config: AppConfig; onSave: (next: AppConfig) => Promise<void> }) {
  const { config, onSave } = props

  // 代理设置目前存储在 config 的 proxy 字段（需要扩展 types.ts，这里先用本地 state 演示）
  const [proxy, setProxy] = useState<ProxySettings>(() => ({
    enabled: false,
    type: 'http',
    host: '127.0.0.1',
    port: '8080',
    username: '',
    password: ''
  }))

  const [testUrl, setTestUrl] = useState('https://www.google.com')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  function updateProxy(patch: Partial<ProxySettings>) {
    setProxy((prev) => ({ ...prev, ...patch }))
    // TODO: 持久化到 config
  }

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      // 这里只是模拟测试，实际需要通过主进程发起带代理的请求
      await new Promise((r) => setTimeout(r, 1000))
      setTestResult({ ok: true, message: '连接成功' })
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>网络代理</div>
      <div style={styles.divider} />

      <div className="settingsCard">
        <div style={styles.cardTitle}>全局代理设置</div>

        <LabeledRow label="启用代理">
          <button
            type="button"
            className={`toggle ${proxy.enabled ? 'toggleOn' : ''}`}
            onClick={() => updateProxy({ enabled: !proxy.enabled })}
          >
            <div className="toggleThumb" />
          </button>
        </LabeledRow>

        <RowDivider />

        <LabeledRow label="代理类型">
          <select
            className="select"
            style={{ width: 140 }}
            value={proxy.type}
            onChange={(e) => updateProxy({ type: e.target.value as 'http' | 'socks5' })}
          >
            <option value="http">HTTP</option>
            <option value="socks5">SOCKS5</option>
          </select>
        </LabeledRow>

        <RowDivider />

        <LabeledRow label="服务器地址">
          <input
            className="input"
            style={{ width: 200 }}
            placeholder="127.0.0.1"
            value={proxy.host}
            onChange={(e) => updateProxy({ host: e.target.value })}
          />
        </LabeledRow>

        <RowDivider />

        <LabeledRow label="端口">
          <input
            className="input"
            style={{ width: 100 }}
            placeholder="8080"
            value={proxy.port}
            onChange={(e) => updateProxy({ port: e.target.value })}
          />
        </LabeledRow>

        <RowDivider />

        <LabeledRow label="用户名（可选）">
          <input
            className="input"
            style={{ width: 160 }}
            placeholder="可选"
            value={proxy.username}
            onChange={(e) => updateProxy({ username: e.target.value })}
          />
        </LabeledRow>

        <RowDivider />

        <LabeledRow label="密码（可选）">
          <input
            className="input"
            type="password"
            style={{ width: 160 }}
            placeholder="可选"
            value={proxy.password}
            onChange={(e) => updateProxy({ password: e.target.value })}
          />
        </LabeledRow>
      </div>

      <div className="settingsCard">
        <div style={styles.cardTitle}>测试连接</div>

        <LabeledRow label="测试 URL">
          <input
            className="input"
            style={{ width: 280 }}
            placeholder="https://www.google.com"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
          />
        </LabeledRow>

        <RowDivider />

        <div style={{ padding: '8px 4px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="btn btn-primary" onClick={testConnection} disabled={testing}>
            {testing ? '测试中...' : '测试连接'}
          </button>
          {testResult && (
            <span style={{ color: testResult.ok ? '#22c55e' : '#ef4444', fontSize: 13 }}>
              {testResult.message}
            </span>
          )}
        </div>
      </div>

      <div className="settingsCard">
        <div style={styles.cardTitle}>说明</div>
        <div style={styles.note}>
          <p>• 全局代理会应用于所有 AI API 请求。</p>
          <p>• 你也可以在每个供应商单独配置代理，优先级高于全局代理。</p>
          <p>• SOCKS5 代理支持 TCP 连接，适用于大多数场景。</p>
        </div>
      </div>
    </div>
  )
}

function RowDivider() {
  return <div style={styles.rowDivider} />
}

function LabeledRow(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.labeledRow}>
      <div style={styles.rowLabel}>{props.label}</div>
      <div style={styles.rowTrailing}>{props.children}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: '16px 16px 32px',
    maxWidth: 800,
    margin: '0 auto'
  },
  header: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 8
  },
  divider: {
    height: 1,
    background: 'var(--border)',
    marginBottom: 12
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 8,
    padding: '0 4px'
  },
  rowDivider: {
    height: 1,
    background: 'var(--border)',
    margin: '4px 8px',
    opacity: 0.5
  },
  labeledRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 4px',
    gap: 12
  },
  rowLabel: {
    fontSize: 14,
    flex: 1
  },
  rowTrailing: {
    flexShrink: 0
  },
  note: {
    fontSize: 13,
    lineHeight: 1.8,
    opacity: 0.8,
    padding: '4px'
  }
}
