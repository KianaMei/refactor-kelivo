import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Cpu, MessageCircle, RefreshCw, Sparkles } from 'lucide-react'

import type { MessageTokenDay, MessageUsageStats } from '../../../../shared/db-types'
import { formatTokenCount } from '../../../../shared/tokenUtils'

const HEATMAP_WEEKS = 53
const TOKEN_TREND_DAYS = 30

function pad2(v: number): string {
  return String(v).padStart(2, '0')
}

function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function parseDayKey(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  return new Date(y, mo, d)
}

function getToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function getHeatmapStartSunday(today: Date): Date {
  const d = new Date(today)
  d.setDate(d.getDate() - d.getDay())
  d.setDate(d.getDate() - 52 * 7)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function quantile(sorted: number[], p: number, fallback: number): number {
  if (sorted.length === 0) return fallback
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p)))
  return sorted[idx] || fallback
}

function formatCount(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

function formatMonthLabel(day: Date): string {
  if (day.getMonth() === 0) return String(day.getFullYear())
  return new Intl.DateTimeFormat('zh-CN', { month: 'short' }).format(day)
}

function buildTokenTrend(stats: MessageUsageStats | null, today: Date): MessageTokenDay[] {
  const rows = stats?.tokenUsagePerDay ?? []
  const byDay = new Map<string, MessageTokenDay>()
  for (const item of rows) byDay.set(item.day, item)

  const start = addDays(today, -(TOKEN_TREND_DAYS - 1))
  const list: MessageTokenDay[] = []
  for (let i = 0; i < TOKEN_TREND_DAYS; i += 1) {
    const d = addDays(start, i)
    const day = dayKeyOf(d)
    const item = byDay.get(day)
    if (item) {
      list.push(item)
    } else {
      list.push({
        day,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        totalTokens: 0
      })
    }
  }
  return list
}

function buildStackHeights(values: number[], totalHeight: number, minVisible = 2): number[] {
  if (totalHeight <= 0) return values.map(() => 0)

  const positive = values.map((v) => (v > 0 ? v : 0))
  const rawTotal = positive.reduce((a, b) => a + b, 0)
  if (rawTotal <= 0) return values.map(() => 0)

  let heights = positive.map((v) => (v / rawTotal) * totalHeight)
  heights = heights.map((h, idx) => (positive[idx] > 0 ? Math.max(minVisible, h) : 0))

  const used = heights.reduce((a, b) => a + b, 0)
  if (used > totalHeight) {
    const scale = totalHeight / used
    heights = heights.map((h) => h * scale)
  } else if (used < totalHeight) {
    const remain = totalHeight - used
    heights = heights.map((h, idx) => (positive[idx] > 0 ? h + (positive[idx] / rawTotal) * remain : 0))
  }

  return heights
}

function dayKeyFromTimestamp(ts: number): string {
  const dt = new Date(ts)
  return dayKeyOf(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()))
}

function isOnOrAfter(day: string, startDay?: string): boolean {
  if (!startDay) return true
  return day >= startDay
}

