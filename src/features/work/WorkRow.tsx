import { StaleBadge, StatusBadge } from '@/components/ui/StatusBadge'
import { OverdueTag } from '@/components/ui/CheckItem'
import { formatDayMonth, formatRelativeDay, weekdayShort, type ISODate } from '@/lib/dates'
import { isItemOpen } from '@/lib/rules/items'
import { isWorkStalled, statusAltDays } from '@/lib/rules/work'
import type { Item } from '@/features/items/api'

/** Work item row: German title with full width, meta line with Bereich, Prio, deadline, status. */
export function WorkRow({ item, today, onOpen, showStatus = true }: { item: Item; today: ISODate; onOpen: () => void; showStatus?: boolean }) {
  const stale = statusAltDays(item, today)
  const overdue = isItemOpen(item) && item.due_date !== null && item.due_date < today
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-1 rounded-xl border border-line bg-card px-4 py-2.5 text-left active:bg-sub"
    >
      <span lang="de" className="text-base text-ink [overflow-wrap:anywhere]">
        {item.title}
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-cap text-ink2">
        {showStatus && <StatusBadge status={item.status ?? 'Offen'} />}
        {item.area && <span lang="de">{item.area}</span>}
        {item.priority === 'Hoch' && <span lang="de">Prio Hoch</span>}
        {overdue ? (
          <OverdueTag>{`Срок прошёл · ${weekdayShort(item.due_date!).toLowerCase()} ${formatDayMonth(item.due_date!)}`}</OverdueTag>
        ) : (
          item.due_date && <span>{formatRelativeDay(item.due_date, today)}</span>
        )}
        {stale !== null && <StaleBadge days={stale} />}
      </span>
      {item.waiting_on && isWorkStalled(item.status) && item.status !== 'Geparkt' && (
        <span lang="de" className="text-cap text-ink2">
          wartet auf: {item.waiting_on}
        </span>
      )}
    </button>
  )
}
