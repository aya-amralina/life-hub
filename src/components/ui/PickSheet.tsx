import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { Sphere } from '@/lib/constants'
import { BottomSheet } from './BottomSheet'
import { IconTile } from './IconTile'

export type PickOption = { label: string; hint?: string; icon: LucideIcon; sphere: Sphere; onPick: () => void }

/** «What to add» rows: a sphere tile, the name, a short hint. */
export function PickList({ options }: { options: readonly PickOption[] }) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {options.map((o) => (
        <li key={o.label} className="border-t border-line first:border-t-0">
          <button type="button" onClick={o.onPick} className="flex min-h-16 w-full items-center gap-3 py-2 text-left active:bg-sub">
            <IconTile icon={o.icon} sphere={o.sphere} />
            <span className="min-w-0 flex-1">
              <span className="block text-base">{o.label}</span>
              {o.hint && <span className="block text-cap text-ink2">{o.hint}</span>}
            </span>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** A short choice when a section adds more than one kind of thing (envelope or debt). */
export function PickSheet({ open, onClose, label, options }: { open: boolean; onClose: () => void; label: string; options: readonly PickOption[] }) {
  return (
    <BottomSheet open={open} onClose={onClose} label={label}>
      <PickList
        options={options.map((o) => ({
          ...o,
          onPick: () => {
            onClose()
            o.onPick()
          },
        }))}
      />
    </BottomSheet>
  )
}
