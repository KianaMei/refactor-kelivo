
import { Play, Square } from 'lucide-react'
import type {
    AgentSdkProvider,
    AppConfig,
    ClaudePermissionMode,
    CodexApprovalPolicy,
    CodexSandboxMode
} from '../../../../../shared/types'
import { AgentSettingsBar } from '../AgentSettingsBar'

export interface AgentComposerProps {
    mode: 'card' | 'bar'
    input: string
    setInput: (value: string) => void
    onRun: () => void
    onStop: () => void
    isRunning: boolean
    workingDirectory: string

    // Settings Props
    config: AppConfig
    sdkProvider: AgentSdkProvider
    setSdkProvider: (val: AgentSdkProvider) => void
    apiProviderId: string | null
    setApiProviderId: (val: string | null) => void
    modelId: string | null
    setModelId: (val: string | null) => void
    claudePermissionMode: ClaudePermissionMode
    setClaudePermissionMode: (val: ClaudePermissionMode) => void
    codexSandboxMode: CodexSandboxMode
    setCodexSandboxMode: (val: CodexSandboxMode) => void
    codexApprovalPolicy: CodexApprovalPolicy
    setCodexApprovalPolicy: (val: CodexApprovalPolicy) => void
    onOpenConfig: () => void
}

export function AgentComposer(props: AgentComposerProps) {
    const {
        mode,
        input,
        setInput,
        onRun,
        onStop,
        isRunning,
        workingDirectory,
        ...settingsProps
    } = props

    // Card Mode Styles (Home)
    const cardStyle: React.CSSProperties = {
        width: '100%',
        maxWidth: 920,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', // Rounded for card
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        transition: 'border-color 0.15s, box-shadow 0.15s'
    }

    // Bar Mode Styles (Chat Bottom)
    const barStyle: React.CSSProperties = {
        width: '100%',
        maxWidth: '100%', // Full width in chat mode
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-2)',
        borderTop: '1px solid var(--border)', // Only top border usually, or full border if floating
        // If we want it floating at bottom like card still:
        border: '1px solid var(--border)',
        borderRadius: '16px', // Slightly less rounded or same
        boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
        overflow: 'hidden'
    }

    const containerStyle = mode === 'card' ? cardStyle : barStyle

    return (
        <div style={containerStyle} className="agentComposer">
            <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入你的任务…"
                style={{
                    width: '100%',
                    minHeight: mode === 'card' ? 60 : 40, // Slightly more compact in bar mode?
                    maxHeight: 400,
                    padding: '12px 14px',
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    resize: 'none',
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: 'var(--text)',
                    fontFamily: 'inherit'
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        onRun()
                    }
                }}
            />

            {/* Footer Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--surface-2)' // Ensure background matches
            }}>
                <AgentSettingsBar {...settingsProps} />

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 11, opacity: 0.5, marginRight: 4, fontFamily: 'monospace' }} title="工作目录">
                        {workingDirectory}
                    </div>
                    {isRunning ? (
                        <button type="button" className="btn btn-danger btn-icon btn-sm" onClick={onStop} title="停止">
                            <Square size={14} fill="currentColor" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="btn btn-primary btn-icon btn-sm"
                            onClick={onRun}
                            disabled={!input.trim()}
                            title="执行 (Enter)"
                            style={{ borderRadius: 6 }}
                        >
                            <Play size={14} fill="white" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
