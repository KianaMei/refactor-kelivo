import {
    Cpu,
    ShieldCheck,
    ChevronDown,
    Check,
    Bot,
    Key,
    Zap,
    Lock,
    Box,
    AlertTriangle,
    MessageSquare,
    CheckCircle,
    AlertCircle,
    Sparkles,
    Terminal,
    Settings
} from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import type {
    AgentSdkProvider,
    AppConfig,
    ClaudePermissionMode,
    CodexApprovalPolicy,
    CodexSandboxMode
} from '../../../../shared/types'
import { clsx } from 'clsx'
import { useState, useEffect } from 'react'

interface AgentSettingsBarProps {
    config: AppConfig
    sdkProvider: AgentSdkProvider
    setSdkProvider: (val: AgentSdkProvider) => void
    apiProviderId: string | null
    setApiProviderId: (val: string | null) => void // We might hide this or auto-select
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

// --- Constants from Reference (types.ts) ---

const AVAILABLE_SDK_PROVIDERS = [
    { id: 'claude', label: 'Claude Code', icon: <Sparkles size={14} className="text-[#d97757]" /> },
    { id: 'codex', label: 'Codex Cli', icon: <Terminal size={14} className="text-blue-500" /> },
    // { id: 'gemini', label: 'Gemini Cli', icon: <Cpu size={14} className="text-purple-500" /> },
] as const

const CLAUDE_MODELS = [
    { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5', description: 'Sonnet 4.5 · Use the default model' },
    { id: 'claude-opus-4-6', label: 'Opus 4.6', description: 'Opus 4.6 · Latest and most capable' },
    { id: 'claude-opus-4-5-20251101', label: 'Opus 4.5', description: 'Opus 4.5 · Most capable for complex work' },
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5', description: 'Haiku 4.5 · Fastest for quick answers' },
]

const CODEX_MODELS = [
    { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex', description: 'Latest frontier agentic coding model with enhanced capabilities.' },
    { id: 'gpt-5.3', label: 'gpt-5.3', description: 'Latest frontier model with significant improvements.' },
    { id: 'gpt-5.2-codex', label: 'gpt-5.2-codex', description: 'Latest frontier agentic coding model.' },
    { id: 'gpt-5.2', label: 'gpt-5.2', description: 'Latest frontier model with improvements across knowledge.' },
    { id: 'gpt-5.1-codex-max', label: 'gpt-5.1-codex-max', description: 'Codex-optimized flagship for deep and fast reasoning.' },
    { id: 'gpt-5.1-codex-mini', label: 'gpt-5.1-codex-mini', description: 'Optimized for codex. Cheaper, faster, but less capable.' },
]

// --- Icons Helper ---
const ModeIcon = ({ mode }: { mode: string }) => {
    switch (mode) {
        case 'default':
        case 'read-only': return <Lock size={14} className="text-[var(--text-3)]" />
        case 'acceptEdits':
        case 'workspace-write': return <CheckCircle size={14} className="text-[var(--text-3)]" />
        case 'dontAsk':
        case 'danger-full-access': return <Zap size={14} className="text-[var(--text-3)]" />
        case 'plan': return <MessageSquare size={14} className="text-[var(--text-3)]" />
        default: return <Lock size={14} className="text-[var(--text-3)]" />
    }
}

// --- Pill Select Component ---
interface PillSelectProps {
    icon: React.ReactNode
    value: string
    // Display label override (e.g. if value is an ID but we want to show a Name)
    displayLabel?: string
    options: { value: string; label: string; icon?: React.ReactNode; description?: string; disabled?: boolean }[]
    onChange: (val: string) => void
}

function PillSelect({ icon, value, displayLabel, options, onChange }: PillSelectProps) {
    const [open, setOpen] = useState(false)
    const currentOpt = options.find(o => o.value === value)

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <button
                    className={clsx(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all outline-none",
                        "bg-[var(--surface-3)] hover:bg-[var(--surface-4)]", // Pill background
                        "text-xs text-[var(--text-1)] font-medium",
                        "select-none cursor-pointer"
                    )}
                >
                    <span className="opacity-90">{icon}</span>
                    <span className="truncate max-w-[150px]">{displayLabel || currentOpt?.label || value}</span>
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="z-50 min-w-[240px] bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-1 animate-in fade-in zoom-in-95 duration-100"
                    sideOffset={8}
                    align="start"
                >
                    {options.map(opt => (
                        <div
                            key={opt.value}
                            onClick={() => !opt.disabled && onChange(opt.value)}
                            className={clsx(
                                "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors group",
                                opt.value === value ? "bg-[var(--surface-3)]" : "hover:bg-[var(--surface-2)]",
                                opt.disabled && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <span className={clsx(
                                "shrink-0 flex items-center justify-center w-4 h-4",
                                opt.value === value ? "text-[var(--text-1)]" : "text-[var(--text-3)] group-hover:text-[var(--text-2)]"
                            )}>
                                {opt.icon || (opt.value === value ? <Check size={14} /> : null)}
                            </span>
                            <div className="flex flex-col flex-1 min-w-0">
                                <span className={clsx("text-sm font-medium", opt.value === value ? "text-[var(--text-1)]" : "text-[var(--text-2)]")}>
                                    {opt.label}
                                </span>
                                {opt.description && (
                                    <span className="text-xs text-[var(--text-3)] truncate">
                                        {opt.description}
                                    </span>
                                )}
                            </div>
                            {opt.value === value && <Check size={14} className="text-[var(--primary)]" />}
                        </div>
                    ))}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}

export function AgentSettingsBar(props: AgentSettingsBarProps) {
    const {
        sdkProvider,
        setSdkProvider,
        modelId,
        setModelId,
        claudePermissionMode,
        setClaudePermissionMode,
        codexSandboxMode,
        setCodexSandboxMode,
    } = props

    // 1. SDK Provider Options
    const sdkOptions = AVAILABLE_SDK_PROVIDERS.map(p => ({
        value: p.id,
        label: p.label,
        icon: p.icon
    }))

    // 2. Model Options (Dependent on SDK)
    const modelOptions = sdkProvider === 'claude'
        ? CLAUDE_MODELS.map(m => ({ value: m.id, label: m.label, description: m.description, icon: <Lock size={14} /> }))
        : CODEX_MODELS.map(m => ({ value: m.id, label: m.label, description: m.description, icon: <ShieldCheck size={14} /> }))

    // Default model auto-select if invalid
    useEffect(() => {
        const currentList = sdkProvider === 'claude' ? CLAUDE_MODELS : CODEX_MODELS
        if (!modelId || !currentList.find(m => m.id === modelId)) {
            // Pick first one
            setModelId(currentList[0].id)
        }
    }, [sdkProvider, modelId, setModelId])


    // 3. Permission Options
    const permissionOptions = sdkProvider === 'claude'
        ? [
            { value: 'default', label: 'Default Mode', description: 'Ask for important actions', icon: <Lock size={14} /> },
            { value: 'acceptEdits', label: 'Agent Mode', description: 'Auto-accept edits', icon: <CheckCircle size={14} /> },
            { value: 'bypassPermissions', label: 'Auto Mode', description: 'Bypass all permissions', icon: <Zap size={14} /> },
            { value: 'plan', label: 'Plan Mode', description: 'Read-only plan', icon: <MessageSquare size={14} /> },
        ]
        : [
            { value: 'read-only', label: 'Read-Only', description: 'No file modifications', icon: <Lock size={14} /> },
            { value: 'workspace-write', label: 'Write', description: 'Can edit workspace', icon: <Box size={14} /> },
            { value: 'danger-full-access', label: 'Full Access', description: 'Full system access', icon: <AlertTriangle size={14} /> },
        ]

    // Helper to get current SDK icon
    const currentSdkInfo = AVAILABLE_SDK_PROVIDERS.find(p => p.id === sdkProvider)

    return (
        <div className="flex items-center gap-2 py-1 select-none">
            {/* Pill 1: SDK Provider (Labeled as "Claude Code" etc) */}
            <PillSelect
                icon={currentSdkInfo?.icon}
                value={sdkProvider}
                options={sdkOptions}
                onChange={(val) => setSdkProvider(val as AgentSdkProvider)}
            />

            {/* Pill 2: Model (Context Aware) */}
            <PillSelect
                icon={<Lock size={14} className="text-[var(--text-3)]" />} // Icon usually Lock in screenshot
                value={modelId || ''}
                displayLabel={modelOptions.find(m => m.value === modelId)?.label}
                options={modelOptions}
                onChange={(val) => setModelId(val)}
            />

            {/* Pill 3: Permission/Mode */}
            <PillSelect
                icon={sdkProvider === 'claude' ? <ModeIcon mode={claudePermissionMode} /> : <Box size={14} />}
                value={sdkProvider === 'claude' ? claudePermissionMode : codexSandboxMode}
                options={permissionOptions}
                onChange={(val) => {
                    if (sdkProvider === 'claude') setClaudePermissionMode(val as ClaudePermissionMode)
                    else setCodexSandboxMode(val as CodexSandboxMode)
                }}
            />
            {/* Configuration Trigger */}
            <button
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors ml-1"
                onClick={props.onOpenConfig}
                title="Agent Configuration"
            >
                <Settings size={14} />
            </button>
        </div>
    )
}
