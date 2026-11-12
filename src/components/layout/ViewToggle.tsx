import { LayoutList, Table2 } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import type { View } from './useView'

export function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const item = (v: View, label: string, Icon: typeof Table2) => (
    <button
      type="button"
      role="radio"
      aria-checked={view === v}
      onClick={() => onChange(v)}
      className={cn('flex h-9 items-center gap-2 rounded-lg px-3 text-cap', view === v ? 'bg-card font-semibold text-ink shadow-seg' : 'text-ink2 hover:text-ink')}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </button>
  )
  return (
    <div role="radiogroup" aria-label="Вид" className="flex gap-1 rounded-xl bg-sub p-1">
      {item('list', 'Список', LayoutList)}
      {item('table', 'Таблица', Table2)}
    </div>
  )
}
