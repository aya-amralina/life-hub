import type { ReactNode } from 'react'

/** Controls of the bulk bar (on the dark bar): a labelled select, a date, a button — 32px, the bar's colours. */
const ctl = 'h-8 rounded-lg border border-inv2 bg-inv2 px-2 text-cap text-on-inv outline-none'

export function BulkSelect({ label, options, onPick, lang }: { label: string; options: readonly { value: string; label: string }[]; onPick: (v: string) => void; lang?: string }) {
  return (
    <select aria-label={label} value="" lang={lang} onChange={(e) => e.target.value !== '' && onPick(e.target.value)} className={ctl}>
      <option value="" disabled>
        {label}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function BulkDate({ label, onPick }: { label: string; onPick: (v: string) => void }) {
  return (
    <label className={`${ctl} flex items-center gap-2`}>
      {label}
      <input type="date" aria-label={label} onChange={(e) => e.target.value && onPick(e.target.value)} className="bg-transparent text-cap text-on-inv outline-none [color-scheme:dark]" />
    </label>
  )
}

export function BulkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="h-8 rounded-lg px-3 text-cap font-semibold text-on-inv hover:bg-inv2">
      {children}
    </button>
  )
}
