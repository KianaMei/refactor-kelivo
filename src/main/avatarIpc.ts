import { ipcMain } from 'electron'

import { IpcChannel } from '../shared/ipc'
import { saveProviderAvatar, deleteProviderAvatar, resolveAvatarAsDataUrl } from './avatarStore'

export function registerAvatarIpc(): void {
  ipcMain.handle(
    IpcChannel.AvatarSave,
    async (_event, providerId: string, base64DataUrl: string) => {
      return await saveProviderAvatar(providerId, base64DataUrl)
    }
  )

  ipcMain.handle(IpcChannel.AvatarDelete, async (_event, providerId: string) => {
    await deleteProviderAvatar(providerId)
  })

  ipcMain.handle(IpcChannel.AvatarResolve, async (_event, relativePath: string) => {
    return await resolveAvatarAsDataUrl(relativePath)
  })
}
