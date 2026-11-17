import { Wallet } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { QuestionCard } from '@/components/ui/QuestionCard'
import { dayChipLabel, formatWeekdayDate, todayBerlin } from '@/lib/dates'
import { formatEur, toCents } from '@/lib/format'
import { plannedQuestions } from '@/lib/rules/money'
import { confirmPatch, unconfirmPatch } from '@/lib/rules/operation'
import { useAnswerPlanned, usePlanTransactions, type PlanTx } from './api'

/**
 * Rule 18: a planned operation whose day has come asks once — income «Пришло?», expense «Списалось?».
 * Confirm (the amount can be corrected), another date, or cancel (out of the plan). Stands first until answered.
 */
export function MoneyQuestions({ only }: { only?: number } = {}) {
  const today = todayBerlin()
  const txs = usePlanTransactions()
  const answerPlanned = useAnswerPlanned()
  const toast = useToast()
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
          <QuestionCard
            key={tx.id}
            sphere="money"
            icon={Wallet}
            question={question}
            title={tx.title}
            lang="de"
            meta={[tx.date === today ? 'сегодня' : formatWeekdayDate(tx.date), tx.account].filter(Boolean).join(' · ')}
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
        )
      })}
    </>
  )
}
