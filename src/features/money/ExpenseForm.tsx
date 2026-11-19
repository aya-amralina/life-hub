import { useState } from 'react'
import { Chip } from '@/components/ui/Chip'
import { CategoryChip } from '@/components/ui/CategoryChip'
import { Keypad } from '@/components/ui/Keypad'
import { useToast } from '@/app/toastContext'
import { WEEK_CATEGORIES, type WeekCategory } from '@/lib/constants'
import { todayBerlin, weekStart } from '@/lib/dates'
import { formatEur, parseEurInput } from '@/lib/format'
import { accountOptions } from '@/lib/rules/accounts'
import { useAccounts, useAddExpense, useDeleteTransaction } from './api'
import { useMoneyWeek } from './useMoneyWeek'

/** The account a quick expense starts with, every time (decision 18.11.2026). */
const MAIN_ACCOUNT = 'acct:revolut-main'

/**
 * Quick expense: «+» → amount → category. Tapping a category saves at once; the toast offers «Отменить».
 * Accounts — only «Баланс» (expenses go only from it); it starts with Revolut · Основной.
 */
export function ExpenseForm({ onDone }: { onDone: () => void }) {
  const today = todayBerlin()
  const [amount, setAmount] = useState('')
  const accounts = useAccounts()
  const choices = accountOptions(accounts.data ?? [], { group: 'balance' })
  const [picked, setPicked] = useState<string | null>(null)
  // until the accounts are loaded (or offline on the first run) the expense goes without one — that is «Баланс» too
  const account = picked ?? choices.find((a) => a.source_id === MAIN_ACCOUNT)?.id ?? choices[0]?.id ?? null
  const { summary } = useMoneyWeek(weekStart(today))
  const add = useAddExpense()
  const del = useDeleteTransaction()
  const toast = useToast()
  const cents = parseEurInput(amount)
  const valid = cents !== null && cents > 0

  const save = (category: WeekCategory) => {
    if (!valid) return
    add.mutate(
      { id: crypto.randomUUID(), date: today, amount_eur: cents / 100, category, account_id: account, title: category },
      {
        onSuccess: (tx) => {
          toast({ text: `${formatEur(cents)} · ${category}`, actionLabel: 'Отменить', onAction: () => del.mutate(tx.id) })
          onDone()
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        aria-live="polite"
        aria-label="Сумма"
        className="flex h-[72px] items-center justify-center gap-2 rounded-2xl bg-sub tabular-nums"
      >
        <span className={`text-big font-semibold tracking-[-0.01em] ${amount ? 'text-ink' : 'text-dis'}`}>{amount || '0'}</span>
        <span className="text-title text-ink2">€</span>
      </div>
      <Keypad value={amount} onChange={setAmount} />
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Счёт">
        {choices.map((a) => (
          <Chip key={a.id} selected={account === a.id} onClick={() => setPicked(a.id)} className="flex-none">
            {a.name}
          </Chip>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Категория — сохранить">
        {WEEK_CATEGORIES.map((c) => {
          const cat = summary.categories.find((x) => x.category === c)!
          const limited = summary.hasLimits && cat.limitCents > 0
          const over = limited && cat.deviationCents > 0
          const caption = !summary.hasLimits
            ? undefined
            : !limited
              ? 'без лимита'
              : over
                ? `сверх на ${formatEur(cat.deviationCents)}`
                : `осталось ${formatEur(-cat.deviationCents)}`
          return <CategoryChip key={c} label={c} caption={caption} over={over} onClick={() => save(c)} disabled={!valid || add.isPending} />
        })}
      </div>
      <p className="m-0 text-cap text-ink2">{valid ? 'Тап по категории — и трата сохранена.' : 'Набери сумму, потом выбери категорию.'}</p>
      {add.isError && <p className="m-0 text-cap font-semibold text-amber-ink">Не сохранилось. Проверь сеть и попробуй ещё раз.</p>}
    </div>
  )
}