async function buildUsageStatsFallback(params: { startDay: string; trendStartDay: string }): Promise<MessageUsageStats> {
  const conversations: Array<{ id: string }> = []
  const limit = 200
  let offset = 0
  let total = 0

  do {
    const page = await window.api.db.conversations.list({ limit, offset })
    if (offset === 0) total = page.total
    conversations.push(...page.items.map((it) => ({ id: it.id })))
    offset += page.items.length
    if (page.items.length === 0) break
  } while (offset < total)

  let totalMessages = 0
  let totalPromptTokens = 0
  let totalCompletionTokens = 0
  let totalCachedTokens = 0

  const userPerDay = new Map<string, number>()
  const tokenPerDay = new Map<string, MessageTokenDay>()

  const batchSize = 8
  for (let i = 0; i < conversations.length; i += batchSize) {
    const batch = conversations.slice(i, i + batchSize)
    const messageBatches = await Promise.all(batch.map((c) => window.api.db.messages.list(c.id)))

    for (const messages of messageBatches) {
      totalMessages += messages.length
      for (const msg of messages) {
        const day = dayKeyFromTimestamp(msg.createdAt)

        if (msg.role === 'user' && isOnOrAfter(day, params.startDay)) {
          userPerDay.set(day, (userPerDay.get(day) ?? 0) + 1)
        }

        const usage = msg.tokenUsage
        if (!usage) continue
        const promptTokens = Number(usage.promptTokens ?? 0) || 0
        const completionTokens = Number(usage.completionTokens ?? 0) || 0
        const cachedTokens = Number(usage.cachedTokens ?? 0) || 0

        totalPromptTokens += promptTokens
        totalCompletionTokens += completionTokens
        totalCachedTokens += cachedTokens

        if (!isOnOrAfter(day, params.trendStartDay)) continue
        const prev = tokenPerDay.get(day)
        if (prev) {
          const nextPrompt = prev.promptTokens + promptTokens
          const nextCompletion = prev.completionTokens + completionTokens
          const nextCached = prev.cachedTokens + cachedTokens
          tokenPerDay.set(day, {
            day,
            promptTokens: nextPrompt,
            completionTokens: nextCompletion,
            cachedTokens: nextCached,
            totalTokens: nextPrompt + nextCompletion + nextCached
          })
        } else {
          tokenPerDay.set(day, {
            day,
            promptTokens,
            completionTokens,
            cachedTokens,
            totalTokens: promptTokens + completionTokens + cachedTokens
          })
        }
      }
    }
  }

  const userMessagesPerDay = Array.from(userPerDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }))

  const tokenUsagePerDay = Array.from(tokenPerDay.values()).sort((a, b) => a.day.localeCompare(b.day))

  return {
    totalConversations: conversations.length,
    totalMessages,
    totalPromptTokens,
    totalCompletionTokens,
    totalCachedTokens,
    userMessagesPerDay,
    tokenUsagePerDay
  }
}

export function UsageStatsPane() {
  const today = useMemo(() => getToday(), [])

  const [stats, setStats] = useState<MessageUsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const start = getHeatmapStartSunday(today)
      const trendStart = addDays(today, -(TOKEN_TREND_DAYS - 1))
      const request = {
        startDay: dayKeyOf(start),
        trendStartDay: dayKeyOf(trendStart)
      }

      const usageStatsFn = (window.api.db.messages as {
        usageStats?: (params?: { startDay?: string; trendStartDay?: string }) => Promise<MessageUsageStats>
      }).usageStats

      const data = typeof usageStatsFn === 'function'
        ? await usageStatsFn(request)
        : await buildUsageStatsFallback(request)
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const heatStart = useMemo(() => getHeatmapStartSunday(today), [today])
  const userMessageMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of stats?.userMessagesPerDay ?? []) map.set(item.day, item.count)
    return map
  }, [stats])

  const levels = useMemo(() => {
    const counts = Array.from(userMessageMap.values()).filter((v) => v > 0).sort((a, b) => a - b)
    return {
      q1: quantile(counts, 0.25, 1),
      q2: quantile(counts, 0.5, 2),
      q3: quantile(counts, 0.75, 3)
    }
  }, [userMessageMap])

  const trendRows = useMemo(() => buildTokenTrend(stats, today), [stats, today])
  const trendMax = useMemo(() => {
    let max = 0
    for (const row of trendRows) max = Math.max(max, row.totalTokens)
    return Math.max(1, max)
  }, [trendRows])

  const totalTokens = (stats?.totalPromptTokens ?? 0) + (stats?.totalCompletionTokens ?? 0) + (stats?.totalCachedTokens ?? 0)

  return (
    <div style={styles.root}>
      <div style={styles.headerRow}>
        <div style={styles.header}>使用统计</div>
        <button type="button" className="btn btn-sm btn-ghost" style={{ gap: 6 }} onClick={() => void loadStats()} disabled={loading}>
          <RefreshCw size={14} />
          刷新
        </button>
      </div>

      {loading && (
        <div className="settingsCard" style={styles.centerCard}>
          加载统计中...
        </div>
      )}

      {!loading && error && (
        <div className="settingsCard" style={styles.errorCard}>
          读取统计失败：{error}
        </div>
      )}

      {!loading && !error && stats && (
        <>
          <div style={styles.grid2}>
            <StatsCard icon={<BarChart3 size={16} />} label="总对话数" value={formatCount(stats.totalConversations)} />
            <StatsCard icon={<MessageCircle size={16} />} label="总消息数" value={formatCount(stats.totalMessages)} />
            <StatsCard icon={<Cpu size={16} />} label="输入 Tokens" value={formatTokenCount(stats.totalPromptTokens)} />
            <StatsCard icon={<Cpu size={16} />} label="输出 Tokens" value={formatTokenCount(stats.totalCompletionTokens)} />
          </div>

          <div style={styles.grid2}>
            <StatsCard icon={<Sparkles size={16} />} label="缓存 Tokens" value={formatTokenCount(stats.totalCachedTokens)} />
            <StatsCard icon={<BarChart3 size={16} />} label="总 Tokens" value={formatTokenCount(totalTokens)} />
          </div>

          <div className="settingsCard">
            <div style={styles.cardTitle}>活跃热力图（近一年）</div>
            <ChatHeatmap
              today={today}
              startSunday={heatStart}
              dayCountMap={userMessageMap}
              q1={levels.q1}
              q2={levels.q2}
              q3={levels.q3}
            />
          </div>

          <div className="settingsCard">
            <div style={styles.cardTitle}>Token 趋势（近 30 天）</div>
            <TokenTrend rows={trendRows} maxValue={trendMax} />
          </div>
        </>
      )}
    </div>
  )
}

