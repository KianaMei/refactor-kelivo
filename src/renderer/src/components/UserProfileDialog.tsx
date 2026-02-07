import { useEffect, useMemo, useRef, useState } from 'react'
import type { UserAvatarType, UserConfig } from '../../../shared/types'
import { Pencil, User as UserIcon, Image as ImageIcon, Link2, RotateCw } from 'lucide-react'

import { Dialog, DialogContent } from './ui/dialog'
import { Input } from './ui/input'
import { Card } from './ui/card'

import { EmojiPickerDialog } from './user-profile/EmojiPickerDialog'
import { ImageUrlDialog } from './user-profile/ImageUrlDialog'
import { QQInputDialog } from './user-profile/QQInputDialog'

interface UserProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserConfig
  onSave: (user: UserConfig) => void
}

function firstGrapheme(input: string): string {
  const s = input.trim()
  if (!s) return ''
  const Seg = (Intl as any)?.Segmenter as (new (...args: any[]) => any) | undefined
  if (Seg) {
    const seg = new Seg(undefined, { granularity: 'grapheme' })
    const it = seg.segment(s)[Symbol.iterator]()
    const first = it.next()
    return first?.value?.segment ?? ''
  }
  return Array.from(s)[0] ?? ''
}

function normalizeUser(user: UserConfig): UserConfig {
  return {
    name: user.name ?? '',
    avatarType: (user.avatarType ?? 'initial') as UserAvatarType,
    avatarValue: user.avatarValue ?? '',
  }
}

