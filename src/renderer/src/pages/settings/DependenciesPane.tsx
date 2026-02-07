import { useEffect, useMemo, useState } from 'react'
import { Cpu, RefreshCw, Trash2, Download, ExternalLink } from 'lucide-react'

import type { AppConfig } from '../../../../shared/types'
import type { DepsProgressEvent, DepsStatusResult, DepsSdkProvider } from '../../../../shared/deps'

import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'

function sdkLabel(sdk: DepsSdkProvider): string {
  return sdk === 'claude' ? 'Claude SDK' : 'Codex SDK'
}

function sourceLabel(source: string): string {
  if (source === 'external') return 'external（外置）'
  if (source === 'bundled') return 'bundled（内置）'
  return 'none'
}

export function DependenciesPane(props: { config: AppConfig; onSave: (next: AppConfig) => Promise<void> }) {
  const { config, onSave } = props

  const [status, setStatus] = useState<DepsStatusResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<DepsProgressEvent | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])

  const depsRoot = config.agentRuntime.depsInstallDir?.trim() || '(默认 userData/dependencies)'

  const useExternal = !!config.agentRuntime.deps.useExternal
  const claudeSpec = config.agentRuntime.deps.claudeVersionSpec || 'latest'
  const codexSpec = config.agentRuntime.deps.codexVersionSpec || 'latest'

  const specBySdk = useMemo(() => ({ claude: claudeSpec, codex: codexSpec }), [claudeSpec, codexSpec])

  async function refresh() {
    const s = await window.api.deps.getStatus()
    setStatus(s)
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    return window.api.deps.onProgress((evt) => {
      setProgress(evt)
      setLogLines((prev) => {
        const next = [...prev, `[${evt.sdk}] ${evt.phase}: ${evt.message}`]
        return next.slice(-120)
      })
    })
  }, [])

  async function setUseExternal(next: boolean) {
    await onSave({
      ...config,
      agentRuntime: {
        ...config.agentRuntime,
        deps: { ...config.agentRuntime.deps, useExternal: next }
      }
    })
    await refresh()
  }

  async function setVersionSpec(sdk: DepsSdkProvider, next: string) {
    const trimmed = next.trim() || 'latest'
    await onSave({
      ...config,
      agentRuntime: {
        ...config.agentRuntime,
        deps: {
          ...config.agentRuntime.deps,
          claudeVersionSpec: sdk === 'claude' ? trimmed : config.agentRuntime.deps.claudeVersionSpec,
          codexVersionSpec: sdk === 'codex' ? trimmed : config.agentRuntime.deps.codexVersionSpec
        }
      }
    })
  }

  async function install(sdk: DepsSdkProvider) {
    setBusy(true)
    setProgress(null)
    try {
      await window.api.deps.install({ sdk, versionSpec: specBySdk[sdk] })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function uninstall(sdk: DepsSdkProvider) {
    const ok = window.confirm(`确认卸载 ${sdkLabel(sdk)} 的外置版本吗？卸载后将自动回退到内置版本。`)
    if (!ok) return
    setBusy(true)
    setProgress(null)
    try {
      await window.api.deps.uninstall({ sdk })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Cpu className="h-5 w-5" />
        <div className="text-lg font-bold">依赖 / SDK</div>
        <div className="flex-1" />
        <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw className="h-4 w-4 mr-2" />
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>使用外置 SDK</CardTitle>
          <CardDescription>外置安装到用户目录，可一键升级；失败不会影响内置版本。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={useExternal} onCheckedChange={(v) => void setUseExternal(!!v)} />
            <div className="text-sm">启用外置（external）</div>
          </div>
          <div className="text-xs text-muted-foreground">
            安装目录：{depsRoot}
          </div>
          <div className="text-xs text-muted-foreground">
            提示：Agent 运行时不会把 API Key 写入 DB/日志；权限交互按各 SDK 机制触发。
          </div>
        </CardContent>
      </Card>

      {(['claude', 'codex'] as DepsSdkProvider[]).map((sdk) => {
        const s = status?.[sdk] ?? null
        return (
          <Card key={sdk}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {sdkLabel(sdk)}
                {s ? (
                  <span className="text-sm font-normal text-muted-foreground">
                    当前：{sourceLabel(s.activeSource)}
                  </span>
                ) : null}
              </CardTitle>
              <CardDescription>内置可用 + 一键安装/升级到外置目录。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-md border p-3">
                  <div className="text-sm font-semibold">内置（bundled）</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {s?.bundled.available ? `版本：${s.bundled.version ?? 'unknown'}` : '不可用'}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-sm font-semibold">外置（external）</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {s?.external.available ? `版本：${s.external.version ?? 'unknown'}` : '未安装'}
                  </div>
                  {s?.external?.dir ? (
                    <div className="text-xs text-muted-foreground mt-1 break-all">
                      目录：{s.external.dir}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label>版本 spec</Label>
                <Input
                  value={specBySdk[sdk]}
                  onChange={(e) => void setVersionSpec(sdk, e.target.value)}
                  placeholder="例如：latest / ^0.77.0 / 0.1.76"
                />
                <div className="text-xs text-muted-foreground">
                  说明：spec 支持 npm 的 semver/tag；安装会先落到临时目录，验证通过后再原子替换。
                </div>
              </div>

              {s?.lastError ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-xs">
                  最近错误：{s.lastError}
                </div>
              ) : null}

              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={() => void install(sdk)} disabled={busy}>
                  <Download className="h-4 w-4 mr-2" />
                  安装/升级
                </Button>
                <Button variant="secondary" onClick={() => void uninstall(sdk)} disabled={busy}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  卸载外置
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => window.open(sdk === 'claude' ? 'https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk' : 'https://www.npmjs.com/package/@openai/codex-sdk')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  npm 页面
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}

      <Card>
        <CardHeader>
          <CardTitle>安装日志</CardTitle>
          <CardDescription>仅用于诊断，不包含任何密钥信息。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {progress ? `最近进度：${progress.sdk} / ${progress.phase} / ${progress.message}` : '（暂无）'}
          </div>
          <pre className="rounded-md border bg-background p-3 text-xs overflow-auto max-h-[220px] whitespace-pre-wrap">
            {logLines.join('\n') || '（暂无）'}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}

