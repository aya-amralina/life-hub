import { useState } from 'react'
import { useAddAction } from '@/app/addSheetContext'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { SkeletonCard } from '@/components/ui/Feedback'
import { Scale } from '@/components/ui/Scale'
import { YesNo } from '@/components/ui/YesNo'
import { formatDayMonth, formatWeekdayDate, todayBerlin } from '@/lib/dates'
import { fingersText, isTestDay } from '@/lib/rules/core'
import { repeatLine, seriesItemOn } from '@/lib/rules/health'
import { useItems, useUpdateItem } from '@/features/items/api'
import { donePatch } from '@/features/items/donePatch'
import { bodyDataKeys, useMeasurements, useWrite, type Measurement } from './activityApi'
import { useCoreProgram, useCoreTests, useSaveCoreTest } from './coreApi'
import { useItemSeries } from './healthApi'

const FINGERS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4].map((v) => ({ value: v, label: String(v).replace('.', ',') }))

const FIELDS = [
  { key: 'waist_cm', label: 'Талия', unit: 'см' },
  { key: 'hips_cm', label: 'Бёдра', unit: 'см' },
  { key: 'thigh_cm', label: 'Бедро', unit: 'см' },
  { key: 'arm_cm', label: 'Рука', unit: 'см' },
  { key: 'weight_kg', label: 'Вес', unit: 'кг' },
] as const
type FieldKey = (typeof FIELDS)[number]['key']

const num = (v: number | null) => (v === null ? '—' : String(v).replace('.', ','))

/**
 * Замеры (step 5): the series «каждые 4 недели» — the next dates on top, the history below (with the finger test of
 * the day). On a finger-test day the form takes the test too (core_tests, as «Кор» writes it); saving closes the day's
 * «Замеры».
 */
export function MeasurementsTab() {
  const today = todayBerlin()
  const list = useMeasurements()
  const items = useItems()
  const series = useItemSeries()
  const tests = useCoreTests()
  const program = useCoreProgram()
  const [adding, setAdding] = useState(false)
  useAddAction(() => setAdding(true))
  if (list.isPending || items.isPending || series.isPending) return <SkeletonCard />
  const rows = list.data ?? []
  const body = (items.data ?? []).filter((i) => i.sphere === 'body')
  const measure = (series.data ?? []).find((x) => x.kind === 'repeat' && x.title === 'Замеры')
  const next = measure ? repeatLine(measure, body, today).next : []
  const dayItem = seriesItemOn(series.data ?? [], body, 'Замеры', today)
  const p = program.data
  const withTest = Boolean(p && (isTestDay(p, today) || dayItem))
  const testOn = (d: string) => (tests.data ?? []).find((t) => t.date === d)
  return (
    <>
      <Card>
        <CardHeader title="Замеры" dotClass="bg-body" context={measure?.cadence ?? undefined} />
        <p className="m-0 text-base">{next.length ? `Следующие: ${next.slice(0, 4).map((i) => formatDayMonth(i.happens_on!)).join(' · ')}` : 'Следующих дат нет'}</p>
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Записать замер
        </Button>
      </Card>
      {rows.length === 0 ? (
        <p className="m-0 text-cap text-ink2">Истории пока нет.</p>
      ) : (
        rows.map((m) => {
          const t = testOn(m.date)
          return (
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
                {t && (
                  <div className="contents">
                    <dt className="text-ink2">Тест пальцами</dt>
                    <dd className="m-0 text-right">{[t.fingers === null ? null : fingersText(Number(t.fingers)), t.dome === null ? null : t.dome ? 'домик был' : 'без домика'].filter(Boolean).join(' · ')}</dd>
                  </div>
                )}
              </dl>
              {m.note && <p className="m-0 text-cap text-ink2">{m.note}</p>}
            </Card>
          )
        })
      )}
      <MeasureSheet open={adding} onClose={() => setAdding(false)} last={rows[0] ?? null} programId={withTest ? (p?.id ?? null) : null} dayItemId={dayItem?.id ?? null} />
    </>
  )
}

function MeasureSheet({ open, onClose, last, programId, dayItemId }: { open: boolean; onClose: () => void; last: Measurement | null; programId: string | null; dayItemId: string | null }) {
  const write = useWrite('measurements', bodyDataKeys.measurements)
  const saveTest = useSaveCoreTest(programId ?? '')
  const updateItem = useUpdateItem()
  const toast = useToast()
  const [fingers, setFingers] = useState<number | null>(null)
  const [dome, setDome] = useState<boolean | null>(null)
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
                // the finger test of the day goes where «Кор» writes it; the day's «Замеры» is done
                if (programId && (fingers !== null || dome !== null)) saveTest.mutate({ date: todayBerlin(), fingers, dome })
                if (dayItemId) updateItem.mutate({ id: dayItemId, patch: donePatch('body') })
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
        {programId && (
          <div className="flex flex-col gap-4 border-t border-line pt-4">
            <div className="text-base font-semibold">Тест пальцами</div>
            <Scale label="Ширина, пальцев" options={FINGERS} columns={4} value={fingers} onChange={setFingers} format={fingersText} />
            <YesNo label="Домик был?" value={dome} onChange={setDome} clearable />
          </div>
        )}
        <Button type="submit" disabled={!valid || write.insert.isPending}>
          Сохранить
        </Button>
      </form>
    </BottomSheet>
  )
}
