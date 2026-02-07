import { useState, useEffect } from 'react'
import { X, Save, Settings, Key, Globe, Eye, EyeOff, Plus, Trash2, CheckCircle, ShieldCheck } from 'lucide-react'
import type { AppConfig, ProviderConfigV2, AgentSdkProvider } from '../../../../shared/types'
import { clsx } from 'clsx'

interface AgentConfigDialogProps {
    isOpen: boolean
    onClose: () => void
    sdkProvider: AgentSdkProvider
    currentProviderId: string | null
    onSave: (providerId: string, updatedConfig: ProviderConfigV2) => void
    config: AppConfig
}

export function AgentConfigDialog(props: AgentConfigDialogProps) {
    const { isOpen, onClose, sdkProvider, currentProviderId, onSave, config } = props

    // State for the currently selected profile ID in this dialog
    const [selectedId, setSelectedId] = useState<string>('')
    // State for the config being edited
    const [editConfig, setEditConfig] = useState<ProviderConfigV2 | null>(null)
    const [showKey, setShowKey] = useState(false)

    // Prefix to namespace these configs as "Independent" Agent Profiles
    const ID_PREFIX = `agent-profile-${sdkProvider}-`

    // Filter to only show Agent-specific profiles for the current SDK
    const agentProfiles = Object.values(config.providerConfigs || {})
        .filter(p => p.id.startsWith(ID_PREFIX))
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))

    // Initialize selection
    useEffect(() => {
        if (!isOpen) return

        if (currentProviderId && currentProviderId.startsWith(ID_PREFIX)) {
            // If the active one is already an agent profile, select it
            setSelectedId(currentProviderId)
        } else if (agentProfiles.length > 0) {
            // Otherwise default to the most recent agent profile
            setSelectedId(agentProfiles[0].id)
        } else {
            // No profiles exist, we will show "New" state
            setSelectedId('new')
        }
    }, [isOpen, currentProviderId, config.providerConfigs, ID_PREFIX])

    // Load config into editor when selection changes
    useEffect(() => {
        if (selectedId === 'new') {
            setEditConfig({
                id: `${ID_PREFIX}${Date.now()}`,
                name: '默认配置',
                enabled: true,
                apiKey: '',
                baseUrl: sdkProvider === 'codex' ? 'https://api.openai.com/v1' : '',
                models: [],
                modelOverrides: {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                customHeaders: {}
            })
        } else if (selectedId) {
            const found = config.providerConfigs?.[selectedId]
            if (found) {
                setEditConfig({ ...found })
            }
        }
    }, [selectedId, config.providerConfigs, ID_PREFIX, sdkProvider])

    if (!isOpen) return null

    const handleSave = () => {
        if (editConfig) {
            onSave(editConfig.id, editConfig)
            setSelectedId(editConfig.id)
            onClose() // Auto close on save
        }
    }

    return (
        <div className="modalOverlay" onMouseDown={onClose}>
            <div className="modalSurface frosted" style={{ width: 520, padding: 0, overflow: 'hidden' }} onMouseDown={e => e.stopPropagation()}>

                {/* Header */}
                <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm",
                            sdkProvider === 'claude' ? 'bg-[#d97757]' : 'bg-blue-600')}>
                            <Settings size={18} />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-base leading-tight">Agent 独立配置</span>
                            <span className="text-[10px] opacity-60 uppercase tracking-wider font-semibold">
                                {sdkProvider === 'claude' ? 'Claude SDK' : 'Codex SDK'} Profile
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn btn-icon btn-sm hover:bg-[var(--surface-3)]">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-6 flex flex-col gap-6 ">

                    {/* Profile Switcher */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold opacity-70 uppercase tracking-wide px-1">选择配置档案</label>
                        <select
                            className="input w-full appearance-none pr-8 cursor-pointer font-medium"
                            value={selectedId}
                            onChange={(e) => setSelectedId(e.target.value)}
                        >
                            {agentProfiles.map(p => (
                                <option key={p.id} value={p.id}>📄 {p.name}</option>
                            ))}
                            <option value="new" className="text-[var(--primary)] font-bold">+ 新建配置档案...</option>
                        </select>
                        <p className="text-[10px] opacity-40 px-1">
                            此配置仅用于 Agent 页面，与主程序供应商隔离。
                        </p>
                    </div>

                    {editConfig && (
                        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-200">

                            <div className="grid grid-cols-1 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium opacity-80 px-1">配置名称</label>
                                    <input
                                        className="input w-full"
                                        value={editConfig.name}
                                        onChange={(e) => setEditConfig({ ...editConfig, name: e.target.value })}
                                        placeholder="给此配置起个名字..."
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium opacity-80 flex items-center gap-1.5 px-1">
                                    <Key size={12} className="text-[var(--primary)]" />
                                    <span>API Key</span>
                                </label>
                                <div className="relative">
                                    <input
                                        className="input w-full font-mono text-xs pr-8"
                                        type={showKey ? "text" : "password"}
                                        placeholder={sdkProvider === 'claude' ? "sk-ant-api03-..." : "sk-..."}
                                        value={editConfig.apiKey || ''}
                                        onChange={(e) => setEditConfig({ ...editConfig, apiKey: e.target.value })}
                                    />
                                    <button
                                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity p-1"
                                        onClick={() => setShowKey(!showKey)}
                                        tabIndex={-1}
                                    >
                                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium opacity-80 flex items-center gap-1.5 px-1">
                                    <Globe size={12} className="opacity-70" />
                                    <span>Base URL</span>
                                </label>
                                <input
                                    className="input w-full font-mono text-xs"
                                    placeholder={sdkProvider === 'claude' ? "https://api.anthropic.com" : "https://api.openai.com/v1"}
                                    value={editConfig.baseUrl || ''}
                                    onChange={(e) => setEditConfig({ ...editConfig, baseUrl: e.target.value })}
                                />
                                {sdkProvider === 'claude' && (
                                    <p className="text-[10px] opacity-40 px-1">Claude 官方 SDK 通常留空即可。</p>
                                )}
                            </div>

                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-[var(--surface-2)] border-t border-[var(--border)] flex justify-between items-center">

                    <div className="text-xs opacity-40">
                        {editConfig?.id.slice(0, 20)}...
                    </div>

                    <div className="flex gap-3">
                        <button className="btn bg-transparent hover:bg-[var(--surface-3)] border-transparent" onClick={onClose}>
                            取消
                        </button>
                        <button
                            className="btn btn-primary px-5 shadow-md flex items-center gap-2"
                            onClick={handleSave}
                            disabled={!editConfig?.apiKey && !editConfig?.baseUrl} // basic validation
                        >
                            <Save size={14} />
                            <span>保存并应用</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
