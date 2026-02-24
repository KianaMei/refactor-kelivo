import { useState, useEffect } from 'react'

// 模块级缓存：本地头像路径 → data URL，避免组件重新挂载时闪烁
const avatarCache = new Map<string, string>()

// ============================================================================
// 品牌图标映射 (与 Flutter BrandAssets 一致)
// ============================================================================
const BRAND_MAPPINGS: Array<{ pattern: RegExp; icon: string; mono?: boolean }> = [
  { pattern: /openai|gpt|o\d/i, icon: 'openai.svg', mono: true },
  { pattern: /gemini/i, icon: 'gemini-color.svg' },
  { pattern: /google/i, icon: 'google-color.svg' },
  { pattern: /claude/i, icon: 'claude-color.svg' },
  { pattern: /anthropic/i, icon: 'anthropic.svg' },
  { pattern: /deepseek/i, icon: 'deepseek-color.svg' },
  { pattern: /grok|xai/i, icon: 'grok.svg', mono: true },
  { pattern: /qwen|qwq|qvq/i, icon: 'qwen-color.svg' },
  { pattern: /doubao/i, icon: 'doubao-color.svg' },
  { pattern: /openrouter/i, icon: 'openrouter.svg', mono: true },
  { pattern: /zhipu|智谱|glm/i, icon: 'zhipu-color.svg' },
  { pattern: /mistral/i, icon: 'mistral-color.svg' },
  { pattern: /metaso|秘塔/i, icon: 'metaso-color.svg' },
  { pattern: /(?<!o)llama|meta/i, icon: 'meta-color.svg' },
  { pattern: /hunyuan|tencent/i, icon: 'hunyuan-color.svg' },
  { pattern: /gemma/i, icon: 'gemma-color.svg' },
  { pattern: /perplexity/i, icon: 'perplexity-color.svg' },
  { pattern: /aliyun|阿里云|百炼/i, icon: 'alibabacloud-color.svg' },
  { pattern: /bytedance|火山/i, icon: 'bytedance-color.svg' },
  { pattern: /silicon|硅基/i, icon: 'siliconflow-color.svg' },
  { pattern: /aihubmix/i, icon: 'aihubmix-color.svg' },
  { pattern: /ollama/i, icon: 'ollama.svg' },
  { pattern: /github/i, icon: 'github.svg' },
  { pattern: /cloudflare/i, icon: 'cloudflare-color.svg' },
  { pattern: /minimax/i, icon: 'minimax-color.svg' },
  { pattern: /kimi/i, icon: 'kimi-color.svg' },
  { pattern: /302/i, icon: '302ai-color.svg' },
  { pattern: /step|阶跃/i, icon: 'stepfun-color.svg' },
  { pattern: /internlm|书生/i, icon: 'internlm-color.svg' },
  { pattern: /cohere|command-.+/i, icon: 'cohere-color.svg' },
  { pattern: /kelivo/i, icon: 'kelivo.png' },
  { pattern: /tensdaq/i, icon: 'tensdaq-color.svg' },
]

function getBrandAsset(name: string): { icon: string; mono: boolean } | null {
  const lower = name.toLowerCase()
  for (const m of BRAND_MAPPINGS) {
    if (m.pattern.test(lower)) {
      return { icon: m.icon, mono: m.mono ?? false }
    }
  }
  return null
}

