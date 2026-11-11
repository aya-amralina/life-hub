import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { INTENSITIES, INTENSITY_POINTS, type Intensity } from '@/lib/constants'
import type { ISODate } from '@/lib/dates'
import { activityPoints } from '@/lib/rules/activities'
import { bodyDataKeys, useActivityTypes, useWrite } from './activityApi'

const MINUTES = [10, 20, 30, 45, 60] as const
const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'

/** «+ активность»: type → minutes → note (≤ 3 taps for a known type). Score is shown before saving. */
export function ActivitySheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: ISODate }) {
  const types = useActivityTypes()
  const write = useWrite('activities', bodyDataKeys.activities)
  const writeType = useWrite('activity_types', bodyDataKeys.types)
  const toast = useToast()
  const [typeId, setTypeId] = useState<string | null>(null)
  const [minutes, setMinutes] = useState<number | null>(30)
  const [custom, setCustom] = useState('')
  const [note, setNote] = useState('')
  const [newName, setNewName] = useState('')
  const [newIntensity, setNewIntensity] = useState<Intensity>('средняя')
  const active = (types.data ?? []).filter((t) => t.active)
  const type = active.find((t) => t.id === typeId) ?? null
  const mins = custom ? Number(custom) || null : minutes

  const reset = () => {
    setTypeId(null)
    setMinutes(30)
    setCustom('')
    setNote('')
  }

  return (
    <BottomSheet open={open} onClose={onClose} label="Активность">
      <div className="flex flex-col gap-6">
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-cap text-ink2">Что было</legend>
          {active.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {active.map((t) => (
                <Chip key={t.id} selected={typeId === t.id} onClick={() => setTypeId(t.id)}>
                  {t.name}
                </Chip>
              ))}
            </div>
          ) : (
            <p className="m-0 text-cap text-ink2">Типов пока нет — добавь первый. Список можно поправить в Настройках → Активности.</p>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!newName.trim()) return
              writeType.insert.mutate(
                { name: newName.trim(), intensity: newIntensity, points_per_10min: INTENSITY_POINTS[newIntensity], sort_order: active.length },
                { onSuccess: () => setNewName('') },
              )
            }}
          >
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Новый тип" aria-label="Новый тип" className={field} />
            <Button type="submit" variant="secondary" className="flex-none" disabled={!newName.trim()} aria-label="Добавить тип">
              <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </form>
          {newName.trim() && (
            <div className="flex flex-wrap gap-2" aria-label="Интенсивность нового типа">
              {INTENSITIES.map((i) => (
                <Chip key={i} selected={newIntensity === i} onClick={() => setNewIntensity(i)}>
                  {i}
                </Chip>
              ))}
            </div>
          )}
        </fieldset>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-cap text-ink2">Минуты</legend>
          <div className="flex flex-wrap gap-2">
            {MINUTES.map((m) => (
              <Chip
                key={m}
                selected={!custom && minutes === m}
                onClick={() => {
                  setCustom('')
                  setMinutes(m)
                }}
              >
                {m}
              </Chip>
            ))}
            <input
              inputMode="numeric"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="своё"
              aria-label="Своё число минут"
              className="h-11 w-24 rounded-xl border border-line2 bg-card px-3 text-base text-ink"
            />
          </div>
        </fieldset>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Заметка, если хочется" aria-label="Заметка" className={field} />
        <Button
          disabled={!type || !mins || mins > 600 || write.insert.isPending}
          onClick={() =>
            type &&
            write.insert.mutate(
              { date, type_id: type.id, minutes: mins, note: note.trim() || null },
              {
                onSuccess: () => {
                  toast({ text: `${type.name} · ${mins} мин · +${String(activityPoints(mins, type.points_per_10min)).replace('.', ',')}` })
                  reset()
                  onClose()
                },
              },
            )
          }
        >
          {type && mins ? `Добавить · +${String(activityPoints(mins, type.points_per_10min)).replace('.', ',')}` : 'Добавить'}
        </Button>
      </div>
    </BottomSheet>
  )
}
