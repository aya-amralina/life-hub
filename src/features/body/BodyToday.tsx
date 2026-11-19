import { useState, type ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Circle, CircleCheck, Pill } from 'lucide-react'
import { Link } from 'react-router'
import { useAddAction } from '@/app/addSheetContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { cn } from '@/components/ui/cn'
import { addDaysISO, formatDayMonth, formatRelativeDay, hourBerlin, todayBerlin, weekStart, type ISODate } from '@/lib/dates'
import { plural } from '@/lib/format'
import { activityPoints } from '@/lib/rules/activities'
import { BLOCK_TITLE, blockFolded, blockOf, strengthCard, templateTitle, type Block } from '@/lib/rules/bodyDay'
import { careChoice, careEntries, careToggle, isCareDone, type CareEntry } from '@/lib/rules/care'
import { isEvening, lastBefore } from '@/lib/rules/day'
import { dayMarks, dueOn, minimumOn, type DayMarks } from '@/lib/rules/habits'
import { isIntakeActive } from '@/lib/rules/intake'
import { happenedQuestions } from '@/lib/rules/items'
import { useItems } from '@/features/items/api'
import { ItemQuestions } from '@/features/items/ItemQuestions'
import { NoteEditor } from '@/features/journal/NoteEditor'
import { ActivitySheet } from './ActivitySheet'
import { useActivities, useActivityTypes, useIntake, useStrengthSets } from './activityApi'
import { useDailyLog, useLogsSince, useSaveDailyLog } from './api'
import { CoreCard } from './CoreCard'
import { CheckIn, CoffeeField } from './EveningCard'
import { habitIcon } from './habitMeta'
import { useHabits, useMarks, useSetMarks, useWorkouts, type Habit } from './habitsApi'
import { SleepRow } from './HabitsCard'

export const STRENGTH_PATH = '/body/training/strength'
const SKIP_KEY = 'lifehub.body.strengthSkippedOn'

/**
 * Тело → Сегодня (step 3): Утро / День / Вечер by the time of day; only what is due today (plan + frequency). Done
 * rows fade, a block with everything done folds into «Утро ✓». «Тяжёлый день» leaves the minimum habits and «Кор» in
 * its minimal version; sleep and the evening check-in stay — they are questions of the day, not habits.
 */
export function BodyToday({ date, setDate }: { date: ISODate; setDate: (d: ISODate) => void }) {
  const today = todayBerlin()
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)
  const habits = useHabits()
  const marks = useMarks(weekStart(date), date)
  const mark = useSetMarks(date)
  const recent = useLogsSince(addDaysISO(date, -14))
  const [adding, setAdding] = useState(false)
  useAddAction(() => setAdding(true))

  if (log.isPending || habits.isPending || marks.isPending) return <SkeletonCard />

  const hard = log.data?.minimum_mode ?? false
  const { habits: all, plans } = habits.data ?? { habits: [], plans: [] }
  const day = dayMarks(marks.data ?? [], date, hard)
  const minimumIds = new Set(minimumOn(all, plans, date).map((h) => h.id))
  const daily = dueOn(all, plans, date, 'habit', marks.data ?? []).filter((h) => !hard || minimumIds.has(h.id))
  const careHabits = hard ? [] : dueOn(all, plans, date, 'care', marks.data ?? [])
  const care = careEntries(careHabits, plans, date)
  const inBlock = (b: Block) => ({ habits: daily.filter((h) => blockOf(h.time_of_day) === b), care: care.filter((e) => blockOf(careTime(e, careHabits)) === b) })
  const evening = date !== today || isEvening(hourBerlin())
  const sleep = log.data?.sleep_h == null ? null : Number(log.data.sleep_h)
  const lastSleep = lastBefore(recent.data ?? [], date, (l) => (l.sleep_h == null ? null : Number(l.sleep_h)))

  const toggleHabit = (h: Habit) => mark.mutate([{ habit_id: h.id, done: !day.done.has(h.id) }])
  const rows = (b: Block) => {
    const { habits: hs, care: cs } = inBlock(b)
    return {
      done: hs.filter((h) => day.done.has(h.id)).length + cs.filter((e) => isCareDone(day, e)).length,
      total: hs.length + cs.length,
      node: (
        <>
          {cs.map((e) => (
            <CareRows key={e.key} entry={e} day={day} onMark={(p) => mark.mutate(p)} />
          ))}
          {hs.map((h) => (
            <CheckRow key={h.id} icon={habitIcon(h.icon)} label={h.name} done={day.done.has(h.id)} onToggle={() => toggleHabit(h)} />
          ))}
        </>
      ),
    }
  }
  const morning = rows('morning')
  const dayBlock = rows('day')
  const eveningBlock = rows('evening')

  return (
    <>
      <DayLine date={date} today={today} setDate={setDate} />
      {date === today && <QuestionsLine today={today} />}
      {hard && <p className="m-0 text-cap text-ink2">Тяжёлый день — только главное.</p>}

      <DayBlockView block="morning" done={morning.done} total={morning.total}>
        <SleepRow bare value={sleep} last={lastSleep} onChange={(v) => save.mutate({ sleep_h: v })} />
        {morning.node}
        {!hard && <IntakeRow date={date} skipped={log.data?.intake_skipped ?? false} onChange={(v) => save.mutate({ intake_skipped: v })} />}
      </DayBlockView>

      <DayBlockView block="day" done={dayBlock.done} total={dayBlock.total}>
        {date === today && <CoreCard today={today} />}
        {!hard && <StrengthNext date={date} />}
        {dayBlock.node}
        {!hard && (
          <>
            <CoffeeField cups={log.data?.coffee_cups ?? 0} onChange={(v) => save.mutate({ coffee_cups: v })} />
            <Movement date={date} onAdd={() => setAdding(true)} />
          </>
        )}
      </DayBlockView>

      {evening ? (
        <DayBlockView block="evening" done={eveningBlock.done} total={eveningBlock.total} foldable={false}>
          {eveningBlock.node}
          <CheckIn date={date} />
          <NoteEditor date={date} />
        </DayBlockView>
      ) : (
        <section aria-label="Вечер" className="flex min-h-11 flex-col justify-center">
          <div className="flex items-baseline justify-between text-base text-ink2">
            <span>Вечер</span>
            <span className="text-cap">с 18:00</span>
          </div>
          <div className="text-cap text-ink3">{hard ? 'Как прошёл день' : 'Уход, крем, как прошёл день'}</div>
        </section>
      )}

      <button type="button" onClick={() => save.mutate({ minimum_mode: !hard })} className="flex min-h-11 items-center self-center px-3 text-base text-ink2 underline underline-offset-4">
        {hard ? 'Обычный день' : 'Тяжёлый день'}
      </button>
      <ActivitySheet open={adding} onClose={() => setAdding(false)} date={date} />
    </>
  )
}

