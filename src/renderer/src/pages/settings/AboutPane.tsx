import { ExternalLink, Github, Heart, Sparkles } from 'lucide-react'

export function AboutPane() {
  const version = '0.1.0'
  const buildNumber = '1'
  const platform = 'Windows (Electron)'

  function openUrl(url: string) {
    window.open(url, '_blank')
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>关于</div>
      <div style={styles.divider} />

      <div style={styles.logoSection}>
        <div style={styles.logoCircle}>
          <Sparkles size={32} style={{ color: 'var(--primary)' }} />
        </div>
        <div style={styles.appName}>Kelivo</div>
        <div style={styles.version}>v{version} ({buildNumber})</div>
        <div style={styles.platform}>{platform}</div>
      </div>

      <div className="settingsCard">
        <div style={styles.cardTitle}>项目链接</div>
        <LinkRow
          icon={<Github size={18} />}
          label="GitHub 仓库"
          href="https://github.com/AreaSongWcc/kelivo"
          onClick={() => openUrl('https://github.com/AreaSongWcc/kelivo')}
        />
        <RowDivider />
        <LinkRow
          icon={<Heart size={18} />}
          label="赞助与支持"
          href="https://github.com/sponsors/AreaSongWcc"
          onClick={() => openUrl('https://github.com/sponsors/AreaSongWcc')}
        />
      </div>

      <div className="settingsCard">
        <div style={styles.cardTitle}>开发信息</div>
        <InfoRow label="版本" value={`${version} (${buildNumber})`} />
        <RowDivider />
        <InfoRow label="平台" value={platform} />
        <RowDivider />
        <InfoRow label="技术栈" value="Electron + React + TypeScript" />
        <RowDivider />
        <InfoRow label="构建工具" value="electron-vite + electron-builder" />
      </div>

      <div className="settingsCard">
        <div style={styles.cardTitle}>开源许可</div>
        <div style={styles.licenseText}>
          本项目基于 MIT 许可证开源。
          <br />
          使用的第三方库遵循各自的开源许可协议。
        </div>
      </div>

      <div style={styles.footer}>
        <div style={styles.footerText}>Made with ❤️ by AreaSongWcc</div>
        <div style={styles.footerCopy}>© 2024-2026 Kelivo</div>
      </div>
    </div>
  )
}

function RowDivider() {
  return <div style={styles.rowDivider} />
}

function InfoRow(props: { label: string; value: string }) {
  return (
    <div style={styles.infoRow}>
      <div style={styles.infoLabel}>{props.label}</div>
      <div style={styles.infoValue}>{props.value}</div>
    </div>
  )
}

function LinkRow(props: { icon: React.ReactNode; label: string; href: string; onClick: () => void }) {
  return (
    <button type="button" className="btn btn-ghost" style={styles.linkRow} onClick={props.onClick}>
      {props.icon}
      <span style={{ flex: 1, textAlign: 'left' }}>{props.label}</span>
      <ExternalLink size={14} style={{ opacity: 0.6 }} />
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: '16px 16px 32px',
    maxWidth: 640,
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
    marginBottom: 24
  },
  logoSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 24
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: 'var(--primary-2)',
    border: '1px solid var(--primary-3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  appName: {
    fontSize: 22,
    fontWeight: 800,
    marginBottom: 4
  },
  version: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 2
  },
  platform: {
    fontSize: 12,
    opacity: 0.6
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
    margin: '4px 0',
    opacity: 0.5
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 4px'
  },
  infoLabel: {
    fontSize: 14,
    opacity: 0.8
  },
  infoValue: {
    fontSize: 14,
    fontWeight: 500
  },
  linkRow: {
    width: '100%',
    justifyContent: 'flex-start',
    gap: 10,
    padding: '10px 8px'
  },
  licenseText: {
    fontSize: 13,
    lineHeight: 1.6,
    opacity: 0.8,
    padding: '4px'
  },
  footer: {
    marginTop: 32,
    textAlign: 'center'
  },
  footerText: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 4
  },
  footerCopy: {
    fontSize: 12,
    opacity: 0.5
  }
}
