import { Gift } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { IconTile } from '@/components/ui/IconTile'
import { formatEur, toCents } from '@/lib/format'
import { wishDue } from '@/lib/rules/wishlist'
import { useUpdateWish, useWishlist, type Wish } from './wishlistApi'

/** Rule 5: after 48 hours a wish asks «Всё ещё нужно?» — on «Сегодня» and in «Хотелки». */
export function WishQuestions() {
  const wishes = useWishlist()
  const update = useUpdateWish()
  const toast = useToast()
  const now = new Date()
  const due = (wishes.data ?? []).filter((w) => wishDue(w, now))

  const decide = (w: Wish, decision: 'buy' | 'skip') => {
    update.mutate({ id: w.id, patch: { decision, decided_at: new Date().toISOString() } })
    toast({
      text: decision === 'buy' ? `${w.title} — берём. Трату внеси через «+», когда купишь` : `${w.title} — не покупаем`,
      actionLabel: 'Вернуть',
      onAction: () => update.mutate({ id: w.id, patch: { decision: null, decided_at: null } }),
    })
  }

  return (
    <>
      {due.map((w) => (
        <section key={w.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4" aria-label={`Всё ещё нужно? ${w.title}`}>
          <div className="flex items-center gap-3">
            <IconTile icon={Gift} sphere="money" />
            <div className="min-w-0 flex-1">
              <div className="text-cap text-ink2">Прошло 48 часов. Всё ещё нужно?</div>
              <div className="text-base font-semibold [overflow-wrap:anywhere]">{w.title}</div>
            </div>
            {w.price_eur !== null && <span className="text-title font-semibold tabular-nums">{formatEur(toCents(w.price_eur), { whole: true })}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => decide(w, 'buy')}>Нужно</Button>
            <Button variant="secondary" onClick={() => decide(w, 'skip')}>
              Не покупать
            </Button>
          </div>
        </section>
      ))}
    </>
  )
}
