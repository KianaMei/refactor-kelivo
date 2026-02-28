import { app, BrowserWindow, shell, ipcMain, protocol, dialog, session } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'

import { registerConfigIpc } from './configIpc'
import { registerChatIpc } from './chatIpc'
import { registerChatPreprocessIpc } from './chatPreprocessIpc'
import { registerModelsIpc } from './modelsIpc'
import { registerAvatarIpc } from './avatarIpc'
import { registerProviderBundleIpc } from './providerBundleIpc'
import { registerConversationIpc } from './conversationIpc'
import { registerMessageIpc } from './messageIpc'
import { registerWorkspaceIpc } from './workspaceIpc'
import { registerMemoryIpc } from './memoryIpc'
import { registerAgentSessionIpc } from './agentSessionIpc'
import { registerAgentMessageIpc } from './agentMessageIpc'
import { registerAgentIpc } from './agent/agentIpc'
import { registerOcrIpc } from './ocrIpc'
import { registerSearchIpc } from './searchIpc'
import { searchManager, createSearchService } from './services/search'
import { registerBackupIpc } from './backupIpc'
import { registerMcpIpc } from './mcpIpc'
import { registerStorageIpc } from './storageIpc'
import { registerDepsIpc } from './deps/depsIpc'
import { registerImageStudioIpc } from './imageStudioIpc'
import { registerPromptLibraryIpc } from './promptLibraryIpc'
import { IpcChannel } from '../shared/ipc'
import { initDatabase, closeDatabase } from './db/database'
import { ensureDefaultWorkspace } from './db/repositories/workspaceRepo'
import { getMemoryCount, bulkInsertMemories } from './db/repositories/memoryRepo'
import { loadConfig, saveConfig } from './configStore'
import { applyProxyConfig } from './proxyManager'
import { setPostJsonStream } from '../shared/streamingHttpClient'
import { postJsonStream as proxyPostJsonStream } from './api/streamingHttpClient'

// Main 进程注入代理版 HTTP 客户端，shared adapters 自动走代理
setPostJsonStream(proxyPostJsonStream)

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    frame: false, // 无边框窗口
    titleBarStyle: 'hidden', // macOS 隐藏标题栏但保留交通灯
    trafficLightPosition: { x: 12, y: 12 }, // macOS 交通灯位置
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // 生成任务等长流程不应因窗口被遮挡/不在前台而被 Chromium 节流，避免 UI/事件表现为“暂停”。
      backgroundThrottling: false,
      webSecurity: false // 禁用 CORS，允许 Renderer 直接请求 AI API
    }
  })

  // 窗口控制 IPC
  ipcMain.on(IpcChannel.WindowMinimize, () => mainWindow.minimize())
  ipcMain.on(IpcChannel.WindowMaximize, () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.on(IpcChannel.WindowClose, () => mainWindow.close())
  ipcMain.handle(IpcChannel.WindowIsMaximized, () => mainWindow.isMaximized())

  // 监听最大化状态变化
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send(IpcChannel.WindowMaximizedChanged, true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send(IpcChannel.WindowMaximizedChanged, false)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 统一把新窗口打开行为变成系统浏览器打开，避免 renderer 被导航走。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const isDev = !app.isPackaged
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 注册自定义协议权限
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'kelivo-file',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true
    }
  }
])

