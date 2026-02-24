import type { UserConfig } from '../../../shared/types'

export interface UserAvatarProps {
    user?: UserConfig
    size?: number
    className?: string
    onClick?: () => void
}

export function UserAvatar(props: UserAvatarProps) {
    const { user, size = 36, onClick, className } = props
    const name = user?.name ?? 'Kelivo'
    const avatarType = user?.avatarType ?? 'initial'
    const avatarValue = user?.avatarValue ?? ''

    let content: React.ReactNode

    if (avatarType === 'emoji' && avatarValue) {
        content = <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>{avatarValue}</span>
    } else if ((avatarType === 'url' || avatarType === 'file') && avatarValue) {
        const src = avatarType === 'file' ? `file://${avatarValue}` : avatarValue
        content = (
            <img
                src={src}
                alt={name}
                style={{ width: '100%', height: '100%', borderRadius: 'var(--radius)', objectFit: 'cover' }}
                onError={(e) => {
                    // 图片加载失败时显示首字母
                    const parent = e.currentTarget.parentElement
                    if (parent) {
                        e.currentTarget.style.display = 'none'
                        // 清空并显示首字母，这里简单处理，实际可能需要更复杂的 fallback 逻辑
                        // 但因为我们在父容器里渲染，这里直接修改 display 不足以回退到文本
                        // 所以我们采用一种混合策略：图片放在顶层，文字放在下层？
                        // 简单起见，如果我们要完美回退，可能需要状态管理。
                        // 但 NavRail 原版是用 e.currentTarget.parentElement!.textContent 直接改 DOM
                        parent.textContent = name.charAt(0) || '?'
                        parent.style.fontSize = `${size * 0.45}px`
                        parent.style.fontWeight = '700'
                        parent.style.display = 'flex'
                        parent.style.alignItems = 'center'
                        parent.style.justifyContent = 'center'
                    }
                }}
            />
        )
    } else {
        // 默认显示名字首字母
        content = (
            <span style={{ fontSize: size * 0.45, fontWeight: 700 }}>
                {name.charAt(0) || '?'}
            </span>
        )
    }

    return (
        <button
            type="button"
            className={className}
            title={name}
            onClick={onClick}
            style={{
                width: size,
                height: size,
                borderRadius: 'var(--radius)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--primary-bg)',
                color: 'var(--primary)',
                overflow: 'hidden',
                border: 'none',
                padding: 0,
                cursor: onClick ? 'pointer' : 'default',
                flexShrink: 0
            }}
        >
            {content}
        </button>
    )
}
