/**
 * 搜索服务选择弹出层
 * 对齐 Flutter Kelivo 的 search_provider_popover.dart
 */
import { Globe, Check, Cloud } from 'lucide-react'
import type { SearchConfig, SearchServiceConfig } from '../../../shared/types'

interface Props {
    config: SearchConfig
    onToggleGlobal: () => void
    onSelectService: (serviceId: string) => void
    onClose?: () => void
}

export function SearchSelectPopover({ config, onToggleGlobal, onSelectService, onClose }: Props) {
    const { global, services } = config
    const activeServiceId = global.defaultServiceId

    // 1. 联网搜索开关
    // 2. 服务列表 (Tavily, Exa, Brave, etc.)
    // 3. 模型原生搜索 (Native) - 作为一个特殊选项

    return (
        <div style={{ padding: 16, minWidth: 320 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ padding: 6, borderRadius: 8, background: 'var(--primary-bg)', display: 'flex' }}>
                    <Globe size={16} style={{ color: 'var(--primary)' }} />
                </div>
                <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
                    联网搜索
                </div>

                {/* Global Toggle Switch */}
                <button
                    className={`toggle ${global.enabled ? 'toggleOn' : ''}`}
                    onClick={onToggleGlobal}
                    style={{ width: 36, height: 20 }}
                >
                    <div className="toggleThumb" style={{ width: 16, height: 16 }} />
                </button>
            </div>

            <div style={{ height: 1, background: 'var(--border)', margin: '0 -16px 12px', opacity: 0.5 }} />

            {/* Service List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4, paddingLeft: 4 }}>
                    搜索引擎
                </div>

                {/* Dynamic Services */}
                {services.filter(s => s.enabled).map((service) => (
                    <button
                        key={service.id}
                        onClick={() => onSelectService(service.id)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: 'none',
                            background: activeServiceId === service.id ? 'var(--surface-2)' : 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background 0.1s'
                        }}
                    >
                        {/* Icon placeholder or specific icon based on type */}
                        <Globe size={16} color={activeServiceId === service.id ? 'var(--primary)' : 'var(--text-2)'} />

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                                {service.name}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                                {service.type}
                            </span>
                        </div>

                        {activeServiceId === service.id && (
                            <Check size={16} color="var(--primary)" />
                        )}
                    </button>
                ))}

                {/* Model Native Option */}
                <button
                    onClick={() => onSelectService('native')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: 'none',
                        background: activeServiceId === 'native' ? 'var(--surface-2)' : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        marginTop: 4
                    }}
                >
                    <Cloud size={16} color={activeServiceId === 'native' ? 'var(--primary)' : 'var(--text-2)'} />

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                            模型自带搜索
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            Google Search / Browsing
                        </span>
                    </div>

                    {activeServiceId === 'native' && (
                        <Check size={16} color="var(--primary)" />
                    )}
                </button>
            </div>

            {!global.enabled && (
                <div style={{ marginTop: 12, padding: 8, borderRadius: 6, background: 'var(--surface-2)', fontSize: 12, color: 'var(--text-3)' }}>
                    联网搜索已关闭。开启后将使用选中的服务进行搜索。
                </div>
            )}
        </div>
    )
}
