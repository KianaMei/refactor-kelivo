/**
 * 消息大纲导航 - 参考 Cherry Studio
 * 解析消息内容中的标题，显示为可点击的导航条
 * 默认只显示小横条，hover 时展开显示标题文字
 */
import { useMemo, useRef } from 'react'

interface HeadingItem {
  level: number
  text: string
}

interface Props {
  content: string
  messageId: string
}

// 剥离 markdown 内联格式
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim()
}

// 从 markdown 内容提取标题
function extractHeadings(content: string): HeadingItem[] {
  const headings: HeadingItem[] = []
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  let match

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length
    const text = stripInlineMarkdown(match[2].trim())
    if (text) {
      headings.push({ level, text })
    }
  }

  return headings
}

export function MessageOutline({ content }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const headings = useMemo(() => extractHeadings(content), [content])

  const minLevel = useMemo(() => {
    return headings.length ? Math.min(...headings.map(h => h.level)) : 1
  }, [headings])

  const scrollToHeading = (index: number) => {
    const bubble = containerRef.current?.closest('.chatBubble')
    if (!bubble) return
    const allHeadings = bubble.querySelectorAll('h1, h2, h3, h4, h5, h6')
    const heading = allHeadings[index] as HTMLElement | undefined
    if (!heading) return

    const scrollContainer = heading.closest('.chatMessagesScroll') as HTMLElement | null
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect()
      const headingRect = heading.getBoundingClientRect()
      const top = headingRect.top - containerRect.top + scrollContainer.scrollTop - 20
      scrollContainer.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    } else {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (headings.length === 0) return null

  return (
    <div ref={containerRef} className="msgOutlineContainer">
      <div className="msgOutlineBody" style={{ '--heading-count': headings.length } as React.CSSProperties}>
        {headings.map((heading, index) => (
          <div
            key={index}
            className="msgOutlineItem"
            onClick={() => scrollToHeading(index)}
          >
            <div
              className="msgOutlineDot"
              style={{ width: `${16 - heading.level * 2}px` }}
            />
            <div
              className="msgOutlineText"
              style={{
                paddingLeft: `${(heading.level - minLevel) * 8}px`,
                fontSize: `${16 - heading.level}px`
              }}
            >
              {heading.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
