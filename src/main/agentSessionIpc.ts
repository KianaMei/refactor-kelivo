import { ipcMain } from 'electron'
import { IpcChannel } from '../shared/ipc'
import * as repo from './db/repositories/agentSessionRepo'
import type { AgentSessionCreateInput, AgentSessionUpdateInput } from '../shared/db-types'

export function registerAgentSessionIpc(): void {
  ipcMain.handle(IpcChannel.DbAgentSessionList, (_e, agentId?: string) => {
    return repo.listAgentSessions(agentId)
  })

  ipcMain.handle(IpcChannel.DbAgentSessionGet, (_e, id: string) => {
    return repo.getAgentSession(id)
  })

  ipcMain.handle(IpcChannel.DbAgentSessionCreate, (_e, input: AgentSessionCreateInput) => {
    return repo.createAgentSession(input)
  })

  ipcMain.handle(IpcChannel.DbAgentSessionUpdate, (_e, id: string, input: AgentSessionUpdateInput) => {
    return repo.updateAgentSession(id, input)
  })

  ipcMain.handle(IpcChannel.DbAgentSessionDelete, (_e, id: string) => {
    repo.deleteAgentSession(id)
  })
}
