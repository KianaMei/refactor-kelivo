import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'

import { registerConfigIpc } from './configIpc'
import { registerChatIpc } from './chatIpc'
import { registerModelsIpc } from './modelsIpc'
import { registerAvatarIpc } from './avatarIpc'
import { registerProviderBundleIpc } from './providerBundleIpc'

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
      sandbox: false
    }
  })

  // 窗口控制 IPC
  ipcMain.on('window-minimize', () => mainWindow.minimize())
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.on('window-close', () => mainWindow.close())
  ipcMain.handle('window-is-maximized', () => mainWindow.isMaximized())

  // 监听最大化状态变化
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-changed', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-changed', false)
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

app.whenReady().then(() => {
  // Windows 任务栏分组/通知等需要 AppUserModelId。
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.kelivo.refactor')
  }

  // IPC 统一在主进程注册（仅暴露必要能力到 renderer）。
  registerConfigIpc()
  registerChatIpc()
  registerModelsIpc()
  registerAvatarIpc()
  registerProviderBundleIpc()

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
