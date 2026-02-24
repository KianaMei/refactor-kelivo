import { ipcMain } from 'electron'

import { IpcChannel } from '../shared/ipc'
import type {
  ImageStudioDeleteRequest,
  ImageStudioListRequest,
  ImageStudioOutputDeleteRequest,
  ImageStudioRetryRequest,
  ImageStudioSubmitRequest
} from '../shared/imageStudio'
import { getImageStudioService } from './services/imageStudio/imageStudioService'

export function registerImageStudioIpc(): void {
  const service = getImageStudioService()

  ipcMain.handle(IpcChannel.ImageStudioSubmit, (_event, request: ImageStudioSubmitRequest) => {
    return service.submit(request)
  })

  ipcMain.handle(IpcChannel.ImageStudioCancel, (_event, generationId: string) => {
    return service.cancel(generationId)
  })

  ipcMain.handle(IpcChannel.ImageStudioHistoryList, (_event, request: ImageStudioListRequest) => {
    return service.listHistory(request)
  })

  ipcMain.handle(IpcChannel.ImageStudioHistoryGet, (_event, generationId: string) => {
    return service.getHistory(generationId)
  })

  ipcMain.handle(IpcChannel.ImageStudioHistoryDelete, (_event, request: ImageStudioDeleteRequest) => {
    return service.deleteHistory(request)
  })

  ipcMain.handle(IpcChannel.ImageStudioOutputDelete, (_event, request: ImageStudioOutputDeleteRequest) => {
    return service.deleteOutput(request)
  })

  ipcMain.handle(IpcChannel.ImageStudioHistoryRetry, (_event, request: ImageStudioRetryRequest) => {
    return service.retryHistory(request)
  })
}
