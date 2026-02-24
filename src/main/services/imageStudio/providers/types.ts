import type { FalSeedreamEditOptions, ImageStudioJobStatus } from '../../../../shared/imageStudio'

export interface ImageStudioSubmitParams {
  prompt: string
  imageUrls: string[]
  options: Required<FalSeedreamEditOptions>
  apiKey: string
  baseUrl: string
  signal?: AbortSignal
}

export interface ImageStudioQueueHandle {
  queueRequestId: string
  statusUrl: string
  responseUrl: string
  cancelUrl: string
}

export interface ImageStudioPollParams {
  apiKey: string
  statusUrl: string
  signal?: AbortSignal
}

export interface ImageStudioResultParams {
  apiKey: string
  responseUrl: string
  signal?: AbortSignal
}

export interface ImageStudioCancelParams {
  apiKey: string
  cancelUrl: string
  signal?: AbortSignal
}

export interface ImageStudioStatusResult {
  rawStatus: string
  status: ImageStudioJobStatus
  logs: string[]
  done: boolean
  errorMessage?: string
}

export interface ImageStudioProviderImageResult {
  url: string
  contentType?: string | null
  width?: number | null
  height?: number | null
}

export interface ImageStudioProviderResult {
  images: ImageStudioProviderImageResult[]
}

export interface ImageStudioProvider {
  submit: (params: ImageStudioSubmitParams) => Promise<ImageStudioQueueHandle>
  pollStatus: (params: ImageStudioPollParams) => Promise<ImageStudioStatusResult>
  getResult: (params: ImageStudioResultParams) => Promise<ImageStudioProviderResult>
  cancel: (params: ImageStudioCancelParams) => Promise<void>
}
