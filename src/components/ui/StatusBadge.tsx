import { Check, Hourglass, Pause, X } from 'lucide-react'
import { cn } from './cn'

/** Work status label: neutral, statuses differ by the shape of the mark. */
export function StatusBadge({ status }: { status: string }) {
  const strong = status === 'In Arbeit'
  return (
    <span
      lang="de"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg bg-sub px-2 py-[3px] text-cap whitespace-nowrap',
        strong ? 'text-ink' : 'text-ink2',
      )}
    >
      <StatusMark status={status} />
      {status}
    </span>
  )
}

function StatusMark({ status }: { status: string }) {
  switch (status) {
    case 'In Arbeit':
      return <span className="size-2 rounded-full bg-work" />
    case 'Im Review':
      return <span className="size-2 rounded-full border-[1.5px] border-work" />
    case 'Wartet auf Antwort':
      return <Hourglass size={12} strokeWidth={2} aria-hidden="true" />
    case 'Blockiert':
      return <span className="h-0.5 w-2 rounded-[1px] bg-ink2" />
    case 'Geparkt':
      return <Pause size={12} strokeWidth={2} aria-hidden="true" />
    case 'Erledigt':
      return <Check size={12} strokeWidth={2.5} aria-hidden="true" />
    case 'Verworfen':
      return <X size={12} strokeWidth={2} aria-hidden="true" />
    default:
      return <span className="size-2 rounded-full border-[1.5px] border-ink3" />
  }
}

/** Soft amber «Status alt · 9 дн». */
export function StaleBadge({ days }: { days: number }) {
  return (
    <span className="inline-flex items-center rounded-lg bg-amber-soft px-2 py-[3px] text-cap font-semibold whitespace-nowrap text-amber-ink">
      Status alt · {days} дн
    </span>
  )
}
