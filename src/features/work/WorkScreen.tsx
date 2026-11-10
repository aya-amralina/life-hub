import { useState } from 'react'
import { ChevronDown, Hourglass } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { todayBerlin } from '@/lib/dates'
import { groupByStatus, nachhaken } from '@/lib/rules/work'
import { NotesCard } from '@/features/notes/NotesCard'
import { useItems, useUpdateItem, type Item } from '@/features/items/api'
import { StatusSheet } from './StatusSheet'
import { WorkRow } from './WorkRow'
import { statusPatch } from './statusPatch'

const CLOSED = ['Erledigt', 'Verworfen']

export function WorkScreen() {
  const today = todayBerlin()
  const items = useItems()
  const update = useUpdateItem()
  const toast = useToast()
  const [picking, setPicking] = useState<Item | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  const work = (items.data ?? []).filter((i) => i.sphere === 'work')
  const groups = groupByStatus(work)
  const open = groups.filter((g) => !CLOSED.includes(g.status))
  const closed = groups.filter((g) => CLOSED.includes(g.status))
  const closedCount = closed.reduce((s, g) => s + g.items.length, 0)
  const waiting = nachhaken(work, [], today)

  const pick = (status: string) => {
    if (!picking) return
    const item = picking
    const before = item.status ?? 'Offen'
    setPicking(null)
    if (status === before) return
    update.mutate({ id: item.id, patch: statusPatch(status) })
    toast({ text: `${status}`, actionLabel: 'Отменить', onAction: () => update.mutate({ id: item.id, patch: statusPatch(before) }) })
  }

  return (
    <>
      <ScreenHeader title="Работа" eyebrow="Localiser" />
      {items.isPending ? (
        <SkeletonCard />
      ) : work.length === 0 ? (
        <EmptyState title="Задач пока нет">Они придут из «Dev Aufgaben» на этапе импорта. Новую можно добавить через «+».</EmptyState>
      ) : (
        <>
          {waiting.length > 0 && (
            <Card>
              <CardHeader title="Bei wem nachhaken" icon={<Hourglass size={20} strokeWidth={1.75} aria-hidden="true" className="text-ink2" />} />
              <div className="flex flex-wrap gap-2">
                {waiting.map((w) => (
                  <span key={w.name} lang="de" className="inline-flex h-8 items-center gap-2 rounded-lg bg-sub px-3 text-cap text-ink tabular-nums">
                    {w.name} <span className="text-ink2">{w.count > 1 ? `${w.count} · ` : ''}{w.days} дн</span>
                  </span>
                ))}
              </div>
            </Card>
          )}
          {open.map((g) => (
            <section key={g.status} className="flex flex-col gap-2" aria-label={g.status}>
              <div className="flex items-center gap-2 pt-2">
                <StatusBadge status={g.status} />
                <span className="text-cap text-ink2 tabular-nums">{g.items.length}</span>
              </div>
              {g.items.map((i) => (
                <WorkRow key={i.id} item={i} today={today} showStatus={false} onOpen={() => setPicking(i)} />
              ))}
            </section>
          ))}
          {closedCount > 0 &&
            (showClosed ? (
              closed.map((g) => (
                <section key={g.status} className="flex flex-col gap-2" aria-label={g.status}>
                  <div className="flex items-center gap-2 pt-2">
                    <StatusBadge status={g.status} />
                    <span className="text-cap text-ink2 tabular-nums">{g.items.length}</span>
                  </div>
                  {g.items.map((i) => (
                    <WorkRow key={i.id} item={i} today={today} showStatus={false} onOpen={() => setPicking(i)} />
                  ))}
                </section>
              ))
            ) : (
              <Button variant="quiet" className="-ml-3 self-start" onClick={() => setShowClosed(true)}>
                Закрытые · {closedCount}
                <ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" />
              </Button>
            ))}
        </>
      )}
      <NotesCard sphere="work" />
      <StatusSheet item={picking} onClose={() => setPicking(null)} onPick={pick} />
    </>
  )
}
