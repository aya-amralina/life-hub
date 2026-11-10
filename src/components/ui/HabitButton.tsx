import type { LucideIcon } from 'lucide-react'
import { Check } from 'lucide-react'
import { cn } from './cn'

/** 104px habit tile. One tap marks, a second unmarks. Тело colour appears only when marked. */
export function HabitButton({
  icon: Glyph,
  label,
  checked,
  disabled = false,
  onToggle,
}: {
  icon: LucideIcon
  label: string
  checked: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'flex h-[104px] min-w-0 flex-col justify-between rounded-2xl border p-3 text-left transition-transform duration-100 select-none',
        disabled
          ? 'border-dashed border-line2 bg-transparent text-dis'
          : checked
            ? 'border-body-soft bg-body-soft text-ink'
            : 'border-line bg-card text-ink active:scale-[.97] active:border-line2 active:bg-sub',
      )}
    >
      <span className={cn('flex items-start justify-between', checked && !disabled ? 'text-body' : disabled ? '' : 'text-ink2')}>
        <Glyph size={24} strokeWidth={1.75} aria-hidden="true" />
        {checked && !disabled ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-body text-card">
            <Check size={14} strokeWidth={3} aria-hidden="true" />
          </span>
        ) : (
          <span className={cn('size-5 rounded-full border-[1.5px]', disabled ? 'border-dashed border-dis' : 'border-line2')} />
        )}
      </span>
      <span className={cn('text-base leading-5', checked && !disabled && 'font-semibold')}>{label}</span>
    </button>
  )
}
