export function AbilityCapsule({
  type,
  color
}: {
  type: 'vision' | 'image' | 'tool' | 'reasoning'
  color: string
}) {
  const icons = {
    // Lucide eye 风格 - 经典眼睛图标，清晰易识别
    vision: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
        <circle cx="12" cy="12" r="3" />
        <circle cx="12" cy="12" r="1" fill={color} />
      </svg>
    ),
    // Lucide image 风格 - 经典图片图标
    image: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    ),
    // Lucide wrench 风格 - 简洁的扳手图标
    tool: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    // Lucide brain-circuit 风格 - AI大脑电路图标
    reasoning: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
        <path d="M9 13a4.5 4.5 0 0 0 3-4" />
        <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
        <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
        <path d="M6 18a4 4 0 0 1-1.967-.516" />
        <path d="M12 13h4" />
        <path d="M12 18h6a2 2 0 0 1 2 2v1" />
        <path d="M12 8h8" />
        <path d="M16 8V5a2 2 0 0 1 2-2" />
        <circle cx="16" cy="13" r="1" fill={color} />
        <circle cx="18" cy="3" r="1" fill={color} />
        <circle cx="20" cy="21" r="1" fill={color} />
        <circle cx="20" cy="8" r="1" fill={color} />
      </svg>
    )
  }

  const titles = {
    vision: '视觉输入',
    image: '图像生成',
    tool: '工具调用',
    reasoning: '推理能力'
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 6px',
        borderRadius: 6,
        background: `${color}18`,
        border: `1px solid ${color}35`,
        transition: 'all 0.15s ease'
      }}
      title={titles[type]}
    >
      {icons[type]}
    </span>
  )
}

