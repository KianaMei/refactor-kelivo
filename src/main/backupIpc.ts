import { ipcMain, shell, dialog } from 'electron'
import { IpcChannel } from '../shared/ipc'
import type { WebDavConfig, BackupFileItem, RestoreMode, BackupWebdavProgress } from '../shared/types'
import {
  testWebdav,
  exportLocalBackup,
  importLocalBackup,
  backupToWebDav,
  listWebDavBackups,
  restoreFromWebDav,
  deleteWebDavBackup,
  clearAllData,
  getDataPath
} from './services/backup/backupService'

export function registerBackupIpc(): void {
  // 导出本地备份
  ipcMain.handle(
    IpcChannel.BackupExportLocal,
    async (_event, options: { includeChats: boolean; includeAttachments: boolean; includeGeneratedImages: boolean }) => {
      try {
        const buffer = await exportLocalBackup(options.includeChats, options.includeAttachments, options.includeGeneratedImages)
        return { success: true, data: buffer }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // 导入本地备份
  ipcMain.handle(
    IpcChannel.BackupImportLocal,
    async (
      _event,
      options: { buffer: Buffer; mode: RestoreMode; includeChats: boolean; includeAttachments: boolean; includeGeneratedImages: boolean }
    ) => {
      try {
        const result = await importLocalBackup(
          options.buffer,
          options.mode,
          options.includeChats,
          options.includeAttachments,
          options.includeGeneratedImages
        )
        return result
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // 测试 WebDAV 连接
  ipcMain.handle(IpcChannel.BackupWebdavTest, async (_event, cfg: WebDavConfig) => {
    try {
      await testWebdav(cfg)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 备份到 WebDAV
  ipcMain.handle(IpcChannel.BackupWebdavBackup, async (event, cfg: WebDavConfig) => {
    try {
      await backupToWebDav(cfg, (progress: BackupWebdavProgress) => {
        event.sender.send(IpcChannel.BackupWebdavProgress, progress)
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 列出 WebDAV 备份文件
  ipcMain.handle(IpcChannel.BackupWebdavList, async (_event, cfg: WebDavConfig) => {
    try {
      const items = await listWebDavBackups(cfg)
      return { success: true, items }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), items: [] }
    }
  })

  // 从 WebDAV 恢复
  ipcMain.handle(
    IpcChannel.BackupWebdavRestore,
    async (_event, cfg: WebDavConfig, item: BackupFileItem, mode: RestoreMode) => {
      try {
        const result = await restoreFromWebDav(cfg, item, mode)
        return result
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // 删除 WebDAV 备份文件
  ipcMain.handle(
    IpcChannel.BackupWebdavDelete,
    async (_event, cfg: WebDavConfig, item: BackupFileItem) => {
      try {
        await deleteWebDavBackup(cfg, item)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // 清除所有数据
  ipcMain.handle(IpcChannel.BackupClearData, async () => {
    try {
      await clearAllData()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 打开数据目录
  ipcMain.handle(IpcChannel.BackupOpenDataDir, async () => {
    try {
      const dataPath = getDataPath()
      await shell.openPath(dataPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 获取数据目录路径
  ipcMain.handle(IpcChannel.BackupGetDataPath, () => {
    return getDataPath()
  })
}
