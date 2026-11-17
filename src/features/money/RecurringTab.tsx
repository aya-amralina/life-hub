import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useAddAction } from '@/app/addSheetContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { cn } from '@/components/ui/cn'
import { formatDayMonth, todayBerlin, type ISODate } from '@/lib/dates'
import { formatEur, toCents } from '@/lib/format'
import { forecastEnd } from '@/lib/rules/money'
import { describeRule, linkCandidates, nextOccurrence, ruleState } from '@/lib/rules/recurring'
import { useAllTransactions, useRecurring, type Recurring } from './api'
import { RecurringLinkSheet } from './RecurringLinkSheet'
import { RecurringSheet } from './RecurringSheet'

const signed = (r: Recurring) => {
  const c = toCents(r.amount_eur)
  return r.kind === 'income' ? `+${formatEur(c, { whole: true })}` : r.kind === 'expense' ? `−${formatEur(c, { whole: true })}` : formatEur(c, { whole: true })
}

/**
 * Регулярные (decision 16.11.2026): rules that put an operation into the plan on a schedule — salary, rent,
 * subscriptions. Active ones by their next date, paused after them, ended folded («Закончились · N»).
 */
export function RecurringTab() {
  const today = todayBerlin()
  const rules = useRecurring()
  const txs = useAllTransactions()
  // the rule sheet: null — closed, 'new' — a new rule, else the one being edited
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null)
  const [endedOpen, setEndedOpen] = useState(false)
  // «Уже есть в плане» for a rule: right after a new one is saved, or from its sheet
  const [linking, setLinking] = useState<Recurring | null>(null)
  useAddAction(() => setEditing('new'))

  if (rules.isPending || txs.isPending) return <SkeletonCard />
  const all = rules.data ?? []
  const tx = txs.data ?? []
  const end = forecastEnd(today)
  const sheet = (
    <>
      <RecurringSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        rule={editing === 'new' ? null : editing}
        txs={tx}
        onCreated={(r) => linkCandidates(r, tx, end).length > 0 && setLinking(r)}
        onLink={(r) => {
          setEditing(null)
          setLinking(r)
        }}
      />
      <RecurringLinkSheet rule={linking} txs={tx} onClose={() => setLinking(null)} />
    </>
  )

  if (!all.length) {
    return (
      <>
        <EmptyState title="Регулярных пока нет">
          <span className="flex flex-col items-start gap-3">
            Зарплата, аренда, подписки: заведи один раз, и они встанут в план до {formatDayMonth(end)}. В свой день спрошу «Пришло?» или «Списалось?», как у обычных операций.
            <Button variant="secondary" onClick={() => setEditing('new')}>
              Новый регулярный платёж
            </Button>
          </span>
        </EmptyState>
        {sheet}
      </>
    )
  }

  const next = new Map(all.map((r) => [r.id, nextOccurrence(r, tx, today, end)]))
  const current = all
    .filter((r) => ruleState(r, today) !== 'ended')
    .sort((a, b) => Number(b.active) - Number(a.active) || (next.get(a.id) ?? '9999').localeCompare(next.get(b.id) ?? '9999') || a.title.localeCompare(b.title))
  const ended = all.filter((r) => ruleState(r, today) === 'ended')

  return (
    <>
      <Card>
        <CardHeader title={`В плане до ${formatDayMonth(end)}`} dotClass="bg-money" context={`${current.filter((r) => r.active).length}`} />
        {current.length === 0 && <p className="m-0 text-cap text-ink2">Действующих нет — все закончились.</p>}
        <ul className="m-0 flex list-none flex-col p-0">
          {current.map((r) => (
            <RuleRow key={r.id} r={r} next={next.get(r.id) ?? null} today={today} onOpen={() => setEditing(r)} />
          ))}
        </ul>
        {ended.length > 0 && (
          <>
            <GroupHeader title="Закончились" count={ended.length} open={endedOpen} onToggle={() => setEndedOpen(!endedOpen)} />
            {endedOpen && (
              <ul className="m-0 flex list-none flex-col p-0">
                {ended.map((r) => (
                  <RuleRow key={r.id} r={r} next={null} today={today} muted onOpen={() => setEditing(r)} />
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
      {sheet}
    </>
  )
}

function RuleRow({ r, next, today, muted = false, onOpen }: { r: Recurring; next: ISODate | null; today: ISODate; muted?: boolean; onOpen: () => void }) {
  const when = muted
    ? `закончился ${formatDayMonth(r.end_date ?? today)}`
    : !r.active
      ? 'на паузе'
      : next
        ? `след. ${formatDayMonth(next)}`
        : r.end_date
          ? `до ${formatDayMonth(r.end_date)}`
          : null
  return (
    <li className="border-t border-line first:border-t-0">
      <button type="button" onClick={onOpen} className="flex min-h-12 w-full items-center gap-3 py-1 text-left active:bg-sub">
        <span className="min-w-0 flex-1">
          <span lang="de" className={cn('block text-base [overflow-wrap:anywhere]', (muted || !r.active) && 'text-ink3')}>
            {r.title}
          </span>
          <span className="block text-cap text-ink2">{[describeRule(r), r.account, when].filter(Boolean).join(' · ')}</span>
        </span>
        <span className={cn('text-base tabular-nums', (muted || !r.active) && 'text-ink3')}>{signed(r)}</span>
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
      </button>
    </li>
  )
}
