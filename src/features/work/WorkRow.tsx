import { CornerDownRight } from 'lucide-react'
import { MetaChips } from '@/components/ui/MetaChip'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Swipeable } from '@/components/ui/Swipeable'
import { cn } from '@/components/ui/cn'
import type { ISODate } from '@/lib/dates'
import { deadlineChip, historyChips } from '@/lib/rules/items'
import { isWorkStalled, statusAltDays } from '@/lib/rules/work'
import type { Item } from '@/features/items/api'

/**
 * Work task (design 3b): German title, meta «Bereich · Prio» + deadline chip and «Status alt»; the full card
 * adds «Nächster Schritt». Tap — status sheet, long press — item card, swipe right — Erledigt.
 */
export function WorkRow({
  item,
  today,
  onOpen,
  onLongPress,
  onDone,
  showStatus = true,
  full = false,
}: {
  item: Item
  today: ISODate
  onOpen: () => void
  onLongPress?: () => void
  onDone?: () => void
  showStatus?: boolean
  full?: boolean
}) {
  const stale = statusAltDays(item, today)
  return (
    <Swipeable onRight={onDone} onLongPress={onLongPress} rightLabel="Erledigt">
      <button
        type="button"
        onClick={onOpen}
        className={cn('flex w-full flex-col gap-1 rounded-xl border border-line bg-card px-4 text-left active:bg-sub', full ? 'gap-2 py-4' : 'py-2.5')}
      >
        <span lang="de" className={cn('text-base text-ink [overflow-wrap:anywhere]', full && 'font-semibold')}>
          {item.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-cap text-ink2">
          {showStatus && <StatusBadge status={item.status ?? 'Offen'} />}
          {item.area && <span lang="de">{item.area}</span>}
          {item.priority && (
            <span lang="de" className={item.priority === 'Hoch' ? 'font-semibold text-ink' : undefined}>
              Prio {item.priority}
            </span>
          )}
          <MetaChips chips={[deadlineChip(item, today), stale !== null ? { kind: 'alt', text: `Status alt · ${stale} дн` } : null, ...historyChips(item)]} />
        </span>
        {item.waiting_on && isWorkStalled(item.status) && item.status !== 'Geparkt' && (
          <span lang="de" className="text-cap text-ink2">
            wartet auf: {item.waiting_on}
          </span>
        )}
        {full && item.next_step && (
          <span className="flex flex-col gap-0.5 rounded-xl bg-sub px-3 py-2">
            <span className="flex items-center gap-1 text-cap text-ink2">
              <CornerDownRight size={14} strokeWidth={1.75} aria-hidden="true" />
              <span lang="de">Nächster Schritt</span>
            </span>
            <span lang="de" className="text-base [overflow-wrap:anywhere]">
              {item.next_step}
            </span>
          </span>
        )}
      </button>
    </Swipeable>
  )
}
