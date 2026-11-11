import { useState } from 'react'
import { Hourglass, Plus } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { formatEur, parseEurInput, plural, toCents } from '@/lib/format'
import { wishDue, wishHoursLeft, wishSavedCents } from '@/lib/rules/wishlist'
import { WishQuestions } from './WishQuestions'
import { useAddWish, useWishlist } from './wishlistApi'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'

/** Хотелки (rule 5): a wish waits 48 hours, then one question — «Всё ещё нужно?». */
export function WishlistTab() {
  const wishes = useWishlist()
  const add = useAddWish()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [showDone, setShowDone] = useState(false)
  if (wishes.isPending) return <SkeletonCard />
  const now = new Date()
  const list = wishes.data ?? []
  const waiting = list.filter((w) => w.decision === null && !wishDue(w, now))
  const decided = list.filter((w) => w.decision !== null)
  const saved = wishSavedCents(list)
  const cents = parseEurInput(price)

  return (
    <>
      <WishQuestions />
      <Card>
        <CardHeader title="Новая хотелка" dotClass="bg-money" />
        <p className="m-0 text-cap text-ink2">Запиши и подожди 48 часов. Потом спрошу один раз — нужно ли ещё.</p>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim()) return
            add.mutate(
              { title: title.trim(), price_eur: cents === null ? null : cents / 100 },
              {
                onSuccess: () => {
                  toast({ text: `${title.trim()} — подождём до послезавтра` })
                  setTitle('')
                  setPrice('')
                },
              },
            )
          }}
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Что хочется" aria-label="Что хочется" className={field} />
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="Цена, €" aria-label="Цена" className={field} />
          <Button type="submit" variant="secondary" icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />} disabled={!title.trim() || (price !== '' && cents === null) || add.isPending}>
            Отложить на 48 часов
          </Button>
        </form>
      </Card>
      {waiting.length > 0 && (
        <Card>
          <CardHeader title="Думаю" context={`${waiting.length}`} />
          <ul className="m-0 flex list-none flex-col p-0">
            {waiting.map((w) => {
              const h = wishHoursLeft(w, now)
              return (
                <li key={w.id} className="flex min-h-12 items-center gap-3 border-t border-line first:border-t-0">
                  <Hourglass size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink2" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base [overflow-wrap:anywhere]">{w.title}</span>
                    <span className="block text-cap text-ink2">
                      ещё {h} {plural(h, ['час', 'часа', 'часов'])}
                    </span>
                  </span>
                  {w.price_eur !== null && <span className="text-base tabular-nums">{formatEur(toCents(w.price_eur), { whole: true })}</span>}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      {decided.length > 0 && (
        <Card>
          <GroupHeader title="Решено" count={decided.length} summary={saved > 0 ? `не потрачено ${formatEur(saved, { whole: true })}` : undefined} open={showDone} onToggle={() => setShowDone(!showDone)} />
          {showDone && (
            <ul className="m-0 flex list-none flex-col p-0">
              {decided.map((w) => (
                <li key={w.id} className="flex min-h-11 items-center gap-3 border-t border-line text-base first:border-t-0">
                  <span className="min-w-0 flex-1 text-ink2 [overflow-wrap:anywhere]">{w.title}</span>
                  <span className="text-cap text-ink2">{w.decision === 'buy' ? 'берём' : 'не покупаем'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  )
}
