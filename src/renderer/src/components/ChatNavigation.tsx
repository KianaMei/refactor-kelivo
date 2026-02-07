/**
 * 聊天导航组件 - 完全参考 Cherry Studio
 * 固定在消息区域右侧，鼠标靠近时滑入显示
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { X, ChevronsUp, ChevronUp, ChevronDown, ChevronsDown } from 'lucide-react'

const RIGHT_GAP = 16

interface Props {
  containerId: string
}

export function ChatNavigation({ containerId }: Props) {
  const [isVisible, setIsVisible] = useState(false)
  const [manuallyClosedUntil, setManuallyClosedUntil] = useState<number | null>(null)
  const isHoveringRef = useRef(false)
  const isInTriggerAreaRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMoveTimeRef = useRef(0)

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleHide = useCallback((delay: number) => {
    clearHideTimer()
    hideTimerRef.current = setTimeout(() => {
      setIsVisible(false)
    }, delay)
  }, [clearHideTimer])

  const showNavigation = useCallback(() => {
    if (manuallyClosedUntil && Date.now() < manuallyClosedUntil) return
    setIsVisible(true)
    clearHideTimer()
  }, [manuallyClosedUntil, clearHideTimer])

  const handleMouseEnter = useCallback(() => {
    if (manuallyClosedUntil && Date.now() < manuallyClosedUntil) return
    isHoveringRef.current = true
    showNavigation()
  }, [manuallyClosedUntil, showNavigation])

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false
    scheduleHide(500)
  }, [scheduleHide])

  const handleClose = useCallback(() => {
    setIsVisible(false)
    isHoveringRef.current = false
    isInTriggerAreaRef.current = false
    clearHideTimer()
    setManuallyClosedUntil(Date.now() + 60000)
  }, [clearHideTimer])

  // 找到用户消息
  const findUserMessages = useCallback(() => {
    const container = document.getElementById(containerId)
    if (!container) return []
    return Array.from(container.querySelectorAll('.msgRowUser')) as HTMLElement[]
  }, [containerId])

  // 滚动到元素
  const scrollToElement = useCallback((element: HTMLElement) => {
    const container = document.getElementById(containerId)
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const elRect = element.getBoundingClientRect()
    const elementTopWithinContainer = elRect.top - containerRect.top + container.scrollTop
    const desiredTop = elementTopWithinContainer - 20
    container.scrollTo({ top: Math.max(0, desiredTop), behavior: 'smooth' })
  }, [containerId])

  const scrollToTop = useCallback(() => {
    const container = document.getElementById(containerId)
    container?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [containerId])

  const scrollToBottom = useCallback(() => {
    const container = document.getElementById(containerId)
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }, [containerId])

  // 获取当前可见的消息索引
  const getCurrentVisibleIndex = useCallback((direction: 'up' | 'down') => {
    const userMessages = findUserMessages()
    const container = document.getElementById(containerId)
    if (!container || userMessages.length === 0) return -1

    const containerRect = container.getBoundingClientRect()
    const visibleThreshold = containerRect.height * 0.1
    const visibleIndices: number[] = []

    for (let i = 0; i < userMessages.length; i++) {
      const msgRect = userMessages[i].getBoundingClientRect()
      const visibleHeight = Math.min(msgRect.bottom, containerRect.bottom) - Math.max(msgRect.top, containerRect.top)
      if (visibleHeight > 0 && visibleHeight >= Math.min(msgRect.height, visibleThreshold)) {
        visibleIndices.push(i)
      }
    }

    if (visibleIndices.length === 0) return -1
    return direction === 'up' ? Math.max(...visibleIndices) : Math.min(...visibleIndices)
  }, [containerId, findUserMessages])

  const handlePrevMessage = useCallback(() => {
    showNavigation()
    const userMessages = findUserMessages()
    if (userMessages.length === 0) return scrollToTop()

    const visibleIndex = getCurrentVisibleIndex('up')
    if (visibleIndex === -1) return scrollToTop()

    const targetIndex = visibleIndex + 1
    if (targetIndex >= userMessages.length) return scrollToTop()

    scrollToElement(userMessages[targetIndex])
  }, [showNavigation, findUserMessages, getCurrentVisibleIndex, scrollToTop, scrollToElement])

  const handleNextMessage = useCallback(() => {
    showNavigation()
    const userMessages = findUserMessages()
    if (userMessages.length === 0) return scrollToBottom()

    const visibleIndex = getCurrentVisibleIndex('down')
    if (visibleIndex === -1) return scrollToBottom()

    const targetIndex = visibleIndex - 1
    if (targetIndex < 0) return scrollToBottom()

    scrollToElement(userMessages[targetIndex])
  }, [showNavigation, findUserMessages, getCurrentVisibleIndex, scrollToBottom, scrollToElement])

  // 监听鼠标位置
  useEffect(() => {
    const container = document.getElementById(containerId)
    if (!container) return

    const handleScroll = () => {
      if (isInTriggerAreaRef.current || isHoveringRef.current) {
        showNavigation()
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (manuallyClosedUntil && Date.now() < manuallyClosedUntil) return

      const now = Date.now()
      if (now - lastMoveTimeRef.current < 50) return
      lastMoveTimeRef.current = now

      const triggerWidth = 60
      const containerRect = container.getBoundingClientRect()
      const rightPosition = containerRect.right - triggerWidth - RIGHT_GAP
      const topPosition = containerRect.top + containerRect.height * 0.35
      const height = containerRect.height * 0.3

      const isInTriggerArea =
        e.clientX > rightPosition &&
        e.clientX < containerRect.right &&
        e.clientY > topPosition &&
        e.clientY < topPosition + height

      if (isInTriggerArea) {
        if (!isInTriggerAreaRef.current) {
          isInTriggerAreaRef.current = true
          showNavigation()
        }
      } else if (isInTriggerAreaRef.current) {
        isInTriggerAreaRef.current = false
        if (!isHoveringRef.current) {
          scheduleHide(500)
        }
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      container.removeEventListener('scroll', handleScroll)
      window.removeEventListener('mousemove', handleMouseMove)
      clearHideTimer()
    }
  }, [containerId, manuallyClosedUntil, showNavigation, scheduleHide, clearHideTimer])

  return (
    <div
      className={`chatNavigation ${isVisible ? 'chatNavigationVisible' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="chatNavBtnGroup">
        <button type="button" className="chatNavBtn" onClick={handleClose} title="关闭">
          <X size={14} />
        </button>
        <div className="chatNavDivider" />
        <button type="button" className="chatNavBtn" onClick={scrollToTop} title="顶部">
          <ChevronsUp size={14} />
        </button>
        <div className="chatNavDivider" />
        <button type="button" className="chatNavBtn" onClick={handlePrevMessage} title="上一条">
          <ChevronUp size={14} />
        </button>
        <div className="chatNavDivider" />
        <button type="button" className="chatNavBtn" onClick={handleNextMessage} title="下一条">
          <ChevronDown size={14} />
        </button>
        <div className="chatNavDivider" />
        <button type="button" className="chatNavBtn" onClick={scrollToBottom} title="底部">
          <ChevronsDown size={14} />
        </button>
      </div>
    </div>
  )
}
