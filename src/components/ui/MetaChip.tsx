import { ArrowRightFromLine, Check, Clock, Flag, Flame, Lock, Pause, Redo2, type LucideIcon } from 'lucide-react'
import type { Chip, ChipKind } from '@/lib/rules/items'
import { cn } from './cn'

const ICON: Partial<Record<ChipKind, LucideIcon>> = {
  clock: Clock,
  from: ArrowRightFromLine,
  flag: Flag,
  hot: Flame,
  moved: Redo2,
  stuck: Pause,
  rigid: Lock,
  ok: Check,
}

const STYLE: Record<ChipKind, string> = {
  clock: 'bg-sub text-ink2',
  from: 'bg-sub text-ink2',
  flag: 'bg-sub text-ink2',
  moved: 'bg-sub text-ink2',
  ok: 'bg-sub text-ink2',
  hot: 'bg-amber-soft text-amber-ink font-semibold',
  alt: 'bg-amber-soft text-amber-ink font-semibold',
  late: 'bg-red-soft text-red font-semibold',
  stuck: 'border-dashed border-line2 text-ink2',
  rigid: 'text-ink2',
}

/**
 * Deadline / history chip of the meta line (design 06): 18px high, radius 6. Neutral while calm,
 * amber «горит» from 3 days before, red only when the deadline passed — the text always says it.
 */
export function MetaChip({ kind, text, className }: Chip & { className?: string }) {
  const Icon = ICON[kind]
  return (
    <span
      className={cn(
        'inline-flex h-[18px] items-center gap-1 rounded-md border border-transparent px-1.5 text-cap leading-4 whitespace-nowrap tabular-nums',
        STYLE[kind],
        className,
      )}
    >
      {Icon && <Icon size={12} strokeWidth={kind === 'ok' ? 2.5 : 2.25} aria-hidden="true" />}
      {text}
    </span>
  )
}

export function MetaChips({ chips }: { chips: readonly (Chip | null | undefined)[] }) {
  return (
    <>
      {chips.filter((c): c is Chip => Boolean(c)).map((c) => (
        <MetaChip key={`${c.kind}:${c.text}`} {...c} />
      ))}
    </>
  )
}
