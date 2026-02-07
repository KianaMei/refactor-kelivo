import { ipcMain } from 'electron'
import { IpcChannel } from '../shared/ipc'
import * as repo from './db/repositories/memoryRepo'
import type { MemoryCreateInput } from '../shared/db-types'

export function registerMemoryIpc(): void {
  ipcMain.handle(IpcChannel.DbMemoryList, (_e, assistantId: string) => {
    return repo.listMemories(assistantId)
  })

  ipcMain.handle(IpcChannel.DbMemoryCreate, (_e, input: MemoryCreateInput) => {
    return repo.createMemory(input)
  })

  ipcMain.handle(IpcChannel.DbMemoryDelete, (_e, id: number) => {
    repo.deleteMemory(id)
  })

  ipcMain.handle(IpcChannel.DbMemoryDeleteByAssistant, (_e, assistantId: string) => {
    repo.deleteMemoriesByAssistant(assistantId)
  })
}
