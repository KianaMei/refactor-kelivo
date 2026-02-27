import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import 'katex/dist/katex.min.css'

function isDarkTheme(): boolean {
  return document.documentElement.dataset.theme !== 'light'
}

function safeCopy(text: string): void {
  void navigator.clipboard.writeText(text)
}

// 从 React children 递归提取纯文本（用于生成与 MessageOutline 一致的 slug）
function extractText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in (node as any)) {
    return extractText((node as any).props.children)
  }
  return ''
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

// 将 $...$ 转换为 \(...\)，但跳过代码块内容
// 参考 RikkaHub/kelivo 的预处理逻辑：代码块内的 $ 不能被转换
function preprocessDollarLatex(content: string): string {
  // 先记录所有代码块的位置范围（fenced + inline）
  const codeRanges: Array<[number, number]> = []
  const fenced = /```[\s\S]*?```|~~~[\s\S]*?~~~/g
  const inlineCode = /`[^`\n]+`/g
  let m: RegExpExecArray | null

  while ((m = fenced.exec(content)) !== null) {
    codeRanges.push([m.index, m.index + m[0].length])
  }
  while ((m = inlineCode.exec(content)) !== null) {
    codeRanges.push([m.index, m.index + m[0].length])
  }

  const isInCode = (pos: number) => codeRanges.some(([s, e]) => pos >= s && pos < e)

  // 替换行内 $...$ → \(...\)，跳过代码块
  return content.replace(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g, (match, inner, offset) => {
    if (isInCode(offset)) return match
    return `\\(${inner}\\)`
  })
}

export const MarkdownView = memo(
  function MarkdownView(props: {
    content: string
    messageId?: string
    enableMath?: boolean
    enableDollarLatex?: boolean
  }) {
    const { enableMath = false, enableDollarLatex = false } = props
    const dark = isDarkTheme()

    const processedContent = useMemo(() => {
      if (!enableMath || !enableDollarLatex) return props.content
      return preprocessDollarLatex(props.content)
    }, [props.content, enableMath, enableDollarLatex])

    const slugger = useMemo(() => createSlugger(), [props.content])

    const remarkPlugins = useMemo(
      () => enableMath ? [remarkGfm, remarkMath] : [remarkGfm],
      [enableMath]
    )

    const rehypePlugins = useMemo(
      () => enableMath ? [rehypeKatex] : [],
      [enableMath]
    )

    return (
      <div className="markdown">
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins as any}
          components={{
            a({ children, href }) {
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              )
            },
            h1({ children }) {
              const text = extractText(children)
              const id = props.messageId ? `heading-${props.messageId}--${slugger.slug(text)}` : undefined
              return <h1 id={id}>{children}</h1>
            },
            h2({ children }) {
              const text = extractText(children)
              const id = props.messageId ? `heading-${props.messageId}--${slugger.slug(text)}` : undefined
              return <h2 id={id}>{children}</h2>
            },
            h3({ children }) {
              const text = extractText(children)
              const id = props.messageId ? `heading-${props.messageId}--${slugger.slug(text)}` : undefined
              return <h3 id={id}>{children}</h3>
            },
            h4({ children }) {
              const text = extractText(children)
              const id = props.messageId ? `heading-${props.messageId}--${slugger.slug(text)}` : undefined
              return <h4 id={id}>{children}</h4>
            },
            h5({ children }) {
              const text = extractText(children)
              const id = props.messageId ? `heading-${props.messageId}--${slugger.slug(text)}` : undefined
              return <h5 id={id}>{children}</h5>
            },
            h6({ children }) {
              const text = extractText(children)
              const id = props.messageId ? `heading-${props.messageId}--${slugger.slug(text)}` : undefined
              return <h6 id={id}>{children}</h6>
            },
            code(codeProps: any) {
              const className = codeProps?.className as string | undefined
              const children = codeProps?.children as any

              const raw = String(children ?? '')
              const text = raw.replace(/\n$/, '')
              const match = /language-(\w+)/.exec(className ?? '')
              const lang = match?.[1] ?? ''

              const inlineProp = typeof codeProps?.inline === 'boolean' ? (codeProps.inline as boolean) : undefined
              const isBlock = Boolean(lang) || /[\r\n]/.test(text)
              const isInline = inlineProp ?? !isBlock

              if (isInline) {
                return <code className="mdInlineCode">{text}</code>
              }

              return (
                <div className="mdCodeBlock">
                  <div className="mdCodeHeader">
                    <div className="mdCodeLang">{lang || 'code'}</div>
                    <div style={{ flex: 1 }} />
                    <button type="button" className="btn btn-ghost" onClick={() => safeCopy(text)}>
                      复制
                    </button>
                  </div>
                  <SyntaxHighlighter
                    language={lang}
                    style={dark ? (oneDark as any) : (oneLight as any)}
                    customStyle={{
                      margin: 0,
                      borderRadius: 12,
                      padding: 12,
                      background: 'var(--code-bg)',
                      border: '1px solid var(--border)'
                    }}
                    codeTagProps={{ style: { fontFamily: 'inherit' } }}
                  >
                    {text}
                  </SyntaxHighlighter>
                </div>
              )
            }
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    )
  },
  (prev, next) =>
    prev.content === next.content &&
    prev.messageId === next.messageId &&
    prev.enableMath === next.enableMath &&
    prev.enableDollarLatex === next.enableDollarLatex
)
