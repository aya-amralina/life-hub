import { Plus } from 'lucide-react'

/** «+» floating above the tab bar on every screen. */
export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Добавить"
      onClick={onClick}
      className="fixed right-4 z-30 print:hidden flex size-14 items-center justify-center rounded-2xl bg-inv text-on-inv shadow-sheet transition-transform duration-100 active:scale-[.96] active:bg-inv2 min-[592px]:right-[calc(50%-280px+16px)]"
      style={{ bottom: 'calc(var(--nav-h) + 16px)' }}
    >
      <Plus size={24} strokeWidth={2} aria-hidden="true" />
    </button>
  )
}
