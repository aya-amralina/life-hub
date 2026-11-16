import { useState } from 'react'
import { Hourglass } from 'lucide-react'
import { useAddAction } from '@/app/addSheetContext'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { SaveError, TextField } from '@/components/ui/Form'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { formatEur, parseEurInput, plural, toCents } from '@/lib/format'
import { wishDue, wishHoursLeft, wishSavedCents } from '@/lib/rules/wishlist'
import { WishQuestions } from './WishQuestions'
import { useAddWish, useWishlist } from './wishlistApi'


/** Хотелки (rule 5): a wish waits 48 hours, then one question — «Всё ещё нужно?». «+» writes a new one. */
export function WishlistTab() {
  const wishes = useWishlist()
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  useAddAction(() => setAdding(true))
  if (wishes.isPending) return <SkeletonCard />
  const now = new Date()
  const list = wishes.data ?? []
  const waiting = list.filter((w) => w.decision === null && !wishDue(w, now))
  const decided = list.filter((w) => w.decision !== null)
  const saved = wishSavedCents(list)

  return (
    <>
      <WishQuestions />
      {list.length === 0 && <EmptyState title="Хотелок пока нет">Захотелось купить — запиши через «+» и подожди 48 часов. Потом спрошу один раз, нужно ли ещё.</EmptyState>}
      <WishSheet open={adding} onClose={() => setAdding(false)} />
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

function WishSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const add = useAddWish()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const cents = parseEurInput(price)
  return (
    <BottomSheet open={open} onClose={onClose} label="Новая хотелка">
      <form
        className="flex flex-col gap-6"
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
                onClose()
              },
            },
          )
        }}
      >
        <p className="m-0 text-cap text-ink2">Запиши и подожди 48 часов. Потом спрошу один раз — нужно ли ещё.</p>
        <TextField label="Что хочется" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField label="Цена, €" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
        <SaveError show={add.isError} />
        <Button type="submit" disabled={!title.trim() || (price !== '' && cents === null) || add.isPending}>
          Отложить на 48 часов
        </Button>
      </form>
    </BottomSheet>
  )
}
