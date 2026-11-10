import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from './cn'

/**
 * Row with a 24px checkbox inside a 44px tap zone. Deadline/meta lives in the meta line
 * so long (German) titles keep the full width.
 */
export function CheckItem({
  title,
  meta,
  dotClass,
  checked,
  disabled = false,
  lang,
  onToggle,
  onOpen,
}: {
  title: string
  meta?: ReactNode
  dotClass?: string
  checked: boolean
  disabled?: boolean
  lang?: string
  onToggle?: () => void
  onOpen?: () => void
}) {
  const muted = checked || disabled
  return (
    <div className="flex items-start gap-1 rounded-xl border border-line bg-card py-2 pr-4 pl-1 has-[button:active]:bg-sub">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={onToggle}
        className="group flex size-11 flex-none items-center justify-center"
      >
        {checked ? (
          <span className="flex size-6 items-center justify-center rounded-lg bg-inv text-on-inv">
            <Check size={16} strokeWidth={2.25} aria-hidden="true" />
          </span>
        ) : disabled ? (
          <span className="size-6 rounded-lg border-[1.5px] border-dashed border-dis bg-sub" />
        ) : (
          <span className="size-6 rounded-lg border-[1.5px] border-line2 group-active:border-ink2" />
        )}
      </button>
      <div
        className={cn('flex min-w-0 flex-1 flex-col gap-0.5 pt-2.5', onOpen && 'cursor-pointer')}
        onClick={onOpen}
      >
        <div lang={lang} className={cn('text-base [overflow-wrap:anywhere]', muted ? 'text-ink3' : 'text-ink')}>
          {title}
        </div>
        {meta && (
          <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-cap', muted ? 'text-ink3' : 'text-ink2')}>
            {dotClass && <span className={cn('size-2 flex-none rounded-full', disabled ? 'bg-dis' : dotClass)} />}
            {meta}
          </div>
        )}
      </div>
    </div>
  )
}

/** Red «срок прошёл» tag — red is used only for missed deadlines. */
export function OverdueTag({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-red-soft px-1.5 font-semibold text-red">{children}</span>
}
