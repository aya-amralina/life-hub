import { Wallet } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { QuestionCard } from '@/components/ui/QuestionCard'
import { dayChipLabel, formatWeekdayDate, todayBerlin } from '@/lib/dates'
import { formatEur, toCents } from '@/lib/format'
import { plannedQuestions } from '@/lib/rules/money'
import { useAllTransactions, useUpdateTransaction, type Transaction } from './api'

/**
 * Rule 18: a planned operation whose day has come asks once — income «Пришло?», expense «Списалось?».
 * Confirm (the amount can be corrected), another date, or cancel (out of the plan). Stands first until answered.
 */
export function MoneyQuestions() {
  const today = todayBerlin()
  const txs = useAllTransactions()
  const update = useUpdateTransaction()
  const toast = useToast()
  const list = plannedQuestions(txs.data ?? [], today)

  const answer = (tx: Transaction, patch: Parameters<typeof update.mutate>[0]['patch'], text: string) => {
    const before = { date: tx.date, amount_eur: tx.amount_eur, confirmed_at: tx.confirmed_at, cancelled_at: tx.cancelled_at }
    update.mutate({ id: tx.id, patch })
    toast({ text, actionLabel: 'Вернуть', onAction: () => update.mutate({ id: tx.id, patch: before }) })
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
              hint: `${income ? 'Пришло' : 'Списалось'} меньше или больше — поправь, план до 31.12 пересчитается.`,
            }}
            onConfirm={(c) => {
              const amount = c ?? cents
              answer(
                tx,
                { confirmed_at: new Date().toISOString(), ...(c ? { amount_eur: c / 100 } : {}) },
                `${tx.title} · ${formatEur(amount, { whole: true })} — ${income ? 'пришло' : 'списано'}`,
              )
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
