import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatAmount, formatEur } from '@/lib/format'
import type { MoneyWeek } from '@/lib/rules/money'

/** «32 из 50 €» + bar; over the limit — amber bar and the sum with a caption. */
export function MoneyTotal({ summary }: { summary: MoneyWeek }) {
  const over = summary.deviationCents > 0
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-title font-semibold">{formatAmount(summary.spentCents, { whole: true })}</span>
        <span className="text-base text-ink2">из {formatEur(summary.limitCents, { whole: true })}</span>
      </div>
      <ProgressBar value={summary.spentCents} max={summary.limitCents} fillClass="bg-money" label="Лимит недели" />
      {over ? (
        <div className="text-cap font-semibold text-amber-ink tabular-nums">+{formatEur(summary.deviationCents)} сверх лимита</div>
      ) : (
        <div className="text-cap text-ink2 tabular-nums">осталось {formatEur(-summary.deviationCents)}</div>
      )}
    </div>
  )
}
