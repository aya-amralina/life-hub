import { useState } from 'react'
import { Pill, Plus } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { DateChoice } from '@/components/ui/DateChoice'
import { SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { INTAKE_KINDS } from '@/lib/constants'
import { addDaysISO, formatDayMonth, todayBerlin, type ISODate } from '@/lib/dates'
import { isIntakeActive } from '@/lib/rules/intake'
import { bodyDataKeys, useIntake, useWrite, type Intake } from './activityApi'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'

/** Приём (SPEC 3.2): periods, not daily marks. «Сейчас принимаю» and a folded archive. Only inside the app. */
export function IntakeTab() {
  const today = todayBerlin()
  const intake = useIntake()
  const write = useWrite('intake', bodyDataKeys.intake)
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  if (intake.isPending) return <SkeletonCard />
  const list = intake.data ?? []
  const now = list.filter((i) => isIntakeActive(i, today))
  const planned = list.filter((i) => i.start_date > today)
  const archive = list.filter((i) => i.end_date !== null && i.end_date < today)

  const finish = (i: Intake) => {
    write.update.mutate({ id: i.id, patch: { end_date: today } })
    toast({ text: `${i.name} — закончила`, actionLabel: 'Вернуть', onAction: () => write.update.mutate({ id: i.id, patch: { end_date: i.end_date } }) })
  }

  return (
    <>
      <Card>
        <CardHeader title="Сейчас принимаю" icon={<Pill size={20} strokeWidth={1.75} aria-hidden="true" className="text-body" />} context={now.length ? `${now.length}` : undefined} />
        {now.length === 0 ? (
          <p className="m-0 text-cap text-ink2">Пока ничего не принимаю.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {now.map((i) => (
              <li key={i.id} className="flex min-h-14 items-center gap-3 border-t border-line py-1 first:border-t-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-base [overflow-wrap:anywhere]">{i.name}</span>
                  <span className="block text-cap text-ink2">{[i.kind, i.dose, i.schedule, `с ${formatDayMonth(i.start_date)}`].filter(Boolean).join(' · ')}</span>
                </span>
                <Button variant="secondary" className="h-11 flex-none px-3 text-cap" onClick={() => finish(i)}>
                  Закончила
                </Button>
              </li>
            ))}
          </ul>
        )}
        {planned.length > 0 && (
          <p className="m-0 text-cap text-ink2">
            Впереди: {planned.map((i) => `${i.name} с ${formatDayMonth(i.start_date)}`).join(', ')}
          </p>
        )}
      </Card>
      <Button variant="secondary" onClick={() => setAdding(true)} icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}>
        Добавить приём
      </Button>
      {archive.length > 0 && (
        <Card>
          <GroupHeader title="Архив" count={archive.length} open={archiveOpen} onToggle={() => setArchiveOpen(!archiveOpen)} />
          {archiveOpen && (
            <ul className="m-0 flex list-none flex-col p-0">
              {archive.map((i) => (
                <li key={i.id} className="flex min-h-11 items-center gap-3 border-t border-line text-base first:border-t-0">
                  <span className="min-w-0 flex-1 text-ink2 [overflow-wrap:anywhere]">{i.name}</span>
                  <span className="text-cap text-ink2 tabular-nums">
                    {formatDayMonth(i.start_date)} — {formatDayMonth(i.end_date!)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <p className="m-0 text-cap text-ink3">Приём живёт только здесь: в «Горит» не попадает.</p>
      <IntakeSheet open={adding} onClose={() => setAdding(false)} today={today} />
    </>
  )
}

function IntakeSheet({ open, onClose, today }: { open: boolean; onClose: () => void; today: ISODate }) {
  const write = useWrite('intake', bodyDataKeys.intake)
  const toast = useToast()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<(typeof INTAKE_KINDS)[number]>('витамин')
  const [dose, setDose] = useState('')
  const [schedule, setSchedule] = useState('')
  const [start, setStart] = useState<ISODate>(today)
  return (
    <BottomSheet open={open} onClose={onClose} label="Приём">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          write.insert.mutate(
            { name: name.trim(), kind, dose: dose.trim() || null, schedule: schedule.trim() || null, start_date: start },
            {
              onSuccess: () => {
                toast({ text: `${name.trim()} — в списке` })
                setName('')
                setDose('')
                setSchedule('')
                onClose()
              },
            },
          )
        }}
      >
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Что принимаю" aria-label="Название" className={field} />
        <div className="flex flex-wrap gap-2">
          {INTAKE_KINDS.map((k) => (
            <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>
              {k}
            </Chip>
          ))}
        </div>
        <input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Доза, например «1 таб»" aria-label="Доза" className={field} />
        <input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="Когда, например «утром»" aria-label="Схема" className={field} />
        <DateChoice label="С какого числа" value={start} onChange={setStart} options={[today, addDaysISO(today, -1)]} today={today} />
        <Button type="submit" disabled={!name.trim() || write.insert.isPending}>
          Сохранить
        </Button>
      </form>
    </BottomSheet>
  )
}
