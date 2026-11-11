import { cn } from './cn'

export type FilterOption<T extends string> = { value: T; label: string; dotClass?: string; lang?: string }

/**
 * Filter chips (design 06): «Все» + options, horizontal scroll on the phone. Selected = inverted, the
 * sphere dot stays (ringed with the card colour), no check mark. `multi` toggles several; «Все» resets.
 */
export function FilterChips<T extends string>({
  options,
  selected,
  onChange,
  multi = false,
  label,
  allLabel = 'Все',
}: {
  options: readonly FilterOption<T>[]
  selected: readonly T[]
  onChange: (next: T[]) => void
  multi?: boolean
  label: string
  allLabel?: string
}) {
  const toggle = (v: T) => {
    if (!multi) return onChange(selected.includes(v) ? [] : [v])
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  }
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      <Pill selected={selected.length === 0} onClick={() => onChange([])}>
        {allLabel}
      </Pill>
      {options.map((o) => (
        <Pill key={o.value} selected={selected.includes(o.value)} onClick={() => toggle(o.value)} dotClass={o.dotClass} lang={o.lang}>
          {o.label}
        </Pill>
      ))}
    </div>
  )
}

function Pill({
  selected,
  onClick,
  dotClass,
  lang,
  children,
}: {
  selected: boolean
  onClick: () => void
  dotClass?: string
  lang?: string
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      lang={lang}
      className={cn(
        'inline-flex h-11 flex-none items-center gap-2 rounded-xl border px-4 text-base whitespace-nowrap',
        selected ? 'border-inv bg-inv font-semibold text-on-inv' : 'border-line2 bg-card text-ink active:bg-sub',
      )}
    >
      {dotClass && <span className={cn('size-2 flex-none rounded-full shadow-[0_0_0_2px_var(--card)]', dotClass)} />}
      {children}
    </button>
  )
}
