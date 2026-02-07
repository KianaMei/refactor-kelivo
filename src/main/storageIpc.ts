import { ipcMain, shell } from 'electron'
import { app } from 'electron'
import { getStorageReport, clearStorageItem, getStorageCategoryItems, deleteStorageItems } from './services/storage/storageService'

export const STORAGE_CHANNELS = {
    GET_REPORT: 'storage:getReport',
    CLEAR: 'storage:clear',
    OPEN_DATA_FOLDER: 'storage:openDataFolder',
    GET_CATEGORY_ITEMS: 'storage:getCategoryItems',
    DELETE_ITEMS: 'storage:deleteItems'
}

export function registerStorageIpc(): void {
    ipcMain.handle(STORAGE_CHANNELS.GET_REPORT, async () => {
        return await getStorageReport()
    })

    ipcMain.handle(STORAGE_CHANNELS.CLEAR, async (_e, categoryKey: any, itemId: any) => {
        await clearStorageItem(categoryKey, itemId)
        return await getStorageReport()
    })

    ipcMain.handle(STORAGE_CHANNELS.OPEN_DATA_FOLDER, () => {
        shell.openPath(app.getPath('userData'))
    })

    ipcMain.handle(STORAGE_CHANNELS.GET_CATEGORY_ITEMS, async (_e, categoryKey: string) => {
        return await getStorageCategoryItems(categoryKey)
    })

    ipcMain.handle(STORAGE_CHANNELS.DELETE_ITEMS, async (_e, paths: string[]) => {
        await deleteStorageItems(paths)
    })
}
