import { ipcMain } from 'electron'
import { IpcChannel } from '../shared/ipc'
import type { OAuthProvider, OAuthTokenData } from '../shared/types'
import { startOAuthLogin, refreshOAuthToken, cancelActiveFlow } from './services/oauth/oauthService'

export function registerOAuthIpc(): void {
  ipcMain.handle(IpcChannel.OAuthLogin, async (_event, provider: OAuthProvider) => {
    return startOAuthLogin(provider)
  })

  ipcMain.handle(IpcChannel.OAuthRefresh, async (_event, tokenData: OAuthTokenData) => {
    return refreshOAuthToken(tokenData)
  })

  ipcMain.handle(IpcChannel.OAuthCancel, async () => {
    cancelActiveFlow()
  })
}
