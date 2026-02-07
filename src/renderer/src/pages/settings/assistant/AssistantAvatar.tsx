import { useEffect, useState } from 'react'

import type { AssistantConfig } from '../../../../../shared/types'

function isLocalRelativePath(p: string): boolean {
  const s = p.trim()
  if (!s) return false
  if (s.startsWith('http') || s.startsWith('data:')) return false
  return s.includes('/') || s.includes('\\')
}

function takeFirstChar(s: string): string {
  const t = s.trim()
  if (!t) return '?'
  return Array.from(t)[0] ?? '?'
}

export function AssistantAvatar(props: { assistant: AssistantConfig; size?: number; className?: string }) {
  const { assistant, size = 48, className } = props
  const raw = (assistant.avatar ?? '').trim()
  const isImage = assistant.avatarType === 'image'

  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    if (!isImage || !raw) {
      setSrc(null)
      return
    }
    if (raw.startsWith('http') || raw.startsWith('data:')) {
      setSrc(raw)
      return
    }
    if (!isLocalRelativePath(raw)) {
      setSrc(null)
      return
    }

    let cancelled = false
    window.api.avatar.resolve(raw)
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl ?? null)
      })
      .catch(() => {
        if (!cancelled) setSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [isImage, raw])

  const displayEmoji = !isImage && raw ? takeFirstChar(raw) : null
  const initial = takeFirstChar(assistant.name || '?')

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--primary-bg)',
        color: 'var(--primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0
      }}
      title={assistant.name}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={assistant.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setFailed(true)}
        />
      ) : displayEmoji ? (
        <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>{displayEmoji}</span>
      ) : (
        <span style={{ fontSize: size * 0.42, fontWeight: 700, lineHeight: 1 }}>{initial}</span>
      )}
    </div>
  )
}

