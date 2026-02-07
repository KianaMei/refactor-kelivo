import { useState, useRef, useEffect } from 'react'
import {
  ExternalLink, Github, Heart, Sparkles, Globe, MessageCircle, FileText, Coffee,
  Bug, Zap, Settings, Code2, RefreshCw, Copy, Check
} from 'lucide-react'

export function AboutPane() {
  const version = '0.1.0'
  const buildNumber = '1'
  const platform = 'Windows (Electron)'

  const [tapCount, setTapCount] = useState(0)
  const [devModeEnabled, setDevModeEnabled] = useState(false)
  const [showEasterEgg, setShowEasterEgg] = useState(false)
  const [copied, setCopied] = useState(false)
  const tapTimer = useRef<NodeJS.Timeout | null>(null)

  const TAPS_REQUIRED = 7

  function handleLogoTap() {
    if (devModeEnabled) return

    setTapCount((prev) => {
      const next = prev + 1

      // 清除之前的计时器
      if (tapTimer.current) {
        clearTimeout(tapTimer.current)
      }

      // 2秒内没有继续点击就重置
      tapTimer.current = setTimeout(() => {
        setTapCount(0)
      }, 2000)

      // 达到7次，触发彩蛋
      if (next >= TAPS_REQUIRED) {
        setShowEasterEgg(true)
        setDevModeEnabled(true)
        setTapCount(0)
        if (tapTimer.current) {
          clearTimeout(tapTimer.current)
        }
        // 3秒后关闭彩蛋动画
        setTimeout(() => setShowEasterEgg(false), 3000)
        return 0
      }

      return next
    })
  }

  useEffect(() => {
    return () => {
      if (tapTimer.current) {
        clearTimeout(tapTimer.current)
      }
    }
  }, [])

  function openUrl(url: string) {
    window.open(url, '_blank')
  }

  async function copyDebugInfo() {
    const info = [
      `Kelivo v${version} (${buildNumber})`,
      `Platform: ${platform}`,
      `User Agent: ${navigator.userAgent}`,
      `Screen: ${window.screen.width}x${window.screen.height}`,
      `Window: ${window.innerWidth}x${window.innerHeight}`,
      `DevicePixelRatio: ${window.devicePixelRatio}`,
      `Language: ${navigator.language}`,
      `Online: ${navigator.onLine}`,
      `Time: ${new Date().toISOString()}`,
    ].join('\n')

    await navigator.clipboard.writeText(info)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const remainingTaps = TAPS_REQUIRED - tapCount

  return (
    <div style={s.root}>
      <div style={s.header}>关于</div>

      {/* 彩蛋动画 */}
      {showEasterEgg && (
        <div style={s.easterEggOverlay}>
          <div style={s.easterEggContent}>
            <Zap size={64} style={{ color: '#fbbf24', marginBottom: 16, animation: 'pulse 0.5s infinite' }} />
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>开发者模式已启用!</div>
            <div style={{ fontSize: 14, opacity: 0.8 }}>你发现了隐藏功能</div>
          </div>
        </div>
      )}

      {/* Logo 区域 - 可点击 */}
      <button
        type="button"
        style={s.logoSection}
        onClick={handleLogoTap}
        aria-label={devModeEnabled ? '开发者模式已启用' : `点击 ${remainingTaps} 次启用开发者模式`}
      >
        <div style={{
          ...s.logoCircle,
          ...(tapCount > 0 ? { transform: `scale(${1 + tapCount * 0.03})`, transition: 'transform 0.1s' } : {})
        }}>
          <Sparkles size={32} style={{ color: 'var(--primary)' }} />
        </div>
        <div style={s.appName}>Kelivo</div>
        <div style={s.versionText}>v{version} ({buildNumber})</div>
        <div style={s.platformText}>{platform}</div>

        {/* 点击提示 */}
        {tapCount > 0 && tapCount < TAPS_REQUIRED && (
          <div style={s.tapHint}>
            再点击 {remainingTaps} 次...
          </div>
        )}

        {devModeEnabled && (
          <div style={s.devBadge}>
            <Bug size={12} />
            开发者模式
          </div>
        )}
      </button>

      {/* 项目链接 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>项目链接</div>
        <LinkRow
          icon={<Globe size={16} />}
          label="官方网站"
          onClick={() => openUrl('https://kelivo.psycheas.top')}
        />
        <div style={s.divider} />
        <LinkRow
          icon={<Github size={16} />}
          label="GitHub 仓库"
          onClick={() => openUrl('https://github.com/KianaMei/kelivo')}
        />
        <div style={s.divider} />
        <LinkRow
          icon={<FileText size={16} />}
          label="使用文档"
          onClick={() => openUrl('https://kelivo.psycheas.top/docs')}
        />
        <div style={s.divider} />
        <LinkRow
          icon={<MessageCircle size={16} />}
          label="Discord 社区"
          onClick={() => openUrl('https://discord.gg/kelivo')}
        />
      </div>

      {/* 赞助与支持 */}
      <div className="settingsCard">
        <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center' }}>
          <Heart size={15} style={{ marginRight: 6, color: '#ef4444' }} />
          赞助与支持
        </div>
        <div style={s.hint}>
          如果你觉得 Kelivo 对你有帮助，欢迎赞助支持项目的持续开发。
        </div>

        <div style={s.sponsorGrid}>
          <button
            type="button"
            className="btn btn-ghost"
            style={s.sponsorCard}
            onClick={() => openUrl('https://afdian.com/a/kelivo')}
          >
            <Coffee size={20} style={{ color: '#946ce6', marginBottom: 6 }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>爱发电</span>
            <span style={{ fontSize: 11, opacity: 0.6 }}>afdian.com</span>
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            style={s.sponsorCard}
            onClick={() => openUrl('https://github.com/sponsors/KianaMei')}
          >
            <Heart size={20} style={{ color: '#db61a2', marginBottom: 6 }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>GitHub Sponsors</span>
            <span style={{ fontSize: 11, opacity: 0.6 }}>github.com</span>
          </button>
        </div>
      </div>

      {/* 开发信息 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>开发信息</div>
        <InfoRow label="版本" value={`${version} (${buildNumber})`} />
        <div style={s.divider} />
        <InfoRow label="平台" value={platform} />
        <div style={s.divider} />
        <InfoRow label="技术栈" value="Electron + React + TypeScript" />
        <div style={s.divider} />
        <InfoRow label="构建工具" value="electron-vite + electron-builder" />
      </div>

      {/* 开发者模式面板 */}
      {devModeEnabled && (
        <div className="settingsCard">
          <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center' }}>
            <Bug size={15} style={{ marginRight: 6, color: '#f59e0b' }} />
            开发者选项
          </div>

          <div style={s.devOption}>
            <div style={s.devOptionInfo}>
              <Settings size={14} />
              <span>开发者模式</span>
            </div>
            <button
              type="button"
              className={`toggle ${devModeEnabled ? 'toggleOn' : ''}`}
              onClick={() => setDevModeEnabled(!devModeEnabled)}
            >
              <div className="toggleThumb" />
            </button>
          </div>
          <div style={s.divider} />

          <div style={s.devOption}>
            <div style={s.devOptionInfo}>
              <Code2 size={14} />
              <span>复制调试信息</span>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={copyDebugInfo}
              style={{ gap: 4 }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
          <div style={s.divider} />

          <div style={s.devOption}>
            <div style={s.devOptionInfo}>
              <RefreshCw size={14} />
              <span>重新加载应用</span>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => window.location.reload()}
            >
              重新加载
            </button>
          </div>

          <div style={{ ...s.hint, marginTop: 12 }}>
            <p style={{ margin: 0, color: '#f59e0b' }}>
              开发者选项仅用于调试目的。错误的操作可能导致应用异常。
            </p>
          </div>

          {/* 系统信息 */}
          <div style={s.debugInfo}>
            <div style={s.debugInfoTitle}>系统信息</div>
            <pre style={s.debugPre}>
{`User Agent: ${navigator.userAgent}
Screen: ${window.screen.width}x${window.screen.height}
Window: ${window.innerWidth}x${window.innerHeight}
Pixel Ratio: ${window.devicePixelRatio}
Language: ${navigator.language}
Online: ${navigator.onLine}`}
            </pre>
          </div>
        </div>
      )}

      {/* 开源许可 */}
      <div className="settingsCard">
        <div style={s.cardTitle}>开源许可</div>
        <div style={s.hint}>
          本项目基于 MIT 许可证开源。
          <br />
          使用的第三方库遵循各自的开源许可协议。
        </div>
      </div>

      {/* 页脚 */}
      <div style={s.footer}>
        <div style={s.footerText}>Made with love by ze</div>
        <div style={s.footerCopy}>&copy; 2024-2026 Kelivo</div>
      </div>
    </div>
  )
}

function InfoRow(props: { label: string; value: string }) {
  return (
    <div style={s.infoRow}>
      <span style={s.infoLabel}>{props.label}</span>
      <span style={s.infoValue}>{props.value}</span>
    </div>
  )
}

function LinkRow(props: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn btn-ghost" style={s.linkRow} onClick={props.onClick}>
      {props.icon}
      <span style={{ flex: 1, textAlign: 'left' }}>{props.label}</span>
      <ExternalLink size={14} style={{ opacity: 0.5 }} />
    </button>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { padding: '16px 16px 32px', maxWidth: 960, margin: '0 auto' },
  header: { fontSize: 16, fontWeight: 700, marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: 700, marginBottom: 10 },
  divider: { height: 1, background: 'var(--border)', margin: '4px 0', opacity: 0.5 },
  hint: { fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)', marginTop: 8 },
  logoSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    marginBottom: 24,
    padding: 16,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 12,
    transition: 'background 0.2s',
    width: '100%',
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: 'var(--primary-2)',
    border: '1px solid var(--primary-3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  appName: { fontSize: 22, fontWeight: 800, marginBottom: 4, color: 'var(--text)' },
  versionText: { fontSize: 14, opacity: 0.8, marginBottom: 2, color: 'var(--text)' },
  platformText: { fontSize: 12, opacity: 0.6, color: 'var(--text)' },
  tapHint: {
    marginTop: 8,
    fontSize: 12,
    color: 'var(--primary)',
    fontWeight: 500,
    animation: 'fadeIn 0.2s',
  },
  devBadge: {
    marginTop: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    padding: '4px 10px',
    background: 'rgba(245, 158, 11, 0.15)',
    color: '#f59e0b',
    borderRadius: 12,
    fontWeight: 600,
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0',
  },
  infoLabel: { fontSize: 14, opacity: 0.8 },
  infoValue: { fontSize: 14, fontWeight: 500 },
  linkRow: {
    width: '100%',
    justifyContent: 'flex-start',
    gap: 10,
    padding: '10px 8px',
  },
  sponsorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 10,
    marginTop: 12,
  },
  sponsorCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '16px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    gap: 2,
  },
  footer: { marginTop: 32, textAlign: 'center' as const },
  footerText: { fontSize: 13, opacity: 0.7, marginBottom: 4 },
  footerCopy: { fontSize: 12, opacity: 0.5 },
  easterEggOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    animation: 'fadeIn 0.3s',
  },
  easterEggContent: {
    textAlign: 'center' as const,
    color: '#fff',
  },
  devOption: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 0',
  },
  devOptionInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
  },
  debugInfo: {
    marginTop: 12,
    padding: 12,
    background: 'var(--surface)',
    borderRadius: 8,
  },
  debugInfoTitle: {
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 8,
    opacity: 0.7,
  },
  debugPre: {
    margin: 0,
    fontSize: 11,
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    opacity: 0.8,
  },
}
