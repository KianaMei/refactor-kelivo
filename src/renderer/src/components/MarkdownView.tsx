import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

function isDarkTheme(): boolean {
  // App.tsx 会把最终主题写到 <html data-theme="light|dark">
  return document.documentElement.dataset.theme !== 'light'
}

function safeCopy(text: string): void {
  void navigator.clipboard.writeText(text)
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

export const MarkdownView = memo(
  function MarkdownView(props: { content: string; messageId?: string }) {
    const dark = isDarkTheme()
    const slugger = useMemo(() => createSlugger(), [props.content])

    return (
      <div className="markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a({ children, href }) {
              // Electron：强制外链在系统浏览器打开（主进程已 setWindowOpenHandler）
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              )
            },
            h1({ children }) {
              const text = String(children ?? '')
              const id = props.messageId ? `heading-${props.messageId}--${slugger.slug(text)}` : undefined
              return <h1 id={id}>{children}</h1>
            },
            h2({ children }) {
              const text = String(children ?? '')
              const id = props.messageId ? `heading-${props.messageId}--${slugger.slug(text)}` : undefined
              return <h2 id={id}>{children}</h2>
            },
            h3({ children }) {
              const text = String(children ?? '')
              const id = props.messageId ? `heading-${props.messageId}--${slugger.slug(text)}` : undefined
              return <h3 id={id}>{children}</h3>
            },
            h4({ children }) {
              const text = String(children ?? '')
              const id = props.messageId ? `heading-${props.messageId}--${slugger.slug(text)}` : undefined
              return <h4 id={id}>{children}</h4>
            },
            h5({ children }) {
              const text = String(children ?? '')
              const id = props.messageId ? `heading-${props.messageId}--${slugger.slug(text)}` : undefined
              return <h5 id={id}>{children}</h5>
            },
            h6({ children }) {
              const text = String(children ?? '')
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

              // react-markdown v10 在某些情况下不会传 inline；
              // 如果把"行内 code"误判成 code block，会在 <p> 里渲染 <div>/<pre> 导致 validateDOMNesting/hydration 警告。
              // 这里用一个稳健的兜底：
              // - 有 language-xxx 或者包含换行 => 认为是 code block
              // - 否则一律当作行内 code
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
          {props.content}
        </ReactMarkdown>
      </div>
    )
  },
  (prev, next) => prev.content === next.content && prev.messageId === next.messageId
)
