import React from 'react'

type Props = {
  children: React.ReactNode
  title?: string
}

type State = {
  error: unknown
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error }
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (!this.state.error) return this.props.children

    const msg = this.state.error instanceof Error ? this.state.error.message : String(this.state.error)

    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>
          {this.props.title ?? '页面渲染出错'}
        </div>
        <div
          style={{
            border: '1px solid rgba(255,80,80,0.35)',
            background: 'rgba(255,80,80,0.12)',
            borderRadius: 12,
            padding: 12,
            color: 'var(--text)',
            fontSize: 13,
            lineHeight: 1.6
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>错误信息</div>
          <code style={{ whiteSpace: 'pre-wrap' }}>{msg}</code>
        </div>
        <div style={{ height: 12 }} />
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          重新加载
        </button>
      </div>
    )
  }
}

