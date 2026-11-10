import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from './cn'

/** Choice chip, 44px high. Selected = inverted with a check mark. */
export function Chip({
  selected = false,
  dotClass,
  className,
  children,
  type = 'button',
  ...rest
}: { selected?: boolean; dotClass?: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-base transition-transform duration-100 select-none',
        selected
          ? 'border-inv bg-inv font-semibold text-on-inv'
          : 'border-line2 bg-card text-ink active:scale-[.97] active:bg-sub disabled:border-line disabled:bg-transparent disabled:text-dis',
        className,
      )}
      {...rest}
    >
      {selected && <Check size={16} strokeWidth={2} aria-hidden="true" />}
      {!selected && dotClass && <span className={cn('size-2 flex-none rounded-full', dotClass)} />}
      {children}
    </button>
  )
}