export function UserProfileDialog(props: UserProfileDialogProps) {
  const { open, onOpenChange, user } = props

  const fileInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCommittedRef = useRef<string>('')
  const draftRef = useRef<UserConfig>(normalizeUser(user))

  const [name, setName] = useState(user.name)
  const [avatarType, setAvatarType] = useState<UserAvatarType>(user.avatarType)
  const [avatarValue, setAvatarValue] = useState(user.avatarValue)

  const [emojiOpen, setEmojiOpen] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [qqOpen, setQQOpen] = useState(false)

  // 只在「打开」时初始化草稿，避免每次持久化回流都打断输入光标。
  useEffect(() => {
    if (!open) return
    const next = normalizeUser(user)
    setName(next.name)
    setAvatarType(next.avatarType)
    setAvatarValue(next.avatarValue)
    draftRef.current = next
    lastCommittedRef.current = JSON.stringify(next)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    draftRef.current = { name, avatarType, avatarValue }
  }, [name, avatarType, avatarValue])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  function commitNow() {
    const next = draftRef.current
    const key = JSON.stringify(next)
    if (key === lastCommittedRef.current) return
    lastCommittedRef.current = key
    props.onSave(next)
  }

  function scheduleCommit() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      commitNow()
    }, 300)
  }

  function flushCommit() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    commitNow()
  }

  const letter = useMemo(() => firstGrapheme(name) || '?', [name])
  const isCustom = (avatarType !== 'initial')

  const renderAvatar = (size: number = 84) => {
    const baseStyle: React.CSSProperties = {
      width: size,
      height: size,
      borderRadius: '50%',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--primary-bg)',
      color: 'var(--primary)',
      fontWeight: 700,
      fontSize: size * 0.44,
      overflow: 'hidden',
    }

    if (avatarType === 'emoji' && avatarValue) {
      return (
        <div style={{ ...baseStyle, fontSize: size * 0.45 }}>
          <span style={{ fontSize: size * 0.45, lineHeight: 1 }}>{avatarValue}</span>
        </div>
      )
    }

    if ((avatarType === 'url' || avatarType === 'file') && avatarValue) {
      const src = avatarType === 'file' ? `file://${avatarValue}` : avatarValue
      return (
        <div style={baseStyle}>
          <span>{letter}</span>
          <img
            src={src}
            alt={name}
            style={{
              position: 'absolute',
              inset: 0,
              width: size,
              height: size,
              objectFit: 'cover',
            }}
            onError={(e) => {
              // 图片加载失败时保留 fallback 首字母
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
      )
    }

    return <div style={baseStyle}>{letter}</div>
  }

  function setAvatar(nextType: UserAvatarType, nextValue: string) {
    setAvatarType(nextType)
    setAvatarValue(nextValue)
    draftRef.current = { ...draftRef.current, avatarType: nextType, avatarValue: nextValue }
    commitNow()
  }

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) flushCommit()
    onOpenChange(nextOpen)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result ?? '')
      if (!dataUrl) return
      // Electron 中 file input 默认拿不到真实路径，这里存 dataURL，按 url 类型显示即可
      setAvatar('url', dataUrl)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          overlayClassName="bg-black/25"
          hideClose
          className={[
            'w-full min-w-[320px] max-w-[480px]', // Increased width for grid
            'rounded-[24px] shadow-2xl',
            'bg-card text-card-foreground',
            'border border-border/40',
            'p-6',
            'gap-0',
          ].join(' ')}
        >
          <div className="flex flex-col items-center w-full">
            {/* Header / Preview Section */}
            <div className="relative mb-6">
              <div className="p-1.5 rounded-full border-2 border-border/30 bg-background shadow-sm">
                {renderAvatar(100)}
              </div>
              <div className="absolute -bottom-2 -right-2 bg-card border border-border/50 rounded-full px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
                {isCustom ? '自定义' : '默认'}
              </div>
            </div>

            {/* Username Input */}
            <div className="w-full max-w-[320px] mb-8">
              <div className="relative group">
                <Input
                  id="user-profile-name"
                  value={name}
                  onChange={(e) => {
                    const next = e.target.value
                    setName(next)
                    draftRef.current = { ...draftRef.current, name: next }
                    scheduleCommit()
                  }}
                  onBlur={flushCommit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      flushCommit()
                      onOpenChange(false)
                    }
                  }}
                  placeholder=" "
                  className="peer h-12 rounded-xl bg-muted/30 border-border/50 text-center text-lg font-medium focus:bg-background transition-all"
                  autoFocus
                />
                <label
                  htmlFor="user-profile-name"
                  className="absolute left-0 right-0 top-1/2 -translate-y-1/2 text-sm text-muted-foreground text-center pointer-events-none transition-all peer-focus:-top-6 peer-focus:translate-y-0 peer-focus:text-xs peer-[:not(:placeholder-shown)]:-top-6 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-primary/70"
                >
                  昵称
                </label>
              </div>
            </div>

            {/* Action Grid */}
            <div className="grid grid-cols-2 w-full gap-3">
              <ActionCard
                icon={<ImageIcon size={20} />}
                label="上传图片"
                desc="支持 PNG/JPG/GIF"
                onClick={() => fileInputRef.current?.click()}
              />

              <ActionCard
                icon={<UserIcon size={20} />}
                label="选择表情"
                desc="系统表情符号"
                onClick={() => setEmojiOpen(true)}
              />

              <ActionCard
                icon={<Link2 size={20} />}
                label="图片链接"
                desc="使用网络图片地址"
                onClick={() => setUrlOpen(true)}
              />

              <ActionCard
                icon={<div className="font-bold text-xs border border-current rounded px-0.5 w-5 h-5 flex items-center justify-center">QQ</div>}
                label="导入 QQ 头像"
                desc="使用 QQ 号码"
                onClick={() => setQQOpen(true)}
              />
            </div>


            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </DialogContent>
      </Dialog>

      <EmojiPickerDialog
        open={emojiOpen}
        onOpenChange={setEmojiOpen}
        onPick={(emoji) => setAvatar('emoji', emoji)}
      />

      <ImageUrlDialog
        open={urlOpen}
        onOpenChange={setUrlOpen}
        onSave={(url) => setAvatar('url', url)}
      />

      <QQInputDialog
        open={qqOpen}
        onOpenChange={setQQOpen}
        onSave={(url) => setAvatar('url', url)}
      />
    </>
  )
}

function ActionCard({
  icon,
  label,
  desc,
  onClick
}: {
  icon: React.ReactNode,
  label: string,
  desc?: string,
  onClick: () => void
}) {
  return (
    <Card
      className="group relative overflow-hidden bg-card hover:bg-muted/40 hover:border-primary/30 transition-all cursor-pointer border-border/60 shadow-sm hover:shadow-md active:scale-95"
      onClick={onClick}
    >
      <div className="p-3 flex flex-row items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/5 text-primary flex items-center justify-center group-hover:bg-primary/10 transition-colors">
          {icon}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold truncate text-foreground/90">{label}</span>
          {desc && <span className="text-[11px] text-muted-foreground truncate">{desc}</span>}
        </div>
      </div>
    </Card>
  )
}
