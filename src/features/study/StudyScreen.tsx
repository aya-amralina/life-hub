import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRightLeft, CalendarClock, ChevronDown, CircleCheck, CircleHelp, CircleDashed, Redo2, TriangleAlert } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { CheckItem } from '@/components/ui/CheckItem'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { IconTile } from '@/components/ui/IconTile'
import { MetaChips } from '@/components/ui/MetaChip'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { Swipeable } from '@/components/ui/Swipeable'
import { WeekSwitcher } from '@/components/ui/WeekSwitcher'
import { CalendarLink } from '@/components/layout/CalendarLink'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { addDaysISO, formatWeekdayDate, todayBerlin, weekStart, type ISODate } from '@/lib/dates'
import { formatHours, plural } from '@/lib/format'
import { countdown, deadlineChip, historyChips, isItemDone, isItemOpen, isUpcoming } from '@/lib/rules/items'
import { studyHeatmap } from '@/lib/rules/charts'
import { isFixed, plannedItems, rolloverCandidates } from '@/lib/rules/study'
import { ChartCard } from '@/components/charts/ChartCard'
import { HeatGrid } from '@/components/charts/HeatGrid'
import { NotesCard } from '@/features/notes/NotesCard'
import { useItems, useUpdateItem, type Item } from '@/features/items/api'
import { ItemQuestions } from '@/features/items/ItemQuestions'
import { useAllWeeks, useWeekRow, type Week } from '@/features/weeks/api'
import { MoveSheet } from './MoveSheet'
import { StudyHours } from './StudyHours'
import { useStudyWeek } from './useStudyWeek'
import { weekLabel } from './weekLabel'

const TABS = [
  { value: 'week', label: 'Неделя' },
  { value: 'subjects', label: 'Предметы' },
  { value: 'tests', label: 'Тесты' },
] as const
type Tab = (typeof TABS)[number]['value']

export function StudyScreen() {
  const [tab, setTab] = useState<Tab>('week')
  return (
    <>
      <ScreenHeader title="Учёба" right={<CalendarLink sphere="study" />} />
      <SegmentedTabs label="Раздел" segments={TABS} value={tab} onChange={setTab} />
      <ItemQuestions sphere="study" />
      {tab === 'week' && <WeekTab />}
      {tab === 'subjects' && <SubjectsTab />}
      {tab === 'tests' && <TestsTab />}
      <NotesCard sphere="study" />
    </>
  )
}

function WeekTab() {
  const today = todayBerlin()
  const thisMonday = weekStart(today)
  const [monday, setMonday] = useState(thisMonday)
  const { week, items, load, done, itemsDone, pending, all } = useStudyWeek(monday)
  const weeks = useAllWeeks()
  const [moving, setMoving] = useState(false)
  const [soonOpen, setSoonOpen] = useState(false)
  const waiting = monday === thisMonday ? rolloverCandidates(all, weeks.data ?? [], thisMonday) : []

  const active = items.filter((i) => !isUpcoming(i, today))
  const soon = items.filter((i) => isUpcoming(i, today))
  const subjects = [...new Set(active.map((i) => i.area ?? 'Без предмета'))].sort((a, b) => a.localeCompare(b, 'de'))

  return (
    <>
      <WeekSwitcher
        label={weekLabel(monday, weeks.data ?? [], true)}
        onPrev={() => setMonday(addDaysISO(monday, -7))}
        onNext={() => setMonday(addDaysISO(monday, 7))}
        onReset={monday !== thisMonday ? () => setMonday(thisMonday) : undefined}
        resetLabel="Эта неделя"
      />
      {waiting.length > 0 && <WaitingBanner waiting={waiting} weeks={weeks.data ?? []} monday={thisMonday} onPick={() => setMoving(true)} />}
      {pending ? (
        <SkeletonCard />
      ) : items.length === 0 ? (
        <EmptyState title={`План на ${weekLabel(monday, weeks.data ?? [])} пока пустой`}>
          {`База — ${formatHours(load.base)}. Пункты можно добавить через «+» — они встанут по сроку.`}
        </EmptyState>
      ) : (
        <>
          <Card>
            <CardHeader title="Неделя" dotClass="bg-study" context={week?.study_week ?? undefined} />
            <StudyHours done={done} load={load} itemsDone={itemsDone} itemsTotal={items.length} />
          </Card>
          {subjects.map((subject) => {
            const list = active.filter((i) => (i.area ?? 'Без предмета') === subject)
            const hours = list.reduce((s, i) => s + (Number(i.hours_est) || 0), 0)
            const closed = list.filter((i) => isItemDone(i)).reduce((s, i) => s + (Number(i.hours_est) || 0), 0)
            return (
              <Card key={subject}>
                <div lang="de">
                  <CardHeader title={subject} dotClass="bg-study" context={hours ? `${formatHours(closed)} из ${formatHours(hours)}` : undefined} />
                </div>
                <SubjectRows list={list} today={today} monday={monday} weeks={weeks.data ?? []} />
              </Card>
            )
          })}
          {soon.length > 0 && (
            <Card>
              <GroupHeader
                mark={<CalendarClock size={16} strokeWidth={1.75} aria-hidden="true" className="text-ink2" />}
                title="Скоро"
                count={soon.length}
                summary={`ближайшее ${formatWeekdayDate(soon.map((i) => i.starts_on!).sort()[0]!)}`}
                open={soonOpen}
                onToggle={() => setSoonOpen(!soonOpen)}
              />
              {soonOpen && soon.map((i) => <StudyRow key={i.id} item={i} today={today} monday={monday} weeks={weeks.data ?? []} />)}
            </Card>
          )}
        </>
      )}
      <MoveSheet open={moving} onClose={() => setMoving(false)} waiting={waiting} all={all} weeks={weeks.data ?? []} monday={thisMonday} />
    </>
  )
}

