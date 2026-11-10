import { Delete } from 'lucide-react'
import { applyAmountKey } from '@/lib/format'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'] as const

/** Amount keypad: keys 20/28, 48px high. */
export function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Клавиатура суммы">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k === 'del' ? 'Стереть' : k}
          onClick={() => onChange(applyAmountKey(value, k))}
          className="flex h-12 items-center justify-center rounded-xl bg-sub text-title font-semibold text-ink tabular-nums transition-transform duration-100 active:scale-[.96] active:bg-line2"
        >
          {k === 'del' ? <Delete size={20} strokeWidth={1.75} aria-hidden="true" /> : k}
        </button>
      ))}
    </div>
  )
}
