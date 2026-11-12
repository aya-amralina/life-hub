import { useState } from 'react'
import { useNavigate } from 'react-router'
import { DatabaseBackup, Plus } from 'lucide-react'
import { IconTile } from '@/components/ui/IconTile'
import { backupAgeDays, backupDue } from '@/lib/backup'
import { downloadBackup, lastExport } from '@/features/settings/backupApi'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { MetaChip } from '@/components/ui/MetaChip'
import { ACCOUNTS, SPHERE_CLASS, SPHERE_LABEL, type Sphere } from '@/lib/constants'
import { addDaysISO, formatWeekdayDate, todayBerlin, type ISODate } from '@/lib/dates'
import { formatEur, formatHours, plural, toCents } from '@/lib/format'
import { weekPoints, weekPointsTarget } from '@/lib/rules/activities'
import { minimumDone, minimumSet, stageForDate, weekHabitShare } from '@/lib/rules/habits'
import { isItemOpen, isStuck } from '@/lib/rules/items'
import { isWeekRow, upcomingPlanned } from '@/lib/rules/money'
import { nextWeekAgenda, splitItem } from '@/lib/rules/review'
import { LOAD_LABEL, isFixed, planRollover, plannedItems, rolloverCandidates, studyItemsOfWeek, weekCapacity, weekLoad } from '@/lib/rules/study'
import { nachhaken, statusAltDays } from '@/lib/rules/work'
import { useActivities, useActivityTypes } from '@/features/body/activityApi'
import { useStages, useWeekLogs } from '@/features/body/api'
import { useCreateItem, useItems, usePatchItems, useUpdateItem, type Item } from '@/features/items/api'
import { CutNextWeek } from '@/features/money/CutNextWeek'
import { MoneyQuestions } from '@/features/money/MoneyQuestions'
import { MoneyTotal } from '@/features/money/MoneyTotal'
import { useAllTransactions } from '@/features/money/api'
import { useMoneyWeek } from '@/features/money/useMoneyWeek'
import { MoveSheet } from '@/features/study/MoveSheet'
import { weekLabel } from '@/features/study/weekLabel'
import { useAllWeeks } from '@/features/weeks/api'
import { ErfolgSheet } from '@/features/work/ErfolgSheet'
import { usePeople } from '@/features/work/api'

const area = 'rounded-xl border border-line2 bg-card px-4 py-3 text-base text-ink outline-none focus:border-ink2'

function Note({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-cap text-ink2">{label}</span>
      <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={area} />
    </label>
  )
}

