import { ipcMain } from 'electron'

import { IpcChannel } from '../shared/ipc'
import { loadConfig } from './configStore'
import { generateText } from './api/chatApiService'

export function registerChatIpc(): void {
  // 测试连接 - 通过 chatApiService 发送简单请求验证连接
  ipcMain.handle(IpcChannel.ChatTest, async (_event, params: { providerId: string; modelId: string }) => {
    const cfg = await loadConfig()
    const provider = cfg.providerConfigs[params.providerId]
    if (!provider) {
      throw new Error(`未找到供应商：${params.providerId}`)
    }

    if (!provider.apiKey) throw new Error('该供应商未配置 API Key')

    // 使用 generateText 发送简单测试请求（自动适配所有 provider 类型）
    await generateText({
      config: provider,
      modelId: params.modelId,
      prompt: 'Hi'
    })
    // 成功 - 不需要返回任何内容
  })
}
