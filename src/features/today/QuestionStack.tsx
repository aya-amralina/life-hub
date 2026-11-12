import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { todayBerlin } from '@/lib/dates'
import { happenedQuestions } from '@/lib/rules/items'
import { plannedQuestions } from '@/lib/rules/money'
import { wishDue } from '@/lib/rules/wishlist'
import { useItems } from '@/features/items/api'
import { ItemQuestions } from '@/features/items/ItemQuestions'
import { useAllTransactions } from '@/features/money/api'
import { MoneyQuestions } from '@/features/money/MoneyQuestions'
import { WishQuestions } from '@/features/money/WishQuestions'
import { useWishlist } from '@/features/money/wishlistApi'

/**
 * Questions on «Сегодня» (design 3m): one question stands as its card; two or more share one place —
 * «Ждут ответа · N», shown one at a time (‹ ›), so the day's cards stay close to the top. An answer brings the next one.
 */
export function QuestionStack() {
  const today = todayBerlin()
  const txs = useAllTransactions()
  const items = useItems()
  const wishes = useWishlist()
  const [at, setAt] = useState(0)

  const money = plannedQuestions(txs.data ?? [], today).length
  const happened = happenedQuestions(items.data ?? [], today).length
  const now = new Date()
  const wish = (wishes.data ?? []).filter((w) => wishDue(w, now)).length
  const total = money + happened + wish

  if (total <= 1) {
    return (
      <>
        <MoneyQuestions />
        <ItemQuestions />
        <WishQuestions />
      </>
    )
  }
  const i = Math.min(at, total - 1)
  return (
    <section aria-label="Ждут ответа" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="m-0 min-w-0 flex-1 text-base font-semibold">
          Ждут ответа <span className="font-normal text-ink2 tabular-nums">· {total}</span>
        </h2>
        <IconButton shape="square" label="Предыдущий вопрос" disabled={i === 0} onClick={() => setAt(i - 1)} className="disabled:border-line disabled:text-dis">
          <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        <span className="w-12 text-center text-cap text-ink2 tabular-nums" aria-live="polite">
          {i + 1} из {total}
        </span>
        <IconButton shape="square" label="Следующий вопрос" disabled={i === total - 1} onClick={() => setAt(i + 1)} className="disabled:border-line disabled:text-dis">
          <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      </div>
      {i < money ? <MoneyQuestions only={i} /> : i < money + happened ? <ItemQuestions only={i - money} /> : <WishQuestions only={i - money - happened} />}
    </section>
  )
}