function StatsCard(props: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="settingsCard" style={styles.statsCard}>
      <div style={styles.statsIcon}>{props.icon}</div>
      <div style={styles.statsValue}>{props.value}</div>
      <div style={styles.statsLabel}>{props.label}</div>
    </div>
  )
}

function ChatHeatmap(props: {
  today: Date
  startSunday: Date
  dayCountMap: Map<string, number>
  q1: number
  q2: number
  q3: number
}) {
  const { today, startSunday, dayCountMap, q1, q2, q3 } = props
  const cellSize = 11
  const spacing = 2

  const weeks = useMemo(() => {
    const list: Array<{
      weekStart: Date
      days: Array<{ key: string; count: number; future: boolean }>
    }> = []
    for (let w = 0; w < HEATMAP_WEEKS; w += 1) {
      const weekStart = addDays(startSunday, w * 7)
      const days: Array<{ key: string; count: number; future: boolean }> = []
      for (let d = 0; d < 7; d += 1) {
        const day = addDays(weekStart, d)
        const key = dayKeyOf(day)
        const future = day.getTime() > today.getTime()
        const count = future ? 0 : (dayCountMap.get(key) ?? 0)
        days.push({ key, count, future })
      }
      list.push({ weekStart, days })
    }
    return list
  }, [startSunday, today, dayCountMap])

  return (
    <div>
      <div style={styles.heatmapWrap}>
        <div style={styles.heatmapLabelCol}>
          <div style={{ height: 14, marginBottom: spacing }} />
          {['', '一', '', '三', '', '五', ''].map((label, i) => (
            <div key={`${label}-${i}`} style={{ height: cellSize, lineHeight: `${cellSize}px`, fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>
              {label}
            </div>
          ))}
        </div>

        <div style={styles.heatmapScroll}>
          <div style={{ display: 'flex', gap: spacing, marginBottom: spacing }}>
            {weeks.map((week, idx) => {
              let monthLabel = ''
              for (let i = 0; i < 7; i += 1) {
                const day = addDays(week.weekStart, i)
                if (day.getDate() === 1) {
                  monthLabel = formatMonthLabel(day)
                  break
                }
              }
              return (
                <div key={`m-${idx}`} style={{ width: cellSize, fontSize: 10, lineHeight: '14px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                  {monthLabel}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: spacing }}>
            {weeks.map((week, idx) => (
              <div key={`w-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: spacing }}>
                {week.days.map((day) => {
                  const alpha = day.future
                    ? -1
                    : day.count === 0
                      ? 0
                      : day.count <= q1
                        ? 0.25
                        : day.count <= q2
                          ? 0.5
                          : day.count <= q3
                            ? 0.75
                            : 1
                  const color = alpha < 0
                    ? 'color-mix(in srgb, var(--surface-3) 60%, transparent)'
                    : alpha === 0
                      ? 'var(--surface-3)'
                      : `color-mix(in srgb, var(--primary) ${Math.round(alpha * 100)}%, var(--surface-3))`
                  return (
                    <div
                      key={day.key}
                      title={`${day.key} · ${day.count} 条用户消息`}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        borderRadius: 3,
                        background: color
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={styles.heatmapLegend}>
        <span>少</span>
        {[0, 0.25, 0.5, 0.75, 1].map((a) => (
          <div
            key={a}
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: a === 0 ? 'var(--surface-3)' : `color-mix(in srgb, var(--primary) ${Math.round(a * 100)}%, var(--surface-3))`
            }}
          />
        ))}
        <span>多</span>
      </div>
    </div>
  )
}

function TokenTrend(props: { rows: MessageTokenDay[]; maxValue: number }) {
  const { rows, maxValue } = props
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [tooltipLeft, setTooltipLeft] = useState(24)
  const [dragging, setDragging] = useState(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ startX: number; startLeft: number } | null>(null)

  const barHeight = 136
  const itemWidth = 22
  const itemGap = 10
  const itemPitch = itemWidth + itemGap
  const trendScrollPadX = 10

  const hoveredRow = hoveredIndex !== null ? (rows[hoveredIndex] ?? null) : null

  const updateScrollAffordance = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }
    const max = Math.max(0, el.scrollWidth - el.clientWidth)
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft < max - 2)
  }, [])

  const updateTooltipPosition = useCallback((index: number, clientX?: number) => {
    const el = scrollRef.current
    if (!el) return
    const wrap = el.parentElement
    if (!wrap) return
    const wrapRect = wrap.getBoundingClientRect()
    const centerX = typeof clientX === 'number'
      ? clientX - wrapRect.left
      : trendScrollPadX + index * itemPitch + itemWidth / 2 - el.scrollLeft
    const tooltipHalfWidth = 132
    const minLeft = tooltipHalfWidth + 6
    const maxLeft = Math.max(minLeft, wrap.clientWidth - tooltipHalfWidth - 6)
    setTooltipLeft(Math.max(minLeft, Math.min(maxLeft, centerX)))
  }, [itemPitch, itemWidth, trendScrollPadX])

  useEffect(() => {
    if (hoveredIndex === null) return
    updateTooltipPosition(hoveredIndex)
  }, [hoveredIndex, updateTooltipPosition])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handleScroll = () => {
      if (hoveredIndex !== null) updateTooltipPosition(hoveredIndex)
      updateScrollAffordance()
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    handleScroll()
    return () => {
      el.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [hoveredIndex, updateScrollAffordance, updateTooltipPosition])

  useEffect(() => {
    updateScrollAffordance()
  }, [rows.length, updateScrollAffordance])

  useEffect(() => {
    const handleMove = (evt: MouseEvent) => {
      const state = dragRef.current
      const el = scrollRef.current
      if (!state || !el) return
      const dx = evt.clientX - state.startX
      el.scrollLeft = state.startLeft - dx
    }
    const handleUp = () => {
      if (!dragRef.current) return
      dragRef.current = null
      setDragging(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('blur', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('blur', handleUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [])

  return (
    <div style={styles.trendBlock}>
      <div style={styles.trendViewportWrap}>
        {hoveredRow && (
          <div style={{ ...styles.trendTooltip, left: tooltipLeft }}>
            <div style={styles.trendTooltipArrowUp} />
            <div style={styles.trendTooltipDate}>{hoveredRow.day}</div>
            <div style={styles.trendTooltipRow}>
              <i style={{ ...styles.dot, background: 'color-mix(in srgb, var(--primary) 86%, var(--surface-3))' }} />
              输入 {formatTokenCount(hoveredRow.promptTokens)}
            </div>
            <div style={styles.trendTooltipRow}>
              <i style={{ ...styles.dot, background: 'color-mix(in srgb, #60a5fa 82%, var(--surface-3))' }} />
              输出 {formatTokenCount(hoveredRow.completionTokens)}
            </div>
            <div style={styles.trendTooltipRow}>
              <i style={{ ...styles.dot, background: 'color-mix(in srgb, #f59e0b 86%, var(--surface-3))' }} />
              缓存 {formatTokenCount(hoveredRow.cachedTokens)}
            </div>
            <div style={styles.trendTooltipTotal}>总计 {formatTokenCount(hoveredRow.totalTokens)}</div>
          </div>
        )}

        <div
          ref={scrollRef}
          className="usageTrendScroll"
          style={{
            ...styles.trendScroll,
            cursor: dragging ? 'grabbing' : 'grab'
          }}
          onWheelCapture={(evt) => {
            evt.preventDefault()
            evt.stopPropagation()
          }}
          onMouseDown={(evt) => {
            if (evt.button !== 0) return
            const el = scrollRef.current
            if (!el) return
            const max = Math.max(0, el.scrollWidth - el.clientWidth)
            if (max <= 0) return
            evt.preventDefault()
            dragRef.current = { startX: evt.clientX, startLeft: el.scrollLeft }
            setDragging(true)
            document.body.style.userSelect = 'none'
            document.body.style.cursor = 'grabbing'
          }}
          onWheel={(evt) => {
            const el = scrollRef.current
            if (!el) return
            evt.preventDefault()
            evt.stopPropagation()
            const max = Math.max(0, el.scrollWidth - el.clientWidth)
            const delta = Math.abs(evt.deltaY) >= Math.abs(evt.deltaX) ? evt.deltaY : evt.deltaX
            if (delta === 0) return
            if (max <= 0) return
            const next = Math.max(0, Math.min(max, el.scrollLeft + delta * 0.65))
            if (next === el.scrollLeft) return
            el.scrollLeft = next
          }}
        >
          <div style={styles.trendCanvas}>
            <div style={styles.trendInner}>
              {rows.map((row, idx) => {
                const effectiveRatio = row.totalTokens > 0 ? Math.sqrt(row.totalTokens / maxValue) : 0
                const totalHeight = row.totalTokens > 0 ? Math.max(2, effectiveRatio * barHeight) : 0
                const [promptH, completionH, cachedH] = buildStackHeights(
                  [row.promptTokens, row.completionTokens, row.cachedTokens],
                  totalHeight
                )
                const showLabel = idx === 0 || idx === rows.length - 1 || idx % 6 === 0
                const dt = parseDayKey(row.day)
                const label = dt ? `${dt.getMonth() + 1}/${dt.getDate()}` : row.day.slice(5)
                const isHovered = hoveredIndex === idx

                return (
                  <div key={row.day} style={styles.trendItem}>
                    <div
                      style={styles.trendTrack}
                      onMouseEnter={() => {
                        setHoveredIndex(idx)
                        updateTooltipPosition(idx)
                      }}
                      onMouseMove={(evt) => updateTooltipPosition(idx, evt.clientX)}
                      onMouseLeave={() => setHoveredIndex((prev) => (prev === idx ? null : prev))}
                      onFocus={() => {
                        setHoveredIndex(idx)
                        updateTooltipPosition(idx)
                      }}
                      onBlur={() => setHoveredIndex((prev) => (prev === idx ? null : prev))}
                      tabIndex={0}
                    >
                      {totalHeight > 0 && (
                        <div
                          style={{
                            ...styles.trendBar,
                            height: `${totalHeight}px`,
                            transform: isHovered ? 'translateY(-3px)' : 'none',
                            boxShadow: isHovered ? '0 8px 18px rgba(0,0,0,.2)' : 'none'
                          }}
                        >
                          {cachedH > 0 && (
                            <div
                              style={{
                                ...styles.trendSeg,
                                height: `${cachedH}px`,
                                bottom: '0px',
                                background: 'color-mix(in srgb, #f59e0b 82%, var(--surface-3))'
                              }}
                            />
                          )}
                          {completionH > 0 && (
                            <div
                              style={{
                                ...styles.trendSeg,
                                height: `${completionH}px`,
                                bottom: `${cachedH}px`,
                                background: 'color-mix(in srgb, #60a5fa 78%, var(--surface-3))'
                              }}
                            />
                          )}
                          {promptH > 0 && (
                            <div
                              style={{
                                ...styles.trendSeg,
                                height: `${promptH}px`,
                                bottom: `${cachedH + completionH}px`,
                                background: 'color-mix(in srgb, var(--primary) 82%, var(--surface-3))'
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ ...styles.trendLabel, color: isHovered ? 'var(--text-2)' : 'var(--text-3)' }}>{showLabel ? label : ''}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div style={{ ...styles.trendEdge, ...styles.trendEdgeLeft, opacity: canScrollLeft ? 1 : 0 }} />
        <div style={{ ...styles.trendEdge, ...styles.trendEdgeRight, opacity: canScrollRight ? 1 : 0 }} />
      </div>

      <div style={styles.trendLegend}>
        <span><i style={{ ...styles.dot, background: 'color-mix(in srgb, var(--primary) 82%, var(--surface-3))' }} />输入</span>
        <span><i style={{ ...styles.dot, background: 'color-mix(in srgb, #60a5fa 78%, var(--surface-3))' }} />输出</span>
        <span><i style={{ ...styles.dot, background: 'color-mix(in srgb, #f59e0b 82%, var(--surface-3))' }} />缓存</span>
      </div>
      <div style={styles.trendHint}>支持：鼠标滚轮横向滚动，或按住拖拽查看两侧</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: '16px 16px 32px',
    maxWidth: 980,
    margin: '0 auto'
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8
  },
  header: {
    fontSize: 16,
    fontWeight: 700
  },
  centerCard: {
    textAlign: 'center',
    fontSize: 13,
    color: 'var(--text-2)'
  },
  errorCard: {
    color: 'var(--danger)',
    borderColor: 'color-mix(in srgb, var(--danger) 35%, var(--border))'
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 12
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 10,
    marginBottom: 10
  },
  statsCard: {
    padding: 14
  },
  statsIcon: {
    color: 'var(--primary)',
    display: 'inline-flex',
    marginBottom: 8
  },
  statsValue: {
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.15
  },
  statsLabel: {
    marginTop: 4,
    fontSize: 12,
    color: 'var(--text-2)'
  },
  heatmapWrap: {
    display: 'flex',
    gap: 6
  },
  heatmapLabelCol: {
    width: 14,
    flex: '0 0 auto'
  },
  heatmapScroll: {
    overflowX: 'auto',
    overflowY: 'hidden',
    paddingBottom: 2
  },
  heatmapLegend: {
    marginTop: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    fontSize: 11,
    color: 'var(--text-3)'
  },
  trendBlock: {
    display: 'flex',
    flexDirection: 'column'
  },
  trendViewportWrap: {
    position: 'relative'
  },
  trendScroll: {
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: '8px 10px 6px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'color-mix(in srgb, var(--surface-2) 84%, transparent)',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch'
  },
  trendCanvas: {
    position: 'relative',
    minWidth: TOKEN_TREND_DAYS * 32
  },
  trendTooltip: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
    zIndex: 12,
    maxWidth: 330,
    minWidth: 240,
    padding: '9px 11px',
    borderRadius: 12,
    border: '1px solid color-mix(in srgb, var(--primary) 35%, var(--border))',
    background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 10px 24px rgba(0,0,0,.18)'
  },
  trendTooltipArrowUp: {
    position: 'absolute',
    left: '50%',
    top: -6,
    width: 10,
    height: 10,
    transform: 'translateX(-50%) rotate(45deg)',
    background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
    borderLeft: '1px solid color-mix(in srgb, var(--primary) 35%, var(--border))',
    borderTop: '1px solid color-mix(in srgb, var(--primary) 35%, var(--border))'
  },
  trendTooltipDate: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: 4
  },
  trendTooltipRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: 'var(--text-2)',
    lineHeight: 1.45
  },
  trendTooltipTotal: {
    marginTop: 5,
    paddingTop: 5,
    borderTop: '1px dashed var(--border)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text)'
  },
  trendInner: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 10,
    minWidth: TOKEN_TREND_DAYS * 32,
    paddingTop: 8
  },
  trendItem: {
    width: 22,
    flex: '0 0 auto'
  },
  trendTrack: {
    height: 136,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'stretch',
    cursor: 'pointer',
    outline: 'none'
  },
  trendBar: {
    position: 'relative',
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    transition: 'transform .12s ease, box-shadow .12s ease'
  },
  trendSeg: {
    position: 'absolute',
    left: 0,
    right: 0
  },
  trendLabel: {
    marginTop: 6,
    fontSize: 10,
    color: 'var(--text-3)',
    textAlign: 'center',
    minHeight: 12
  },
  trendLegend: {
    marginTop: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    fontSize: 11,
    color: 'var(--text-3)'
  },
  trendHint: {
    marginTop: 8,
    fontSize: 11,
    color: 'var(--text-3)'
  },
  trendEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 30,
    pointerEvents: 'none',
    transition: 'opacity .16s ease'
  },
  trendEdgeLeft: {
    left: 1,
    background: 'linear-gradient(90deg, color-mix(in srgb, var(--surface) 84%, transparent), transparent)'
  },
  trendEdgeRight: {
    right: 1,
    background: 'linear-gradient(270deg, color-mix(in srgb, var(--surface) 84%, transparent), transparent)'
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 2,
    display: 'inline-block',
    marginRight: 5,
    verticalAlign: '-1px'
  }
}
