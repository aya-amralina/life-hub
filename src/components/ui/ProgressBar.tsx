import { cn } from './cn'

/** 8px bar. Fill in sphere colour; when over the limit — amber over the full width. */
export function ProgressBar({
  value,
  max,
  fillClass,
  label,
}: {
  value: number
  max: number
  fillClass: string
  label?: string
}) {
  const over = max > 0 && value > max
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('h-2 overflow-hidden rounded-[4px]', over ? 'bg-amber' : 'bg-sub')}
    >
      {!over && pct > 0 && <div className={cn('h-full rounded-[4px]', fillClass)} style={{ width: `${pct}%` }} />}
    </div>
  )
}
