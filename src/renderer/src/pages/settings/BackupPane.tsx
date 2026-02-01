import { useState } from 'react'
import { Download, FolderOpen, RefreshCw, Upload, Trash2, CloudUpload, HardDrive, CheckCircle, XCircle } from 'lucide-react'

export function BackupPane() {
  const [webdavUrl, setWebdavUrl] = useState('')
  const [webdavUsername, setWebdavUsername] = useState('')
  const [webdavPassword, setWebdavPassword] = useState('')
  const [webdavPath, setWebdavPath] = useState('kelivo_backups')
  const [includeChats, setIncludeChats] = useState(true)
  const [includeFiles, setIncludeFiles] = useState(true)

  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleExportLocal() {
    // TODO: IPC 调用主进程导出 ZIP
  }

  async function handleImportLocal() {
    // TODO: IPC 调用主进程导入 ZIP
  }

  async function handleWebdavSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      // TODO: IPC 调用主进程同步 WebDAV
      await new Promise((r) => setTimeout(r, 2000))
      setSyncResult({ ok: true, message: '同步完成' })
    } catch (e) {
      setSyncResult({ ok: false, message: `同步失败: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setSyncing(false)
    }
  }

  async function handleClearData() {
    if (!confirm('确定要清除所有本地数据吗？此操作不可撤销。')) return
    // TODO: IPC 清除
  }

  return (
    <div style={s.root}>
      <div style={s.header}>备份</div>

      {/* 本地备份 */}
      <div className="settingsCard">
        <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center' }}>
          <HardDrive size={15} style={{ marginRight: 6 }} />
          本地备份
        </div>
        <div style={s.hint}>
          导出或导入本地数据（ZIP 格式），包含对话记录、设置和附件。
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-sm" onClick={handleExportLocal} style={{ gap: 4 }}>
            <Download size={13} />
            导出到文件
          </button>
          <button type="button" className="btn btn-sm" onClick={handleImportLocal} style={{ gap: 4 }}>
            <Upload size={13} />
            从文件导入
          </button>
        </div>
      </div>

      {/* WebDAV 同步 */}
      <div className="settingsCard">
        <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center' }}>
          <CloudUpload size={15} style={{ marginRight: 6 }} />
          WebDAV 同步
        </div>

        <div style={s.labeledRow}>
          <span style={s.rowLabel}>服务器地址</span>
          <input
            className="input"
            style={{ width: 280 }}
            placeholder="https://dav.example.com/dav"
            value={webdavUrl}
            onChange={(e) => setWebdavUrl(e.target.value)}
          />
        </div>
        <div style={s.divider} />

        <div style={s.labeledRow}>
          <span style={s.rowLabel}>用户名</span>
          <input
            className="input"
            style={{ width: 180 }}
            placeholder="用户名"
            value={webdavUsername}
            onChange={(e) => setWebdavUsername(e.target.value)}
          />
        </div>
        <div style={s.divider} />

        <div style={s.labeledRow}>
          <span style={s.rowLabel}>密码</span>
          <input
            className="input"
            type="password"
            style={{ width: 180 }}
            placeholder="密码"
            value={webdavPassword}
            onChange={(e) => setWebdavPassword(e.target.value)}
          />
        </div>
        <div style={s.divider} />

        <div style={s.labeledRow}>
          <span style={s.rowLabel}>远程路径</span>
          <input
            className="input"
            style={{ width: 200 }}
            placeholder="kelivo_backups"
            value={webdavPath}
            onChange={(e) => setWebdavPath(e.target.value)}
          />
        </div>
        <div style={s.divider} />

        <div style={s.labeledRow}>
          <span style={s.rowLabel}>包含对话</span>
          <button
            type="button"
            className={`toggle ${includeChats ? 'toggleOn' : ''}`}
            onClick={() => setIncludeChats(!includeChats)}
          >
            <div className="toggleThumb" />
          </button>
        </div>
        <div style={s.divider} />

        <div style={s.labeledRow}>
          <span style={s.rowLabel}>包含附件</span>
          <button
            type="button"
            className={`toggle ${includeFiles ? 'toggleOn' : ''}`}
            onClick={() => setIncludeFiles(!includeFiles)}
          >
            <div className="toggleThumb" />
          </button>
        </div>
        <div style={s.divider} />

        <div style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={handleWebdavSync}
            disabled={syncing}
            style={{ gap: 4 }}
          >
            <RefreshCw size={13} className={syncing ? 'spin' : ''} />
            {syncing ? '同步中...' : '立即同步'}
          </button>
          {syncResult && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
              {syncResult.ok
                ? <CheckCircle size={14} style={{ color: '#22c55e' }} />
                : <XCircle size={14} style={{ color: '#ef4444' }} />}
              <span style={{ color: syncResult.ok ? '#22c55e' : '#ef4444' }}>{syncResult.message}</span>
            </div>
          )}
        </div>
      </div>

      {/* 数据目录 */}
      <div className="settingsCard">
        <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center' }}>
          <FolderOpen size={15} style={{ marginRight: 6 }} />
          数据目录
        </div>
        <div style={s.hint}>
          本地数据存储在应用的 userData 目录中。
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-sm btn-ghost" style={{ gap: 4 }}>
            <FolderOpen size={13} />
            打开数据目录
          </button>
        </div>
      </div>

      {/* 危险操作 */}
      <div className="settingsCard">
        <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center' }}>
          <Trash2 size={15} style={{ marginRight: 6, color: '#ef4444' }} />
          <span style={{ color: '#ef4444' }}>危险操作</span>
        </div>
        <div style={s.hint}>
          清除所有本地数据，包括对话记录、设置和附件。此操作不可撤销。
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-sm btn-danger" onClick={handleClearData} style={{ gap: 4 }}>
            <Trash2 size={13} />
            清除所有数据
          </button>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { padding: 20, maxWidth: 640, margin: '0 auto' },
  header: { fontSize: 16, fontWeight: 700, marginBottom: 16 },
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
