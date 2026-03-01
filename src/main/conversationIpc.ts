import { ipcMain } from 'electron'
import { IpcChannel } from '../shared/ipc'
import * as repo from './db/repositories/conversationRepo'
import { regenerateConversationTitle } from './services/conversationTitle'
import type {
  ConversationCreateInput,
  ConversationUpdateInput,
  ConversationListParams
} from '../shared/db-types'

export function registerConversationIpc(): void {
  ipcMain.handle(IpcChannel.DbConversationList, (_e, params: ConversationListParams) => {
    return repo.listConversations(params)
  })

  ipcMain.handle(IpcChannel.DbConversationGet, (_e, id: string) => {
    return repo.getConversation(id)
  })

  ipcMain.handle(IpcChannel.DbConversationCreate, (_e, input: ConversationCreateInput) => {
    return repo.createConversation(input)
  })

  ipcMain.handle(IpcChannel.DbConversationUpdate, (_e, id: string, input: ConversationUpdateInput) => {
    return repo.updateConversation(id, input)
  })

  ipcMain.handle(IpcChannel.DbConversationDelete, (_e, id: string) => {
    repo.deleteConversation(id)
  })

  ipcMain.handle(IpcChannel.DbConversationRegenerateTitle, async (_e, id: string) => {
    return regenerateConversationTitle(id)
  })

  ipcMain.handle(IpcChannel.DbConversationSearch, (_e, query: string, workspaceId?: string | null) => {
    return repo.searchConversations(query, workspaceId)
  })

  ipcMain.handle(IpcChannel.DbConversationMessageCount, (_e, conversationId: string) => {
    return repo.getConversationMessageCount(conversationId)
  })

  ipcMain.handle(IpcChannel.DbConversationAssistantCount, (_e, conversationId: string) => {
    return repo.getConversationAssistantMessageCount(conversationId)
  })

  ipcMain.handle(IpcChannel.DbConversationAllAssistantCounts, () => {
    return repo.getAllAssistantMessageCounts()
  })
}
