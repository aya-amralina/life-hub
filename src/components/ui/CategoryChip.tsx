import { cn } from './cn'

/** Category chip with a caption — in quick entry you see at once how much is left. */
export function CategoryChip({
  label,
  caption,
  over = false,
  onClick,
  disabled,
}: {
  label: string
  caption?: string
  over?: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 flex-col justify-center rounded-xl border border-line2 bg-card px-3 py-1.5 text-left transition-transform duration-100 active:scale-[.97] active:bg-sub disabled:border-line disabled:text-dis"
    >
      <span className="text-base">{label}</span>
      {caption && <span className={cn('text-cap tabular-nums', over ? 'text-amber-ink' : 'text-ink2')}>{caption}</span>}
    </button>
  )
}
