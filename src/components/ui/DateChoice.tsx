import { CalendarDays } from 'lucide-react'
import { dayChipLabel, formatWeekdayDate, type ISODate } from '@/lib/dates'
import { formatTime } from '@/lib/format'
import { Chip } from './Chip'

/** Day chips «Сегодня / Завтра / Чт 12.11» + «Дата» (native picker) for any other day. */
export function DateChoice({
  label,
  value,
  onChange,
  options,
  today,
  min,
}: {
  label: string
  value: ISODate | null
  onChange: (d: ISODate) => void
  options: readonly ISODate[]
  today: ISODate
  min?: ISODate
}) {
  const custom = value !== null && !options.includes(value)
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-cap text-ink2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((d) => (
          <Chip key={d} selected={value === d} onClick={() => onChange(d)}>
            {dayChipLabel(d, today)}
          </Chip>
        ))}
        <label
          className={`relative inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-base ${
            custom ? 'border-inv bg-inv font-semibold text-on-inv' : 'border-line2 bg-card text-ink'
          }`}
        >
          <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
          {custom ? formatWeekdayDate(value) : 'Дата'}
          <input
            type="date"
            aria-label={`${label}: другая дата`}
            min={min}
            value={value ?? ''}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            className="absolute inset-0 opacity-0"
          />
        </label>
      </div>
    </fieldset>
  )
}

/** Time chips «Весь день / 10:00 / 14:00» + «Время» (native picker). Value 'HH:MM' or null. */
export function TimeChoice({
  label = 'Время',
  value,
  onChange,
  options = ['10:00', '14:00'],
  allDay = 'Весь день',
}: {
  label?: string
  value: string | null
  onChange: (t: string | null) => void
  options?: readonly string[]
  allDay?: string | null
}) {
  const v = value ? formatTime(value) : null
  const custom = v !== null && !options.includes(v)
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-cap text-ink2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {allDay && (
          <Chip selected={v === null} onClick={() => onChange(null)}>
            {allDay}
          </Chip>
        )}
        {options.map((t) => (
          <Chip key={t} selected={v === t} onClick={() => onChange(t)}>
            {t}
          </Chip>
        ))}
        <label
          className={`relative inline-flex h-11 items-center rounded-xl border px-4 text-base ${
            custom ? 'border-inv bg-inv font-semibold text-on-inv' : 'border-line2 bg-card text-ink'
          }`}
        >
          {custom ? v : 'Время'}
          <input
            type="time"
            aria-label={`${label}: своё`}
            value={v ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            className="absolute inset-0 opacity-0"
          />
        </label>
      </div>
    </fieldset>
  )
}
