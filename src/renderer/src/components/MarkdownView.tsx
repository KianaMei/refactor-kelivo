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

export function MarkdownView(props: { content: string }) {
  const dark = isDarkTheme()

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
          code(props: any) {
            const className = props?.className as string | undefined
            const children = props?.children as any
            const inline = Boolean(props?.inline)

            const raw = String(children ?? '')
            const text = raw.replace(/\n$/, '')
            const match = /language-(\w+)/.exec(className ?? '')
            const lang = match?.[1] ?? ''

            if (inline) {
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
}