app.whenReady().then(() => {
  // 注册 kelivo-file 协议用于加载本地图片
  protocol.handle('kelivo-file', async (request) => {
    try {
      const u = new URL(request.url)
      let filePath = ''

      // Windows 路径特殊处理
      if (process.platform === 'win32') {
        // Case 1: Browser parsed "C:" as host, stripping colon.
        // kelivo-file://c/Users/jaqenze/... => hostname="c", pathname="/Users/jaqenze/..."
        if (u.hostname && u.hostname.length === 1) {
          filePath = `${u.hostname}:${u.pathname}`
        }
        // Case 2: Three slashes. hostname is empty. pathname="/C:/Users/..."
        else if (u.pathname.startsWith('/') && /^[a-zA-Z]:/.test(u.pathname.slice(1))) {
          filePath = u.pathname.slice(1)
        }
        // Fallback
        else {
          filePath = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname
        }
      } else {
        filePath = u.pathname
      }

      // URL pathname is encoded
      filePath = decodeURIComponent(filePath)

      const data = await readFile(filePath)

      const ext = filePath.split('.').pop()?.toLowerCase()
      let mimeType = 'application/octet-stream'
      if (ext === 'png') mimeType = 'image/png'
      else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg'
      else if (ext === 'gif') mimeType = 'image/gif'
      else if (ext === 'svg') mimeType = 'image/svg+xml'
      else if (ext === 'webp') mimeType = 'image/webp'

      return new Response(data, {
        headers: { 'content-type': mimeType }
      })
    } catch (err) {
      console.error('Failed to load file:', request.url, err)
      return new Response('Not Found', { status: 404 })
    }
  })

  // Windows 任务栏分组/通知等需要 AppUserModelId。
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.kelivo.refactor')
  }

  // Database
  try {
    initDatabase()
    ensureDefaultWorkspace()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[db] init failed:', err)

    const isDev = !app.isPackaged
    const hint = isDev
      ? '可能是原生依赖（better-sqlite3）未按 Electron 版本重建。请运行：node scripts/ensure-electron-native.mjs --rebuild'
      : '请尝试重新安装或升级应用。'

    dialog.showErrorBox('数据库初始化失败', `${String(err)}\n\n${hint}`)
    app.quit()
    return
  }

  // 迁移记忆数据：config.json → SQLite（幂等，只执行一次）
  void migrateMemoriesFromConfig()

  // IPC 统一在主进程注册（仅暴露必要能力到 renderer）。
  registerConfigIpc()
  registerChatIpc()
  registerChatPreprocessIpc()
  registerModelsIpc()
  registerAvatarIpc()
  registerProviderBundleIpc()
  registerConversationIpc()
  registerMessageIpc()
  registerWorkspaceIpc()
  registerMemoryIpc()
  registerAgentSessionIpc()
  registerAgentMessageIpc()
  registerAgentIpc()
  registerOcrIpc()
  registerSearchIpc()
  registerBackupIpc()
  registerMcpIpc()
  registerStorageIpc()
  registerDepsIpc()
  registerImageStudioIpc()
  registerPromptLibraryIpc()

  createMainWindow()

  // 根据 Provider 配置设置全局代理
  loadConfig()
    .then((cfg) => {
      applyProxyConfig(session.defaultSession, cfg)
      // 从保存的配置恢复已启用的搜索服务
      const { services, global: globalCfg } = cfg.searchConfig
      for (const svc of services) {
        if (!svc.enabled) continue
        try {
          const regConfig = {
            type: svc.type,
            id: svc.id,
            apiKeys: svc.apiKeys,
            strategy: svc.strategy,
            apiKey: svc.apiKeys.find(k => k.isEnabled && k.key)?.key ?? '',
            ...(svc.baseUrl ? { baseUrl: svc.baseUrl } : {}),
            ...(svc.serviceConfig ?? {})
          }
          const instance = createSearchService(regConfig as any)
          searchManager.register(svc.id, instance, globalCfg.defaultServiceId === svc.id)
        } catch (e) {
          console.warn(`[Search] Failed to restore service ${svc.id}:`, e)
        }
      }
    })
    .catch((err) => console.warn('[ProxyManager] Failed to apply proxy config:', err))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})

// ── 记忆迁移（config.json → SQLite）────────────────────────────
async function migrateMemoriesFromConfig(): Promise<void> {
  try {
    // 如果数据库中已有记忆数据，说明已迁移过，跳过
    if (getMemoryCount() > 0) return

    const config = await loadConfig()
    const memories = config.assistantMemories ?? []
    if (memories.length === 0) return

    // 批量插入到 SQLite
    bulkInsertMemories(
      memories.map((m) => ({
        assistantId: m.assistantId,
        content: m.content
      }))
    )

    // 清空 config.json 中的 assistantMemories
    await saveConfig({
      ...config,
      assistantMemories: []
    })

    // eslint-disable-next-line no-console
    console.log(`[Migration] Migrated ${memories.length} memories from config.json to SQLite`)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Migration] Failed to migrate memories:', err)
  }
}
