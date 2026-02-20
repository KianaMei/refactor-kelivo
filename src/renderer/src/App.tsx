import { useEffect, useState } from 'react'

import type { AppConfig } from '../../shared/types'
import { getPalette } from '../../shared/palettes'
import { NavRail, type NavKey } from './layout/NavRail'
import { TitleBar } from './layout/TitleBar'
import { ChatPage } from './pages/ChatPageNew'
import { TranslatePage } from './pages/TranslatePage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { ApiTestPage } from './pages/ApiTestPage'
import { StoragePage } from './pages/StoragePage'
import { AgentPage } from './pages/AgentPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ConfirmProvider } from './hooks/useConfirm'
import { Toaster } from './components/ui/sonner'

export default function App() {
  const [tab, setTab] = useState<NavKey>('chat')
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.config
      .get()
      .then((cfg) => {
        if (cancelled) return
        setConfig(cfg)
      })
      .catch((err) => {
        if (cancelled) return
        setSaveError(String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function persist(next: AppConfig) {
    setSaveError(null)
    const saved = await window.api.config.save(next)
    setConfig(saved)
  }

  // 应用主题模式和调色板
  useEffect(() => {
    if (!config) return
    const el = document.documentElement
    const display = config.display

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      // 确定当前主题模式
      const mode = config.themeMode
      let isDark: boolean
      if (mode === 'light') {
        el.dataset.theme = 'light'
        isDark = false
      } else if (mode === 'dark') {
        el.dataset.theme = 'dark'
        isDark = true
      } else {
        isDark = media.matches
        el.dataset.theme = isDark ? 'dark' : 'light'
      }

      // 应用调色板颜色
      const palette = getPalette(display.themePalette || 'default')
      const colors = isDark ? palette.dark : palette.light

      el.style.setProperty('--primary', colors.primary)
      el.style.setProperty('--primary-hover', colors.primary + 'dd')
      el.style.setProperty('--primary-bg', colors.primary + '26')
      el.style.setProperty('--danger', colors.error)
      el.style.setProperty('--danger-bg', colors.error + '26')
    }

    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [config])

  // 应用显示设置的字体和缩放配置
  useEffect(() => {
    if (!config) return
    const el = document.documentElement
    const display = config.display

    // 应用字体
    if (display.appFontFamily) {
      el.style.setProperty('--app-font-family', display.appFontFamily)
      document.body.style.fontFamily = display.appFontFamily
    } else {
      el.style.removeProperty('--app-font-family')
      document.body.style.fontFamily = ''
    }
    if (display.codeFontFamily) {
      el.style.setProperty('--code-font-family', display.codeFontFamily)
    } else {
      el.style.removeProperty('--code-font-family')
    }

    // 应用全局缩放
    // globalFontScale 的单位是倍数（0.8 - 1.5），不是百分比；这里直接使用即可。
    const scale = display.globalFontScale ?? 1
    el.style.setProperty('--global-font-scale', String(scale))
    document.body.style.fontSize = `${14 * scale}px`

    // 应用聊天字体大小
    el.style.setProperty('--chat-font-size', `${display.chatFontSize ?? 14}px`)

    // 桌面内容宽度：用于消息气泡最大宽度（对齐 Flutter：宽模式更宽，窄模式用配置值）
    const mode = display.desktopContentWidth ?? 'wide'
    const narrow = display.desktopNarrowWidth ?? 800
    const assistantMax = mode === 'narrow' ? narrow : 1200
    const userMax = Math.round(assistantMax * 0.76)
    el.style.setProperty('--assistant-bubble-max-width', `${assistantMax}px`)
    el.style.setProperty('--user-bubble-max-width', `${userMax}px`)
  }, [config])

  async function cycleTheme() {
    if (!config) return
    const next = config.themeMode === 'system' ? 'light' : config.themeMode === 'light' ? 'dark' : 'system'
    await persist({ ...config, themeMode: next })
  }

  async function openDefaultModelSettings() {
    if (!config) return
    setTab('settings')
    await persist({
      ...config,
      ui: {
        ...config.ui,
        desktop: {
          ...config.ui.desktop,
          selectedSettingsMenu: 'defaultModel'
        }
      }
    })
  }

  async function openSettingsPane(pane?: string) {
    if (!config) return
    setTab('settings')
    if (pane) {
      await persist({
        ...config,
        ui: {
          ...config.ui,
          desktop: {
            ...config.ui.desktop,
            selectedSettingsMenu: pane as any
          }
        }
      })
    }
  }

  return (
    <ConfirmProvider>
      <Toaster />
      <div style={styles.appContainer}>
        <TitleBar />
        <div style={styles.root}>
          <NavRail
            active={tab}
            onChange={setTab}
            themeMode={config?.themeMode ?? 'system'}
            onCycleTheme={cycleTheme}
            user={config?.user}
            onUserChange={(user) => config && persist({ ...config, user })}
          />

          <div style={styles.main}>
            {saveError ? <div style={styles.errorBox}>错误：{saveError}</div> : null}
            {!config ? (
              <div style={{ padding: 16 }}>加载中...</div>
            ) : (
              <div style={styles.pageHost}>
                <ErrorBoundary title="页面渲染出错（请把错误信息截图发我）">
                  {tab === 'chat' ? (
                    <ChatPage config={config} onSave={persist} onOpenDefaultModelSettings={openDefaultModelSettings} onOpenSettings={openSettingsPane} />
                  ) : tab === 'translate' ? (
                    <TranslatePage config={config} onSave={persist} onOpenDefaultModelSettings={openDefaultModelSettings} />
                  ) : tab === 'apiTest' ? (
                    <ApiTestPage config={config} />
                  ) : tab === 'storage' ? (
                    <StoragePage />
                  ) : tab === 'agent' ? (
                    <AgentPage config={config} onSave={persist} />
                  ) : (
                    <SettingsPage config={config} onSave={persist} />
                  )}
                </ErrorBoundary>
              </div>
            )}
          </div>
        </div>
      </div>
    </ConfirmProvider>
  )
}

const styles: Record<string, any> = {
  appContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh'
  },
  root: {
    display: 'flex',
    flex: 1,
    minHeight: 0
  },
  main: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column'
  },
  pageHost: {
    flex: 1,
    minHeight: 0
  },
  errorBox: {
    margin: 16,
    padding: 12,
    borderRadius: 10,
    border: '1px solid rgba(255,80,80,0.35)',
    background: 'rgba(255,80,80,0.12)',
    color: '#ffb3b3'
  }
}
