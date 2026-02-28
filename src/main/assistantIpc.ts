import { ipcMain } from 'electron'
import { IpcChannel } from '../shared/ipc'
import type { AssistantCreateInput, AssistantUpdateInput } from '../shared/db-types'
import * as repo from './db/repositories/assistantRepo'

export function registerAssistantIpc(): void {
  ipcMain.handle(IpcChannel.DbAssistantList, () => {
    return repo.listAssistants()
  })

  ipcMain.handle(IpcChannel.DbAssistantGet, (_e, id: string) => {
    return repo.getAssistant(id)
  })

  ipcMain.handle(IpcChannel.DbAssistantCreate, (_e, input: AssistantCreateInput) => {
    return repo.createAssistant(input)
  })

  ipcMain.handle(IpcChannel.DbAssistantUpdate, (_e, id: string, input: AssistantUpdateInput) => {
    return repo.updateAssistant(id, input)
  })

  ipcMain.handle(IpcChannel.DbAssistantDelete, (_e, id: string) => {
    repo.deleteAssistant(id)
  })

  ipcMain.handle(IpcChannel.DbAssistantSetDefault, (_e, id: string) => {
    return repo.setDefaultAssistant(id)
  })

  ipcMain.handle(IpcChannel.DbAssistantReorder, (_e, ids: string[]) => {
    return repo.reorderAssistants(ids)
  })
}
