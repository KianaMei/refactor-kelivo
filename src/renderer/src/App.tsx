import { useEffect, useState } from 'react'

import type { AppConfig } from '../../shared/types'
import { NavRail, type NavKey } from './layout/NavRail'
import { TitleBar } from './layout/TitleBar'
import { ChatPage } from './pages/ChatPageNew'
import { TranslatePage } from './pages/TranslatePage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { ApiTestPage } from './pages/ApiTestPage'
import { StoragePage } from './pages/StoragePage'
import { AgentPage } from './pages/AgentPage'

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
    await window.api.config.save(next)
    setConfig(next)
  }

  useEffect(() => {
    if (!config) return
    const el = document.documentElement

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const mode = config.themeMode
      if (mode === 'light') el.dataset.theme = 'light'
      else if (mode === 'dark') el.dataset.theme = 'dark'
      else el.dataset.theme = media.matches ? 'dark' : 'light'
    }

    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
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
    <div style={styles.appContainer}>
      <TitleBar />
      <div style={styles.root}>
        <NavRail active={tab} onChange={setTab} themeMode={config?.themeMode ?? 'system'} onCycleTheme={cycleTheme} />

        <div style={styles.main}>
          {saveError ? <div style={styles.errorBox}>错误：{saveError}</div> : null}
          {!config ? (
            <div style={{ padding: 16 }}>加载中...</div>
          ) : (
            <div style={styles.pageHost}>
              {tab === 'chat' ? (
                <ChatPage config={config} onSave={persist} onOpenDefaultModelSettings={openDefaultModelSettings} onOpenSettings={openSettingsPane} />
              ) : tab === 'translate' ? (
                <TranslatePage config={config} onOpenDefaultModelSettings={openDefaultModelSettings} />
              ) : tab === 'apiTest' ? (
                <ApiTestPage config={config} />
              ) : tab === 'storage' ? (
                <StoragePage />
              ) : tab === 'agent' ? (
                <AgentPage />
              ) : (
                <SettingsPage config={config} onSave={persist} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
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
