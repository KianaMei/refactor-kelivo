import { createContext, useCallback, useContext, type ReactNode } from 'react'
import type { AppConfig } from '../../../shared/types'

export interface ConfigContextValue {
  config: AppConfig
  updateConfig: (next: AppConfig) => Promise<void>
  patchConfig: (patch: Partial<AppConfig>) => Promise<void>
}

const ConfigContext = createContext<ConfigContextValue | null>(null)

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig must be used within <ConfigProvider>')
  return ctx
}

export function ConfigProvider(props: {
  config: AppConfig
  onSave: (next: AppConfig) => Promise<void>
  children: ReactNode
}) {
  const patchConfig = useCallback(
    async (patch: Partial<AppConfig>) => {
      await props.onSave({ ...props.config, ...patch })
    },
    [props.config, props.onSave]
  )

  const value: ConfigContextValue = {
    config: props.config,
    updateConfig: props.onSave,
    patchConfig
  }

  return <ConfigContext.Provider value={value}>{props.children}</ConfigContext.Provider>
}