/** The time of day of a care entry — its first habit's. */
function careTime(entry: CareEntry, habits: readonly Habit[]): string | undefined {
  const id = entry.options ? entry.options[0]?.id : entry.id
  return habits.find((h) => h.id === id)?.time_of_day
}

/** «Сегодня, 19.11» with arrows — the day shown (past days can be filled in). */
function DayLine({ date, today, setDate }: { date: ISODate; today: ISODate; setDate: (d: ISODate) => void }) {
  return (
    <div className="-my-1 flex items-center gap-1">
      <button type="button" aria-label="Предыдущий день" onClick={() => setDate(addDaysISO(date, -1))} className="flex size-11 items-center justify-center rounded-full text-ink2 active:bg-sub">
        <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <span className="text-base">{`${formatRelativeDay(date, today)}${date === today ? `, ${formatDayMonth(date)}` : ''}`}</span>
      <button type="button" aria-label="Следующий день" disabled={date >= today} onClick={() => setDate(addDaysISO(date, 1))} className="flex size-11 items-center justify-center rounded-full text-ink2 active:bg-sub disabled:text-dis">
        <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {date !== today && (
        <button type="button" onClick={() => setDate(today)} className="ml-auto flex min-h-11 items-center px-2 text-cap text-ink2 underline underline-offset-4">
          Сегодня
        </button>
      )}
    </div>
  )
}

/** «Состоялось?» of the body sphere as one line; the list opens by a tap. */
function QuestionsLine({ today }: { today: ISODate }) {
  const items = useItems()
  const [open, setOpen] = useState(false)
  const n = happenedQuestions(items.data ?? [], today).filter((i) => i.sphere === 'body').length
  if (n === 0) return null
  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-11 items-center justify-between rounded-xl bg-amber-soft px-4 text-base text-amber-ink">
        <span>
          {n} {plural(n, ['событие ждёт', 'события ждут', 'событий ждут'])} ответа
        </span>
        <span className="font-semibold">{open ? 'Свернуть' : 'Ответить'}</span>
      </button>
      {open && <ItemQuestions sphere="body" />}
    </>
  )
}

/** A block: title and «N из M»; with everything done it folds into «Утро ✓» (a tap opens it again). */
function DayBlockView({ block, done, total, foldable = true, children }: { block: Block; done: number; total: number; foldable?: boolean; children: ReactNode }) {
  const [opened, setOpened] = useState(false)
  const title = BLOCK_TITLE[block]
  if (foldable && blockFolded(done, total) && !opened) {
    return (
      <button type="button" aria-expanded={false} onClick={() => setOpened(true)} className="flex min-h-11 items-center gap-2 text-base text-ink3">
        {title}
        <Check size={18} strokeWidth={2} aria-label="всё сделано" className="text-body" />
      </button>
    )
  }
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-base font-normal text-ink2">{title}</h2>
        {total > 0 && <span className="text-cap text-ink2 tabular-nums">{`${done} из ${total}`}</span>}
      </div>
      {children}
    </section>
  )
}

