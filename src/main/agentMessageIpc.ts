import { ipcMain } from 'electron'
import { IpcChannel } from '../shared/ipc'
import * as repo from './db/repositories/agentMessageRepo'
import type { AgentMessageCreateInput, AgentMessageUpdateInput } from '../shared/db-types'

export function registerAgentMessageIpc(): void {
  ipcMain.handle(IpcChannel.DbAgentMessageList, (_e, sessionId: string) => {
    return repo.listAgentMessages(sessionId)
  })

  ipcMain.handle(IpcChannel.DbAgentMessageCreate, (_e, input: AgentMessageCreateInput) => {
    return repo.createAgentMessage(input)
  })

  ipcMain.handle(IpcChannel.DbAgentMessageUpdate, (_e, id: string, input: AgentMessageUpdateInput) => {
    return repo.updateAgentMessage(id, input)
  })

  ipcMain.handle(IpcChannel.DbAgentMessageDelete, (_e, id: string) => {
    repo.deleteAgentMessage(id)
  })
}
