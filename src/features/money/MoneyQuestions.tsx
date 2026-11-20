import { ChevronRight, Wallet } from 'lucide-react'
import { Link } from 'react-router'
import { useToast } from '@/app/toastContext'
import { QuestionCard } from '@/components/ui/QuestionCard'
import { dayChipLabel, formatWeekdayDate, todayBerlin } from '@/lib/dates'
import { formatEur, toCents } from '@/lib/format'
import { plannedQuestions } from '@/lib/rules/money'
import { paydayRule } from '@/lib/rules/periods'
import { confirmPatch, unconfirmPatch } from '@/lib/rules/operation'
import { useAccountName, useAccounts, useAnswerPlanned, usePlanTransactions, useRecurring, type PlanTx } from './api'

/**
 * Rule 18: a planned operation whose day has come asks once — income «Пришло?», expense «Списалось?».
 * Confirm (the amount can be corrected), another date, or cancel (out of the plan). Stands first until answered.
 */
export function MoneyQuestions({ only }: { only?: number } = {}) {
  const accountName = useAccountName()
  const today = todayBerlin()
  const txs = usePlanTransactions()
  const answerPlanned = useAnswerPlanned()
  const toast = useToast()
  // the salary (day of money, phase 6) also offers to distribute it
  const salaryRule = paydayRule(useRecurring().data ?? [], useAccounts().data ?? [])
  const list = plannedQuestions(txs.data ?? [], today).filter((_, i) => only === undefined || i === only)

  type Patch = Parameters<typeof answerPlanned>[1]
  // «Вернуть» puts the row back as it was; after a confirmation — back to plan with the plan's amount;
  // an occurrence of a recurring rule goes back to the plan as it was
  const answer = (tx: PlanTx, patch: Patch, text: string, undo?: Patch) => {
    toast({ text, actionLabel: 'Вернуть', onAction: answerPlanned(tx, patch, undo) })
  }

  return (
    <>
      {list.map(({ tx, question }) => {
        const income = question === 'Пришло?'
        const cents = toCents(tx.amount_eur)
        return (
          <div key={tx.id} className="flex flex-col gap-2">
          <QuestionCard
            sphere="money"
            icon={Wallet}
            question={question}
            title={tx.title}
            lang="de"
            meta={[tx.date === today ? 'сегодня' : formatWeekdayDate(tx.date), accountName(tx)].filter(Boolean).join(' · ')}
            confirmLabel="Подтвердить"
            today={today}
            amount={{
              cents,
              question: income ? 'Сколько пришло?' : 'Сколько списалось?',
              hint: `${income ? 'Пришло' : 'Списалось'} меньше или больше — поправь, прогноз пересчитается.`,
            }}
            onConfirm={(c) => {
              const amount = c ?? cents
              const patch = confirmPatch(tx, c ?? null, new Date().toISOString())
              answer(tx, patch, `${tx.title} · ${formatEur(amount, { whole: true })} — ${income ? 'пришло' : 'списано'}`, unconfirmPatch({ ...tx, ...patch }))
            }}
            reschedule={{
              title: 'Когда ждать?',
              actionLabel: (d) => `Ждать ${dayChipLabel(d, today) === 'Завтра' ? 'завтра' : `в ${formatWeekdayDate(d)}`}`,
              onPick: (d) => answer(tx, { date: d }, `${tx.title} ждём в ${formatWeekdayDate(d)} — спрошу в этот день`),
            }}
            onCancel={() => answer(tx, { cancelled_at: new Date().toISOString() }, `${tx.title} — убрала из плана`)}
          />
          {salaryRule && tx.recurring_id === salaryRule.id && (
            <Link to="/money/payday" className="flex min-h-11 items-center gap-2 rounded-xl bg-sub px-4 text-base text-ink no-underline active:bg-line2">
              <span className="size-2 flex-none rounded-full bg-money" />
              <span className="min-w-0 flex-1">День денег — распределить</span>
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
            </Link>
          )}
          </div>
        )
      })}
    </>
  )
}