/** A subject's rows of the week: open ones first; done ones fold under «Сделано · N» (closed by default). */
function SubjectRows({ list, today, monday, weeks }: { list: Item[]; today: ISODate; monday: ISODate; weeks: Week[] }) {
  const [doneOpen, setDoneOpen] = useState(false)
  const rest = list.filter((i) => !isItemDone(i))
  const done = list.filter((i) => isItemDone(i))
  return (
    <>
      {rest.length > 0 && (
        <div className="flex flex-col gap-2">
          {rest.map((i) => (
            <StudyRow key={i.id} item={i} today={today} monday={monday} weeks={weeks} />
          ))}
        </div>
      )}
      {done.length > 0 && (
        <div className={rest.length > 0 ? 'flex flex-col gap-2 border-t border-line pt-1' : 'flex flex-col gap-2'}>
          <GroupHeader
            mark={<CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink2" />}
            title="Сделано"
            count={done.length}
            summary={doneOpen ? undefined : 'показать'}
            open={doneOpen}
            onToggle={() => setDoneOpen(!doneOpen)}
          />
          {doneOpen && done.map((i) => <StudyRow key={i.id} item={i} today={today} monday={monday} weeks={weeks} />)}
        </div>
      )}
    </>
  )
}

/** Rule 21: what did not fit after the rollover — never moved silently. */
function WaitingBanner({ waiting, weeks, monday, onPick }: { waiting: Item[]; weeks: Week[]; monday: ISODate; onPick: () => void }) {
  const n = waiting.length
  const hours = waiting.reduce((s, i) => s + (Number(i.hours_est) || 0), 0)
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4" aria-label="Ждут решения">
      <div className="flex items-start gap-3">
        <IconTile icon={Redo2} sphere="study" />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">
            {n} {plural(n, ['пункт не влез', 'пункта не влезли', 'пунктов не влезли'])} в {weekLabel(monday, weeks)}
          </div>
          <div className="text-cap text-ink2">
            {`Неделя уже на максимуме, ещё ${formatHours(hours)} сверху. Это ${plural(n, ['гибкий пункт', 'гибкие пункты', 'гибкие пункты'])} — их можно сдвинуть туда, где свободнее, или снять.`}
          </div>
        </div>
      </div>
      <Button variant="secondary" onClick={onPick}>
        Выбрать неделю
      </Button>
    </section>
  )
}

