import { useEffect, useMemo, useState } from 'react'

import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

function isValidHttpUrl(input: string): boolean {
  const s = input.trim()
  return s.startsWith('http://') || s.startsWith('https://')
}

export function ImageUrlDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (url: string) => void
}) {
  const { open, onOpenChange, onSave } = props
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!open) return
    setValue('')
  }, [open])

  const valid = useMemo(() => isValidHttpUrl(value), [value])

  function commit() {
    if (!valid) return
    onSave(value.trim())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-black/0"
        hideClose
        className={[
          'w-full max-w-[440px] rounded-2xl',
          'bg-card text-card-foreground',
          'border border-border/60 shadow-xl',
          'p-6',
          'gap-4',
        ].join(' ')}
      >
        <DialogTitle className="text-base font-semibold">输入图片链接</DialogTitle>

        <div className="space-y-3">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onOpenChange(false)
              if (e.key === 'Enter') commit()
            }}
            placeholder="例如: https://example.com/avatar.png"
            className="h-11 rounded-xl bg-muted border-0 focus-visible:ring-primary/30"
            autoFocus
          />

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

