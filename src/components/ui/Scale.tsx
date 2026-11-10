import { cn } from './cn'

export type ScaleOption<T extends string | number> = { value: T; label?: string }

/**
 * Row of keys (≥ 44px), two rows of five for 1–10. One tap = one answer; tapping the selected
 * key again clears it. Disabled state shows a hint instead of the value (e.g. «откроется после 18:00»).
 */
export function Scale<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  disabledHint,
  hintLow,
  hintHigh,
  columns = 5,
  format,
}: {
  label: string
  options: readonly ScaleOption<T>[]
  value: T | null | undefined
  onChange: (v: T | null) => void
  disabled?: boolean
  disabledHint?: string
  hintLow?: string
  hintHigh?: string
  columns?: number
  format?: (v: T) => string
}) {
  const shown = value === null || value === undefined ? '' : format ? format(value) : String(value)
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <div className={cn('flex justify-between text-base', disabled ? 'text-ink3' : 'text-ink')}>
        <span>{label}</span>
        {disabled && disabledHint ? (
          <span className="text-cap leading-6">{disabledHint}</span>
        ) : (
          <span className="font-semibold tabular-nums">{shown}</span>
        )}
      </div>
      <div className="grid gap-2 tabular-nums" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const selected = o.value === value
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={selected}
              aria-label={`${label}: ${o.label ?? o.value}`}
              disabled={disabled}
              onClick={() => onChange(selected ? null : o.value)}
              className={cn(
                'flex h-11 items-center justify-center rounded-xl text-base transition-transform duration-100',
                disabled
                  ? 'border border-line text-dis'
                  : selected
                    ? 'bg-inv font-semibold text-on-inv'
                    : 'bg-sub text-ink active:scale-[.96] active:bg-line2',
              )}
            >
              {o.label ?? o.value}
            </button>
          )
        })}
      </div>
      {(hintLow || hintHigh) && !disabled && (
        <div className="flex justify-between text-cap text-ink2">
          <span>{hintLow}</span>
          <span>{hintHigh}</span>
        </div>
      )}
    </div>
  )
}
