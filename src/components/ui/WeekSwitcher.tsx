import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from './Button'

/** ‹ label › for moving between weeks (or days). */
export function WeekSwitcher({
  label,
  onPrev,
  onNext,
  nextDisabled = false,
  onReset,
  resetLabel,
}: {
  label: string
  onPrev: () => void
  onNext: () => void
  nextDisabled?: boolean
  onReset?: () => void
  resetLabel?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <IconButton shape="square" label="Назад" onClick={onPrev}>
        <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
      </IconButton>
      <div className="min-w-0 flex-1 text-center text-base tabular-nums">{label}</div>
      {onReset && resetLabel && (
        <button type="button" onClick={onReset} className="h-11 rounded-xl px-3 text-cap font-semibold text-ink active:bg-sub">
          {resetLabel}
        </button>
      )}
      <IconButton shape="square" label="Вперёд" onClick={onNext} disabled={nextDisabled} className="disabled:text-dis">
        <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
      </IconButton>
    </div>
  )
}
