import { useState, useRef } from 'react'
import { Copy, Check } from 'lucide-react'
import { formatTokenCount } from '../../../../../shared/tokenUtils'

interface RoundUsageInfo {
  promptTokens: number
  completionTokens: number
  cachedTokens?: number
  totalTokens: number
}

interface Props {
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cachedTokens?: number
    roundUsages?: RoundUsageInfo[]
  }
  createdAt: number
  finishedAt?: number
  firstTokenAt?: number
}

export function TokenStatsBar({ usage, createdAt, finishedAt, firstTokenAt }: Props) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [copied, setCopied] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    setShowTooltip(true)
  }
  const hide = () => {
    hideTimer.current = setTimeout(() => setShowTooltip(false), 150)
  }

  const parts: string[] = []

  parts.push(`↑${formatTokenCount(usage.promptTokens)}`)
  parts.push(`↓${formatTokenCount(usage.completionTokens)}`)
  if (usage.cachedTokens && usage.cachedTokens > 0) {
    parts.push(`⚡${formatTokenCount(usage.cachedTokens)}`)
  }

  let durationMs: number | null = null
  let tps: number | null = null
  if (finishedAt && finishedAt > createdAt) {
    durationMs = finishedAt - createdAt
    const durationSec = durationMs / 1000
    parts.push(`耗时 ${durationSec.toFixed(1)}s`)

    if (usage.completionTokens > 0 && durationSec > 0) {
      tps = usage.completionTokens / durationSec
      parts.push(`tps ${Math.round(tps)}`)
    }
  }

  if (firstTokenAt && firstTokenAt > createdAt) {
    const ttft = (firstTokenAt - createdAt) / 1000
    parts.push(`首字 ${ttft.toFixed(1)}s`)
  }

  const rounds = usage.roundUsages
  const hasRounds = rounds && rounds.length > 1

  const tooltipLines: string[] = []

  if (hasRounds) {
    tooltipLines.push(`—— 汇总（${rounds.length} 轮）——`)
  }
  tooltipLines.push(`输入：${usage.promptTokens} tokens`)
  tooltipLines.push(`输出：${usage.completionTokens} tokens`)
  if (usage.cachedTokens && usage.cachedTokens > 0) {
    tooltipLines.push(`缓存：${usage.cachedTokens} tokens`)
  }
  if (durationMs !== null) {
    tooltipLines.push(`耗时：${durationMs} ms`)
  }
  if (tps !== null) {
    tooltipLines.push(`token速度：${tps.toFixed(2)} tokens/s`)
  }

  if (hasRounds) {
    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i]
      tooltipLines.push('')
      tooltipLines.push(`—— 第 ${i + 1} 轮 ——`)
      tooltipLines.push(`输入：${r.promptTokens} tokens`)
      tooltipLines.push(`输出：${r.completionTokens} tokens`)
      if (r.cachedTokens && r.cachedTokens > 0) {
        tooltipLines.push(`缓存：${r.cachedTokens} tokens`)
      }
    }
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(tooltipLines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className="tokenStatsBar"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {parts.join(' · ')}
      {showTooltip && (
        <div
          className="tokenStatsTooltip"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <div className="tokenStatsTooltipContent">
            {tooltipLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
          <button
            type="button"
            className="tokenStatsTooltipCopy"
            onClick={handleCopy}
            title="复制"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      )}
    </div>
  )
}
