import { useState } from 'react'
import { ChartCard } from '@/components/charts/ChartCard'
import { HeatGrid } from '@/components/charts/HeatGrid'
import { XYChart } from '@/components/charts/Chart'
import { ChartLegend } from '@/components/charts/chartParts'
import { formatChartNumber as chartNumber } from '@/lib/format'
import { Chip } from '@/components/ui/Chip'
import { SkeletonCard } from '@/components/ui/Feedback'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { addDaysISO, formatDayMonth, todayBerlin, weekStart } from '@/lib/dates'
import { activityPoints, weekPointsTarget } from '@/lib/rules/activities'
import { activityWeeks, habitCalendar, intakeBands, repsSeries, wellbeingSeries, type Period } from '@/lib/rules/charts'
import { useActivities, useActivityTypes, useIntake, useStrengthSets } from './activityApi'
import { useLogsSince, useStages } from './api'

const PERIODS = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
] as const

/** Тело → Графики (SPEC §5): wellbeing, habit calendar, activity score vs target, reps growth. */
export function BodyCharts() {
  return (
    <>
      <WellbeingCard />
      <HabitsGridCard />
      <ActivityCard />
      <RepsCard />
    </>
  )
}

function WellbeingCard() {
  const today = todayBerlin()
  const [period, setPeriod] = useState<Period>('day')
  const [withIntake, setWithIntake] = useState(false)
  const logs = useLogsSince(addDaysISO(today, -190))
  const intake = useIntake()
  if (logs.isPending) return <SkeletonCard />
  const data = wellbeingSeries(logs.data ?? [], today, period)
  const marked = (logs.data ?? []).filter((l) => l.mood !== null || l.energy !== null || l.sleep_h !== null).length
  const bands = withIntake ? intakeBands(intake.data ?? [], data, today) : []
  return (
    <ChartCard title="Самочувствие" dotClass="bg-body" context={period === 'day' ? '14 дней' : period === 'week' ? 'средние за неделю' : 'средние за месяц'}>
      <SegmentedTabs label="Период" segments={PERIODS} value={period} onChange={setPeriod} />
      <XYChart
        label="Настроение, энергия и сон"
        data={data}
        height={184}
        empty={marked < 3}
        emptyText="Мало данных — график появится через неделю отметок"
        lines={[
          { key: 'mood', name: 'Настроение', color: 'body' },
          { key: 'energy', name: 'Энергия', color: 'body', dash: true },
        ]}
        bars={[{ key: 'sleep', name: 'Сон', color: 'body', axis: 'right', unit: ' ч' }]}
        yLeft={{ domain: [1, 10], ticks: [1, 5, 10] }}
        yRight={{ domain: [0, 10], ticks: [0, 5, 10], unit: ' ч' }}
        bands={bands}
        todayKey={period === 'day' ? today : undefined}
      />
      <ChartLegend
        items={[
          { name: 'Настроение', color: 'body', kind: 'line' },
          { name: 'Энергия', color: 'body', kind: 'dash' },
          { name: 'Сон, часы — правая ось', color: 'body', kind: 'bar' },
        ]}
      />
      <div className="flex items-center gap-3">
        <Chip selected={withIntake} onClick={() => setWithIntake(!withIntake)} className="flex-none">
          Показать приём
        </Chip>
        <span className="text-cap text-ink2">Шкала 1–10. Разрыв — день без отметки, не ноль.</span>
      </div>
      {withIntake && !bands.length && <p className="m-0 text-cap text-ink2">В этом периоде приёма нет.</p>}
    </ChartCard>
  )
}

