import { useState } from 'react'
import { Download, FolderOpen, RefreshCw, Upload, Trash2, CloudUpload, HardDrive } from 'lucide-react'

export function BackupPane() {
  const [webdavUrl, setWebdavUrl] = useState('')
  const [webdavUsername, setWebdavUsername] = useState('')
  const [webdavPassword, setWebdavPassword] = useState('')
  const [webdavPath, setWebdavPath] = useState('kelivo_backups')
  const [includeChats, setIncludeChats] = useState(true)
  const [includeFiles, setIncludeFiles] = useState(true)

  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  async function handleExportLocal() {
    // TODO: 通过 IPC 调用主进程导出 ZIP
    alert('导出功能开发中...')
  }

  async function handleImportLocal() {
    // TODO: 通过 IPC 调用主进程导入 ZIP
    alert('导入功能开发中...')
  }

  async function handleWebdavSync() {
    setSyncing(true)
    setSyncStatus('同步中...')
    try {
      // TODO: 通过 IPC 调用主进程同步 WebDAV
      await new Promise((r) => setTimeout(r, 2000))
      setSyncStatus('同步完成')
    } catch (e) {
      setSyncStatus(`同步失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSyncing(false)
    }
  }

  async function handleClearData() {
    if (!confirm('确定要清除所有本地数据吗？此操作不可撤销。')) return
    alert('清除功能开发中...')
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>备份</div>
      <div style={styles.divider} />

      <div className="settingsCard">
        <div style={styles.cardTitle}>
          <HardDrive size={18} style={{ marginRight: 8 }} />
          本地备份
        </div>
        <div style={styles.note}>
          导出或导入本地数据（ZIP 格式），包含对话记录、设置和附件。
        </div>
        <div style={styles.buttonRow}>
          <button type="button" className="btn" onClick={handleExportLocal}>
            <Download size={16} />
            导出到文件
          </button>
          <button type="button" className="btn" onClick={handleImportLocal}>
            <Upload size={16} />
            从文件导入
          </button>
        </div>
      </div>

      <div className="settingsCard">
        <div style={styles.cardTitle}>
          <CloudUpload size={18} style={{ marginRight: 8 }} />
          WebDAV 同步
        </div>

        <LabeledRow label="服务器地址">
          <input
            className="input"
            style={{ width: 280 }}
            placeholder="https://dav.example.com/dav"
            value={webdavUrl}
            onChange={(e) => setWebdavUrl(e.target.value)}
          />
        </LabeledRow>

        <RowDivider />

        <LabeledRow label="用户名">
          <input
            className="input"
            style={{ width: 180 }}
            placeholder="用户名"
            value={webdavUsername}
            onChange={(e) => setWebdavUsername(e.target.value)}
          />
        </LabeledRow>

        <RowDivider />

        <LabeledRow label="密码">
          <input
            className="input"
            type="password"
            style={{ width: 180 }}
            placeholder="密码"
            value={webdavPassword}
            onChange={(e) => setWebdavPassword(e.target.value)}
          />
        </LabeledRow>

        <RowDivider />

        <LabeledRow label="远程路径">
          <input
            className="input"
            style={{ width: 200 }}
            placeholder="kelivo_backups"
            value={webdavPath}
            onChange={(e) => setWebdavPath(e.target.value)}
          />
        </LabeledRow>

        <RowDivider />

        <LabeledRow label="包含对话">
          <button
            type="button"
            className={`toggle ${includeChats ? 'toggleOn' : ''}`}
            onClick={() => setIncludeChats(!includeChats)}
          >
            <div className="toggleThumb" />
          </button>
        </LabeledRow>

        <RowDivider />

        <LabeledRow label="包含附件">
          <button
            type="button"
            className={`toggle ${includeFiles ? 'toggleOn' : ''}`}
            onClick={() => setIncludeFiles(!includeFiles)}
          >
            <div className="toggleThumb" />
          </button>
        </LabeledRow>

        <RowDivider />

        <div style={styles.buttonRow}>
          <button type="button" className="btn btn-primary" onClick={handleWebdavSync} disabled={syncing}>
            <RefreshCw size={16} className={syncing ? 'spin' : ''} />
            {syncing ? '同步中...' : '立即同步'}
          </button>
          {syncStatus && <span style={{ fontSize: 13, opacity: 0.8 }}>{syncStatus}</span>}
        </div>
      </div>

      <div className="settingsCard">
        <div style={styles.cardTitle}>
          <FolderOpen size={18} style={{ marginRight: 8 }} />
          数据目录
        </div>
        <div style={styles.note}>
          本地数据存储在应用的 userData 目录中。
        </div>
        <div style={styles.buttonRow}>
          <button type="button" className="btn" onClick={() => alert('打开目录功能开发中...')}>
            <FolderOpen size={16} />
            打开数据目录
          </button>
        </div>
      </div>

      <div className="settingsCard">
        <div style={styles.cardTitle}>
          <Trash2 size={18} style={{ marginRight: 8, color: 'var(--danger)' }} />
          危险操作
        </div>
        <div style={styles.note}>
          清除所有本地数据，包括对话记录、设置和附件。此操作不可撤销。
        </div>
        <div style={styles.buttonRow}>
          <button type="button" className="btn btn-danger" onClick={handleClearData}>
            <Trash2 size={16} />
            清除所有数据
          </button>
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
    padding: '0 4px',
    display: 'flex',
    alignItems: 'center'
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
    lineHeight: 1.6,
    opacity: 0.8,
    padding: '4px 4px 12px'
  },
  buttonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 4px'
  }
}
