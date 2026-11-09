import { cn } from './cn'

export type Segment<T extends string> = { value: T; label: string; disabled?: boolean }

/** Segmented control: 4px inset on subtle fill, active segment lifted onto card. */
export function SegmentedTabs<T extends string>({
  segments,
  value,
  onChange,
  compact = false,
  className,
  label,
}: {
  segments: readonly Segment<T>[]
  value: T
  onChange: (v: T) => void
  compact?: boolean
  className?: string
  label?: string
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 rounded-xl bg-sub p-1', className)}>
      {segments.map((s) => {
        const active = s.value === value
        return (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={s.disabled}
            onClick={() => onChange(s.value)}
            className={cn(
              'flex min-w-0 flex-1 items-center justify-center truncate rounded-lg px-2 text-body',
              compact ? 'h-9' : 'h-10',
              active ? 'bg-card font-semibold text-ink shadow-seg' : 'text-ink2 disabled:text-dis',
            )}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
