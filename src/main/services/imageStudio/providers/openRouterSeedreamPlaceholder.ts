import type { ImageStudioProvider } from './types'

const PLACEHOLDER_ERROR = 'OpenRouter Seedream 4.5 目前为占位实现，暂不支持执行生成。'

export const openRouterSeedreamPlaceholderProvider: ImageStudioProvider = {
  async submit() {
    throw new Error(PLACEHOLDER_ERROR)
  },
  async pollStatus() {
    throw new Error(PLACEHOLDER_ERROR)
  },
  async getResult() {
    throw new Error(PLACEHOLDER_ERROR)
  },
  async cancel() {
    throw new Error(PLACEHOLDER_ERROR)
  }
}

export { PLACEHOLDER_ERROR }
