import React from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown } from 'lucide-react'

// 通用 Option 接口
export interface SelectOption {
    value: string
    label: string
    icon?: React.ReactNode
    description?: string
}

interface CustomSelectProps {
    value: string
    options: SelectOption[]
    onChange: (value: string) => void
    placeholder?: string

    // 样式覆盖
    className?: string
    width?: number | string
    style?: React.CSSProperties

    // 自定义渲染
    renderTrigger?: (selectedOption?: SelectOption) => React.ReactNode
    renderOption?: (option: SelectOption, isSelected: boolean) => React.ReactNode
}

/**
 * 基于 Radix UI 的通用下拉选择组件
 * 样式对齐 Kelivo 设计系统 (毛玻璃, 图标支持)
 */
export function CustomSelect(props: CustomSelectProps) {
    const {
        value,
        options,
        onChange,
        placeholder = '请选择',
        className,
        width = '100%',
        renderTrigger,
        renderOption
    } = props

    const selectedOption = options.find(o => o.value === value)

    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                {renderTrigger ? (
                    renderTrigger(selectedOption)
                ) : (
                    <button
                        className={`select ${className || ''}`}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedOption?.icon && (
                                <span className="select-icon" style={{ display: 'flex', alignItems: 'center' }}>
                                    {selectedOption.icon}
                                </span>
                            )}
                            {selectedOption ? selectedOption.label : <span style={{ opacity: 0.5 }}>{placeholder}</span>}
                        </span>
                        <ChevronDown size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                    </button>
                )}
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className="desktopPopover"
                    sideOffset={4}
                    align="start"
                    style={{
                        width: 'var(--radix-dropdown-menu-trigger-width)',
                        padding: 4,
                        minWidth: 160,
                        // 需高于 ImageStudio 设置面板遮罩层 (z-index: 2050)
                        zIndex: 10000,
                        maxHeight: 300,
                        overflowY: 'auto'
                    }}
                >
                    {options.map((option) => {
                        const isSelected = option.value === value
                        return (
                            <DropdownMenu.Item
                                key={option.value}
                                className={`contextMenuItem ${isSelected ? 'settingsMenuItemActive' : ''}`}
                                onClick={() => onChange(option.value)}
                                style={{ borderRadius: 6, fontSize: 13, height: 'auto', minHeight: 36, padding: '6px 8px' }}
                            >
                                {renderOption ? (
                                    renderOption(option, isSelected)
                                ) : (
                                    <>
                                        {option.icon && (
                                            <span style={{ display: 'flex', alignItems: 'center', marginRight: 8 }}>
                                                {option.icon}
                                            </span>
                                        )}
                                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                                            <span style={{ fontWeight: isSelected ? 600 : 400 }}>{option.label}</span>
                                            {option.description && (
                                                <span style={{ fontSize: 11, opacity: 0.6 }}>{option.description}</span>
                                            )}
                                        </div>
                                        {isSelected && <Check size={14} style={{ marginLeft: 8 }} />}
                                    </>
                                )}
                            </DropdownMenu.Item>
                        )
                    })}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    )
}
