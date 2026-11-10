import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from './cn'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('flex flex-col gap-3 rounded-2xl border border-line bg-card p-4', className)}>{children}</section>
}

/** Card header: sphere dot + title 16/600, context 13 on the right, optional chevron link. */
export function CardHeader({
  title,
  dotClass,
  icon,
  context,
  to,
}: {
  title: string
  dotClass?: string
  icon?: ReactNode
  context?: ReactNode
  to?: string
}) {
  const inner = (
    <>
      {dotClass && <span className={cn('size-2 flex-none rounded-full', dotClass)} />}
      {icon}
      <h2 className="m-0 flex-1 text-base font-semibold">{title}</h2>
      {context && <span className="text-cap text-ink2 tabular-nums">{context}</span>}
      {to && <ChevronRight size={20} strokeWidth={1.75} className="text-ink3" aria-hidden="true" />}
    </>
  )
  if (to) {
    return (
      <Link to={to} className="-my-2.5 flex min-h-11 items-center gap-2 no-underline">
        {inner}
      </Link>
    )
  }
  return <div className="flex min-h-6 items-center gap-2">{inner}</div>
}
