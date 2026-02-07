/**
 * 消息大纲导航 - 参考 Cherry Studio
 * 解析消息内容中的标题，显示为可点击的导航条
 * 默认只显示小横条，hover 时展开显示标题文字
 */
import { useMemo, useRef } from 'react'

interface HeadingItem {
  id: string
  level: number
  text: string
}

interface Props {
  content: string
  messageId: string
}

// 简单的 slug 生成器
function createSlugger() {
  const occurrences = new Map<string, number>()
  return {
    slug(text: string): string {
      const base = text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '')
      const count = occurrences.get(base) || 0
      occurrences.set(base, count + 1)
      return count > 0 ? `${base}-${count}` : base
    }
  }
}

// 从 markdown 内容提取标题
function extractHeadings(content: string, messageId: string): HeadingItem[] {
  const headings: HeadingItem[] = []
  const slugger = createSlugger()

  // 匹配 markdown 标题: # Title, ## Title, etc.
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  let match

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length
    const text = match[2].trim()
    if (text) {
      const slug = slugger.slug(text)
      const id = `heading-${messageId}--${slug}`
      headings.push({ id, level, text })
    }
  }

  return headings
}

export function MessageOutline({ content, messageId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const headings = useMemo(() => extractHeadings(content, messageId), [content, messageId])

  const minLevel = useMemo(() => {
    return headings.length ? Math.min(...headings.map(h => h.level)) : 1
  }, [headings])

  const scrollToHeading = (id: string) => {
    const heading = document.getElementById(id)
    if (heading) {
      const scrollContainer = heading.closest('.chatMessagesScroll') as HTMLElement | null
      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect()
        const headingRect = heading.getBoundingClientRect()
        const elementTopWithinContainer = headingRect.top - containerRect.top + scrollContainer.scrollTop
        const desiredTop = elementTopWithinContainer - 20
        scrollContainer.scrollTo({ top: Math.max(0, desiredTop), behavior: 'smooth' })
      } else {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
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
            onClick={() => scrollToHeading(heading.id)}
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
