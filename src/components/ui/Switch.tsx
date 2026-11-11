import { cn } from './cn'

/** Toggle 52×32 inside a 44px tap zone; on = inverted. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex h-11 flex-none items-center"
    >
      <span className={cn('flex h-8 w-[52px] items-center rounded-full p-1 transition-colors', checked ? 'bg-inv' : 'bg-line2')}>
        <span className={cn('size-6 rounded-full bg-card transition-transform', checked && 'translate-x-5')} />
      </span>
    </button>
  )
}
