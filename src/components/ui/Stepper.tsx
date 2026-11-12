import type { ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from './cn'

const KEY = 'flex size-11 flex-none items-center justify-center rounded-lg bg-card text-ink transition-transform duration-100 active:scale-[.96] disabled:bg-transparent disabled:text-dis disabled:scale-100'

/** Counter «− value +» on a subtle pill: 44px keys, the value in the middle (announced when it changes). */
export function Stepper({
  children,
  onMinus,
  onPlus,
  minusLabel,
  plusLabel,
  minusDisabled = false,
  plusDisabled = false,
  className,
}: {
  children: ReactNode
  onMinus: () => void
  onPlus: () => void
  minusLabel: string
  plusLabel: string
  minusDisabled?: boolean
  plusDisabled?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2 rounded-xl bg-sub p-1', className)}>
      <button type="button" aria-label={minusLabel} disabled={minusDisabled} onClick={onMinus} className={KEY}>
        <Minus size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <output aria-live="polite" className="flex min-w-0 flex-1 items-baseline justify-center gap-1 tabular-nums">
        {children}
      </output>
      <button type="button" aria-label={plusLabel} disabled={plusDisabled} onClick={onPlus} className={KEY}>
        <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  )
}
