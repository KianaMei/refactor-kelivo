import type { ChatMessage } from '../MessageBubble'

function addBlobUrlsFromMessages(messages: ChatMessage[], out: Set<string>): void {
  for (const m of messages) {
    const atts = m.attachments ?? []
    for (const a of atts) {
      const u = String(a.url ?? '').trim()
      if (!u) continue
      if (!u.startsWith('blob:')) continue
      out.add(u)
    }
  }
}

/**
 * Revoke object URLs that are no longer referenced by any remaining message.
 *
 * Why:
 * - Attachments are kept in-memory (not persisted to DB yet)
 * - We must NOT revoke URLs still used by other messages/conversations (eg. forked chats)
 */
export function revokeOrphanBlobUrls(args: {
  removing: ChatMessage[]
  remainingByConv: Record<string, ChatMessage[]>
}): void {
  const toMaybeRevoke = new Set<string>()
  addBlobUrlsFromMessages(args.removing, toMaybeRevoke)
  if (toMaybeRevoke.size === 0) return

  const stillUsed = new Set<string>()
  for (const msgs of Object.values(args.remainingByConv)) {
    addBlobUrlsFromMessages(msgs, stillUsed)
  }

  for (const url of toMaybeRevoke) {
    if (stillUsed.has(url)) continue
    try {
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
  }
}
