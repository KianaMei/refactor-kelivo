export function joinUrl(baseUrl: string, path: string): string {
  // 允许用户把 baseUrl 填到 /v1，也允许 path 以 /chat/completions 形式传入。
  const base = new URL(baseUrl)
  const basePath = base.pathname.replace(/\/+$/, '')
  const extra = path.replace(/^\/+/, '')
  base.pathname = `${basePath}/${extra}`
  return base.toString()
}

export async function safeReadText(resp: Response): Promise<string> {
  try {
    return await resp.text()
  } catch {
    return ''
  }
}

export function isAbortError(err: unknown): boolean {
  // Node fetch / undici 会抛 DOMException(name=AbortError) 或类似 Error(message includes 'aborted')
  if (!err) return false
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes('abort')) return true
    if (msg.includes('aborted')) return true
  }
  return false
}

