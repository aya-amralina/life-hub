import { useState } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { WeekSwitcher } from '@/components/ui/WeekSwitcher'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { FACE_EVENING, WORKOUT_MINUTES, WORKOUT_TYPES } from '@/lib/constants'
import { addDaysISO, formatDayMonth, formatRelativeDay, todayBerlin, weekStart, type ISODate } from '@/lib/dates'
import { activeHabits, stageForDate, weekHabitShare } from '@/lib/rules/habits'
import { NotesCard } from '@/features/notes/NotesCard'
import { useDailyLog, useSaveDailyLog, useStages, useWeekLogs } from './api'
import { EveningCard } from './EveningCard'
import { HABIT_META } from './habitMeta'
import { HabitsCard } from './HabitsCard'

const TABS = [
  { value: 'day', label: 'Отметка дня' },
  { value: 'stage', label: 'Этап' },
] as const

export function BodyScreen() {
  const [tab, setTab] = useState<'day' | 'stage'>('day')
  return (
    <>
      <ScreenHeader title="Тело" />
      <SegmentedTabs label="Раздел" segments={TABS} value={tab} onChange={setTab} />
      {tab === 'day' ? <DayTab /> : <StageTab />}
      <NotesCard sphere="body" />
    </>
  )
}

function DayTab() {
  const today = todayBerlin()
  const [date, setDate] = useState<ISODate>(today)
  return (
    <>
      <WeekSwitcher
        label={`${formatRelativeDay(date, today)}${date === today ? `, ${formatDayMonth(date)}` : ''}`}
        onPrev={() => setDate(addDaysISO(date, -1))}
        onNext={() => setDate(addDaysISO(date, 1))}
        nextDisabled={date >= today}
        onReset={date !== today ? () => setDate(today) : undefined}
        resetLabel="Сегодня"
      />
      <HabitsCard date={date} />
      <MovementCard date={date} />
      <CareCard date={date} />
      <EveningCard date={date} title="Самочувствие" />
      <MinimumCard date={date} />
      <WeekShare date={date} />
    </>
  )
}

function MovementCard({ date }: { date: ISODate }) {
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)
  if (log.isPending) return <SkeletonCard />
  const type = log.data?.workout_type ?? null
  const min = log.data?.workout_min ?? null
  return (
    <Card>
      <CardHeader title="Движение" dotClass="bg-body" context={type ? `${type}${min ? ` · ${min} мин` : ''}` : undefined} />
      <div className="flex flex-wrap gap-2">
        {WORKOUT_TYPES.map((t) => (
          <Chip key={t} selected={type === t} onClick={() => save.mutate({ workout_type: type === t ? null : t })}>
            {t}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Минут">
        {WORKOUT_MINUTES.map((m) => (
          <Chip key={m} selected={min === m} onClick={() => save.mutate({ workout_min: min === m ? null : m })}>
            {m} мин
          </Chip>
        ))}
      </div>
    </Card>
  )
}

function CareCard({ date }: { date: ISODate }) {
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)
  if (log.isPending) return <SkeletonCard />
  const cream = log.data?.body_cream ?? false
  const face = log.data?.face_evening ?? null
  return (
    <Card>
      <CardHeader title="Уход" dotClass="bg-body" />
      <div className="flex flex-wrap gap-2">
        <Chip selected={cream} onClick={() => save.mutate({ body_cream: !cream })}>
          Крем для тела
        </Chip>
      </div>
      <div className="text-cap text-ink2">Вечер: лицо</div>
      <div className="flex flex-wrap gap-2">
        {FACE_EVENING.map((f) => (
          <Chip key={f} selected={face === f} onClick={() => save.mutate({ face_evening: face === f ? null : f })}>
            {f}
          </Chip>
        ))}
      </div>
    </Card>
  )
}

function MinimumCard({ date }: { date: ISODate }) {
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)
  const [note, setNote] = useState<string | null>(null)
  if (log.isPending) return <SkeletonCard />
  const minimum = log.data?.minimum_mode ?? false
  const saved = log.data?.note ?? ''
  return (
    <Card>
      <CardHeader title="Режим «минимум»" context={minimum ? 'день засчитан' : undefined} />
      <p className="m-0 text-cap text-ink2">Тяжёлый день? Минимум засчитывает его целиком. Пропуск — это сигнал, а не провал.</p>
      <div>
        <Chip selected={minimum} onClick={() => save.mutate({ minimum_mode: !minimum })}>
          Сегодня минимум
        </Chip>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-cap font-semibold text-ink2">Заметка дня</span>
        <textarea
          rows={3}
          value={note ?? saved}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (note !== null && note !== saved) save.mutate({ note: note.trim() || null })
            setNote(null)
          }}
          className="rounded-xl border border-line2 bg-card px-4 py-3 text-base text-ink outline-none focus:border-ink2"
        />
      </label>
    </Card>
  )
}

function WeekShare({ date }: { date: ISODate }) {
  const monday = weekStart(date)
  const logs = useWeekLogs(monday)
  const stages = useStages()
  if (!logs.data || !stages.data) return null
  // Elapsed days run up to today (a finished week counts all 7 — the rule caps it).
  const share = weekHabitShare(logs.data, stages.data, monday, todayBerlin())
  if (share === null) return null
  return (
    <p className="m-0 text-cap text-ink2">
      Неделя: {Math.round(share * 100)} % привычек отмечено. Без стриков — каждый день с чистого листа.
    </p>
  )
}

function StageTab() {
  const today = todayBerlin()
  const stages = useStages()
  if (stages.isPending) return <SkeletonCard />
  const list = stages.data ?? []
  const current = list.length ? stageForDate(list, today) : null
  const next = list.find((s) => s.sphere === 'body' && s.start_date > today)

  if (!list.length) {
    return (
      <EmptyState title="Этапов пока нет">
        Они придут из глоу-ап трекера на этапе импорта. А пока считаются все три привычки.
      </EmptyState>
    )
  }

  return (
    <>
      {current ? (
        <Card>
          <CardHeader title={current.name} dotClass="bg-body" context={`${formatDayMonth(current.start_date)}–${formatDayMonth(current.end_date)}`} />
          <div className="text-cap text-ink2">Привычки этапа</div>
          <div className="flex flex-wrap gap-2">
            {activeHabits(current).map((k) => (
              <span key={k} className="inline-flex h-8 items-center rounded-lg bg-sub px-3 text-cap text-ink">
                {HABIT_META[k].label}
              </span>
            ))}
          </div>
          {Object.keys(current.targets as object).length > 0 && (
            <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-base">
              {Object.entries(current.targets as Record<string, unknown>).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink2">{k}</dt>
                  <dd className="m-0 text-right tabular-nums">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      ) : (
        <EmptyState title="Сейчас нет активного этапа">Привычки считаются все три.</EmptyState>
      )}
      {next && (
        <EmptyState title={`Дальше: ${next.name}`}>
          {`С ${formatDayMonth(next.start_date)}. Новые привычки появятся сами, когда этап начнётся.`}
        </EmptyState>
      )}
    </>
  )
}
