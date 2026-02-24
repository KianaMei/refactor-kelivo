import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Download,
  FolderOpen,
  RefreshCw,
  Upload,
  Trash2,
  CloudUpload,
  HardDrive,
  CheckCircle,
  XCircle,
  Plus,
  Settings,
  ChevronDown,
  Wifi,
  Clock,
  FileArchive,
  Eye,
  EyeOff
} from 'lucide-react'
import type { AppConfig, WebDavConfig, BackupFileItem, RestoreMode } from '../../../../shared/types'
import { createDefaultWebDavConfig } from '../../../../shared/types'

type OperationStatus = { type: 'success' | 'error'; message: string } | null
type RestoreSource = 'local' | 'webdav'

interface RestoreDialogState {
  open: boolean
  source: RestoreSource
  mode: RestoreMode
  localBuffer?: Buffer
  localFileName?: string
  remoteItem?: BackupFileItem
}

interface DeleteConfirmState {
  open: boolean
  x: number
  y: number
  file: BackupFileItem | null
}

interface BackupPaneProps {
  config: AppConfig
  onSave: (next: AppConfig) => Promise<void>
}

export function BackupPane({ config, onSave }: BackupPaneProps) {
  const backupConfig = config.backupConfig

  // WebDAV 配置状态
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(
    backupConfig.currentWebdavConfigId
  )
  const [showConfigDropdown, setShowConfigDropdown] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [showEditingPassword, setShowEditingPassword] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭下拉菜单
  useEffect(() => {
    if (!showConfigDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowConfigDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showConfigDropdown])

  // 编辑中的配置
  const [editingConfig, setEditingConfig] = useState<WebDavConfig | null>(null)

  // 远程文件列表
  const [remoteFiles, setRemoteFiles] = useState<BackupFileItem[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  // 操作状态
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  // 结果提示
  const [status, setStatus] = useState<OperationStatus>(null)

  // 恢复弹窗状态
  const [restoreDialog, setRestoreDialog] = useState<RestoreDialogState>({
    open: false,
    source: 'local',
    mode: 'overwrite'
  })
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({
    open: false,
    x: 0,
    y: 0,
    file: null
  })
  const [deletingRemoteHref, setDeletingRemoteHref] = useState<string | null>(null)
  const deleteConfirmRef = useRef<HTMLDivElement>(null)

  // 数据路径
  const [dataPath, setDataPath] = useState<string>('')

  // 获取当前选中的配置
  const currentConfig = backupConfig.webdavConfigs.find((c) => c.id === selectedConfigId) || null
  const editingIsExisting = editingConfig
    ? backupConfig.webdavConfigs.some((c) => c.id === editingConfig.id)
    : false

  // 加载数据路径
  useEffect(() => {
    window.api.backup.getDataPath().then(setDataPath)
  }, [])

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirm({
      open: false,
      x: 0,
      y: 0,
      file: null
    })
  }, [])

  useEffect(() => {
    if (!deleteConfirm.open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!deleteConfirmRef.current) return
      if (!deleteConfirmRef.current.contains(event.target as Node)) {
        closeDeleteConfirm()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDeleteConfirm()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeDeleteConfirm, deleteConfirm.open])

  // 保存配置到 store
  const saveWebdavConfig = useCallback(
    async (cfg: WebDavConfig) => {
      const existing = backupConfig.webdavConfigs.find((c) => c.id === cfg.id)
      const updatedConfigs = existing
        ? backupConfig.webdavConfigs.map((c) => (c.id === cfg.id ? cfg : c))
        : [...backupConfig.webdavConfigs, cfg]

      await onSave({
        ...config,
        backupConfig: {
          ...backupConfig,
          webdavConfigs: updatedConfigs,
          currentWebdavConfigId: cfg.id
        }
      })
      setSelectedConfigId(cfg.id)
    },
    [backupConfig, config, onSave]
  )

  // 删除配置
  const deleteWebdavConfig = useCallback(
    async (id: string) => {
      const updatedConfigs = backupConfig.webdavConfigs.filter((c) => c.id !== id)
      const newCurrentId = updatedConfigs.length > 0 ? updatedConfigs[0].id : null

      await onSave({
        ...config,
        backupConfig: {
          ...backupConfig,
          webdavConfigs: updatedConfigs,
          currentWebdavConfigId: newCurrentId
        }
      })
      setSelectedConfigId(newCurrentId)
      setIsEditing(false)
      setEditingConfig(null)
    },
    [backupConfig, config, onSave]
  )

  // 创建新配置
  const handleNewConfig = () => {
    const id = `webdav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const newConfig = createDefaultWebDavConfig(id, `配置 ${backupConfig.webdavConfigs.length + 1}`)
    setEditingConfig(newConfig)
    setShowEditingPassword(false)
    setIsEditing(true)
    setShowConfigDropdown(false)
  }

  // 编辑现有配置
  const handleEditConfig = () => {
    if (currentConfig) {
      setEditingConfig({ ...currentConfig })
      setShowEditingPassword(false)
      setIsEditing(true)
    }
  }

  // 保存编辑
  const handleSaveEdit = async () => {
    if (editingConfig) {
      await saveWebdavConfig({
        ...editingConfig,
        updatedAt: new Date().toISOString()
      })
      setIsEditing(false)
      setEditingConfig(null)
      setShowEditingPassword(false)
    }
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditingConfig(null)
    setShowEditingPassword(false)
  }

  // 测试连接
  const handleTestConnection = async () => {
    const cfg = editingConfig || currentConfig
    if (!cfg || !cfg.url) {
      setStatus({ type: 'error', message: '请先填写服务器地址' })
      return
    }

    setTesting(true)
    setStatus(null)
    try {
      const result = await window.api.backup.webdavTest(cfg)
      if (result.success) {
        setStatus({ type: 'success', message: '连接成功' })
      } else {
        setStatus({ type: 'error', message: result.error || '连接失败' })
      }
    } catch (e) {
      setStatus({ type: 'error', message: `连接失败: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setTesting(false)
    }
  }

  // 执行备份
  const handleBackup = async () => {
    if (!currentConfig || !currentConfig.url) {
      setStatus({ type: 'error', message: '请先配置 WebDAV 服务器' })
      return
    }

    setSyncing(true)
    setStatus(null)
    try {
      const result = await window.api.backup.webdavBackup(currentConfig)
      if (result.success) {
        setStatus({ type: 'success', message: '备份成功' })
        // 刷新文件列表
        void handleLoadFiles()
      } else {
        setStatus({ type: 'error', message: result.error || '备份失败' })
      }
    } catch (e) {
      setStatus({ type: 'error', message: `备份失败: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setSyncing(false)
    }
  }

  // 加载远程文件列表
  const handleLoadFiles = async () => {
    if (!currentConfig || !currentConfig.url) return

    setLoadingFiles(true)
    try {
      const result = await window.api.backup.webdavList(currentConfig)
      if (result.success) {
        setRemoteFiles(result.items)
      } else {
        setStatus({ type: 'error', message: result.error || '获取文件列表失败' })
      }
    } catch (e) {
      setStatus({ type: 'error', message: `获取文件列表失败: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setLoadingFiles(false)
    }
  }

  // 打开“恢复模式”弹窗（本地导入）
  const openLocalRestoreDialog = (buffer: Buffer, filePath?: string) => {
    const fileName = filePath?.split(/[\\/]/).pop() || 'backup.zip'
    setRestoreDialog({
      open: true,
      source: 'local',
      mode: 'overwrite',
      localBuffer: buffer,
      localFileName: fileName
    })
  }

  // 打开“恢复模式”弹窗（WebDAV 远程恢复）
  const openWebdavRestoreDialog = (item: BackupFileItem) => {
    setRestoreDialog({
      open: true,
      source: 'webdav',
      mode: 'overwrite',
      remoteItem: item
    })
  }

  const closeRestoreDialog = (force = false) => {
    if (!force && (importing || restoring)) return
    setRestoreDialog({
      open: false,
      source: 'local',
      mode: 'overwrite'
    })
  }

  // 在弹窗中确认恢复模式后执行
  const handleConfirmRestore = async () => {
    if (!restoreDialog.open) return

    if (restoreDialog.source === 'local') {
      if (!restoreDialog.localBuffer) return
      setImporting(true)
      setStatus(null)
      try {
        const result = await window.api.backup.importLocal({
          buffer: restoreDialog.localBuffer,
          mode: restoreDialog.mode,
          includeChats: currentConfig?.includeChats ?? true,
          includeAttachments: currentConfig?.includeAttachments ?? true,
          includeGeneratedImages: currentConfig?.includeGeneratedImages ?? false
        })

        if (result.success) {
          setStatus({ type: 'success', message: result.message || '导入成功，部分更改需要重启应用生效。' })
          closeRestoreDialog(true)
        } else {
          setStatus({ type: 'error', message: result.error || '导入失败' })
        }
      } catch (e) {
        setStatus({ type: 'error', message: `导入失败: ${e instanceof Error ? e.message : String(e)}` })
      } finally {
        setImporting(false)
      }
      return
    }

    if (!currentConfig || !restoreDialog.remoteItem) return
    setRestoring(true)
    setStatus(null)
    try {
      const result = await window.api.backup.webdavRestore(currentConfig, restoreDialog.remoteItem, restoreDialog.mode)
      if (result.success) {
        setStatus({ type: 'success', message: result.message || '恢复成功，部分更改需要重启应用生效。' })
        closeRestoreDialog(true)
      } else {
        setStatus({ type: 'error', message: result.error || '恢复失败' })
      }
    } catch (e) {
      setStatus({ type: 'error', message: `恢复失败: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setRestoring(false)
    }
  }

  // 恢复备份
  const handleRestore = (item: BackupFileItem) => {
    if (!currentConfig) return
    openWebdavRestoreDialog(item)
  }

  const openDeleteConfirm = (item: BackupFileItem, event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const popoverWidth = 300
    const popoverHeight = 136
    const gap = 8

    let x = rect.right - popoverWidth
    let y = rect.bottom + gap

    const maxX = window.innerWidth - popoverWidth - 8
    const maxY = window.innerHeight - popoverHeight - 8
    x = Math.max(8, Math.min(x, maxX))
    if (y > maxY) {
      y = Math.max(8, rect.top - popoverHeight - gap)
    }

    setDeleteConfirm({
      open: true,
      x,
      y,
      file: item
    })
  }

  const handleConfirmDeleteRemote = async () => {
    if (!currentConfig || !deleteConfirm.file) return

    const deletingItem = deleteConfirm.file
    closeDeleteConfirm()
    setDeletingRemoteHref(deletingItem.href)

    try {
      const result = await window.api.backup.webdavDelete(currentConfig, deletingItem)
      if (result.success) {
        setRemoteFiles((prev) => prev.filter((f) => f.href !== deletingItem.href))
        setStatus({ type: 'success', message: '删除成功' })
      } else {
        setStatus({ type: 'error', message: result.error || '删除失败' })
      }
    } catch (e) {
      setStatus({ type: 'error', message: `删除失败: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setDeletingRemoteHref(null)
    }
  }

  // 本地导出
  const handleExportLocal = async () => {
    setExporting(true)
    setStatus(null)
    try {
      const result = await window.api.backup.exportLocal({
        includeChats: currentConfig?.includeChats ?? true,
        includeAttachments: currentConfig?.includeAttachments ?? true,
        includeGeneratedImages: currentConfig?.includeGeneratedImages ?? false
      })

      if (result.success && result.data) {
        // 保存文件
        const saveResult = await window.api.dialog.saveFile({
          defaultPath: `kelivo_backup_electron_${Date.now()}.zip`,
          filters: [{ name: 'ZIP 文件', extensions: ['zip'] }]
        })

        if (!saveResult.canceled && saveResult.filePath) {
          await window.api.dialog.writeFile(saveResult.filePath, result.data)
          setStatus({ type: 'success', message: '导出成功' })
        }
      } else {
        setStatus({ type: 'error', message: result.error || '导出失败' })
      }
    } catch (e) {
      setStatus({ type: 'error', message: `导出失败: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setExporting(false)
    }
  }

  // 本地导入
  const handleImportLocal = async () => {
    setStatus(null)
    try {
      const openResult = await window.api.dialog.openFile({
        filters: [{ name: 'ZIP 文件', extensions: ['zip'] }]
      })

      if (!openResult.canceled && openResult.buffer) {
        openLocalRestoreDialog(openResult.buffer, openResult.filePath)
      }
    } catch (e) {
      setStatus({ type: 'error', message: `导入失败: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  // 打开数据目录
  const handleOpenDataDir = async () => {
    await window.api.backup.openDataDir()
  }

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  // 格式化时间
  const formatTime = (isoString: string | null): string => {
    if (!isoString) return '未知'
    const date = new Date(isoString)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div style={s.root}>
      <div style={s.header}>备份</div>

      {/* 状态提示 */}
      {status && (
        <div
          style={{
            ...s.statusBar,
            background: status.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
            color: status.type === 'success' ? 'var(--success)' : 'var(--error)'
          }}
        >
          {status.type === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
          <span>{status.message}</span>
          <button
            type="button"
            style={s.closeBtn}
            onClick={() => setStatus(null)}
          >
            ×
          </button>
        </div>
      )}

      {deleteConfirm.open && deleteConfirm.file && (
        <div style={s.deleteConfirmLayer}>
          <div style={s.deleteConfirmOverlay} onClick={closeDeleteConfirm} />
          <div
            ref={deleteConfirmRef}
            style={{
              ...s.deleteConfirmCard,
              left: deleteConfirm.x,
              top: deleteConfirm.y
            }}
          >
            <div style={s.deleteConfirmTitle}>删除远程备份？</div>
            <div style={s.deleteConfirmText}>{deleteConfirm.file.displayName}</div>
            <div style={s.deleteConfirmActions}>
              <button type="button" className="btn btn-sm" onClick={() => closeDeleteConfirm()}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handleConfirmDeleteRemote}
                disabled={deletingRemoteHref === deleteConfirm.file.href}
              >
                {deletingRemoteHref === deleteConfirm.file.href ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditing && editingConfig && (
        <div style={s.webdavEditOverlay} onClick={handleCancelEdit}>
          <div style={s.webdavEditModal} onClick={(event) => event.stopPropagation()}>
            <div style={s.webdavEditHeader}>
              <div>
                <div style={s.webdavEditTitle}>{editingIsExisting ? '编辑 WebDAV 配置' : '新建 WebDAV 配置'}</div>
                <div style={s.webdavEditSubtitle}>配置服务器信息后可直接用于云端备份与恢复。</div>
              </div>
              <button type="button" style={s.restoreCloseBtn} onClick={handleCancelEdit}>
                ×
              </button>
            </div>

            <div style={s.webdavEditGrid}>
              <label style={s.webdavEditField}>
                <span style={s.webdavEditLabel}>配置名称</span>
                <input
                  className="input"
                  value={editingConfig.name}
                  onChange={(e) => setEditingConfig({ ...editingConfig, name: e.target.value })}
                  placeholder="默认配置"
                />
              </label>
              <label style={s.webdavEditField}>
                <span style={s.webdavEditLabel}>远程路径</span>
                <input
                  className="input"
                  value={editingConfig.path}
                  onChange={(e) => setEditingConfig({ ...editingConfig, path: e.target.value })}
                  placeholder="kelivo_backups"
                />
              </label>
              <label style={{ ...s.webdavEditField, ...s.webdavEditFieldWide }}>
                <span style={s.webdavEditLabel}>服务器地址</span>
                <input
                  className="input"
                  value={editingConfig.url}
                  onChange={(e) => setEditingConfig({ ...editingConfig, url: e.target.value })}
                  placeholder="https://dav.example.com/dav"
                />
              </label>
              <label style={s.webdavEditField}>
                <span style={s.webdavEditLabel}>用户名</span>
                <input
                  className="input"
                  value={editingConfig.username}
                  onChange={(e) => setEditingConfig({ ...editingConfig, username: e.target.value })}
                  placeholder="用户名"
                />
              </label>
              <label style={s.webdavEditField}>
                <span style={s.webdavEditLabel}>密码</span>
                <div style={s.webdavPasswordRow}>
                  <input
                    className="input"
                    type={showEditingPassword ? 'text' : 'password'}
                    value={editingConfig.password}
                    onChange={(e) => setEditingConfig({ ...editingConfig, password: e.target.value })}
                    placeholder="密码"
                    style={s.webdavPasswordInput}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={s.webdavPasswordToggleBtn}
                    onClick={() => setShowEditingPassword((v) => !v)}
                    title={showEditingPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showEditingPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    <span>{showEditingPassword ? '隐藏' : '显示'}</span>
                  </button>
                </div>
              </label>
            </div>

            <div style={s.webdavEditSwitchRow}>
              <div style={s.webdavEditSwitchCard}>
                <div>
                  <div style={s.webdavEditSwitchTitle}>包含对话</div>
                  <div style={s.webdavEditSwitchDesc}>备份对话记录和数据库。</div>
                </div>
                <button
                  type="button"
                  className={`toggle ${editingConfig.includeChats ? 'toggleOn' : ''}`}
                  onClick={() => setEditingConfig({ ...editingConfig, includeChats: !editingConfig.includeChats })}
                >
                  <div className="toggleThumb" />
                </button>
              </div>
              <div style={s.webdavEditSwitchCard}>
                <div>
                  <div style={s.webdavEditSwitchTitle}>包含附件</div>
                  <div style={s.webdavEditSwitchDesc}>备份头像与上传目录。</div>
                </div>
                <button
                  type="button"
                  className={`toggle ${editingConfig.includeAttachments ? 'toggleOn' : ''}`}
                  onClick={() => setEditingConfig({ ...editingConfig, includeAttachments: !editingConfig.includeAttachments })}
                >
                  <div className="toggleThumb" />
                </button>
              </div>
              <div style={s.webdavEditSwitchCard}>
                <div>
                  <div style={s.webdavEditSwitchTitle}>包含生成图片</div>
                  <div style={s.webdavEditSwitchDesc}>备份图片工作室生成目录。</div>
                </div>
                <button
                  type="button"
                  className={`toggle ${editingConfig.includeGeneratedImages ? 'toggleOn' : ''}`}
                  onClick={() => setEditingConfig({ ...editingConfig, includeGeneratedImages: !editingConfig.includeGeneratedImages })}
                >
                  <div className="toggleThumb" />
                </button>
              </div>
            </div>

            <div style={s.webdavEditActions}>
              <div style={s.webdavEditActionsLeft}>
                {editingIsExisting && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => deleteWebdavConfig(editingConfig.id)}
                    style={s.webdavActionBtn}
                  >
                    删除配置
                  </button>
                )}
              </div>
              <div style={s.webdavEditActionsRight}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={handleTestConnection}
                  disabled={testing}
                  style={{ ...s.webdavActionBtn, gap: 4 }}
                >
                  <Wifi size={13} className={testing ? 'spin' : ''} />
                  {testing ? '测试中...' : '测试连接'}
                </button>
                <button type="button" className="btn btn-sm" style={s.webdavActionBtn} onClick={handleCancelEdit}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={s.webdavActionBtn}
                  onClick={handleSaveEdit}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {restoreDialog.open && (
        <div style={s.restoreModalOverlay} onClick={() => closeRestoreDialog()}>
          <div style={s.restoreModal} onClick={(event) => event.stopPropagation()}>
            <div style={s.restoreModalHeader}>
              <div>
                <div style={s.restoreModalTitle}>选择恢复模式</div>
                <div style={s.restoreModalSubtitle}>
                  {restoreDialog.source === 'local'
                    ? `文件：${restoreDialog.localFileName || 'backup.zip'}`
                    : `远程备份：${restoreDialog.remoteItem?.displayName || '-'}`}
                </div>
              </div>
              <button type="button" style={s.restoreCloseBtn} onClick={() => closeRestoreDialog()}>
                ×
              </button>
            </div>

            <div style={s.restoreModeRow}>
              <button
                type="button"
                style={{
                  ...s.restoreModeCard,
                  ...(restoreDialog.mode === 'overwrite' ? s.restoreModeCardActive : null)
                }}
                onClick={() => setRestoreDialog((prev) => ({ ...prev, mode: 'overwrite' }))}
              >
                <div style={s.restoreModeCardTitle}>完全覆盖</div>
                <div style={s.restoreModeCardDesc}>用备份内容替换当前数据，适合完整回滚。</div>
              </button>
              <button
                type="button"
                style={{
                  ...s.restoreModeCard,
                  ...(restoreDialog.mode === 'merge' ? s.restoreModeCardActive : null)
                }}
                onClick={() => setRestoreDialog((prev) => ({ ...prev, mode: 'merge' }))}
              >
                <div style={s.restoreModeCardTitle}>增量合并</div>
                <div style={s.restoreModeCardDesc}>仅导入新增内容，尽量保留当前数据。</div>
              </button>
            </div>

            <div style={s.restoreModalActions}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => closeRestoreDialog()}
                disabled={importing || restoring}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handleConfirmRestore}
                disabled={importing || restoring}
                style={{ minWidth: 110 }}
              >
                {restoreDialog.source === 'local'
                  ? importing
                    ? '正在导入...'
                    : '开始导入'
                  : restoring
                    ? '正在恢复...'
                    : '开始恢复'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={s.mainGrid}>
        {/* 本地备份 */}
        <div className="settingsCard" style={{ ...s.mainCard, ...s.localCard }}>
          <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center' }}>
            <HardDrive size={15} style={{ marginRight: 6 }} />
            本地备份
          </div>
          <div style={s.hint}>导出或导入本地数据（ZIP 格式），包含对话记录、设置和附件。</div>
          <div style={s.localMetaRow}>
            <span style={s.localMetaTag}>ZIP 快照</span>
            <span style={s.localMetaTag}>导入时再选择覆盖/合并</span>
          </div>

          <div style={s.localActionRow}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleExportLocal}
              disabled={exporting}
              style={{ ...s.localActionButton, gap: 4 }}
            >
              <Download size={13} className={exporting ? 'spin' : ''} />
              {exporting ? '导出中...' : '导出到文件'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleImportLocal}
              disabled={importing}
              style={{ ...s.localActionButton, gap: 4 }}
            >
              <Upload size={13} className={importing ? 'spin' : ''} />
              {importing ? '导入中...' : '从文件导入'}
            </button>
          </div>
        </div>

        {/* WebDAV 同步 */}
        <div className="settingsCard" style={{ ...s.mainCard, ...s.webdavCard }}>
          <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <CloudUpload size={15} style={{ marginRight: 6 }} />
              WebDAV 同步
            </div>

            {/* 配置选择器 */}
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => setShowConfigDropdown(!showConfigDropdown)}
                style={{ gap: 4 }}
              >
                {currentConfig ? currentConfig.name : '选择配置'}
                <ChevronDown size={12} />
              </button>

              {showConfigDropdown && (
                <div style={s.dropdown}>
                  {backupConfig.webdavConfigs.map((cfg) => (
                    <div
                      key={cfg.id}
                      style={{
                        ...s.dropdownItem,
                        background: cfg.id === selectedConfigId ? 'var(--hover)' : undefined
                      }}
                      onClick={async () => {
                        setSelectedConfigId(cfg.id)
                        setShowConfigDropdown(false)
                        await onSave({
                          ...config,
                          backupConfig: { ...backupConfig, currentWebdavConfigId: cfg.id }
                        })
                      }}
                    >
                      {cfg.name}
                    </div>
                  ))}
                  <div style={s.dropdownDivider} />
                  <div style={s.dropdownItem} onClick={handleNewConfig}>
                    <Plus size={12} style={{ marginRight: 4 }} />
                    新建配置
                  </div>
                </div>
              )}
            </div>
          </div>

          {currentConfig ? (
            <div style={{ marginTop: 12 }}>
              {/* 显示当前配置信息 */}
              <div style={s.configInfo}>
                <div style={s.configRow}>
                  <span style={s.configLabel}>服务器:</span>
                  <span style={s.configValue}>{currentConfig.url || '未配置'}</span>
                </div>
                <div style={s.configRow}>
                  <span style={s.configLabel}>用户名:</span>
                  <span style={s.configValue}>{currentConfig.username || '未配置'}</span>
                </div>
                <div style={s.configRow}>
                  <span style={s.configLabel}>远程路径:</span>
                  <span style={s.configValue}>{currentConfig.path}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handleBackup}
                  disabled={syncing || !currentConfig.url}
                  style={{ gap: 4 }}
                >
                  <RefreshCw size={13} className={syncing ? 'spin' : ''} />
                  {syncing ? '备份中...' : '立即备份'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handleLoadFiles}
                  disabled={loadingFiles || !currentConfig.url}
                  style={{ gap: 4 }}
                >
                  <FileArchive size={13} className={loadingFiles ? 'spin' : ''} />
                  {loadingFiles ? '加载中...' : '查看远程备份'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handleEditConfig}
                  style={{ gap: 4 }}
                >
                  <Settings size={13} />
                  编辑配置
                </button>
              </div>

              {/* 远程文件列表 */}
              {remoteFiles.length > 0 && (
                <div style={s.fileList}>
                  <div style={s.fileListHeader}>
                    <span>远程备份列表</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      共 {remoteFiles.length} 个文件
                    </span>
                  </div>
                  <div style={s.fileListBody}>
                    {remoteFiles.map((file) => (
                      <div key={file.href} style={s.fileItem}>
                        <div style={s.fileInfo}>
                          <FileArchive size={14} style={{ color: 'var(--text-secondary)' }} />
                          <div>
                            <div style={s.fileName}>{file.displayName}</div>
                            <div style={s.fileMeta}>
                              <Clock size={10} />
                              <span>{formatTime(file.lastModified)}</span>
                              <span style={{ margin: '0 6px' }}>·</span>
                              <span>{formatSize(file.size)}</span>
                            </div>
                          </div>
                        </div>
                        <div style={s.fileActions}>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => handleRestore(file)}
                            disabled={restoring}
                            title="恢复此备份"
                          >
                            <Download size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={(event) => openDeleteConfirm(file, event)}
                            disabled={deletingRemoteHref === file.href}
                            title="删除此备份"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div style={s.hint}>请选择或创建 WebDAV 配置以启用云端同步。</div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handleNewConfig}
                style={{ marginTop: 12, gap: 4 }}
              >
                <Plus size={13} />
                新建配置
              </button>
            </div>
          )}
        </div>

        {/* 数据目录 */}
        <div className="settingsCard" style={{ ...s.mainCard, ...s.dataCard }}>
          <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center' }}>
            <FolderOpen size={15} style={{ marginRight: 6 }} />
            数据目录
          </div>
          <div style={s.hint}>本地数据存储在应用的 userData 目录中。</div>
          <div style={s.dataPathBox}>
            <div style={s.dataPathText}>{dataPath}</div>
          </div>
          <div style={s.dataActionRow}>
            <button type="button" className="btn btn-sm btn-primary" onClick={handleOpenDataDir} style={{ gap: 4, flexShrink: 0 }}>
              <FolderOpen size={13} />
              打开目录
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { padding: '16px 16px 32px', maxWidth: 1240, margin: '0 auto' },
  header: { fontSize: 16, fontWeight: 700, marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: 700, marginBottom: 10 },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gridTemplateAreas: '"local data" "webdav webdav"',
    gap: 12,
    alignItems: 'start'
  },
  mainCard: {
    margin: 0,
    minWidth: 0
  },
  localCard: {
    gridArea: 'local'
  },
  dataCard: {
    gridArea: 'data'
  },
  webdavCard: {
    gridArea: 'webdav'
  },
  localMetaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10
  },
  localMetaTag: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)'
  },
  localActionRow: {
    display: 'flex',
    gap: 8,
    marginTop: 12
  },
  localActionButton: {
    flex: 1
  },
  dataPathBox: {
    marginTop: 10,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)'
  },
  dataPathText: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    fontFamily: 'monospace',
    lineHeight: 1.6,
    wordBreak: 'break-all'
  },
  dataActionRow: {
    marginTop: 12,
    display: 'flex',
    justifyContent: 'flex-end'
  },
  hint: { fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)', marginTop: 8 },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 6,
    marginBottom: 12,
    fontSize: 13
  },
  closeBtn: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 16,
    padding: 0,
    lineHeight: 1,
    opacity: 0.6
  },
  deleteConfirmLayer: {
    position: 'fixed',
    inset: 0,
    zIndex: 1250
  },
  deleteConfirmOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'transparent'
  },
  deleteConfirmCard: {
    position: 'absolute',
    width: 300,
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    boxShadow: '0 16px 34px rgba(0,0,0,0.24)',
    padding: 12
  },
  deleteConfirmTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)'
  },
  deleteConfirmText: {
    marginTop: 6,
    fontSize: 12,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    wordBreak: 'break-all'
  },
  deleteConfirmActions: {
    marginTop: 12,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8
  },
  webdavEditOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10, 12, 18, 0.62)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1260,
    backdropFilter: 'blur(1px)'
  },
  webdavEditModal: {
    width: 'min(760px, calc(100vw - 36px))',
    borderRadius: 14,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    boxShadow: '0 24px 56px rgba(0,0,0,0.28)',
    padding: 16
  },
  webdavEditHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  webdavEditTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--text-primary)'
  },
  webdavEditSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: 'var(--text-secondary)'
  },
  webdavEditGrid: {
    marginTop: 14,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10
  },
  webdavEditField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  webdavEditFieldWide: {
    gridColumn: '1 / -1'
  },
  webdavEditLabel: {
    fontSize: 12,
    color: 'var(--text-secondary)'
  },
  webdavPasswordRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  webdavPasswordInput: {
    flex: 1
  },
  webdavPasswordToggleBtn: {
    minWidth: 72,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--surface-2)',
    borderColor: 'var(--border)'
  },
  webdavEditSwitchRow: {
    marginTop: 12,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10
  },
  webdavEditSwitchCard: {
    border: '1px solid var(--border)',
    borderRadius: 10,
    background: 'var(--bg-secondary)',
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  webdavEditSwitchTitle: {
    fontSize: 13,
    fontWeight: 600
  },
  webdavEditSwitchDesc: {
    marginTop: 3,
    fontSize: 12,
    color: 'var(--text-secondary)'
  },
  webdavEditActions: {
    marginTop: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  webdavEditActionsLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  webdavEditActionsRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  webdavActionBtn: {
    background: 'var(--surface-2)',
    borderColor: 'var(--border)',
    color: 'var(--text-primary)'
  },
  restoreModalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 15, 20, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1200,
    backdropFilter: 'blur(2px)'
  },
  restoreModal: {
    width: 'min(680px, calc(100vw - 32px))',
    borderRadius: 14,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    boxShadow: '0 20px 46px rgba(0,0,0,0.28)',
    padding: 16
  },
  restoreModalHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  restoreModalTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--text-primary)'
  },
  restoreModalSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: 'var(--text-secondary)'
  },
  restoreCloseBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: 1,
    color: 'var(--text-secondary)',
    padding: 2
  },
  restoreModeRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10,
    marginTop: 14
  },
  restoreModeCard: {
    textAlign: 'left',
    border: '1px solid var(--border)',
    borderRadius: 10,
    background: 'var(--bg-secondary)',
    padding: 12,
    cursor: 'pointer'
  },
  restoreModeCardActive: {
    borderColor: 'var(--primary)',
    boxShadow: '0 0 0 1px color-mix(in srgb, var(--primary) 65%, transparent)',
    background: 'color-mix(in srgb, var(--primary) 8%, var(--bg-secondary))'
  },
  restoreModeCardTitle: {
    fontSize: 14,
    fontWeight: 700
  },
  restoreModeCardDesc: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 1.5,
    color: 'var(--text-secondary)'
  },
  restoreModalActions: {
    marginTop: 16,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    minWidth: 150,
    zIndex: 100
  },
  dropdownItem: {
    padding: '8px 12px',
    fontSize: 13,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center'
  },
  dropdownDivider: {
    height: 1,
    background: 'var(--border)',
    margin: '4px 0'
  },
  configInfo: {
    background: 'var(--bg-secondary)',
    borderRadius: 6,
    padding: '10px 12px'
  },
  configRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    padding: '2px 0'
  },
  configLabel: {
    color: 'var(--text-secondary)',
    minWidth: 60
  },
  configValue: {
    color: 'var(--text-primary)'
  },
  fileList: {
    marginTop: 16,
    border: '1px solid var(--border)',
    borderRadius: 6,
    overflow: 'hidden'
  },
  fileListHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
    fontWeight: 600,
    fontSize: 13
  },
  fileListBody: {
    maxHeight: 280,
    overflowY: 'auto',
    overscrollBehavior: 'contain'
  },
  fileItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)'
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10
  },
  fileName: {
    fontSize: 13,
    fontWeight: 500
  },
  fileMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: 'var(--text-secondary)',
    marginTop: 2
  },
  fileActions: {
    display: 'flex',
    gap: 4
  }
}
