import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CalendarClock, Check, Hourglass, Pause, Plus, Trophy } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { useOpenAdd } from '@/app/addSheetContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { DateChoice } from '@/components/ui/DateChoice'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { FilterChips } from '@/components/ui/FilterChips'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { MetaChip } from '@/components/ui/MetaChip'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CalendarLink } from '@/components/layout/CalendarLink'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { ERFOLG_TYPE, WORK_AREAS, WORK_STALLED, WORK_STATUSES } from '@/lib/constants'
import { enoughForMonths, erfolgeByMonth, statusCounts } from '@/lib/rules/charts'
import { ChartCard } from '@/components/charts/ChartCard'
import { XYChart } from '@/components/charts/Chart'
import { addDaysISO, daysBetween, formatWeekdayDate, todayBerlin, type ISODate } from '@/lib/dates'
import { plural } from '@/lib/format'
import { deadlineChip } from '@/lib/rules/items'
import { boardGroups, fridayQueue, isErfolg, nachhaken, statusAltDays, type BoardGroupKey } from '@/lib/rules/work'
import { NotesCard } from '@/features/notes/NotesCard'
import { useCreateItem, useItems, useUpdateItem, type Item } from '@/features/items/api'
import { ItemQuestions } from '@/features/items/ItemQuestions'
import { useAddPerson, usePeople } from './api'
import { StatusSheet } from './StatusSheet'
import { WorkRow } from './WorkRow'
import { statusPatch } from './statusPatch'

const TABS = [
  { value: 'board', label: 'Доска' },
  { value: 'people', label: 'Люди' },
  { value: 'archive', label: 'Архив' },
] as const
type Tab = (typeof TABS)[number]['value']

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'

export function WorkScreen() {
  const [tab, setTab] = useState<Tab>('board')
  return (
    <>
      <ScreenHeader title="Работа" right={<CalendarLink sphere="work" />} />
      <SegmentedTabs label="Раздел" segments={TABS} value={tab} onChange={setTab} />
      {tab === 'board' && <BoardTab />}
      {tab === 'people' && <PeopleTab />}
      {tab === 'archive' && <ArchiveTab />}
      <NotesCard sphere="work" />
    </>
  )
}

/** Status change with «Отменить» in the toast; shared by the board, the sheet and swipes. */
function useSetStatus() {
  const update = useUpdateItem()
  const toast = useToast()
  return (item: Item, status: string) => {
    const before = item.status ?? 'Offen'
    if (status === before) return
    update.mutate({ id: item.id, patch: statusPatch(status) })
    toast({ text: status, actionLabel: 'Отменить', onAction: () => update.mutate({ id: item.id, patch: statusPatch(before) }) })
  }
}

const GROUP_TITLE: Record<BoardGroupKey, string> = {
  'In Arbeit': 'In Arbeit',
  'Im Review': 'Im Review',
  Offen: 'Offen',
  soon: 'Скоро',
  stalled: 'Стоит',
  Erledigt: 'Erledigt',
}
const OPEN_BY_DEFAULT: BoardGroupKey[] = ['In Arbeit', 'Offen']

function GroupMark({ k }: { k: BoardGroupKey }) {
  if (k === 'In Arbeit') return <span className="size-2.5 flex-none rounded-full bg-work" />
  if (k === 'Im Review') return <span className="size-2.5 flex-none rounded-full border-2 border-work" />
  if (k === 'Offen') return <span className="size-2.5 flex-none rounded-full border-[1.5px] border-ink3" />
  if (k === 'soon') return <CalendarClock size={16} strokeWidth={1.75} aria-hidden="true" className="text-ink2" />
  if (k === 'stalled') return <Pause size={16} strokeWidth={1.75} aria-hidden="true" className="text-ink2" />
  return <Check size={16} strokeWidth={2} aria-hidden="true" className="text-ink2" />
}

