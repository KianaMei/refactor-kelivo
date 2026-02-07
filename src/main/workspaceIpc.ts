import { ipcMain } from 'electron'
import { IpcChannel } from '../shared/ipc'
import * as repo from './db/repositories/workspaceRepo'
import type {
  WorkspaceCreateInput,
  WorkspaceUpdateInput
} from '../shared/db-types'

export function registerWorkspaceIpc(): void {
  ipcMain.handle(IpcChannel.DbWorkspaceList, () => {
    return repo.listWorkspaces()
  })

  ipcMain.handle(IpcChannel.DbWorkspaceGet, (_e, id: string) => {
    return repo.getWorkspace(id)
  })

  ipcMain.handle(IpcChannel.DbWorkspaceCreate, (_e, input: WorkspaceCreateInput) => {
    return repo.createWorkspace(input)
  })

  ipcMain.handle(IpcChannel.DbWorkspaceUpdate, (_e, id: string, input: WorkspaceUpdateInput) => {
    return repo.updateWorkspace(id, input)
  })

  ipcMain.handle(IpcChannel.DbWorkspaceDelete, (_e, id: string) => {
    repo.deleteWorkspace(id)
  })

  ipcMain.handle(IpcChannel.DbWorkspaceChildren, (_e, parentId: string | null) => {
    return repo.getWorkspaceChildren(parentId)
  })
}
