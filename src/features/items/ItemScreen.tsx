import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowRightFromLine, ChevronLeft, CircleDashed, Clock, Flag, Minus, Plus, type LucideIcon } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { Button, IconButton } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { DateChoice, TimeChoice } from '@/components/ui/DateChoice'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { MetaChips } from '@/components/ui/MetaChip'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { cn } from '@/components/ui/cn'
import {
  BODY_STATUSES,
  CANCEL_STATUS,
  SPHERE_CLASS,
  SPHERE_LABEL,
  WORK_AREAS,
  WORK_PRIORITIES,
  WORK_STATUSES,
  type Sphere,
} from '@/lib/constants'
import type { TablesUpdate } from '@/lib/db/types'
import { addDaysISO, dayChipLabel, formatDayMonth, parseISODate, todayBerlin, type ISODate } from '@/lib/dates'
import { formatHours, formatTime } from '@/lib/format'
import { deadlineChip, deadlineKind, historyChips, isItemCancelled, isItemOpen, type DeadlineKind } from '@/lib/rules/items'
import { isFixed, readyBy } from '@/lib/rules/study'
import { useDeleteItem, useItem, useUpdateItem, type FullItem } from './api'

const SPHERES: Sphere[] = ['money', 'work', 'study', 'body', 'personal']
const GENITIVE: Record<Sphere, string> = { money: 'Денег', work: 'Работы', study: 'Учёбы', body: 'Тела', personal: 'Личного' }

const KINDS: { value: DeadlineKind; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'open', label: 'Открытый', hint: 'без даты', icon: CircleDashed },
  { value: 'day', label: 'В день', hint: 'дата и время', icon: Clock },
  { value: 'from', label: 'С даты', hint: 'не раньше', icon: ArrowRightFromLine },
  { value: 'deadline', label: 'Дедлайн', hint: 'сдать до', icon: Flag },
]

const field = 'min-h-12 w-full rounded-xl border border-line2 bg-card px-4 py-3 text-base text-ink outline-none focus:border-ink2'

/** Item card (design 3a): title, sphere, the four deadline kinds, sphere fields; saved by «Сохранить». */
export function ItemScreen() {
  const { id } = useParams()
  const item = useItem(id)
  const navigate = useNavigate()
  if (item.isPending) return <SkeletonCard className="mt-8" />
  if (!item.data) {
    return (
      <div className="flex flex-col gap-4 pt-8">
        <EmptyState title="Пункт не найден">Возможно, его уже удалили.</EmptyState>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Назад
        </Button>
      </div>
    )
  }
  return <ItemForm key={item.data.id} item={item.data} />
}

