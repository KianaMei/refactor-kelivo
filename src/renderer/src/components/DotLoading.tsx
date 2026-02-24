/**
 * 呼吸动画圆点 — 用于 tool loading 态
 */
export function DotLoading({ size = 6 }: { size?: number }) {
  return (
    <span className="dotLoadingWrap">
      <span className="dotLoadingDot" style={{ width: size, height: size, animationDelay: '0s' }} />
      <span className="dotLoadingDot" style={{ width: size, height: size, animationDelay: '0.2s' }} />
      <span className="dotLoadingDot" style={{ width: size, height: size, animationDelay: '0.4s' }} />
    </span>
  )
}
