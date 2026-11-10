import type { ReactNode } from 'react'
import { CloudOff } from 'lucide-react'
import { cn } from './cn'

/** Skeleton that repeats the card shape, pulsing 1.2s. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('flex flex-col gap-3 rounded-2xl border border-line bg-card p-4', className)}>
      <div className="flex items-center gap-2">
        <div className="size-2 animate-skeleton rounded-full bg-sub" />
        <div className="h-4 w-24 animate-skeleton rounded-lg bg-sub" />
      </div>
      <div className="h-6 w-[55%] animate-skeleton rounded-lg bg-sub" />
      <div className="h-2 animate-skeleton rounded-[4px] bg-sub" />
    </div>
  )
}

/** Empty state: one line of fact and one warm line. */
export function EmptyState({ title, children, className }: { title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-2xl border border-line bg-card p-4', className)}>
      <div className="text-base font-semibold">{title}</div>
      {children && <div className="text-cap text-ink2">{children}</div>}
    </div>
  )
}

/** Neutral pill: offline / pending changes. No alarm — data is not lost. */
export function OfflinePill({ children }: { children: ReactNode }) {
  return (
    <span role="status" className="inline-flex h-8 items-center gap-2 rounded-full bg-sub px-3 text-cap text-ink2">
      <CloudOff size={16} strokeWidth={1.75} aria-hidden="true" />
      {children}
    </span>
  )
}
