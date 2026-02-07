/**
 * 加载指示器组件 - CSS 纯动画版
 * 高性能、无卡顿、丝滑流畅
 */
import React from 'react'

/**
 * 波浪加载指示器 - 竖条上下律动
 */
interface WaveLoadingIndicatorProps {
  color?: string
  size?: number
  barCount?: number
}

export function WaveLoadingIndicator({ color, size = 32, barCount = 5 }: WaveLoadingIndicatorProps) {
  // 计算每根条的宽度和间距
  // 假设间距是条宽的 0.6 倍
  // size = n * w + (n-1) * 0.6w = w * (1.6n - 0.6)
  // w = size / (1.6n - 0.6)
  const barWidth = size / (1.6 * barCount - 0.6)
  const gap = barWidth * 0.6
  
  // 动态样式
  const containerStyle: React.CSSProperties = {
    width: size,
    height: size * 0.8,
    gap: gap,
  }

  return (
    <div className="wave-container" style={containerStyle}>
      {Array.from({ length: barCount }).map((_, index) => {
        // 从中间向两边扩散的延迟，或者简单的线性延迟
        // 这里使用简单的线性延迟，产生波浪传导感
        const delay = index * 0.1
        
        return (
          <div
            key={index}
            className="wave-bar"
            style={{
              width: barWidth,
              height: '100%',
              backgroundColor: color || 'var(--primary)',
              animationDelay: `${delay}s`,
            }}
          />
        )
      })}
    </div>
  )
}

/**
 * 呼吸圆点指示器（用于行内流式输出）
 */
interface PulseDotsProps {
  color?: string
  size?: number
  gap?: number
}

export function PulseDots({ color, size = 6, gap = 4 }: PulseDotsProps) {
  const effectiveColor = color || 'var(--primary)'
  
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap, verticalAlign: 'middle', marginLeft: 4 }}>
      {[0, 0.15, 0.3].map((delay, i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            backgroundColor: effectiveColor,
            animation: 'dotBounce 1.4s ease-in-out infinite both', // 使用 app.css 中已有的 dotBounce
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </span>
  )
}

/**
 * 纯净加载动画 - 不在消息气泡内，只显示动画
 */
interface PureLoadingAnimationProps {
  text?: string
  color?: string
  size?: number
}

export function PureLoadingAnimation({
  text = '思考中...',
  color,
  size = 32
}: PureLoadingAnimationProps) {
  return (
    <div
      className="pureLoadingAnimation"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        animation: 'fadeSlideIn 0.3s ease-out'
      }}
    >
      <WaveLoadingIndicator color={color} size={size} />
      <span
        className="shimmerText"
        style={{
          fontSize: 14,
          color: 'var(--text-2)',
          fontStyle: 'italic'
        }}
      >
        {text}
      </span>
    </div>
  )
}

/**
 * 带动画的加载文字 (兼容旧接口)
 */
interface AnimatedLoadingTextProps {
  text?: string
  textStyle?: React.CSSProperties
  color?: string
  size?: number
  showText?: boolean
}

export function AnimatedLoadingText({
  text = '思考中',
  textStyle,
  color,
  size = 24,
  showText = true
}: AnimatedLoadingTextProps) {
  const baseTextStyle: React.CSSProperties = {
    fontSize: 14,
    color: 'var(--text-2)',
    fontStyle: 'italic',
    ...textStyle
  }

  return (
    <div
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 10, 
        animation: 'fadeSlideIn 0.3s ease-out' 
      }}
    >
      <WaveLoadingIndicator color={color} size={size} />
      {showText && (
        <span className="shimmerText" style={baseTextStyle}>
          {text}
        </span>
      )}
    </div>
  )
}

/**
 * 流式内容后的打字指示器 (兼容旧接口)
 */
interface StreamingDotsProps {
  color?: string
  size?: number
}

export function StreamingDots({ color, size = 6 }: StreamingDotsProps) {
  return <PulseDots color={color} size={size} />
}

/**
 * 废弃的组件导出 (保持兼容)
 */
export function DotsTypingIndicator(props: any) { return <PulseDots {...props} /> }
export function OrbitLoadingIndicator(props: any) { return <WaveLoadingIndicator {...props} /> }
