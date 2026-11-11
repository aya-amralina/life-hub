import { useState, type ReactNode } from 'react'
import { Pencil, type LucideIcon } from 'lucide-react'
import type { Sphere } from '@/lib/constants'
import { addDaysISO, type ISODate } from '@/lib/dates'
import { formatAmount, formatEur, parseEurInput } from '@/lib/format'
import { Button } from './Button'
import { DateChoice, TimeChoice } from './DateChoice'
import { IconTile } from './IconTile'

export type Reschedule = {
  /** «Когда перенести?» / «Когда ждать?» */
  title: string
  hint?: string
  withTime?: boolean
  initialTime?: string | null
  /** Button text for the picked day, e.g. «Перенести на Ср 11.11». */
  actionLabel: (day: ISODate, time: string | null) => string
  onPick: (day: ISODate, time: string | null) => void
}

/**
 * Question with three actions (design 06 / 3b / 3k): confirm · another date · cancel — always in this
 * order, cancel is not red. «Другая дата» unfolds day chips in place; money questions can correct the
 * amount first. After an answer the parent shows a toast with «Вернуть».
 */
export function QuestionCard({
  sphere,
  icon,
  question,
  title,
  lang,
  meta,
  confirmLabel,
  onConfirm,
  reschedule,
  onCancel,
  today,
  amount,
}: {
  sphere: Sphere
  icon: LucideIcon
  question: string
  title: string
  lang?: string
  meta?: ReactNode
  confirmLabel: string
  onConfirm: (amountCents?: number) => void
  reschedule: Reschedule
  onCancel: () => void
  today: ISODate
  /** Money: planned amount and the question for the correction step («Сколько списалось?»). */
  amount?: { cents: number; question: string; hint: string }
}) {
  const [step, setStep] = useState<'ask' | 'date' | 'amount'>('ask')
  const [day, setDay] = useState<ISODate>(addDaysISO(today, 1))
  const [time, setTime] = useState<string | null>(reschedule.initialTime ?? null)
  const [input, setInput] = useState(amount ? formatAmount(amount.cents) : '')
  const days = [1, 2, 3, 4].map((n) => addDaysISO(today, n))
  const corrected = parseEurInput(input)

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4" aria-label={`${question} ${title}`}>
      <div className="flex items-center gap-3">
        <IconTile icon={icon} sphere={sphere} />
        <div className="min-w-0 flex-1">
          <div className="text-cap text-ink2">{step === 'date' ? reschedule.title : step === 'amount' ? amount?.question : question}</div>
          <div lang={lang} className="text-base font-semibold [overflow-wrap:anywhere]">
            {title}
          </div>
          {meta && <div className="text-cap text-ink2">{meta}</div>}
        </div>
        {amount && step === 'ask' && (
          <button
            type="button"
            onClick={() => setStep('amount')}
            aria-label="Поправить сумму"
            className="flex h-11 flex-none items-center gap-1 rounded-xl px-2 text-title font-semibold tabular-nums active:bg-sub"
          >
            {formatEur(amount.cents, { whole: true })}
            <Pencil size={16} strokeWidth={1.75} aria-hidden="true" className="text-ink3" />
          </button>
        )}
      </div>

      {step === 'ask' && (
        <>
          <Button onClick={() => onConfirm()}>{confirmLabel}</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-11" onClick={() => setStep('date')}>
              Другая дата
            </Button>
            <Button variant="quiet" onClick={onCancel}>
              Отменить
            </Button>
          </div>
        </>
      )}

      {step === 'date' && (
        <>
          {reschedule.hint && <p className="m-0 text-cap text-ink2">{reschedule.hint}</p>}
          <DateChoice label="День" value={day} onChange={setDay} options={days} today={today} min={today} />
          {reschedule.withTime && <TimeChoice value={time} onChange={setTime} options={['10:00', '15:00', '16:30']} />}
          <Button onClick={() => reschedule.onPick(day, time)}>{reschedule.actionLabel(day, time)}</Button>
          <Button variant="quiet" onClick={() => setStep('ask')}>
            Назад
          </Button>
        </>
      )}

      {step === 'amount' && amount && (
        <>
          <label className="flex h-16 items-center gap-2 rounded-2xl border-[1.5px] border-ink bg-sub px-4">
            <input
              autoFocus
              inputMode="decimal"
              aria-label="Сумма"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-big font-semibold text-ink tabular-nums outline-none"
            />
            <span className="text-title text-ink2">€</span>
          </label>
          <p className="m-0 text-cap text-ink2">{amount.hint}</p>
          <Button disabled={corrected === null || corrected <= 0} onClick={() => corrected && onConfirm(corrected)}>
            {`Подтвердить ${corrected ? formatEur(corrected, { whole: true }) : ''}`.trim()}
          </Button>
          <Button variant="quiet" onClick={() => setStep('ask')}>
            Назад
          </Button>
        </>
      )}
    </section>
  )
}
