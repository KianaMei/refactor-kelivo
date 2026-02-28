import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import type { ImageStudioJob } from '../../../../shared/imageStudio'
import { HISTORY_COLLAPSED_STORAGE_KEY, jobThumbSrc, briefPrompt, statusLabel } from './helpers'

export type HistoryRailProps = {
  rightJobs: ImageStudioJob[]
  currentJobId: string | null
  historyLoading: boolean
  isRunning: boolean
  onNew: () => void
  onSelect: (job: ImageStudioJob) => void
  onDelete: (job: ImageStudioJob) => void
}

export function HistoryRail(props: HistoryRailProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(HISTORY_COLLAPSED_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [collapsed])

  return (
    <aside className={`csPaintingsList ${collapsed ? 'is-collapsed' : ''}`} aria-label="历史缩略图">
      <div className="csHistoryHeader" aria-label="历史栏">
        <button className="csHistoryToggleBtn" type="button" onClick={() => setCollapsed((prev) => !prev)} title={collapsed ? '展开' : '收起'}>
          {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        <button className="csHistoryNewBtn" type="button" onClick={props.onNew} title="新建">
          +
        </button>
      </div>

      <div className="csPaintingsListBody" aria-hidden={collapsed}>
        <div className="csThumbList">
          {props.rightJobs.length === 0 ? (
            <div className="csThumbEmpty">{props.historyLoading ? '加载中...' : '暂无'}</div>
          ) : (
            props.rightJobs.map((job) => {
              const src = jobThumbSrc(job)
              const selected = props.currentJobId === job.id
              return (
                <div key={job.id} className="csThumbWrap">
                  <button
                    type="button"
                    className={`csThumb ${selected ? 'selected' : ''}`}
                    onClick={() => {
                      if (collapsed) return
                      if (props.isRunning) return
                      if (props.currentJobId === job.id) return
                      props.onSelect(job)
                    }}
                    title={`${briefPrompt(job.prompt)} · ${statusLabel(job.status)}`}>
                    {src ? (
                      <img className="csThumbImg" src={src} alt={briefPrompt(job.prompt)} loading="lazy" decoding="async" />
                    ) : null}
                  </button>

                  <button
                    className="csThumbDelete csTip"
                    data-tip="删除"
                    type="button"
                    onClick={(event) => {
                      if (collapsed) return
                      event.stopPropagation()
                      props.onDelete(job)
                    }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </aside>
  )
}
