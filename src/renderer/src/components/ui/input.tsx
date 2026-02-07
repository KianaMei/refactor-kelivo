import * as React from 'react'

import { cn } from '../../lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type = 'text', style, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      // 有些场景会被错误的 `-webkit-text-fill-color` 覆盖导致“有值但文字不可见”，这里强制跟随 currentColor。
      style={{ WebkitTextFillColor: 'currentColor', ...style }}
      className={cn(
        [
          'flex h-9 w-full rounded-md border border-input bg-background text-foreground caret-foreground px-3 py-1',
          'text-sm shadow-none transition-colors',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'placeholder:text-muted-foreground',
          // 统一 Kelivo 现有输入框的焦点样式：去掉 ring-offset（避免出现“内外双边框 + 间隙”的观感）
          'focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ].join(' '),
        className
      )}
      {...props}
    />
  )
})
Input.displayName = 'Input'