function StudyRow({ item, today, monday, weeks }: { item: Item; today: ISODate; monday: ISODate; weeks: Week[] }) {
  const navigate = useNavigate()
  const update = useUpdateItem()
  const toast = useToast()
  const weekRow = useWeekRow()
  const done = isItemDone(item)
  const open = isItemOpen(item)
  const fixed = isFixed(item)
  const lateFixed = open && fixed && item.due_date !== null && item.due_date < today
  const doneDay = item.done_at ? todayBerlin(new Date(item.done_at)) : null
  const lateDone = done && item.due_date !== null && doneDay !== null && doneDay > item.due_date

  const toggle = () => update.mutate({ id: item.id, patch: done ? { done_at: null, status: 'открыто' } : { done_at: new Date().toISOString(), status: 'готово' } })
  const nextWeek = async () => {
    const target = addDaysISO(monday, 7)
    const week = await weekRow(target, weeks)
    const before = { week_id: item.week_id }
    update.mutate({ id: item.id, patch: { week_id: week.id } })
    toast({ text: `Перенесено в ${weekLabel(target, weeks)}`, actionLabel: 'Вернуть', onAction: () => update.mutate({ id: item.id, patch: before }) })
  }
  const takeOff = () => {
    update.mutate({ id: item.id, patch: { status: 'снято' } })
    toast({
      text: `${item.title} снят${item.hours_est ? ` — ${formatHours(Number(item.hours_est))} вернулись в план недели` : ''}`,
      actionLabel: 'Вернуть',
      onAction: () => update.mutate({ id: item.id, patch: { status: item.status } }),
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Swipeable onRight={open ? toggle : undefined} onLeft={open && !fixed ? () => void nextWeek() : undefined} onLongPress={() => navigate(`/item/${item.id}`)} leftLabel="На след. неделю">
        <CheckItem
          title={item.title}
          lang="de"
          checked={done}
          onToggle={toggle}
          onOpen={() => navigate(`/item/${item.id}`)}
          meta={
            <>
              {item.type && <span>{item.type}</span>}
              {item.hours_est ? <span className="tabular-nums">{formatHours(Number(item.hours_est))}</span> : null}
              {done && !lateDone && <span>готово</span>}
              <MetaChips
                chips={[
                  deadlineChip(item, today),
                  lateDone ? { kind: 'ok', text: `сдано позже · ${formatWeekdayDate(doneDay!)}` } : null,
                  open && fixed ? { kind: 'rigid', text: 'жёсткий' } : null,
                  ...historyChips(item),
                ]}
              />
              {item.synergy && <ArrowRightLeft size={14} strokeWidth={1.75} aria-label={`Связь: ${item.synergy}`} />}
              {item.trap && <TriangleAlert size={14} strokeWidth={1.75} aria-label={`Ловушка: ${item.trap}`} />}
            </>
          }
        />
      </Swipeable>
      {lateFixed && (
        <div className="flex flex-col gap-2 pl-12">
          <span className="text-cap text-ink2">Не успелось к сроку — бывает. Как было?</span>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-11" onClick={toggle}>
              Сдано позже
            </Button>
            <Button variant="quiet" onClick={takeOff}>
              Снять
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Предметы: hours for the semester per subject, all ↔ and ⚠ (SPEC §5). */
function SubjectsTab() {
  const items = useItems()
  const weeks = useAllWeeks()
  const [openSubject, setOpenSubject] = useState<string | null>(null)
  if (items.isPending || weeks.isPending) return <SkeletonCard />
  const study = plannedItems((items.data ?? []).filter((i) => i.sphere === 'study'))
  const heat = studyHeatmap(items.data ?? [], weeks.data ?? [], todayBerlin())
  const heatCard = heat.length > 0 && (
    <ChartCard title="Загрузка семестра" dotClass="bg-study" context={`Н${heat[0]!.label}–Н${heat[heat.length - 1]!.label}`}>
      <HeatGrid
        label="Загрузка по неделям"
        cells={heat}
        cols={13}
        rows={Math.ceil(heat.length / 13)}
        color="study"
        hint={heat.some((c) => c.level !== null) ? 'Нажми на неделю — покажу загрузку' : 'Недели заполнятся, когда в них появятся пункты'}
        legend={[
          { level: 1, text: 'ок' },
          { level: 2, text: 'нужен Do/Sa ½' },
          { level: 3, text: 'перегруз' },
          { level: null, text: 'не спланирована' },
        ]}
      />
    </ChartCard>
  )
  if (!study.length) {
    return (
      <>
        {heatCard}
        <EmptyState title="Часов пока нет">Прогресс по предметам появится после первых пунктов и отметок в неделе.</EmptyState>
      </>
    )
  }
  const subjects = [...new Set(study.map((i) => i.area ?? 'Без предмета'))].sort((a, b) => a.localeCompare(b, 'de'))
  const total = study.reduce((s, i) => s + (Number(i.hours_est) || 0), 0)
  const closed = study.filter((i) => isItemDone(i)).reduce((s, i) => s + (Number(i.hours_est) || 0), 0)
  return (
    <>
      {heatCard}
      <Card>
        <CardHeader title="Часы по предметам" dotClass="bg-study" context={`${formatHours(closed)} из ${formatHours(total)}`} />
        <div className="flex flex-col gap-4">
          {subjects.map((subject) => {
            const list = study.filter((i) => (i.area ?? 'Без предмета') === subject)
            const h = list.reduce((s, i) => s + (Number(i.hours_est) || 0), 0)
            const d = list.filter((i) => isItemDone(i)).reduce((s, i) => s + (Number(i.hours_est) || 0), 0)
            const notes = list.filter((i) => i.synergy || i.trap)
            return (
              <div key={subject} className="flex flex-col gap-2">
                <div className="flex justify-between gap-3 text-base tabular-nums">
                  <span lang="de">{subject}</span>
                  <span>
                    {formatHours(d)} <span className="text-ink2">/ {formatHours(h)}</span>
                  </span>
                </div>
                <ProgressBar value={d} max={h} fillClass="bg-study" label={subject} />
                {notes.length > 0 && (
                  <button
                    type="button"
                    aria-expanded={openSubject === subject}
                    onClick={() => setOpenSubject(openSubject === subject ? null : subject)}
                    className="flex min-h-11 items-center gap-1 self-start text-cap text-ink2"
                  >
                    ↔ и ⚠ · {notes.length}
                    <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className={openSubject === subject ? 'rotate-180' : ''} />
                  </button>
                )}
                {openSubject === subject && (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {notes.map((i) => (
                      <li key={i.id} lang="de" className="rounded-xl bg-sub px-3 py-2 text-cap">
                        <div className="text-ink">{i.title}</div>
                        {i.synergy && (
                          <div className="flex items-start gap-1 text-ink2">
                            <ArrowRightLeft size={14} strokeWidth={1.75} aria-label="Связь" className="mt-0.5 flex-none" /> {i.synergy}
                          </div>
                        )}
                        {i.trap && (
                          <div className="flex items-start gap-1 text-ink2">
                            <TriangleAlert size={14} strokeWidth={1.75} aria-label="Ловушка" className="mt-0.5 flex-none" /> {i.trap}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </>
  )
}

const DATA_STATUS = {
  confirmed: { icon: CircleCheck, label: 'подтверждено' },
  assumption: { icon: CircleDashed, label: 'допущение' },
  check: { icon: CircleHelp, label: 'проверить' },
} as const

/** Дедлайны и тесты: open fixed items by deadline, countdown, data_status mark. */
function TestsTab() {
  const today = todayBerlin()
  const items = useItems()
  const navigate = useNavigate()
  if (items.isPending) return <SkeletonCard />
  const list = (items.data ?? [])
    .filter((i) => i.sphere === 'study' && isItemOpen(i) && i.due_date !== null && isFixed(i))
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
  if (!list.length) return <EmptyState title="Сроков нет">Тесты и сдачи появятся здесь, как только у пунктов будет дедлайн.</EmptyState>
  return (
    <Card>
      <CardHeader title="Дедлайны и тесты" dotClass="bg-study" context={`${list.length}`} />
      <ul className="m-0 flex list-none flex-col p-0">
        {list.map((i) => {
          const ds = i.data_status ? DATA_STATUS[i.data_status as keyof typeof DATA_STATUS] : null
          return (
            <li key={i.id} className="border-t border-line first:border-t-0">
              <button type="button" onClick={() => navigate(`/item/${i.id}`)} className="flex min-h-14 w-full items-start gap-3 py-2 text-left">
                <span className="min-w-0 flex-1">
                  <span lang="de" className="block text-base [overflow-wrap:anywhere]">
                    {i.title}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-cap text-ink2">
                    {i.area && <span lang="de">{i.area}</span>}
                    <span className="tabular-nums">
                      {formatWeekdayDate(i.due_date!)} · {countdown(i.due_date!, today)}
                    </span>
                    <MetaChips chips={[deadlineChip(i, today)?.kind === 'late' || deadlineChip(i, today)?.kind === 'hot' ? deadlineChip(i, today) : null]} />
                  </span>
                </span>
                {ds && (
                  <span className="flex flex-none items-center gap-1 pt-0.5 text-cap text-ink2">
                    <ds.icon size={16} strokeWidth={1.75} aria-hidden="true" />
                    {ds.label}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
