import type { ReactNode } from 'react'
import { cn } from './cn'

/**
 * A yes/no question in one row: the question on the left, the segment [Нет | Да] on the right («Нет» first).
 * The look of SegmentedTabs (lifted segment on a subtle fill), the meaning of an answer: buttons with aria-pressed.
 * `clearable` — tapping the chosen answer again clears it (a question without a default); otherwise it stays.
 */
export function YesNo({
  label,
  value,
  onChange,
  icon,
  hint,
  clearable = false,
}: {
  label: string
  value: boolean | null
  onChange: (v: boolean | null) => void
  icon?: ReactNode
  hint?: ReactNode
  clearable?: boolean
}) {
  const key = (answer: boolean) => {
    const selected = value === answer
    return (
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${label}: ${answer ? 'да' : 'нет'}`}
        onClick={() => onChange(selected ? (clearable ? null : answer) : answer)}
        className={cn(
          'flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg px-2 text-base transition-transform duration-100',
          selected ? 'bg-card font-semibold text-ink shadow-seg' : 'text-ink2 active:scale-[.96]',
        )}
      >
        {answer ? 'Да' : 'Нет'}
      </button>
    )
  }
  return (
    <div role="group" aria-label={label} className="flex items-center gap-3">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-base">{label}</span>
        {hint && <span className="block text-cap text-ink2">{hint}</span>}
      </span>
      <div className="flex w-40 flex-none gap-1 rounded-xl bg-sub p-1">
        {key(false)}
        {key(true)}
      </div>
    </div>
  )
}