// 生成基于名称的颜色 (与 Flutter 一致)
function getInitialColor(name: string): string {
  const colors = [
    '#10a37f', // OpenAI绿
    '#cc785c', // Claude橙
    '#4285f4', // Google蓝
    '#0066ff', // DeepSeek蓝
    '#6366f1', // 紫色
    '#ec4899', // 粉色
    '#f59e0b', // 橙色
    '#10b981', // 青绿
    '#8b5cf6', // 紫罗兰
    '#06b6d4', // 青色
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return colors[hash % colors.length]
}

/**
 * 判断 customAvatarPath 是不是本地相对路径（avatars/providers/xxx.png）。
 * 排除 http(s) URL、data URL、纯 emoji。
 */
function isLocalRelativePath(av: string): boolean {
  if (av.startsWith('http') || av.startsWith('data:')) return false
  // 包含路径分隔符 → 本地路径
  return av.includes('/') || av.includes('\\')
}

// ============================================================================
// BrandAvatar 组件 - 像素级复刻 Flutter BrandAvatar
// ============================================================================
export function BrandAvatar({
  name,
  size = 88,
  customAvatarPath,
  square = false,
  fill = false
}: {
  name: string
  size?: number
  customAvatarPath?: string
  square?: boolean
  fill?: boolean
}) {
  // 从缓存同步初始化，避免重新挂载时闪烁
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    const av = customAvatarPath?.trim()
    if (av && isLocalRelativePath(av)) return avatarCache.get(av) ?? null
    return null
  })
  const [imgFailed, setImgFailed] = useState(false)

  // 本地相对路径 → 异步解析为 data URL（主进程读文件并返回 base64）
  useEffect(() => {
    setImgFailed(false)
    const av = customAvatarPath?.trim()
    if (!av || !isLocalRelativePath(av)) {
      setResolvedSrc(null)
      return
    }
    // 缓存命中 → 直接使用，跳过 IPC
    const cached = avatarCache.get(av)
    if (cached) {
      setResolvedSrc(cached)
      return
    }
    let cancelled = false
    window.api.avatar.resolve(av).then((dataUrl) => {
      if (!cancelled && dataUrl) {
        avatarCache.set(av, dataUrl)
        setResolvedSrc(dataUrl)
      }
    }).catch(() => {
      if (!cancelled) setResolvedSrc(null)
    })
    return () => { cancelled = true }
  }, [customAvatarPath])

  const initial = name.charAt(0).toUpperCase() || '?'
  const brandAsset = getBrandAsset(name)
  const borderRadius = square ? 12 : '50%'
  const sizeStyle = fill ? { width: '100%', height: '100%' } : { width: size, height: size }

  // 自定义头像优先
  if (customAvatarPath && customAvatarPath.trim()) {
    const av = customAvatarPath.trim()

    // 网络图片 / data URL
    if (av.startsWith('http') || av.startsWith('data:')) {
      return (
        <div
          className="brand-avatar"
          style={{
            ...sizeStyle,
            borderRadius,
            background: 'var(--surface-2)',
            overflow: 'hidden'
          }}
        >
          <img
            src={av}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
      )
    }

    // 本地文件路径（已通过 useEffect 解析）
    if (isLocalRelativePath(av)) {
      return (
        <div
          className="brand-avatar"
          style={{
            ...sizeStyle,
            borderRadius,
            background: 'var(--surface-2)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {imgFailed ? (
            <svg width="40%" height="40%" viewBox="0 0 24 24" fill="none" stroke="var(--text-3, #999)" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
              <line x1="4" y1="4" x2="20" y2="20" stroke="var(--danger, #e55)" strokeWidth="1.5" />
            </svg>
          ) : resolvedSrc ? (
            <img
              src={resolvedSrc}
              alt={name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setImgFailed(true)}
            />
          ) : null}
        </div>
      )
    }

    // Emoji（不含路径分隔符）
    if (!av.includes('/') && !av.includes(':') && !av.includes('\\')) {
      return (
        <div
          className="brand-avatar"
          style={{
            ...sizeStyle,
            borderRadius,
            background: 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: fill ? '3em' : size * 0.5
          }}
        >
          {av}
        </div>
      )
    }
  }

  // 品牌图标
  if (brandAsset) {
    return (
      <div
        className="brand-avatar"
        style={{
          ...sizeStyle,
          borderRadius,
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <img
          src={`/icons/${brandAsset.icon}`}
          alt={name}
          style={{
            width: '70%',
            height: '70%',
            objectFit: 'contain'
          }}
          onError={(e) => {
            const parent = e.currentTarget.parentElement
            if (parent) {
              e.currentTarget.style.display = 'none'
              const span = document.createElement('span')
              span.style.cssText = 'color:var(--primary);font-size:2.5em;font-weight:700'
              span.textContent = initial
              parent.appendChild(span)
            }
          }}
        />
      </div>
    )
  }

  // 首字母回退
  const color = getInitialColor(name)
  return (
    <div
      className="brand-avatar"
      style={{
        ...sizeStyle,
        borderRadius,
        background: `${color}20`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: color,
        fontSize: fill ? '3em' : size * 0.42,
        fontWeight: 700
      }}
    >
      {initial}
    </div>
  )
}
