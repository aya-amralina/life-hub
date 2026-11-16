import { useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Chip } from './Chip'
import { cn } from './cn'

export const FIELD = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'

/** Labelled text input of the add forms. */
export function TextField({ label, className, ...rest }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-cap text-ink2">{label}</span>
      <input className={cn(FIELD, className)} {...rest} />
    </label>
  )
}

/** One choice from chips; a second tap on the selected chip clears it (when `optional`). */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  optional = true,
  lang,
  dotClass,
}: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T | null
  onChange: (v: T | null) => void
  optional?: boolean
  lang?: string
  dotClass?: string
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-cap text-ink2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.value} lang={lang} dotClass={dotClass} selected={value === o.value} onClick={() => onChange(value === o.value && optional ? null : o.value)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </fieldset>
  )
}

/** «Ещё поля»: rarely needed fields stay folded until asked for. */
export function MoreFields({ children, label = 'Ещё поля' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  if (open) return <div className="flex flex-col gap-6">{children}</div>
  return (
    <button type="button" onClick={() => setOpen(true)} className="-my-2 flex min-h-11 items-center gap-1 self-start text-base text-ink2">
      {label}
      <ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}

export function SaveError({ show }: { show: boolean }) {
  if (!show) return null
  return <p className="m-0 text-cap text-ink2">Не получилось сохранить. Проверь сеть и попробуй ещё раз.</p>
}