/** Шаг 1 · Деньги: the week against its limit, overspend → cut next week (rule 3), open questions, balances, impulses. */
export function MoneyStep({
  monday,
  balances,
  onBalances,
  impulse,
  onImpulse,
}: {
  monday: ISODate
  balances: Record<string, string>
  onBalances: (b: Record<string, string>) => void
  impulse: string
  onImpulse: (v: string) => void
}) {
  const { summary, txs, pending } = useMoneyWeek(monday)
  if (pending) return <SkeletonCard />
  const expenses = txs.filter((t) => t.kind === 'expense')
  return (
    <>
      <MoneyQuestions />
      {!summary.hasLimits && !expenses.length ? (
        <EmptyState title="Трат за неделю не записано">Если они были — их можно внести через «+» на «Деньгах». Или пропустить шаг: обзор и так сработает.</EmptyState>
      ) : (
        <Card>
          <CardHeader title="Неделя" dotClass="bg-money" context={summary.status === 'over' ? 'перерасход' : 'в лимите'} />
          {summary.hasLimits ? <MoneyTotal summary={summary} /> : <p className="m-0 text-cap text-ink2">Лимиты этой недели не заданы.</p>}
          <ul className="m-0 flex list-none flex-col p-0">
            {summary.categories
              .filter((c) => c.limitCents > 0 || c.spentCents > 0)
              .map((c) => (
                <li key={c.category} className="flex min-h-11 items-center gap-2 border-t border-line text-base first:border-t-0">
                  <span className="min-w-0 flex-1">{c.category}</span>
                  {c.deviationCents > 0 && <MetaChip kind="alt" text={`+${formatEur(c.deviationCents)}`} />}
                  <span className="tabular-nums">
                    {formatEur(c.spentCents, { whole: true })} <span className="text-ink2">/ {formatEur(c.limitCents, { whole: true })}</span>
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}
      {summary.status === 'over' && <CutNextWeek monday={monday} summary={summary} />}
      <Card>
        <CardHeader title="Остатки на счетах" context="по желанию" />
        <p className="m-0 text-cap text-ink2">Сверка с банком: впиши, что видно в приложениях банков, — сохранится в обзоре недели.</p>
        {ACCOUNTS.map((a) => (
          <label key={a} className="flex items-center gap-3">
            <span className="flex-1 text-base">{a}</span>
            <input
              inputMode="decimal"
              value={balances[a] ?? ''}
              onChange={(e) => onBalances({ ...balances, [a]: e.target.value })}
              aria-label={`Остаток ${a}`}
              className="h-11 w-28 rounded-xl border border-line2 bg-card px-3 text-right text-base text-ink tabular-nums"
            />
            <span className="text-cap text-ink2">€</span>
          </label>
        ))}
      </Card>
      <Note label="Импульсные траты — были?" value={impulse} onChange={onImpulse} placeholder="Например: кофе по дороге, потому что устала" />
    </>
  )
}

/** Шаг 2 · Тело: habits of the week (rule 14), minimum days, activity score vs target, how it felt. */
export function BodyStep({ monday, note, onNote }: { monday: ISODate; note: string; onNote: (v: string) => void }) {
  const today = todayBerlin()
  const logs = useWeekLogs(monday)
  const stages = useStages()
  const activities = useActivities()
  const types = useActivityTypes()
  if (logs.isPending || stages.isPending || activities.isPending || types.isPending) return <SkeletonCard />
  const sunday = addDaysISO(monday, 6)
  const share = weekHabitShare(logs.data ?? [], stages.data ?? [], monday, today < sunday ? today : sunday)
  const stage = stages.data?.length ? stageForDate(stages.data, monday) : null
  const minDays = (logs.data ?? []).filter((l) => minimumDone(l, minimumSet(stage))).length
  const avg = (f: (l: { mood: number | null; energy: number | null; sleep_h: number | null }) => number | null) => {
    const v = (logs.data ?? []).map(f).filter((x): x is number => x !== null).map(Number)
    return v.length ? String(Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10).replace('.', ',') : '—'
  }
  const points = weekPoints(activities.data ?? [], types.data ?? [], monday)
  const target = weekPointsTarget(stage)
  return (
    <>
      <Card>
        <CardHeader title="Привычки" dotClass="bg-body" context={stage?.name} />
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-big font-semibold">{share === null ? '—' : `${Math.round(share * 100)} %`}</span>
          <span className="text-base text-ink2">отмечено</span>
        </div>
        <p className="m-0 text-cap text-ink2">
          {minDays > 0 ? `Дней минимума: ${minDays}. ` : ''}Без стриков — каждая неделя с чистого листа.
        </p>
      </Card>
      <Card>
        <CardHeader title="Самочувствие и движение" dotClass="bg-body" />
        <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-base tabular-nums">
          <dt className="text-ink2">Настроение, среднее</dt>
          <dd className="m-0 text-right">{avg((l) => l.mood)}</dd>
          <dt className="text-ink2">Энергия, среднее</dt>
          <dd className="m-0 text-right">{avg((l) => l.energy)}</dd>
          <dt className="text-ink2">Сон, часов в среднем</dt>
          <dd className="m-0 text-right">{avg((l) => l.sleep_h)}</dd>
          <dt className="text-ink2">Очки активности</dt>
          <dd className="m-0 text-right">
            {String(points).replace('.', ',')}
            {target ? ` из ${String(target).replace('.', ',')}` : ''}
          </dd>
        </dl>
      </Card>
      <Note label="Что поддержало на этой неделе?" value={note} onChange={onNote} />
    </>
  )
}

/** Шаг 3 · Учёба: the week's hours, «Ждут решения» (rule 21), what rolls tomorrow, «Застряло» (rule 22), late fixed items. */
export function StudyStep({ monday }: { monday: ISODate }) {
  const today = todayBerlin()
  const items = useItems()
  const weeks = useAllWeeks()
  const update = useUpdateItem()
  const patch = usePatchItems()
  const create = useCreateItem()
  const toast = useToast()
  const navigate = useNavigate()
  const [moving, setMoving] = useState<Item[] | null>(null)
  if (items.isPending || weeks.isPending) return <SkeletonCard />
  const all = items.data ?? []
  const ws = weeks.data ?? []
  const week = ws.find((w) => w.start_date === monday) ?? null
  const list = plannedItems(studyItemsOfWeek(all, monday, week?.id ?? null))
  const load = weekLoad(list, weekCapacity(week))
  const done = list.filter((i) => !isItemOpen(i)).reduce((s, i) => s + (Number(i.hours_est) || 0), 0)
  const waiting = rolloverCandidates(all, ws, addDaysISO(monday, 7) <= today ? addDaysISO(monday, 7) : monday)
  const next = addDaysISO(monday, 7)
  const nextWeek = ws.find((w) => w.start_date === next) ?? null
  const tomorrow = next > today ? planRollover(all, ws, { monday: next, weekId: nextWeek?.id ?? null, capacity: weekCapacity(nextWeek) }) : null
  const stuck = all.filter((i) => i.sphere === 'study' && isItemOpen(i) && isStuck(i))
  const late = all.filter((i) => i.sphere === 'study' && isItemOpen(i) && isFixed(i) && i.due_date !== null && i.due_date < today)

  const takeOff = (i: Item) => {
    update.mutate({ id: i.id, patch: { status: 'снято' } })
    toast({ text: `${i.title} снят`, actionLabel: 'Вернуть', onAction: () => update.mutate({ id: i.id, patch: { status: i.status } }) })
  }
  const split = (i: Item) => {
    const s = splitItem(i)
    s.create.forEach((row) => create.mutate(row))
    patch.mutate([s.close])
    toast({ text: `${i.title}: два шага вместо одного` })
  }

  return (
    <>
      <Card>
        <CardHeader title="Неделя" dotClass="bg-study" context={LOAD_LABEL[load.status]} />
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-big font-semibold">{formatHours(done)}</span>
          <span className="text-base text-ink2">из {formatHours(load.hours)} закрыто</span>
        </div>
        {tomorrow && (tomorrow.moves.length > 0 || tomorrow.waiting.length > 0) && (
          <p className="m-0 text-cap text-ink2">
            Завтра в {weekLabel(next, ws)} переедут {tomorrow.moves.length} {plural(tomorrow.moves.length, ['гибкий пункт', 'гибких пункта', 'гибких пунктов'])}
            {tomorrow.waiting.length ? `, ещё ${tomorrow.waiting.length} не влезут и будут ждать решения` : ''}.
          </p>
        )}
      </Card>
      <Card>
        <CardHeader title="Ждут решения" dotClass="bg-study" context={waiting.length ? `${waiting.length}` : undefined} />
        {waiting.length === 0 ? (
          <p className="m-0 text-cap text-ink2">Ничего не ждёт — всё, что не успелось, поместилось.</p>
        ) : (
          <>
            <ul className="m-0 flex list-none flex-col p-0">
              {waiting.map((i) => (
                <li key={i.id} className="flex min-h-11 items-center gap-2 border-t border-line text-base first:border-t-0">
                  <span lang="de" className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    {i.title}
                    {i.hours_est ? <span className="text-ink2"> · {formatHours(Number(i.hours_est))}</span> : null}
                  </span>
                  <button type="button" className="h-11 px-2 text-cap font-semibold active:bg-sub" onClick={() => takeOff(i)}>
                    Снять
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="secondary" onClick={() => setMoving(waiting)}>
              Выбрать неделю
            </Button>
          </>
        )}
      </Card>
      <Card>
        <CardHeader title="Застряло" dotClass="bg-study" context={stuck.length ? `${stuck.length}` : undefined} />
        {stuck.length === 0 ? (
          <p className="m-0 text-cap text-ink2">Ничего не застряло.</p>
        ) : (
          stuck.map((i) => (
            <div key={i.id} className="flex flex-col gap-2 border-t border-line pt-2 first-of-type:border-t-0">
              <div className="flex flex-wrap items-center gap-2">
                <span lang="de" className="min-w-0 flex-1 text-base [overflow-wrap:anywhere]">
                  {i.title}
                </span>
                <MetaChip kind="stuck" text={`застряло · ${i.rollover_count + 1} нед`} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="secondary" className="h-11 px-2" onClick={() => split(i)}>
                  Разбить
                </Button>
                <Button variant="secondary" className="h-11 px-2" onClick={() => setMoving([i])}>
                  Перенести
                </Button>
                <Button variant="quiet" onClick={() => takeOff(i)}>
                  Снять
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>
      {late.length > 0 && (
        <Card>
          <CardHeader title="Срок прошёл" dotClass="bg-study" context={`${late.length}`} />
          <ul className="m-0 flex list-none flex-col p-0">
            {late.map((i) => (
              <li key={i.id} className="border-t border-line first:border-t-0">
                <button type="button" onClick={() => navigate(`/item/${i.id}`)} className="flex min-h-11 w-full items-center gap-2 text-left text-base">
                  <span lang="de" className="min-w-0 flex-1">
                    {i.title}
                  </span>
                  <MetaChip kind="late" text={`Срок прошёл · ${formatWeekdayDate(i.due_date!)}`} />
                </button>
              </li>
            ))}
          </ul>
          <p className="m-0 text-cap text-ink2">«Сдано позже» или «Снять» — в карточке пункта или на «Учёбе».</p>
        </Card>
      )}
      {moving && (
        <MoveSheet
          open
          onClose={() => setMoving(null)}
          waiting={moving}
          all={all}
          weeks={ws}
          monday={monday}
          subtitle={moving.length === 1 ? `${moving[0]!.title} — куда поставить?` : undefined}
        />
      )}
    </>
  )
}

/** Шаг 4 · Работа: tasks without movement for 14+ days (rule 9), who to nudge (rule 10), a success of the week. */
export function WorkStep({ note, onNote }: { note: string; onNote: (v: string) => void }) {
  const today = todayBerlin()
  const items = useItems()
  const people = usePeople()
  const update = useUpdateItem()
  const navigate = useNavigate()
  const [erfolg, setErfolg] = useState(false)
  if (items.isPending || people.isPending) return <SkeletonCard />
  const work = (items.data ?? []).filter((i) => i.sphere === 'work')
  const stale = work.filter((i) => isItemOpen(i) && statusAltDays(i, today) !== null)
  const waiting = nachhaken(work, (people.data ?? []).map((p) => p.name), today)
  const inWork = work.filter((i) => i.status === 'In Arbeit').length
  return (
    <>
      <Card>
        <CardHeader title="Status alt" dotClass="bg-work" context={stale.length ? `${stale.length}` : undefined} />
        {stale.length === 0 ? (
          <p className="m-0 text-cap text-ink2">Всё двигалось за последние две недели.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {stale.map((i) => (
              <li key={i.id} className="flex min-h-12 items-center gap-2 border-t border-line first:border-t-0">
                <button type="button" onClick={() => navigate(`/item/${i.id}`)} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left">
                  <span lang="de" className="text-base [overflow-wrap:anywhere]">
                    {i.title}
                  </span>
                  <span className="text-cap text-ink2">
                    <span lang="de">{i.status}</span> · {statusAltDays(i, today)} дн без изменений
                  </span>
                </button>
                <button
                  type="button"
                  className="h-11 flex-none rounded-xl border border-line2 px-3 text-cap font-semibold active:bg-sub"
                  onClick={() => update.mutate({ id: i.id, patch: { updated_at: new Date().toISOString() } })}
                >
                  Актуально
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Bei wem nachhaken" dotClass="bg-work" />
        {waiting.length === 0 ? (
          <p className="m-0 text-cap text-ink2">Никого не ждём.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {waiting.map((w) => (
              <li key={w.name} className="flex min-h-11 items-center justify-between rounded-xl bg-sub px-3 text-base">
                <span lang="de">{w.name}</span>
                <span className="text-cap text-ink2 tabular-nums">
                  {w.count > 1 ? `${w.count} · ` : ''}ждём {w.days} дн
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="m-0 text-cap text-ink2">В работе сейчас: {inWork}.</p>
      </Card>
      <Button variant="secondary" icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />} onClick={() => setErfolg(true)}>
        Записать Erfolg
      </Button>
      <Note label="Главное за неделю" value={note} onChange={onNote} />
      <ErfolgSheet open={erfolg} onClose={() => setErfolg(false)} today={today} />
    </>
  )
}

/** Шаг 5 · Неделя вперёд: place and events, study load, what is due, planned money, a thought for the week. */
export function AheadStep({ monday, thought, onThought }: { monday: ISODate; thought: string; onThought: (v: string) => void }) {
  const items = useItems()
  const weeks = useAllWeeks()
  const txs = useAllTransactions()
  const stages = useStages()
  if (items.isPending || weeks.isPending || txs.isPending) return <SkeletonCard />
  const ws = weeks.data ?? []
  const week = ws.find((w) => w.start_date === monday) ?? null
  const all = items.data ?? []
  const load = weekLoad(plannedItems(studyItemsOfWeek(all, monday, week?.id ?? null)), weekCapacity(week))
  const agenda = nextWeekAgenda(all, monday)
  const sunday = addDaysISO(monday, 6)
  const money = upcomingPlanned(txs.data ?? [], addDaysISO(monday, -1)).filter((t) => t.date <= sunday && !isWeekRow(t))
  const newStage = (stages.data ?? []).find((s) => s.sphere === 'body' && s.start_date >= monday && s.start_date <= sunday)
  return (
    <>
      <Card>
        <CardHeader title="Неделя" context={[week?.budget_week_no ? `бюджет ${week.budget_week_no}` : null, week?.study_week, week?.glowup_week_no ? `глоу-ап ${week.glowup_week_no}` : null].filter(Boolean).join(' · ') || undefined} />
        {week?.place_mode && <p className="m-0 text-base">Где: {week.place_mode}</p>}
        {week?.events && <p className="m-0 text-cap text-ink2">{week.events}</p>}
        <p className="m-0 text-base tabular-nums">
          Учёба в плане: {formatHours(load.hours)} — {LOAD_LABEL[load.status]}
        </p>
        {newStage && <p className="m-0 text-cap text-ink2">С {formatWeekdayDate(newStage.start_date)} начинается этап «{newStage.name}».</p>}
      </Card>
      <Card>
        <CardHeader title="В планах" context={agenda.length ? `${agenda.length}` : undefined} />
        {agenda.length === 0 ? (
          <p className="m-0 text-cap text-ink2">Сроков и встреч на неделе нет. Спокойная неделя.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {agenda.map(({ item, date, kind }) => {
              const sphere = (item.sphere in SPHERE_LABEL ? item.sphere : 'personal') as Sphere
              return (
                <li key={item.id + kind} className="flex min-h-11 items-center gap-2 border-t border-line text-base first:border-t-0">
                  <span className={`size-2 flex-none rounded-full ${SPHERE_CLASS[sphere].dot}`} />
                  <span className="w-16 flex-none text-cap text-ink2 tabular-nums">{formatWeekdayDate(date)}</span>
                  <span lang={sphere === 'work' || sphere === 'study' ? 'de' : undefined} className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    {item.title}
                  </span>
                  {kind !== 'day' && <MetaChip kind={kind === 'start' ? 'from' : 'flag'} text={kind === 'start' ? 'начало' : 'срок'} />}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      {money.length > 0 && (
        <Card>
          <CardHeader title="Деньги по плану" dotClass="bg-money" />
          <ul className="m-0 flex list-none flex-col p-0">
            {money.map((t) => (
              <li key={t.id} className="flex min-h-11 items-center gap-2 border-t border-line text-base first:border-t-0">
                <span className="w-16 flex-none text-cap text-ink2 tabular-nums">{formatWeekdayDate(t.date)}</span>
                <span lang="de" className="min-w-0 flex-1">
                  {t.title}
                </span>
                <span className="tabular-nums">{`${t.kind === 'income' ? '+' : '−'}${formatEur(toCents(t.amount_eur), { whole: true })}`}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <BackupReminder />
      <Note label="Мысль на неделю" value={thought} onChange={onThought} placeholder="Одна фраза — что важно не потерять" />
    </>
  )
}

/** Free Supabase keeps no backups: the review reminds to download one when the last export is older than 7 days. */
function BackupReminder() {
  const toast = useToast()
  const [last, setLast] = useState(lastExport)
  const [busy, setBusy] = useState(false)
  const [now] = useState(() => new Date())
  if (!backupDue(last, now)) return null
  const days = backupAgeDays(last, now)
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4" aria-label="Бэкап">
      <div className="flex items-center gap-3">
        <IconTile icon={DatabaseBackup} sphere="personal" />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">Скачать бэкап (JSON)</div>
          <div className="text-cap text-ink2">
            {days === null ? 'С этого телефона бэкапа ещё не было.' : `Последний — ${days} ${plural(days, ['день', 'дня', 'дней'])} назад.`} Все данные только в базе — копия на
            всякий случай.
          </div>
        </div>
      </div>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void downloadBackup()
            .then((rows) => {
              toast({ text: `Бэкап готов · ${rows} строк` })
              setLast(lastExport())
            })
            .catch(() => toast({ text: 'Не получилось — проверь сеть и попробуй ещё раз' }))
            .finally(() => setBusy(false))
        }}
      >
        {busy ? 'Собираю…' : 'Скачать бэкап'}
      </Button>
    </section>
  )
}
