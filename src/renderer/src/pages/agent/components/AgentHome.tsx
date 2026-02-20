
import { Bot } from 'lucide-react'
import { AgentComposer, type AgentComposerProps } from './AgentComposer'

interface AgentHomeProps extends Omit<AgentComposerProps, 'mode'> {
    // Add any Home specific props here if needed, e.g., recent sessions
}

export function AgentHome(props: AgentHomeProps) {
    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingBottom: '20vh' // Visual centering
        }}>
            <div style={{ marginBottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.8 }}>
                <Bot size={48} strokeWidth={1.5} style={{ marginBottom: 16, color: 'var(--text-2)' }} />
                <h2 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-1)' }}>有什么我可以帮你的吗？</h2>
            </div>

            <div style={{ width: '100%', maxWidth: 920, padding: '0 24px' }}>
                <AgentComposer mode="card" {...props} />
            </div>
        </div>
    )
}
