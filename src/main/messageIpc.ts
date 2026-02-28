import { ipcMain } from 'electron'
import { IpcChannel } from '../shared/ipc'
import * as repo from './db/repositories/messageRepo'
import type {
  MessageCreateInput,
  MessageUsageStatsParams,
  MessageUpdateInput
} from '../shared/db-types'

export function registerMessageIpc(): void {
  ipcMain.handle(IpcChannel.DbMessageList, (_e, conversationId: string) => {
    return repo.listMessages(conversationId)
  })

  ipcMain.handle(IpcChannel.DbMessageCreate, (_e, input: MessageCreateInput) => {
    return repo.createMessage(input)
  })

  ipcMain.handle(IpcChannel.DbMessageCreateBatch, (_e, inputs: MessageCreateInput[]) => {
    repo.createMessages(inputs)
  })

  ipcMain.handle(IpcChannel.DbMessageUpdate, (_e, id: string, input: MessageUpdateInput) => {
    return repo.updateMessage(id, input)
  })

  ipcMain.handle(IpcChannel.DbMessageDelete, (_e, id: string) => {
    repo.deleteMessage(id)
  })

  ipcMain.handle(IpcChannel.DbMessageVersions, (_e, groupId: string) => {
    return repo.getMessageVersions(groupId)
  })

  ipcMain.handle(IpcChannel.DbMessageSearch, (_e, query: string) => {
    return repo.searchMessages(query)
  })

  ipcMain.handle(IpcChannel.DbMessageNextSortOrder, (_e, conversationId: string) => {
    return repo.getNextSortOrder(conversationId)
  })

  ipcMain.handle(IpcChannel.DbMessageUsageStats, (_e, params?: MessageUsageStatsParams) => {
    return repo.getMessageUsageStats(params)
  })
}
