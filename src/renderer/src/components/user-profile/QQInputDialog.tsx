import { useEffect, useMemo, useState } from 'react'

import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

function isValidQQ(input: string): boolean {
  const s = input.trim()
  return /^[1-9][0-9]{4,11}$/.test(s)
}

export function QQInputDialog(props: {
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

  const valid = useMemo(() => isValidQQ(value), [value])

  function commit() {
    if (!valid) return
    const qq = value.trim()
    const url = `https://q2.qlogo.cn/headimg_dl?dst_uin=${qq}&spec=100`
    onSave(url)
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
        <DialogTitle className="text-base font-semibold">导入 QQ 头像</DialogTitle>

        <div className="space-y-3">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onOpenChange(false)
              if (e.key === 'Enter') commit()
            }}
            placeholder="请输入 QQ 号码"
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
              导入
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
