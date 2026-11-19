import { useState, type ReactNode } from 'react'
import { Check, Circle, CircleDot, Repeat, Stethoscope } from 'lucide-react'
import { Link } from 'react-router'
import { useAddAction, useOpenAdd } from '@/app/addSheetContext'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { OverdueTag } from '@/components/ui/CheckItem'
import { cn } from '@/components/ui/cn'
import { formatDayMonth, todayBerlin, type ISODate } from '@/lib/dates'
import { chainSteps, repeatLine, taskGroups } from '@/lib/rules/health'
import { targetDate } from '@/lib/rules/items'
import { useItems, useUpdateItem, type Item } from '@/features/items/api'
import { donePatch, reopenPatch } from '@/features/items/donePatch'
import { ItemRow } from '@/features/items/ItemRow'
import { useItemSeries, type ItemSeries } from './healthApi'

/**
 * Тело → Здоровье → Задачи и визиты (step 5): «Ждёт ответа», «Просрочено», «Ближайшие 2 недели», «Позже» (folded);
 * a repeat as one line («Замеры · каждые 4 недели · следующие …»), chains — body comp and doctors — as cards of steps.
 */
export function HealthTasks() {
  const today = todayBerlin()
  const items = useItems()
  const series = useItemSeries()
  const update = useUpdateItem()
  const openAdd = useOpenAdd()
  const [laterOpen, setLaterOpen] = useState(false)
  useAddAction(() => openAdd('body'))
  if (items.isPending || series.isPending) return <SkeletonCard />
  const body = (items.data ?? []).filter((i) => i.sphere === 'body')
  const groups = taskGroups(body, today)
  const list = (series.data ?? []).filter((s) => !s.archived_at && s.sphere === 'body')
  const repeats = list.filter((s) => s.kind === 'repeat')
  const chains = list.filter((s) => s.kind === 'chain').filter((s) => chainSteps(s, body).some((x) => x.state === 'current'))
  const toggle = (i: Item) => update.mutate({ id: i.id, patch: i.done_at ? reopenPatch(null, 'body') : donePatch('body') })
  const rows = (xs: Item[]) => xs.map((i) => <ItemRow key={i.id} item={i} today={today} showSphere={false} meta={i.type ?? undefined} onToggle={() => toggle(i)} />)
  const nothing = !groups.waiting.length && !groups.overdue.length && !groups.soon.length && !groups.later.length && !chains.length && !repeats.length

  if (nothing) return <EmptyState title="Открытых задач нет">Визит к врачу или покупка к сроку — через «+».</EmptyState>
  return (
    <>
      {groups.waiting.length > 0 && <Group title="Ждёт ответа">{rows(groups.waiting)}</Group>}
      {groups.overdue.length > 0 && <Group title="Просрочено">{rows(groups.overdue)}</Group>}
      {repeats.map((s) => (
        <RepeatLine key={s.id} series={s} items={body} today={today} />
      ))}
      {chains.map((s) => (
        <ChainCard key={s.id} series={s} items={body} today={today} onToggle={toggle} />
      ))}
      {groups.soon.length > 0 && <Group title="Ближайшие 2 недели">{rows(groups.soon)}</Group>}
      {groups.later.length > 0 && (
        <Card>
          <GroupHeader title="Позже" count={groups.later.length} open={laterOpen} onToggle={() => setLaterOpen(!laterOpen)} />
          {laterOpen && <div className="flex flex-col gap-2">{rows(groups.later)}</div>}
        </Card>
      )}
    </>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} dotClass="bg-body" />
      <div className="flex flex-col gap-2">{children}</div>
    </Card>
  )
}

/** «Замеры · каждые 4 недели · следующие 17.12, 14.01» — one line; the dates are on «Замеры». */
function RepeatLine({ series, items, today }: { series: ItemSeries; items: Item[]; today: ISODate }) {
  const { next } = repeatLine(series, items, today)
  if (!next.length) return null
  return (
    <Link to="/body/health/measure" className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-card px-4 text-ink no-underline">
      <Repeat size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink2" />
      <span className="min-w-0 flex-1">
        <span className="block text-base">{series.title}</span>
        <span className="block text-cap text-ink2">
          {[series.cadence, `следующие ${next.slice(0, 2).map((i) => formatDayMonth(i.happens_on!)).join(', ')}`].filter(Boolean).join(' · ')}
        </span>
      </span>
    </Link>
  )
}

const STEP_LABEL: Record<string, string> = { записаться: 'Записаться', визит: 'Визит', анализы: 'Анализы', результаты: 'Результаты', сделать: 'Сделать' }

/** A doctor or body comp: the steps in order, the current one with a tick; done ones fade, a cancelled one is struck. */
function ChainCard({ series, items, today, onToggle }: { series: ItemSeries; items: Item[]; today: ISODate; onToggle: (i: Item) => void }) {
  const steps = chainSteps(series, items)
  return (
    <Card>
      <CardHeader title={series.title} icon={<Stethoscope size={20} strokeWidth={1.75} aria-hidden="true" className="text-ink2" />} />
      <ol className="m-0 flex list-none flex-col p-0" aria-label={`${series.title}: шаги`}>
        {steps.map(({ item, state }) => {
          const target = targetDate(item) ?? item.happens_on ?? item.starts_on
          const overdue = state === 'current' && target !== null && target !== undefined && target < today
          return (
            <li key={item.id} className="flex min-h-11 items-center gap-3">
              {state === 'current' ? (
                <button type="button" role="checkbox" aria-checked={false} aria-label={`${item.title}: сделано`} onClick={() => onToggle(item)} className="-ml-2 flex size-11 flex-none items-center justify-center">
                  <CircleDot size={22} strokeWidth={1.75} aria-hidden="true" className="text-body" />
                </button>
              ) : state === 'done' ? (
                <Check size={22} strokeWidth={2} aria-hidden="true" className="flex-none text-body" />
              ) : (
                <Circle size={22} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
              )}
              <Link to={`/item/${item.id}`} className={cn('flex min-w-0 flex-1 flex-col no-underline', state === 'current' ? 'text-ink' : 'text-ink3', state === 'cancelled' && 'line-through')}>
                <span className="text-base">{STEP_LABEL[item.step ?? 'сделать'] ?? item.step}</span>
                <span className="text-cap">
                  {item.title}
                  {target ? ` · ${formatDayMonth(target)}` : ''}
                </span>
              </Link>
              {overdue && <OverdueTag>срок прошёл</OverdueTag>}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
