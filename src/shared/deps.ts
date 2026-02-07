export type DepsSdkProvider = 'claude' | 'codex'

export type DepsPackageStatus = {
  available: boolean
  version: string | null
}

export type DepsSdkStatus = {
  bundled: DepsPackageStatus
  external: DepsPackageStatus & { dir: string }
  activeSource: 'bundled' | 'external' | 'none'
  lastError: string | null
}

export type DepsStatusResult = {
  depsRoot: string
  useExternal: boolean
  claude: DepsSdkStatus
  codex: DepsSdkStatus
}

export type DepsInstallParams = {
  sdk: DepsSdkProvider
  versionSpec: string
}

export type DepsUninstallParams = {
  sdk: DepsSdkProvider
}

export type DepsProgressEvent = {
  sdk: DepsSdkProvider
  phase: 'prepare' | 'download' | 'verify' | 'activate' | 'done' | 'error'
  message: string
}

