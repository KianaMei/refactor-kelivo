import { ipcMain } from 'electron'

import { IpcChannel } from '../shared/ipc'
import type {
    PromptLibraryCreateInput,
    PromptLibraryUpdateInput,
    PromptLibraryListRequest,
    PromptLibraryListResult,
    PromptLibrarySingleResult,
    PromptLibraryDeleteResult
} from '../shared/promptLibrary'
import {
    createPromptLibraryItem,
    updatePromptLibraryItem,
    getPromptLibraryItem,
    listPromptLibraryItems,
    deletePromptLibraryItem,
    clearNonFavoritePrompts
} from './db/repositories/promptLibraryRepo'

export function registerPromptLibraryIpc(): void {
    ipcMain.handle(
        IpcChannel.PromptLibraryList,
        (_event, request: PromptLibraryListRequest): PromptLibraryListResult => {
            try {
                const result = listPromptLibraryItems(request)
                return { success: true, items: result.items, total: result.total }
            } catch (err) {
                return { success: false, error: String(err) }
            }
        }
    )

    ipcMain.handle(
        IpcChannel.PromptLibraryCreate,
        (_event, input: PromptLibraryCreateInput): PromptLibrarySingleResult => {
            try {
                const item = createPromptLibraryItem(input)
                return { success: true, item }
            } catch (err) {
                return { success: false, error: String(err) }
            }
        }
    )

    ipcMain.handle(
        IpcChannel.PromptLibraryUpdate,
        (_event, id: string, input: PromptLibraryUpdateInput): PromptLibrarySingleResult => {
            try {
                const item = updatePromptLibraryItem(id, input)
                return { success: true, item }
            } catch (err) {
                return { success: false, error: String(err) }
            }
        }
    )

    ipcMain.handle(
        IpcChannel.PromptLibraryGet,
        (_event, id: string): PromptLibrarySingleResult => {
            try {
                const item = getPromptLibraryItem(id)
                return { success: true, item }
            } catch (err) {
                return { success: false, error: String(err) }
            }
        }
    )

    ipcMain.handle(
        IpcChannel.PromptLibraryDelete,
        (_event, id: string): PromptLibraryDeleteResult => {
            try {
                deletePromptLibraryItem(id)
                return { success: true }
            } catch (err) {
                return { success: false, error: String(err) }
            }
        }
    )

    ipcMain.handle(
        IpcChannel.PromptLibraryClear,
        (): PromptLibraryDeleteResult => {
            try {
                clearNonFavoritePrompts()
                return { success: true }
            } catch (err) {
                return { success: false, error: String(err) }
            }
        }
    )
}
