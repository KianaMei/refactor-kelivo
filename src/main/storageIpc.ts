import { ipcMain, shell } from 'electron'
import { app } from 'electron'
import { getStorageReport, clearStorageItem, getStorageCategoryItems, deleteStorageItems } from './services/storage/storageService'
import { IpcChannel } from '../shared/ipc'

export function registerStorageIpc(): void {
    ipcMain.handle(IpcChannel.StorageGetReport, async () => {
        return await getStorageReport()
    })

    ipcMain.handle(IpcChannel.StorageClear, async (_e, categoryKey: any, itemId: any) => {
        await clearStorageItem(categoryKey, itemId)
        return await getStorageReport()
    })

    ipcMain.handle(IpcChannel.StorageOpenDataFolder, () => {
        shell.openPath(app.getPath('userData'))
    })

    ipcMain.handle(IpcChannel.StorageGetCategoryItems, async (_e, categoryKey: string) => {
        return await getStorageCategoryItems(categoryKey)
    })

    ipcMain.handle(IpcChannel.StorageDeleteItems, async (_e, paths: string[]) => {
        await deleteStorageItems(paths)
    })
}