/** A habit row: one tap marks, a second unmarks; done rows fade. */
function CheckRow({ icon: Icon, label, done, onToggle }: { icon?: typeof Circle; label: string; done: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={done} onClick={onToggle} className="flex min-h-11 items-center gap-3 text-left">
      {done ? <CircleCheck size={22} strokeWidth={1.75} aria-hidden="true" className="flex-none text-body" /> : <Circle size={22} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />}
      <span className={cn('min-w-0 flex-1 text-base', done ? 'text-ink3' : 'text-ink')}>{label}</span>
      {Icon && Icon !== Circle && <Icon size={18} strokeWidth={1.75} aria-hidden="true" className={cn('flex-none', done ? 'text-ink3' : 'text-ink2')} />}
    </button>
  )
}

/** Care: a plain item is one row; a group — a row per option, one choice («Утро: Ниацинамид»). */
function CareRows({ entry, day, onMark }: { entry: CareEntry; day: DayMarks; onMark: (p: { habit_id: string; done: boolean }[]) => void }) {
  if (!entry.options) return <CheckRow label={entry.label} done={isCareDone(day, entry)} onToggle={() => onMark(careToggle(day, entry))} />
  const chosen = careChoice(day, entry)
  return (
    <>
      {entry.options.map((o) => (
        <CheckRow key={o.id} label={o.name} done={chosen?.id === o.id} onToggle={() => onMark(careToggle(day, entry, o.id))} />
      ))}
    </>
  )
}

/** «Приём отмечен · Пропустила»: taken by default, only a skipped day is stored. Shown while something is taken. */
function IntakeRow({ date, skipped, onChange }: { date: ISODate; skipped: boolean; onChange: (v: boolean) => void }) {
  const intake = useIntake()
  if (!(intake.data ?? []).some((i) => isIntakeActive(i, date))) return null
  return (
    <div className="flex min-h-11 items-center gap-3 text-base">
      <Pill size={22} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
      <span className={cn('min-w-0 flex-1', skipped ? 'text-ink' : 'text-ink3')}>{skipped ? 'Приём пропущен.' : 'Приём отмечен.'}</span>
      <button type="button" onClick={() => onChange(!skipped)} className="flex min-h-11 items-center px-1 text-base text-ink2 underline underline-offset-4">
        {skipped ? 'Вернуть' : 'Пропустила'}
      </button>
    </div>
  )
}

/** The next strength session of the queue: «Начать» — the journal for now; «Не сегодня» hides it until tomorrow (this device). */
function StrengthNext({ date }: { date: ISODate }) {
  const workouts = useWorkouts()
  const sets = useStrengthSets()
  const [skippedOn, setSkippedOn] = useState<ISODate | null>(() => {
    try {
      return localStorage.getItem(SKIP_KEY)
    } catch {
      return null
    }
  })
  if (workouts.isPending || sets.isPending) return null
  const { templates, queue } = workouts.data ?? { templates: [], queue: [] }
  const card = strengthCard(queue, (sets.data ?? []).map((s) => s.date), date, skippedOn)
  if (!card) return null
  if (card.kind === 'done') {
    return <CheckRow label="Силовая" done onToggle={() => undefined} />
  }
  const t = templates.find((x) => x.id === card.slot.template_id)
  if (!t) return null
  const skip = () => {
    try {
      localStorage.setItem(SKIP_KEY, date)
    } catch {
      /* the card just stays */
    }
    setSkippedOn(date)
  }
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-base font-semibold">{templateTitle(t)}</h3>
          <div className="text-cap text-ink2">{card.afterYesterday ? 'Следующая по очереди · вчера уже была силовая' : 'Следующая по очереди'}</div>
        </div>
        <Button variant="quiet" onClick={skip}>
          Не сегодня
        </Button>
        <Link to={STRENGTH_PATH} className="inline-flex h-12 flex-none items-center justify-center rounded-xl border border-line2 bg-card px-4 text-base font-semibold text-ink no-underline active:bg-sub">
          Начать
        </Link>
      </div>
    </Card>
  )
}

/** Today's activities as done rows and «+ Движение». */
function Movement({ date, onAdd }: { date: ISODate; onAdd: () => void }) {
  const activities = useActivities()
  const types = useActivityTypes()
  const list = (activities.data ?? []).filter((a) => a.date === date)
  return (
    <>
      {list.map((a) => {
        const t = (types.data ?? []).find((x) => x.id === a.type_id)
        const pts = t ? activityPoints(a.minutes, t.points_per_10min) : 0
        return (
          <div key={a.id} className="flex min-h-11 items-center gap-3 text-base text-ink3">
            <CircleCheck size={22} strokeWidth={1.75} aria-hidden="true" className="flex-none text-body" />
            <span className="min-w-0 flex-1">{[t?.name ?? 'Активность', a.minutes ? `${a.minutes} мин` : null].filter(Boolean).join(' · ')}</span>
            <span className="tabular-nums">+{String(pts).replace('.', ',')}</span>
          </div>
        )
      })}
      <button type="button" onClick={onAdd} className="flex min-h-11 items-center self-start px-1 text-base text-ink2">
        + Движение
      </button>
    </>
  )
}