function BoardTab() {
  const today = todayBerlin()
  const items = useItems()
  const navigate = useNavigate()
  const openAdd = useOpenAdd()
  const setStatus = useSetStatus()
  const [picking, setPicking] = useState<Item | null>(null)
  const [area, setArea] = useState<string[]>([])
  const [open, setOpen] = useState<BoardGroupKey[]>(OPEN_BY_DEFAULT)
  const [review, setReview] = useState(false)

  if (items.isPending) return <SkeletonCard />
  const work = (items.data ?? []).filter((i) => i.sphere === 'work')
  const tasks = work.filter((i) => i.type !== ERFOLG_TYPE)
  if (!tasks.length) {
    return (
      <EmptyState title="Доска пустая">
        <span className="flex flex-col items-start gap-3">
          Новая задача — через «+». Хватит названия, остальное потом.
          <Button variant="secondary" onClick={() => openAdd('item', { sphere: 'work' })}>
            Новая задача
          </Button>
        </span>
      </EmptyState>
    )
  }

  const areas = [...new Set(tasks.map((i) => i.area).filter((a): a is string => Boolean(a)))].sort((a, b) => a.localeCompare(b, 'de'))
  const filtered = area.length ? tasks.filter((i) => i.area === area[0]) : tasks
  const groups = boardGroups(filtered, today)
  const toggle = (k: BoardGroupKey) => setOpen(open.includes(k) ? open.filter((x) => x !== k) : [...open, k])
  const row = (i: Item, full = false) => (
    <WorkRow
      key={i.id}
      item={i}
      today={today}
      full={full}
      showStatus={false}
      onOpen={() => setPicking(i)}
      onLongPress={() => navigate(`/item/${i.id}`)}
      onDone={i.status === 'Erledigt' ? undefined : () => setStatus(i, 'Erledigt')}
    />
  )

  return (
    <>
      <ItemQuestions sphere="work" />
      {areas.length > 1 && <FilterChips label="Bereich" options={areas.map((a) => ({ value: a, label: a, lang: 'de' }))} selected={area} onChange={setArea} />}
      {groups.length === 0 && area.length > 0 && (
        <EmptyState title={`В ${area[0]} пусто`}>
          <span className="flex flex-col items-start gap-2">
            Всё по этому Bereich закрыто или лежит в архиве.
            <Button variant="quiet" className="-ml-3" onClick={() => setArea([])}>
              Сбросить фильтр
            </Button>
          </span>
        </EmptyState>
      )}
      {groups.map((g) => {
        const isOpen = open.includes(g.key)
        const late = g.items.filter((i) => deadlineChip(i, today)?.kind === 'late').length
        const stale = g.items.filter((i) => statusAltDays(i, today) !== null).length
        const summary =
          g.key === 'soon' ? (
            `ближайшее ${formatWeekdayDate(g.items[0]!.starts_on!)}`
          ) : g.key === 'Erledigt' ? (
            `${g.items.length} за неделю`
          ) : (
            <>
              {late > 0 && <MetaChip kind="late" text={`Срок прошёл · ${late}`} />}
              {stale > 0 && <MetaChip kind="alt" text={`Status alt · ${stale}`} />}
            </>
          )
        return (
          <section key={g.key} className="flex flex-col gap-2" aria-label={GROUP_TITLE[g.key]}>
            <GroupHeader
              mark={<GroupMark k={g.key} />}
              title={GROUP_TITLE[g.key]}
              lang={g.key === 'soon' || g.key === 'stalled' ? 'ru' : 'de'}
              count={g.key === 'Erledigt' ? undefined : g.items.length}
              summary={summary}
              open={isOpen}
              onToggle={() => toggle(g.key)}
            />
            {isOpen &&
              (g.key === 'stalled'
                ? WORK_STALLED.map((st) => {
                    const list = g.items.filter((i) => i.status === st)
                    if (!list.length) return null
                    return (
                      <div key={st} className="flex flex-col gap-2">
                        <div lang="de" className="text-cap font-semibold text-ink2">
                          {st} · {list.length}
                        </div>
                        {list.map((i) => row(i))}
                      </div>
                    )
                  })
                : g.items.map((i) => row(i, g.key === 'In Arbeit')))}
          </section>
        )
      })}
      <Button variant="secondary" onClick={() => setReview(true)}>
        Пятничный обзор · {fridayQueue(tasks).length}
      </Button>
      <StatusSheet
        item={picking}
        onClose={() => setPicking(null)}
        onPick={(s) => {
          if (picking) setStatus(picking, s)
          setPicking(null)
        }}
      />
      {review && <FridayReview open onClose={() => setReview(false)} queue={fridayQueue(tasks)} today={today} />}
    </>
  )
}