function ItemForm({ item }: { item: FullItem }) {
  const today = todayBerlin()
  const navigate = useNavigate()
  const toast = useToast()
  const update = useUpdateItem()
  const del = useDeleteItem()

  const [title, setTitle] = useState(item.title)
  const [sphere, setSphere] = useState<Sphere>((SPHERES as string[]).includes(item.sphere) ? (item.sphere as Sphere) : 'personal')
  const [kind, setKind] = useState<DeadlineKind>(deadlineKind(item))
  const [happensOn, setHappensOn] = useState<ISODate>(item.happens_on ?? today)
  const [happensTime, setHappensTime] = useState<string | null>(item.happens_time ? formatTime(item.happens_time) : null)
  const [startsOn, setStartsOn] = useState<ISODate | null>(item.starts_on)
  const [dueDate, setDueDate] = useState<ISODate | null>(item.due_date)
  const [dueTime, setDueTime] = useState<string | null>(item.due_time ? formatTime(item.due_time) : null)
  const [status, setStatus] = useState(item.status)
  const [area, setArea] = useState(item.area ?? '')
  const [priority, setPriority] = useState(item.priority)
  const [nextStep, setNextStep] = useState(item.next_step ?? '')
  const [waitingOn, setWaitingOn] = useState(item.waiting_on ?? '')
  const [outcome, setOutcome] = useState(item.outcome ?? '')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [fixed, setFixed] = useState<boolean>(isFixed(item))
  const [hours, setHours] = useState<number>(Number(item.hours_est) || 0)

  const week = [0, 1, 2, 3].map((n) => addDaysISO(today, n))
  const later = [7, 14, 21].map((n) => addDaysISO(today, n))
  const dates = kind === 'from' || kind === 'deadline'
  const start = kind === 'from' ? (startsOn ?? addDaysISO(today, 7)) : startsOn
  const due = kind === 'deadline' ? (dueDate ?? addDaysISO(today, 7)) : dueDate

  // The fields as they will be saved: the kind decides which dates stay.
  const dated = {
    happens_on: kind === 'day' ? happensOn : null,
    happens_time: kind === 'day' ? happensTime : null,
    starts_on: dates ? start : null,
    due_date: dates ? due : null,
    due_time: dates && due ? dueTime : null,
  }
  const datesClash = dated.starts_on !== null && dated.due_date !== null && dated.starts_on > dated.due_date
  const draft = {
    ...item,
    ...dated,
    title: title.trim() || item.title,
    status,
    rollover_count: item.rollover_count,
    ready_by: sphere === 'study' && dated.due_date ? (dated.due_date === item.due_date ? item.ready_by : readyBy(dated.due_date)) : null,
  }

  const save = () => {
    const patch: TablesUpdate<'items'> = {
      title: draft.title,
      sphere,
      ...dated,
      ready_by: draft.ready_by,
      status,
      notes: notes.trim() || null,
    }
    if (sphere === 'work') {
      Object.assign(patch, {
        area: area.trim() || null,
        priority,
        next_step: nextStep.trim() || null,
        waiting_on: waitingOn.trim() || null,
        outcome: outcome.trim() || null,
      })
    }
    if (sphere === 'study') {
      Object.assign(patch, {
        area: area.trim() || null,
        hours_est: hours || null,
        // Store the choice only when it differs from the default (rule 19); otherwise keep it automatic.
        is_fixed: fixed === (dated.due_date !== null) ? null : fixed,
      })
    }
    update.mutate(
      { id: item.id, patch },
      {
        onSuccess: () => {
          toast({ text: 'Сохранено' })
          navigate(-1)
        },
      },
    )
  }

  const cancel = () => {
    const before = item.status
    update.mutate({ id: item.id, patch: { status: CANCEL_STATUS[sphere], done_at: null } })
    toast({ text: `${draft.title} — снято`, actionLabel: 'Вернуть', onAction: () => update.mutate({ id: item.id, patch: { status: before } }) })
    navigate(-1)
  }

  const lang = sphere === 'work' || sphere === 'study' ? 'de' : undefined
  const previewChips = [deadlineChip(draft, today), ...(sphere === 'study' && fixed ? [{ kind: 'rigid' as const, text: 'жёсткий' }] : []), ...historyChips(draft)]

  return (
    <div className="flex flex-col gap-6 pb-4">
      <header className="grid grid-cols-[44px_1fr_44px] items-center pt-4">
        <IconButton shape="square" label="Назад" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        <h1 className="m-0 text-center text-base font-semibold">Пункт</h1>
      </header>

      <Field label="Что сделать">
        <textarea rows={2} value={title} onChange={(e) => setTitle(e.target.value)} lang={lang} className={field} aria-label="Что сделать" />
      </Field>

      <Field label="Сфера">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {SPHERES.map((s) => (
            <Chip key={s} selected={sphere === s} dotClass={SPHERE_CLASS[s].dot} onClick={() => setSphere(s)} className="flex-none">
              {SPHERE_LABEL[s]}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Вид срока">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Вид срока">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              onClick={() => setKind(k.value)}
              className={cn(
                'flex min-h-[76px] flex-col items-start gap-1 rounded-xl border p-3 text-left',
                kind === k.value ? 'border-inv bg-inv text-on-inv' : 'border-line2 bg-card text-ink active:bg-sub',
              )}
            >
              <k.icon size={20} strokeWidth={1.75} aria-hidden="true" />
              <span className="text-base font-semibold">{k.label}</span>
              <span className={cn('text-cap', kind === k.value ? 'text-on-inv' : 'text-ink2')}>{k.hint}</span>
            </button>
          ))}
        </div>
      </Field>

      {kind === 'open' && (
        <p className="m-0 rounded-2xl border border-dashed border-line2 p-4 text-cap text-ink2">
          Без даты пункт живёт в списке «{GENITIVE[sphere]}» и не попадает в «Горит». Срок можно добавить в любой момент.
        </p>
      )}

      {kind === 'day' && (
        <>
          <DateChoice label="День" value={happensOn} onChange={setHappensOn} options={week.slice(0, 3)} today={today} />
          <TimeChoice value={happensTime} onChange={setHappensTime} />
          <Hint>
            {`${dayPhrase(happensOn, today)} пункт встанет в «Сегодня»${happensTime ? ` на ${happensTime}` : ''}. После — один вопрос «Состоялось?».`}
          </Hint>
        </>
      )}

      {dates && (
        <>
          {start !== null ? (
            <div className="flex flex-col gap-2">
              <DateChoice label="Начать с" value={start} onChange={setStartsOn} options={later} today={today} />
              {kind === 'deadline' && <RemoveLink onClick={() => setStartsOn(null)} />}
            </div>
          ) : (
            <AddOptional onClick={() => setStartsOn(addDaysISO(today, 7))}>Начать не раньше</AddOptional>
          )}
          {due !== null ? (
            <div className="flex flex-col gap-2">
              <DateChoice label="Сдать до" value={due} onChange={setDueDate} options={[...later, addDaysISO(today, 28)].filter((d) => !start || d >= start)} today={today} min={start ?? undefined} />
              <TimeChoice label="Время сдачи" value={dueTime} onChange={setDueTime} options={['10:00', '23:59']} allDay="Без времени" />
              {kind === 'from' && <RemoveLink onClick={() => setDueDate(null)} />}
            </div>
          ) : (
            <AddOptional onClick={() => setDueDate(addDaysISO(start ?? today, 14))}>Срок сдачи</AddOptional>
          )}
          {datesClash && <p className="m-0 text-cap font-semibold text-ink">Срок сдачи раньше старта — поправь одну из дат или убери срок.</p>}
          <Hint>
            {start && due
              ? `До ${formatDayMonth(start)} пункт ждёт в «Скоро» и не мешает. За 3 дня до ${formatDayMonth(due)} — в «Горит».`
              : start
                ? `До ${formatDayMonth(start)} пункт ждёт в «Скоро» и не мешает. Срок сдачи можно не ставить.`
                : 'За 3 дня до срока пункт появится в «Горит».'}
          </Hint>
        </>
      )}

      {sphere === 'study' && (
        <>
          <Field label="Предмет">
            <input value={area} onChange={(e) => setArea(e.target.value)} lang="de" className={field} aria-label="Предмет" />
          </Field>
          <Field label="Как планировать">
            <SegmentedTabs
              label="Как планировать"
              segments={[
                { value: 'flex', label: 'Гибкий' },
                { value: 'fixed', label: 'Жёсткий' },
              ]}
              value={fixed ? 'fixed' : 'flex'}
              onChange={(v) => setFixed(v === 'fixed')}
            />
            <Hint>
              {fixed
                ? 'Привязан к сроку и сам не двигается. Если неделя переполнится — подвинутся гибкие соседи.'
                : 'Можно двигать между неделями. Если неделя переполнится, предложу, куда перенести.'}
            </Hint>
          </Field>
          <Field label="Время">
            <div className="flex items-center gap-2">
              <IconButton shape="square" label="Меньше на полчаса" onClick={() => setHours(Math.max(0, hours - 0.5))}>
                <Minus size={20} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
              <div className="flex h-11 flex-1 items-center justify-center rounded-xl bg-sub text-title font-semibold tabular-nums">{formatHours(hours)}</div>
              <IconButton shape="square" label="Больше на полчаса" onClick={() => setHours(hours + 0.5)}>
                <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
            </div>
          </Field>
        </>
      )}

      {sphere === 'work' && (
        <>
          <Field label="Статус">
            <div className="grid grid-cols-2 gap-2">
              {WORK_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={(status ?? 'Offen') === s}
                  onClick={() => setStatus(s)}
                  className={cn('flex min-h-12 items-center rounded-xl border px-3 text-left active:bg-sub', (status ?? 'Offen') === s ? 'border-inv' : 'border-line2')}
                >
                  <StatusBadge status={s} />
                </button>
              ))}
            </div>
          </Field>
          <Field label="Bereich">
            <div className="flex flex-wrap gap-2">
              {[...new Set([...WORK_AREAS, ...(item.area ? [item.area] : [])])].map((a) => (
                <Chip key={a} selected={area === a} onClick={() => setArea(area === a ? '' : a)} lang="de">
                  {a}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Prio">
            <div className="flex flex-wrap gap-2">
              {WORK_PRIORITIES.map((p) => (
                <Chip key={p} selected={priority === p} onClick={() => setPriority(priority === p ? null : p)} lang="de">
                  {p}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Nächster Schritt">
            <input value={nextStep} onChange={(e) => setNextStep(e.target.value)} lang="de" className={field} aria-label="Nächster Schritt" />
          </Field>
          <Field label="Wartet auf / blockiert durch">
            <input value={waitingOn} onChange={(e) => setWaitingOn(e.target.value)} lang="de" className={field} aria-label="Wartet auf" />
          </Field>
          <Field label="Что это дало">
            <input
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className={field}
              aria-label="Что это дало"
              placeholder="Одна строка — и задача попадёт в Erfolge"
            />
          </Field>
        </>
      )}

      {sphere === 'body' && (
        <Field label="Статус">
          <div className="flex flex-wrap gap-2">
            {BODY_STATUSES.map((s) => (
              <Chip key={s} selected={(status ?? 'Не начато') === s} onClick={() => setStatus(s)}>
                {s}
              </Chip>
            ))}
          </div>
        </Field>
      )}

      <Field label="Заметка">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={field} aria-label="Заметка" />
      </Field>

      <Field label="В списке будет так">
        <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-card px-4 py-2.5">
          <span lang={lang} className="text-base [overflow-wrap:anywhere]">
            {draft.title}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-cap text-ink2">
            <span className={cn('size-2 rounded-full', SPHERE_CLASS[sphere].dot)} />
            <span>{SPHERE_LABEL[sphere]}</span>
            {sphere === 'study' && hours > 0 && <span className="tabular-nums">{formatHours(hours)}</span>}
            <MetaChips chips={previewChips} />
          </span>
        </div>
      </Field>

      {update.isError && <p className="m-0 text-cap text-ink2">Не получилось сохранить. Проверь сеть и попробуй ещё раз.</p>}
      <Button onClick={save} disabled={!title.trim() || datesClash || update.isPending}>
        Сохранить
      </Button>
      {isItemOpen(item) && !isItemCancelled(item) && (
        <Button variant="quiet" onClick={cancel}>
          {sphere === 'body' ? 'Отменить пункт' : 'Снять пункт'}
        </Button>
      )}
      {item.source_id === null && (
        <Button
          variant="quiet"
          className="text-ink2"
          onClick={() =>
            del.mutate(item.id, {
              onSuccess: () => {
                toast({ text: 'Пункт удалён' })
                navigate(-1)
              },
            })
          }
        >
          Удалить
        </Button>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-cap text-ink2">{label}</div>
      {children}
    </div>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="m-0 text-cap text-ink2">{children}</p>
}

function RemoveLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-11 self-end px-2 text-cap font-semibold text-ink active:bg-sub">
      Убрать
    </button>
  )
}

function AddOptional({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-line2 text-base text-ink active:bg-sub"
    >
      <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
      {children}
    </button>
  )
}

const ON_WEEKDAY = ['В воскресенье', 'В понедельник', 'Во вторник', 'В среду', 'В четверг', 'В пятницу', 'В субботу']

/** «Сегодня», «Завтра», «В четверг» (this week), else «12.11». */
function dayPhrase(day: ISODate, today: ISODate): string {
  const label = dayChipLabel(day, today)
  if (label === 'Сегодня' || label === 'Завтра') return label
  if (day <= addDaysISO(today, 6)) return ON_WEEKDAY[parseISODate(day).getDay()]!
  return formatDayMonth(day)
}
