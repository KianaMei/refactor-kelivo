import { useEffect, useState } from 'react'

function isLocalRelativePath(p: string): boolean {
  const s = p.trim()
  if (!s) return false
  if (s.startsWith('http') || s.startsWith('data:')) return false
  return s.includes('/') || s.includes('\\')
}

export function useResolvedAssetUrl(path?: string | null) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const raw = (path ?? '').trim()
    if (!raw) {
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
    window.api.avatar.resolve(raw).then((dataUrl) => {
      if (!cancelled) setSrc(dataUrl ?? null)
    }).catch(() => {
      if (!cancelled) setSrc(null)
    })
    return () => { cancelled = true }
  }, [path])

  return src
}