function HabitsGridCard() {
  const today = todayBerlin()
  const logs = useLogsSince(addDaysISO(weekStart(today), -12 * 7))
  const stages = useStages()
  if (logs.isPending || stages.isPending) return <SkeletonCard />
  const cells = habitCalendar(logs.data ?? [], stages.data ?? [], today)
  return (
    <ChartCard title="Календарь привычек" dotClass="bg-body" context="13 недель">
      <HeatGrid
        label="Календарь привычек"
        cells={cells}
        cols={13}
        rows={7}
        flow="column"
        cell={[20, 20]}
        color="body"
        mix={[0, 30, 60, 100]}
        rowLabels={['Пн', '', 'Ср', '', 'Пт', '', 'Вс']}
        hint="Нажми на день — покажу, что отмечено"
        legend={[
          { level: 0, text: '0' },
          { level: 1, text: '1' },
          { level: 2, text: '2' },
          { level: 3, text: '3 из 3' },
        ]}
      />
    </ChartCard>
  )
}

function ActivityCard() {
  const today = todayBerlin()
  const activities = useActivities()
  const types = useActivityTypes()
  const stages = useStages()
  if (activities.isPending || types.isPending || stages.isPending) return <SkeletonCard />
  const all = activities.data ?? []
  const typeList = types.data ?? []
  const weeks = activityWeeks(all, typeList, stages.data ?? [], today, weekPointsTarget)
  const hasTarget = weeks.some((w) => w.target !== null)
  const recent = [...all].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)
  return (
    <ChartCard title="Очки активности" dotClass="bg-body" context="по неделям">
      <XYChart
        label="Очки активности по неделям"
        data={weeks}
        empty={!all.length}
        emptyText="Пока ни одной активности — первая появится здесь"
        bars={[{ key: 'points', name: 'Очки', color: 'body' }]}
        lines={hasTarget ? [{ key: 'target', name: 'Цель', color: 'ink2', dash: true }] : []}
        yLeft={{ domain: [0, 'auto'] }}
      />
      {hasTarget && (
        <ChartLegend
          items={[
            { name: 'Очки недели', color: 'body', kind: 'line' },
            { name: 'Цель этапа', color: 'ink2', kind: 'dash' },
          ]}
        />
      )}
      {recent.length > 0 && (
        <table className="w-full border-collapse text-cap tabular-nums">
          <thead>
            <tr className="text-ink2">
              <th className="py-1 text-left font-normal">День</th>
              <th className="py-1 text-left font-normal">Что</th>
              <th className="py-1 text-right font-normal">Мин</th>
              <th className="py-1 text-right font-normal">Очки</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((a) => {
              const t = typeList.find((x) => x.id === a.type_id)
              return (
                <tr key={a.id} className="border-t border-line">
                  <td className="py-2">{formatDayMonth(a.date)}</td>
                  <td className="py-2">{t?.name ?? '—'}</td>
                  <td className="py-2 text-right">{a.minutes ?? '—'}</td>
                  <td className="py-2 text-right font-semibold">{chartNumber(t ? activityPoints(a.minutes, t.points_per_10min) : 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </ChartCard>
  )
}

function RepsCard() {
  const sets = useStrengthSets()
  const [picked, setPicked] = useState<string | null>(null)
  if (sets.isPending) return <SkeletonCard />
  const list = sets.data ?? []
  const exercises = [...new Set(list.map((s) => s.exercise))]
  const exercise = picked ?? exercises[0] ?? null
  const data = exercise ? repsSeries(list, exercise) : []
  return (
    <ChartCard title="Рост повторов" dotClass="bg-body" context={exercise ?? undefined}>
      {exercises.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {exercises.map((x) => (
            <Chip key={x} selected={x === exercise} onClick={() => setPicked(x)} className="flex-none">
              {x}
            </Chip>
          ))}
        </div>
      )}
      <XYChart
        label="Повторы за тренировку"
        data={data}
        empty={data.length < 2}
        emptyText="Мало данных — график появится после второй тренировки с этим упражнением"
        lines={[{ key: 'reps', name: 'Повторов', color: 'body' }]}
        yLeft={{ domain: [0, 'auto'] }}
      />
    </ChartCard>
  )
}
