import { BottomSheet } from '@/components/ui/BottomSheet'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { cn } from '@/components/ui/cn'
import { WORK_STATUSES } from '@/lib/constants'
import type { Item } from '@/features/items/api'

/** Pick a new status — one tap. Erledigt / Verworfen close the item (done_at). */
export function StatusSheet({ item, onClose, onPick }: { item: Item | null; onClose: () => void; onPick: (status: string) => void }) {
  return (
    <BottomSheet open={item !== null} onClose={onClose} label="Статус">
      {item && (
        <div className="flex flex-col gap-4">
          <p lang="de" className="m-0 text-base font-semibold [overflow-wrap:anywhere]">
            {item.title}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {WORK_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={(item.status ?? 'Offen') === s}
                onClick={() => onPick(s)}
                className={cn(
                  'flex min-h-12 items-center rounded-xl border px-3 text-left active:bg-sub',
                  (item.status ?? 'Offen') === s ? 'border-inv' : 'border-line2',
                )}
              >
                <StatusBadge status={s} />
              </button>
            ))}
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
