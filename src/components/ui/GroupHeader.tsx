import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './cn'

/** Collapsible group title (design 3b): mark + name 16/600 + count + summary/badge + chevron. */
export function GroupHeader({
  mark,
  title,
  lang,
  count,
  summary,
  open,
  onToggle,
}: {
  mark?: ReactNode
  title: string
  lang?: string
  count?: number
  summary?: ReactNode
  open: boolean
  onToggle: () => void
}) {
  return (
    <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-11 w-full items-center gap-2 text-left">
      {mark}
      <span lang={lang} className="text-base font-semibold">
        {title}
      </span>
      {count !== undefined && <span className="text-cap text-ink2 tabular-nums">{count}</span>}
      <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-cap text-ink2">{summary}</span>
      <ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" className={cn('flex-none text-ink3 transition-transform', open && 'rotate-180')} />
    </button>
  )
}