/** Friday quick review: open cards one by one — «актуально» (touch) or «обновить» (open the card). */
function FridayReview({ open, onClose, queue, today }: { open: boolean; onClose: () => void; queue: Item[]; today: ISODate }) {
  const [index, setIndex] = useState(0)
  const [ids] = useState(() => queue.map((i) => i.id))
  const update = useUpdateItem()
  const navigate = useNavigate()
  const current = queue.find((i) => i.id === ids[index]) ?? null
  const next = () => setIndex(index + 1)
  return (
    <BottomSheet open={open} onClose={onClose} label="Пятничный обзор">
      {current ? (
        <div className="flex flex-col gap-4">
          <div className="text-cap text-ink2 tabular-nums">
            {index + 1} из {ids.length}
          </div>
          <div className="flex flex-col gap-2">
            <div lang="de" className="text-title font-semibold [overflow-wrap:anywhere]">
              {current.title}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-cap text-ink2">
              <StatusBadge status={current.status ?? 'Offen'} />
              {current.area && <span lang="de">{current.area}</span>}
              <span>
                без изменений {daysBetween(todayBerlin(new Date(current.updated_at)), today)} {plural(daysBetween(todayBerlin(new Date(current.updated_at)), today), ['день', 'дня', 'дней'])}
              </span>
            </div>
            {current.next_step && (
              <p lang="de" className="m-0 rounded-xl bg-sub px-3 py-2 text-base">
                {current.next_step}
              </p>
            )}
          </div>
          <Button
            onClick={() => {
              update.mutate({ id: current.id, patch: { updated_at: new Date().toISOString() } })
              next()
            }}
          >
            Актуально
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-11" onClick={() => navigate(`/item/${current.id}`)}>
              Обновить
            </Button>
            <Button variant="quiet" onClick={next}>
              Пропустить
            </Button>
          </div>
        </div>
      ) : (
        <EmptyState title="Обзор закончен">Все открытые карточки просмотрены. Хороших выходных.</EmptyState>
      )}
    </BottomSheet>
  )
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

/** Люди: rule 10 «Bei wem nachhaken» and the contact list. */
function PeopleTab() {
  const today = todayBerlin()
  const items = useItems()
  const people = usePeople()
  const add = useAddPerson()
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  if (items.isPending || people.isPending) return <SkeletonCard />
  const work = (items.data ?? []).filter((i) => i.sphere === 'work')
  const names = (people.data ?? []).map((p) => p.name)
  const waiting = nachhaken(work, names, today)

  return (
    <>
      <Card>
        <CardHeader title="Bei wem nachhaken" icon={<Hourglass size={20} strokeWidth={1.75} aria-hidden="true" className="text-ink2" />} />
        {waiting.length === 0 ? (
          <p className="m-0 text-cap text-ink2">Никого не ждём. Всё, что зависит от других, сейчас движется.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {waiting.map((w) => (
              <li key={w.name} className="flex min-h-11 items-center gap-3 rounded-xl bg-sub px-3">
                <span className="flex size-7 flex-none items-center justify-center rounded-full bg-work-soft text-cap font-semibold">{initials(w.name)}</span>
                <span lang="de" className="min-w-0 flex-1 text-base">
                  {w.name}
                </span>
                <span className="text-cap text-ink2 tabular-nums">
                  {w.count > 1 ? `${w.count} · ` : ''}ждём {w.days} дн
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Люди" context={names.length ? `${names.length}` : undefined} />
        {names.length === 0 && <p className="m-0 text-cap text-ink2">Список придёт из «Legende» при импорте. Можно добавить и сейчас.</p>}
        <ul className="m-0 flex list-none flex-col p-0">
          {(people.data ?? []).map((p) => {
            const open = work.filter((i) => i.people.includes(p.name) || (i.waiting_on ?? '').includes(p.name)).filter((i) => i.status !== 'Erledigt' && i.status !== 'Verworfen').length
            return (
              <li key={p.id} className="flex min-h-12 items-center gap-3 border-t border-line first:border-t-0">
                <span className="flex size-7 flex-none items-center justify-center rounded-full bg-work-soft text-cap font-semibold">{initials(p.name)}</span>
                <span className="min-w-0 flex-1">
                  <span lang="de" className="block text-base">
                    {p.name}
                  </span>
                  {p.role && (
                    <span lang="de" className="block text-cap text-ink2">
                      {p.role}
                    </span>
                  )}
                </span>
                {open > 0 && <span className="text-cap text-ink2 tabular-nums">{open} открыто</span>}
              </li>
            )
          })}
        </ul>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            add.mutate({ name: name.trim(), role: role.trim() || null }, {
                onSuccess: () => {
                  setName('')
                  setRole('')
                },
              })
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" aria-label="Имя" lang="de" className={field} />
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Роль" aria-label="Роль" lang="de" className={field} />
          <Button type="submit" variant="secondary" disabled={!name.trim() || add.isPending} icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}>
            Добавить человека
          </Button>
        </form>
      </Card>
    </>
  )
}

/** Архив: Erfolge (recorded or done with «что это дало») and closed tasks. */
function ArchiveTab() {
  const today = todayBerlin()
  const items = useItems()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  if (items.isPending) return <SkeletonCard />
  const work = (items.data ?? []).filter((i) => i.sphere === 'work')
  const erfolge = work
    .filter(isErfolg)
    .sort((a, b) => (b.done_at ?? b.updated_at).localeCompare(a.done_at ?? a.updated_at))
  const closed = work
    .filter((i) => i.type !== ERFOLG_TYPE && (i.status === 'Erledigt' || i.status === 'Verworfen'))
    .sort((a, b) => (b.done_at ?? b.updated_at).localeCompare(a.done_at ?? a.updated_at))

  const erfolgDates = erfolge.map((i) => todayBerlin(new Date(i.done_at ?? i.updated_at)))
  const months = erfolgeByMonth(erfolgDates, today)
  const statuses = statusCounts(work.filter((i) => i.status !== 'Erledigt' && i.status !== 'Verworfen'), WORK_STATUSES)
  const maxCount = Math.max(1, ...statuses.map((s) => s.count))
  return (
    <>
      <ChartCard title="Erfolge" dotClass="bg-work" context={months.length ? `${monthsLabel(months)}` : 'по месяцам'}>
        <XYChart
          label="Erfolge по месяцам"
          data={months}
          empty={!enoughForMonths(erfolgDates, today)}
          emptyText="Мало данных — график появится, когда наберётся месяц записей"
          bars={[{ key: 'count', name: 'Erfolge', color: 'work' }]}
          yLeft={{ domain: [0, 'auto'], ticks: undefined }}
        />
      </ChartCard>
      {statuses.length > 0 && (
        <ChartCard title="Доска по статусам" dotClass="bg-work" context={`${statuses.reduce((s, x) => s + x.count, 0)} открыто`}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {statuses.map((s) => (
              <li key={s.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-cap">
                <span lang="de" className="truncate text-ink2">
                  {s.label}
                </span>
                <span className="h-2 rounded-[4px] bg-sub">
                  <span className="block h-2 rounded-[4px] bg-work" style={{ width: `${(s.count / maxCount) * 100}%` }} />
                </span>
                <span className="text-right font-semibold text-ink tabular-nums">{s.count}</span>
              </li>
            ))}
          </ul>
        </ChartCard>
      )}
      {erfolge.length === 0 ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-line2 p-4">
          <div className="text-base font-semibold">Записей пока нет</div>
          <p className="m-0 text-cap text-ink2">Хватит одной строки: что получилось. Закрытые задачи сюда не попадают — только то, чем хочется гордиться.</p>
          <Button onClick={() => setAdding(true)} icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}>
            Записать первый
          </Button>
        </section>
      ) : (
        <>
          <Card>
            <CardHeader title="Erfolge" dotClass="bg-work" context={`${erfolge.length}`} />
            <ul className="m-0 flex list-none flex-col p-0">
              {erfolge.slice(0, 12).map((i) => (
                <li key={i.id} className="border-t border-line first:border-t-0">
                  <button type="button" onClick={() => navigate(`/item/${i.id}`)} className="flex min-h-14 w-full flex-col justify-center py-2 text-left">
                    <span lang="de" className="text-base [overflow-wrap:anywhere]">
                      {i.type === ERFOLG_TYPE ? i.title : i.outcome}
                    </span>
                    <span className="text-cap text-ink2">
                      {[i.done_at ? formatWeekdayDate(todayBerlin(new Date(i.done_at))) : null, i.type === ERFOLG_TYPE ? i.area : i.title].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Button variant="secondary" onClick={() => setAdding(true)} icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}>
            Записать Erfolg
          </Button>
        </>
      )}
      <Card>
        <GroupHeader
          mark={<Check size={16} strokeWidth={2} aria-hidden="true" className="text-ink2" />}
          title="Erledigt и Verworfen"
          count={closed.length}
          open={showDone}
          onToggle={() => setShowDone(!showDone)}
        />
        {showDone &&
          (closed.length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {closed.map((i) => (
                <li key={i.id} className="flex min-h-11 items-center gap-2 border-t border-line text-base text-ink3 first:border-t-0">
                  <span lang="de" className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    {i.title}
                  </span>
                  <span lang="de" className="text-cap">
                    {i.status === 'Verworfen' ? 'Verworfen' : i.done_at ? formatWeekdayDate(todayBerlin(new Date(i.done_at))) : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-cap text-ink2">Закрытых задач пока нет.</p>
          ))}
      </Card>
      <ErfolgSheet open={adding} onClose={() => setAdding(false)} today={today} />
    </>
  )
}

/** «июн — ноя» */
function monthsLabel(months: { label: string }[]): string {
  return months.length > 1 ? `${months[0]!.label} — ${months[months.length - 1]!.label}` : months[0]!.label
}

function ErfolgSheet({ open, onClose, today }: { open: boolean; onClose: () => void; today: ISODate }) {
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<string | null>(null)
  const [day, setDay] = useState<ISODate>(today)
  const create = useCreateItem()
  const toast = useToast()
  return (
    <BottomSheet open={open} onClose={onClose} label="Записать Erfolg">
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          create.mutate(
            { sphere: 'work', type: ERFOLG_TYPE, status: 'Erledigt', title: title.trim(), area, done_at: new Date(`${day}T12:00:00Z`).toISOString() },
            {
              onSuccess: () => {
                toast({ text: 'Записано в Erfolge' })
                setTitle('')
                onClose()
              },
            },
          )
        }}
      >
        <label className="flex flex-col gap-2">
          <span className="text-cap text-ink2">Что получилось</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} lang="de" className={field} placeholder="Kundenportal 2.4 ist live" />
        </label>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-cap text-ink2">Bereich</legend>
          <div className="flex flex-wrap gap-2">
            {WORK_AREAS.map((a) => (
              <Chip key={a} selected={area === a} onClick={() => setArea(area === a ? null : a)} lang="de">
                {a}
              </Chip>
            ))}
          </div>
        </fieldset>
        <DateChoice label="Когда" value={day} onChange={setDay} options={[today, addDaysISO(today, -1)]} today={today} />
        <Button type="submit" disabled={!title.trim() || create.isPending} icon={<Trophy size={20} strokeWidth={1.75} aria-hidden="true" />}>
          Записать
        </Button>
      </form>
    </BottomSheet>
  )
}

