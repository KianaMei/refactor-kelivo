import type { UserConfig } from '../../../shared/types'
import { useHideAvatars } from '../contexts/HideAvatarsContext'

export interface UserAvatarProps {
    user?: UserConfig
    size?: number
    className?: string
    onClick?: () => void
}

function AvatarPlaceholder({ size }: { size: number }) {
    return (
        <svg
            width={size * 0.6}
            height={size * 0.6}
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ opacity: 0.4 }}
        >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
    )
}

export function UserAvatar(props: UserAvatarProps) {
    const { user, size = 36, onClick, className } = props
    const hideAvatars = useHideAvatars()
    const name = user?.name ?? 'Kelivo'
    const avatarType = user?.avatarType ?? 'initial'
    const avatarValue = user?.avatarValue ?? ''

    let content: React.ReactNode

    if (hideAvatars) {
        content = <AvatarPlaceholder size={size} />
    } else if (avatarType === 'emoji' && avatarValue) {
        content = <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>{avatarValue}</span>
    } else if ((avatarType === 'url' || avatarType === 'file') && avatarValue) {
        const src = avatarType === 'file' ? `file://${avatarValue}` : avatarValue
        content = (
            <img
                src={src}
                alt={name}
                style={{ width: '100%', height: '100%', borderRadius: 'var(--radius)', objectFit: 'cover' }}
                onError={(e) => {
                    const parent = e.currentTarget.parentElement
                    if (parent) {
                        e.currentTarget.style.display = 'none'
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

