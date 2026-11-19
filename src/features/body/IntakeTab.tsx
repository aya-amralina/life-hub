import { useState } from 'react'
import { ChevronRight, Pill, Plus } from 'lucide-react'
import { useAddAction } from '@/app/addSheetContext'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { INTAKE_KINDS } from '@/lib/constants'
import { formatDayMonth, todayBerlin, type ISODate } from '@/lib/dates'
import { TIME_LABEL, intakeArchive, intakeList } from '@/lib/rules/health'
import { bodyDataKeys, useIntake, useWrite, type Intake } from './activityApi'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'
const TIMES = [
  { value: 'morning', label: 'Утро' },
  { value: 'evening', label: 'Вечер' },
] as const

/**
 * Приём (step 5): one list without headers — medicines, other, vitamins; a row is the name, the dose, the time and the
 * type small. A tap opens the card (dose, time, from, «курс до», note, «Завершить приём»). Finished ones — a folded archive.
 */
export function IntakeTab() {
  const today = todayBerlin()
  const intake = useIntake()
  const [open, setOpen] = useState<Intake | 'new' | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  useAddAction(() => setOpen('new'))
  if (intake.isPending) return <SkeletonCard />
  const all = intake.data ?? []
  const now = intakeList(all, today)
  const archive = intakeArchive(all, today)

  return (
    <>
      {now.length === 0 ? (
        <EmptyState title="Сейчас ничего не принимаю">Лекарство или витамин — через «+ Добавить».</EmptyState>
      ) : (
        <Card>
          <ul className="m-0 flex list-none flex-col p-0" aria-label="Сейчас принимаю">
            {now.map((i) => (
              <li key={i.id} className="border-t border-line first:border-t-0">
                <button type="button" onClick={() => setOpen(i)} className="flex min-h-12 w-full items-center gap-3 py-1 text-left">
                  <Pill size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base">{i.name}</span>
                    <span className="block text-cap text-ink2">{[i.dose, i.time_of_day ? TIME_LABEL[i.time_of_day] : null, i.kind, i.course_until ? `курс до ${formatDayMonth(i.course_until)}` : null].filter(Boolean).join(' · ')}</span>
                  </span>
                  <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <button type="button" onClick={() => setOpen('new')} className="flex min-h-11 items-center gap-1 self-start px-1 text-base text-ink2">
        <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
        Добавить
      </button>
      {archive.length > 0 && (
        <Card>
          <GroupHeader title="Архив" count={archive.length} open={archiveOpen} onToggle={() => setArchiveOpen(!archiveOpen)} />
          {archiveOpen && (
            <ul className="m-0 flex list-none flex-col p-0">
              {archive.map((i) => (
                <li key={i.id} className="border-t border-line first:border-t-0">
                  <button type="button" onClick={() => setOpen(i)} className="flex min-h-11 w-full items-center gap-3 text-left text-ink3">
                    <span className="min-w-0 flex-1 text-base">{[i.name, i.dose].filter(Boolean).join(' · ')}</span>
                    <span className="text-cap tabular-nums">
                      {formatDayMonth(i.start_date)} — {formatDayMonth(i.end_date!)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <IntakeSheet key={open === 'new' ? 'new' : (open?.id ?? 'none')} intake={open} onClose={() => setOpen(null)} today={today} />
    </>
  )
}

/** The card of an intake: dose, time, from, «курс до» (optional), note; «Завершить приём» with a date. New — the same form. */
function IntakeSheet({ intake, onClose, today }: { intake: Intake | 'new' | null; onClose: () => void; today: ISODate }) {
  const write = useWrite('intake', bodyDataKeys.intake)
  const toast = useToast()
  const row = intake && intake !== 'new' ? intake : null
  const [name, setName] = useState(row?.name ?? '')
  const [kind, setKind] = useState<string>(row?.kind ?? 'витамин')
  const [dose, setDose] = useState(row?.dose ?? '')
  const [time, setTime] = useState<'morning' | 'evening'>(row?.time_of_day === 'evening' ? 'evening' : 'morning')
  const [start, setStart] = useState<ISODate>(row?.start_date ?? today)
  const [course, setCourse] = useState<string>(row?.course_until ?? '')
  const [note, setNote] = useState(row?.note ?? '')
  const [endOn, setEndOn] = useState<ISODate>(today)
  const ended = Boolean(row?.end_date && row.end_date < today)
  const courseOk = !course || course >= start
  const values = { name: name.trim(), kind, dose: dose.trim() || null, time_of_day: time, start_date: start, course_until: course || null, note: note.trim() || null }

  const save = () => {
    if (!values.name || !courseOk) return
    if (row) write.update.mutate({ id: row.id, patch: values })
    else write.insert.mutate(values)
    onClose()
  }
  const finish = () => {
    if (!row) return
    write.update.mutate({ id: row.id, patch: { end_date: endOn } })
    toast({ text: `${row.name} — приём завершён`, actionLabel: 'Вернуть', onAction: () => write.update.mutate({ id: row.id, patch: { end_date: row.end_date } }) })
    onClose()
  }

  return (
    <BottomSheet open={intake !== null} onClose={onClose} label={row ? row.name : 'Приём'}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <h2 className="m-0 text-title font-semibold">{row ? row.name : 'Новый приём'}</h2>
        {!row && <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Что принимаю" aria-label="Название" className={field} />}
        <div className="flex flex-wrap gap-2" aria-label="Тип">
          {INTAKE_KINDS.map((k) => (
            <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>
              {k}
            </Chip>
          ))}
        </div>
        <input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Доза, например «14 мг» или «1 таб»" aria-label="Доза" className={field} />
        <SegmentedTabs label="Время приёма" segments={TIMES} value={time} onChange={setTime} />
        <label className="flex items-center gap-3">
          <span className="w-28 flex-none text-base">С какого числа</span>
          <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} aria-label="С какого числа" className={field} />
        </label>
        <label className="flex items-center gap-3">
          <span className="w-28 flex-none text-base">Курс до</span>
          <input type="date" value={course} min={start} onChange={(e) => setCourse(e.target.value)} aria-label="Курс до" className={field} />
        </label>
        {!courseOk && <p className="m-0 text-cap font-semibold text-amber-ink">Курс не может закончиться раньше начала.</p>}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Заметка" aria-label="Заметка" rows={2} className="w-full rounded-xl border border-line2 bg-card px-4 py-3 text-base text-ink outline-none focus:border-ink2" />
        <Button type="submit" disabled={!values.name || !courseOk}>
          Сохранить
        </Button>
        {row && !ended && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <label className="flex items-center gap-3">
              <span className="w-28 flex-none text-base">Последний день</span>
              <input type="date" value={endOn} min={row.start_date} onChange={(e) => e.target.value && setEndOn(e.target.value)} aria-label="Последний день приёма" className={field} />
            </label>
            <Button variant="secondary" onClick={finish}>
              Завершить приём
            </Button>
          </div>
        )}
        {row && ended && <p className="m-0 text-cap text-ink2">Приём завершён {formatDayMonth(row.end_date!)}.</p>}
      </form>
    </BottomSheet>
  )
}
