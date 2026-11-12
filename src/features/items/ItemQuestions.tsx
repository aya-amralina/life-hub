import { CalendarCheck } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { QuestionCard } from '@/components/ui/QuestionCard'
import { CANCEL_STATUS, SPHERE_LABEL, type Sphere } from '@/lib/constants'
import { formatWeekdayDate, todayBerlin } from '@/lib/dates'
import { formatTime } from '@/lib/format'
import { happenedQuestions } from '@/lib/rules/items'
import { useItems, useUpdateItem, type Item } from './api'
import { donePatch, reopenPatch } from './donePatch'

const asSphere = (s: string): Sphere => (s in SPHERE_LABEL ? (s as Sphere) : 'personal')

/** Rule 17: «Состоялось?» for past day-items — on «Сегодня» (all spheres) and inside a sphere. */
export function ItemQuestions({ sphere, only }: { sphere?: Sphere; only?: number }) {
  const today = todayBerlin()
  const items = useItems()
  const update = useUpdateItem()
  const toast = useToast()
  const list = happenedQuestions(items.data ?? [], today).filter((i) => !sphere || i.sphere === sphere).filter((_, i) => only === undefined || i === only)

  const answer = (item: Item, patch: Parameters<typeof update.mutate>[0]['patch'], text: string) => {
    const before = { status: item.status, done_at: item.done_at, happens_on: item.happens_on, happens_time: item.happens_time }
    update.mutate({ id: item.id, patch })
    toast({ text, actionLabel: 'Вернуть', onAction: () => update.mutate({ id: item.id, patch: before }) })
  }

  return (
    <>
      {list.map((item) => {
        const s = asSphere(item.sphere)
        const lang = s === 'work' || s === 'study' ? 'de' : undefined
        const time = item.happens_time ? formatTime(item.happens_time) : null
        return (
          <QuestionCard
            key={item.id}
            sphere={s}
            icon={CalendarCheck}
            question="Состоялось?"
            title={item.title}
            lang={lang}
            meta={[formatWeekdayDate(item.happens_on!), time, item.area].filter(Boolean).join(' · ')}
            confirmLabel="Да"
            today={today}
            onConfirm={() => answer(item, donePatch(s), `${item.title} — состоялось`)}
            reschedule={{
              title: 'Когда перенести?',
              hint: time ? `Время останется ${time}, если не выбрать другое.` : undefined,
              withTime: true,
              initialTime: time,
              actionLabel: (d, t) => `Перенести на ${formatWeekdayDate(d)}${t ? ` · ${t}` : ''}`,
              onPick: (d, t) =>
                answer(item, { happens_on: d, happens_time: t }, `Перенесла на ${formatWeekdayDate(d)}${t ? ` · ${t}` : ''}`),
            }}
            onCancel={() => answer(item, { ...reopenPatch(null, s), status: CANCEL_STATUS[s] }, 'Отменено')}
          />
        )
      })}
    </>
  )
}
