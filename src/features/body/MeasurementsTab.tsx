import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { SkeletonCard } from '@/components/ui/Feedback'
import { formatWeekdayDate, todayBerlin } from '@/lib/dates'
import { bodyDataKeys, useMeasurements, useWrite, type Measurement } from './activityApi'

const FIELDS = [
  { key: 'waist_cm', label: 'Талия', unit: 'см' },
  { key: 'hips_cm', label: 'Бёдра', unit: 'см' },
  { key: 'thigh_cm', label: 'Бедро', unit: 'см' },
  { key: 'arm_cm', label: 'Рука', unit: 'см' },
  { key: 'weight_kg', label: 'Вес', unit: 'кг' },
] as const
type FieldKey = (typeof FIELDS)[number]['key']

const num = (v: number | null) => (v === null ? '—' : String(v).replace('.', ','))

/** Замеры: list by date; photos are only marked as taken, never stored. */
export function MeasurementsTab() {
  const list = useMeasurements()
  const [adding, setAdding] = useState(false)
  if (list.isPending) return <SkeletonCard />
  const rows = list.data ?? []
  return (
    <>
      <Button onClick={() => setAdding(true)} icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}>
        Новый замер
      </Button>
      {rows.length === 0 ? (
        <section className="flex flex-col gap-1 rounded-2xl border border-dashed border-line2 p-4">
          <div className="text-base font-semibold">Замеров пока нет</div>
          <p className="m-0 text-cap text-ink2">Даты замеров придут из глоу-ап трекера и встанут напоминаниями. Вес — по желанию.</p>
        </section>
      ) : (
        rows.map((m) => (
          <Card key={m.id}>
            <CardHeader title={formatWeekdayDate(m.date)} dotClass="bg-body" context={[m.photo_body && 'фото тела', m.photo_face && 'фото лица'].filter(Boolean).join(' · ') || undefined} />
            <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-base tabular-nums">
              {FIELDS.filter((f) => m[f.key] !== null).map((f) => (
                <div key={f.key} className="contents">
                  <dt className="text-ink2">{f.label}</dt>
                  <dd className="m-0 text-right">
                    {num(m[f.key])} {f.unit}
                  </dd>
                </div>
              ))}
            </dl>
            {m.note && <p className="m-0 text-cap text-ink2">{m.note}</p>}
          </Card>
        ))
      )}
      <MeasureSheet open={adding} onClose={() => setAdding(false)} last={rows[0] ?? null} />
    </>
  )
}

function MeasureSheet({ open, onClose, last }: { open: boolean; onClose: () => void; last: Measurement | null }) {
  const write = useWrite('measurements', bodyDataKeys.measurements)
  const toast = useToast()
  const [values, setValues] = useState<Partial<Record<FieldKey, string>>>({})
  const [photoBody, setPhotoBody] = useState(false)
  const [photoFace, setPhotoFace] = useState(false)
  const parsed = Object.fromEntries(
    FIELDS.map((f) => {
      const v = values[f.key]?.trim().replace(',', '.')
      return [f.key, v ? Number(v) : null]
    }),
  ) as Record<FieldKey, number | null>
  const valid = Object.values(parsed).every((v) => v === null || (Number.isFinite(v) && v > 0))
  return (
    <BottomSheet open={open} onClose={onClose} label="Замер">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          write.insert.mutate(
            { date: todayBerlin(), ...parsed, photo_body: photoBody, photo_face: photoFace },
            {
              onSuccess: () => {
                toast({ text: 'Замер сохранён' })
                setValues({})
                onClose()
              },
              onError: () => toast({ text: 'Сегодня замер уже есть' }),
            },
          )
        }}
      >
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-3">
            <span className="w-16 text-base">{f.label}</span>
            <input
              inputMode="decimal"
              value={values[f.key] ?? ''}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              placeholder={last?.[f.key] != null ? num(last[f.key]) : ''}
              aria-label={f.label}
              className="h-12 min-w-0 flex-1 rounded-xl border border-line2 bg-card px-4 text-base text-ink tabular-nums outline-none focus:border-ink2"
            />
            <span className="w-6 text-cap text-ink2">{f.unit}</span>
          </label>
        ))}
        <div className="flex flex-wrap gap-2">
          <Chip selected={photoBody} onClick={() => setPhotoBody(!photoBody)}>
            Фото тела сделано
          </Chip>
          <Chip selected={photoFace} onClick={() => setPhotoFace(!photoFace)}>
            Фото лица сделано
          </Chip>
        </div>
        <Button type="submit" disabled={!valid || write.insert.isPending}>
          Сохранить
        </Button>
      </form>
    </BottomSheet>
  )
}
