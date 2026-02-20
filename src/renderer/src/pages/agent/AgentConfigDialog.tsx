import { useState, useEffect } from 'react'
import { X, Save, Settings, Key, Globe, Eye, EyeOff, Plus, Trash2, Check, LayoutGrid, Monitor, Cpu, Box } from 'lucide-react'
import type { AppConfig, ProviderConfigV2, AgentSdkProvider } from '../../../../shared/types'
import { clsx } from 'clsx'

interface AgentConfigDialogProps {
    isOpen: boolean
    onClose: () => void
    sdkProvider: AgentSdkProvider
    currentProviderId: string | null
    onSave: (providerId: string, updatedConfig: ProviderConfigV2) => void
    onDelete?: (providerId: string) => void
    config: AppConfig
}

export function AgentConfigDialog(props: AgentConfigDialogProps) {
    const { isOpen, onClose, sdkProvider, currentProviderId, onSave, onDelete, config } = props

    // State for the currently selected profile ID
    const [selectedId, setSelectedId] = useState<string>('')
    const [editConfig, setEditConfig] = useState<ProviderConfigV2 | null>(null)
    const [showKey, setShowKey] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')

    // Prefix to namespace these configs
    const ID_PREFIX = `agent-profile-${sdkProvider}-`

    // Filter to only show Agent-specific profiles for the current SDK
    const agentProfiles = Object.values(config.providerConfigs || {})
        .filter(p => p.id.startsWith(ID_PREFIX))
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))

    // Initialize selection
    useEffect(() => {
        if (!isOpen) return

        if (currentProviderId && currentProviderId.startsWith(ID_PREFIX)) {
            setSelectedId(currentProviderId)
        } else if (agentProfiles.length > 0) {
            setSelectedId(agentProfiles[0].id)
        } else {
            createNewProfile()
        }
    }, [isOpen])

    const createNewProfile = () => {
        const newId = `${ID_PREFIX}${Date.now()}`
        const newConfig: ProviderConfigV2 = {
            id: newId,
            name: '新配置',
            enabled: true,
            apiKey: '',
            baseUrl: sdkProvider === 'codex' ? 'https://api.openai.com/v1' : '',
            models: [],
            modelOverrides: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            customHeaders: {}
        }
        setEditConfig(newConfig)
        setSelectedId(newId)
    }

    // Load config into editor when selection changes
    useEffect(() => {
        if (!selectedId) return

        // Check if it's an existing profile
        const found = config.providerConfigs?.[selectedId]
        if (found) {
            setEditConfig({ ...found })
        } else if (editConfig?.id !== selectedId) {
            // If selectedId matches the "new" one we just created in memory, keep it
            // otherwise, if selectedId is invalid, do nothing or reset
        }
    }, [selectedId, config.providerConfigs])

    if (!isOpen) return null

    const handleSave = () => {
        if (editConfig) {
            onSave(editConfig.id, editConfig)
            // If it was a new profile (not in list), it will be added by parent update
            // We keep it selected
        }
    }

    const handleDelete = (id: string) => {
        if (confirm('确定要删除此配置吗？')) {
            if (onDelete) onDelete(id)
            // Select another one
            const others = agentProfiles.filter(p => p.id !== id)
            if (others.length > 0) {
                setSelectedId(others[0].id)
            } else {
                createNewProfile() // Create new if all deleted
            }
        }
    }

    return (
        <div className="modalOverlay" onMouseDown={onClose}>
            <div className="modalSurface frosted flex flex-col overflow-hidden shadow-2xl"
                style={{ width: 800, height: 550, padding: 0, borderRadius: 12 }}
                onMouseDown={e => e.stopPropagation()}>

                {/* Titlebar */}
                <div className="h-12 bg-[var(--surface-1)] border-b border-[var(--border)] flex items-center justify-between px-4 select-none drag-handle">
                    <div className="flex items-center gap-2 text-[var(--text-1)]">
                        <Monitor size={16} className="opacity-70" />
                        <span className="font-semibold text-sm">Agent 环境配置</span>
                        <span className="text-xs opacity-50 px-2 py-0.5 bg-[var(--surface-3)] rounded-full">
                            {sdkProvider === 'claude' ? 'Claude SDK' : 'Codex SDK'}
                        </span>
                    </div>
                    <button onClick={onClose} className="btn btn-icon btn-sm hover:bg-[var(--surface-3)]">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left Sidebar - Profile List */}
                    <div className="w-64 bg-[var(--surface-2)] border-r border-[var(--border)] flex flex-col">
                        <div className="p-3 border-b border-[var(--border)]">
                            <button
                                onClick={createNewProfile}
                                className="w-full btn btn-sm bg-[var(--surface-1)] hover:bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-1)] justify-center gap-2"
                            >
                                <Plus size={14} />
                                <span>新建配置</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                            {agentProfiles.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setSelectedId(p.id)}
                                    className={clsx(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all text-left group",
                                        selectedId === p.id
                                            ? "bg-[var(--primary)] text-white shadow-md font-medium"
                                            : "hover:bg-[var(--surface-3)] text-[var(--text-2)] hover:text-[var(--text-1)]"
                                    )}
                                >
                                    <Box size={16} className={selectedId === p.id ? "opacity-100" : "opacity-60"} />
                                    <div className="flex-1 truncate">
                                        {p.name}
                                    </div>
                                    {selectedId === p.id && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-white opacity-50" />
                                    )}
                                </button>
                            ))}

                            {/* Show the temporary new one if it's not yet saved/in the list */}
                            {!agentProfiles.find(p => p.id === selectedId) && editConfig && (
                                <button
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm bg-[var(--primary)] text-white shadow-md font-medium text-left"
                                >
                                    <Plus size={16} />
                                    <div className="flex-1 truncate">
                                        {editConfig.name} <span className="opacity-60 text-xs">(未保存)</span>
                                    </div>
                                </button>
                            )}

                            {agentProfiles.length === 0 && !editConfig && (
                                <div className="text-center py-8 text-xs opacity-50">
                                    暂无配置档案
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Content - Edit Form */}
                    <div className="flex-1 bg-[var(--surface-1)] flex flex-col">
                        {editConfig ? (
                            <>
                                <div className="p-6 flex-1 overflow-y-auto">
                                    <div className="max-w-lg mx-auto flex flex-col gap-6">

                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs font-bold uppercase opacity-60 tracking-wider">配置名称</label>
                                            <input
                                                className="input w-full text-lg font-medium px-3 py-2"
                                                value={editConfig.name}
                                                onChange={(e) => setEditConfig({ ...editConfig, name: e.target.value })}
                                                placeholder="我的配置"
                                            />
                                        </div>

                                        <div className="bg-[var(--surface-2)] rounded-lg p-1 border border-[var(--border)]">
                                            <div className="p-3 border-b border-[var(--border)] text-xs font-bold uppercase opacity-60 tracking-wider flex items-center gap-2">
                                                <Key size={12} /> 凭证设置
                                            </div>
                                            <div className="p-4 flex flex-col gap-4">
                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-xs opacity-80">API Key <span className="opacity-50 font-normal">(可选，若留空则使用本地 CLI 登录态)</span></label>
                                                    <div className="relative">
                                                        <input
                                                            className="input w-full font-mono text-sm pr-8 bg-[var(--surface-1)]"
                                                            type={showKey ? "text" : "password"}
                                                            placeholder={sdkProvider === 'claude' ? "sk-ant-... (留空使用 claude login)" : "sk-..."}
                                                            value={editConfig.apiKey || ''}
                                                            onChange={(e) => setEditConfig({ ...editConfig, apiKey: e.target.value })}
                                                        />
                                                        <button
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-opacity p-1"
                                                            onClick={() => setShowKey(!showKey)}
                                                            tabIndex={-1}
                                                        >
                                                            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-xs opacity-80">Base URL</label>
                                                    <input
                                                        className="input w-full font-mono text-sm bg-[var(--surface-1)]"
                                                        placeholder={sdkProvider === 'claude' ? "https://api.anthropic.com" : "https://api.openai.com/v1"}
                                                        value={editConfig.baseUrl || ''}
                                                        onChange={(e) => setEditConfig({ ...editConfig, baseUrl: e.target.value })}
                                                    />
                                                    <p className="text-[10px] opacity-40">
                                                        {sdkProvider === 'claude'
                                                            ? "如果使用官方接口，请留空（将使用 `claude login` 的系统凭证）。如果是中转/代理，请输入完整的 Base URL。"
                                                            : "OpenAI 兼容接口的地址。"}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 text-xs opacity-50 pl-1">
                                            <Check size={12} className="text-green-500" />
                                            <span>此配置将独立存储，不会影响主程序的模型设置。</span>
                                        </div>

                                    </div>
                                </div>

                                {/* Footer Actions */}
                                <div className="p-4 border-t border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between">
                                    <button
                                        className={clsx("btn btn-ghost hover:bg-red-900/10 text-red-500", !agentProfiles.find(p => p.id === selectedId) && 'opacity-0 pointer-events-none')}
                                        onClick={() => handleDelete(selectedId)}
                                    >
                                        <Trash2 size={16} />
                                        <span className="ml-1">删除</span>
                                    </button>

                                    <div className="flex items-center gap-3">
                                        <button className="btn btn-ghost hover:bg-[var(--surface-3)]" onClick={onClose}>
                                            取消
                                        </button>
                                        <button
                                            className="btn btn-primary px-6 shadow-lg"
                                            onClick={handleSave}
                                            disabled={!editConfig.name}
                                        >
                                            <Save size={16} />
                                            <span>保存并应用</span>
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center opacity-30 gap-4">
                                <Cpu size={48} />
                                <span>请选择或新建一个配置</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
