import { useEffect, useMemo, useState } from 'react'

import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

import { QUICK_EMOJIS } from './quickEmojis'

function firstGrapheme(input: string): string {
  const s = input.trim()
  if (!s) return ''

  // Electron(Chromium) 默认支持 Intl.Segmenter；这里用它来按「字素簇」切分，和 Flutter 的 Characters 行为一致。
  // 兜底：不支持时退回到 Array.from（可能对 ZWJ/肤色修饰等不完美，但不会崩）。
  const Seg = (Intl as any)?.Segmenter as (new (...args: any[]) => any) | undefined
  if (Seg) {
    const seg = new Seg(undefined, { granularity: 'grapheme' })
    const it = seg.segment(s)[Symbol.iterator]()
    const first = it.next()
    return first?.value?.segment ?? ''
  }
  return Array.from(s)[0] ?? ''
}

function isSingleGrapheme(input: string): boolean {
  const s = input.trim()
  if (!s) return false
  const first = firstGrapheme(s)
  return first !== '' && first === s
}

export function EmojiPickerDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (emoji: string) => void
}) {
  const { open, onOpenChange, onPick } = props
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!open) return
    setValue('')
  }, [open])

  const preview = useMemo(() => {
    const g = firstGrapheme(value)
    // Flutter 版空值时用 🤔 做预览占位
    return g || '\u{1F914}'
  }, [value])

  const valid = useMemo(() => isSingleGrapheme(value), [value])

  function commit() {
    if (!valid) return
    onPick(firstGrapheme(value))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-black/0"
        hideClose
        className={[
          // 对齐 Flutter: AlertDialog 圆角 16、宽度 360、可滚动内容
          'w-full max-w-[400px] rounded-2xl',
          'bg-card text-card-foreground',
          'border border-border/60 shadow-xl',
          'p-6',
          'gap-4',
        ].join(' ')}
      >
        <DialogTitle className="text-base font-semibold">选择表情</DialogTitle>

        <div className="space-y-3">
          <div
            className="h-[72px] w-[72px] rounded-full flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)' }}
          >
            <span className="text-[40px] leading-none">{preview}</span>
          </div>

          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
            }}
            placeholder="输入或粘贴任意表情"
            className="h-11 rounded-xl bg-muted border-0 focus-visible:ring-primary/30"
            autoFocus
          />

          <div
            className={[
              // Flutter: height 动态 clamp(120, 220)。Web 这里用 max/min + overflow 近似。
              'min-h-[120px] max-h-[220px] overflow-y-auto',
              'grid grid-cols-8 gap-2',
              'pr-1',
            ].join(' ')}
          >
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="h-10 w-10 rounded-xl flex items-center justify-center text-xl leading-none"
                style={{
                  background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                }}
                onClick={() => {
                  onPick(emoji)
                  onOpenChange(false)
                }}
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="font-semibold text-primary disabled:text-muted-foreground"
              disabled={!valid}
              onClick={commit}
            >
              保存
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

