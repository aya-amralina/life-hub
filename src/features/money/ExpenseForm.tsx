import { useState } from 'react'
import { Chip } from '@/components/ui/Chip'
import { CategoryChip } from '@/components/ui/CategoryChip'
import { Keypad } from '@/components/ui/Keypad'
import { useToast } from '@/app/toastContext'
import { ACCOUNTS, WEEK_CATEGORIES, type WeekCategory } from '@/lib/constants'
import { todayBerlin, weekStart } from '@/lib/dates'
import { formatEur, parseEurInput } from '@/lib/format'
import { useAddExpense, useDeleteTransaction } from './api'
import { useMoneyWeek } from './useMoneyWeek'

const ACCOUNT_KEY = 'lifehub.lastAccount'

function lastAccount(): string {
  try {
    return localStorage.getItem(ACCOUNT_KEY) ?? ACCOUNTS[0]
  } catch {
    return ACCOUNTS[0]
  }
}

/**
 * Quick expense: «+» → amount → category. Tapping a category saves at once;
 * the toast offers «Отменить». Account defaults to the last one used.
 */
export function ExpenseForm({ onDone }: { onDone: () => void }) {
  const today = todayBerlin()
  const [amount, setAmount] = useState('')
  const [account, setAccount] = useState(lastAccount)
  const { summary } = useMoneyWeek(weekStart(today))
  const add = useAddExpense()
  const del = useDeleteTransaction()
  const toast = useToast()
  const cents = parseEurInput(amount)
  const valid = cents !== null && cents > 0

  const save = (category: WeekCategory) => {
    if (!valid) return
    try {
      localStorage.setItem(ACCOUNT_KEY, account)
    } catch {
      // ignore
    }
    add.mutate(
      { id: crypto.randomUUID(), date: today, amount_eur: cents / 100, category, account, title: category },
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
        {ACCOUNTS.map((a) => (
          <Chip key={a} selected={account === a} onClick={() => setAccount(a)} className="flex-none">
            {a}
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
