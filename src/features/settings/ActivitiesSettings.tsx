import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { SkeletonCard } from '@/components/ui/Feedback'
import { Switch } from '@/components/ui/Switch'
import { INTENSITIES, INTENSITY_POINTS, type Intensity } from '@/lib/constants'
import { plural } from '@/lib/format'
import { bodyDataKeys, useActivityTypes, useWrite, type ActivityType } from '@/features/body/activityApi'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'
const pts = (n: number) => `${String(n).replace('.', ',')} ${plural(Math.ceil(n), ['очко', 'очка', 'очков'])} / 10 мин`

/** Настройки → Активности: types, intensity, points per 10 minutes (rule 25), hide, order. */
export function ActivitiesSettings() {
  const types = useActivityTypes()
  const write = useWrite('activity_types', bodyDataKeys.types)
  const [editing, setEditing] = useState<ActivityType | 'new' | null>(null)
  if (types.isPending) return <SkeletonCard />
  const list = types.data ?? []

  const move = (i: number, dir: -1 | 1) => {
    const a = list[i]!
    const b = list[i + dir]
    if (!b) return
    write.update.mutate({ id: a.id, patch: { sort_order: i + dir } })
    write.update.mutate({ id: b.id, patch: { sort_order: i } })
  }

  return (
    <Card>
      <CardHeader title="Активности" context={list.length ? `${list.length}` : undefined} />
      <p className="m-0 text-cap text-ink2">Очки за 10 минут: лёгкая — 1, средняя — 2, интенсивная — 3. Можно поправить у каждого типа.</p>
      {list.length === 0 && <p className="m-0 text-cap text-ink2">Типов пока нет. Стартовый список придёт из глоу-ап трекера при импорте.</p>}
      <ul className="m-0 flex list-none flex-col p-0">
        {list.map((t, i) => (
          <li key={t.id} className="flex min-h-14 items-center gap-2 border-t border-line first:border-t-0">
            <button type="button" onClick={() => setEditing(t)} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left">
              <span className={t.active ? 'text-base' : 'text-base text-ink3'}>{t.name}</span>
              <span className="text-cap text-ink2">
                {t.intensity} · {pts(Number(t.points_per_10min))}
              </span>
            </button>
            <IconButton shape="square" label={`${t.name} выше`} className="border-transparent" disabled={i === 0} onClick={() => move(i, -1)}>
              <ChevronUp size={20} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
            <IconButton shape="square" label={`${t.name} ниже`} className="border-transparent" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
              <ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
            <Switch checked={t.active} onChange={(v) => write.update.mutate({ id: t.id, patch: { active: v } })} label={`${t.name}: показывать`} />
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={() => setEditing('new')} icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}>
        Новый тип
      </Button>
      {editing && <TypeSheet type={editing === 'new' ? null : editing} count={list.length} onClose={() => setEditing(null)} />}
    </Card>
  )
}

function TypeSheet({ type, count, onClose }: { type: ActivityType | null; count: number; onClose: () => void }) {
  const write = useWrite('activity_types', bodyDataKeys.types)
  const [name, setName] = useState(type?.name ?? '')
  const [intensity, setIntensity] = useState<Intensity>((type?.intensity as Intensity) ?? 'средняя')
  const [points, setPoints] = useState(Number(type?.points_per_10min ?? INTENSITY_POINTS.средняя))
  const save = () => {
    const row = { name: name.trim(), intensity, points_per_10min: points }
    if (type) write.update.mutate({ id: type.id, patch: row }, { onSuccess: onClose })
    else write.insert.mutate({ ...row, sort_order: count }, { onSuccess: onClose })
  }
  return (
    <BottomSheet open onClose={onClose} label={type ? type.name : 'Новый тип'}>
      <div className="flex flex-col gap-4">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" aria-label="Название" className={field} />
        <div className="flex flex-wrap gap-2" aria-label="Интенсивность">
          {INTENSITIES.map((i) => (
            <Chip
              key={i}
              selected={intensity === i}
              onClick={() => {
                setIntensity(i)
                setPoints(INTENSITY_POINTS[i])
              }}
            >
              {i}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <IconButton shape="square" label="Меньше очков" onClick={() => setPoints(Math.max(0, points - 0.5))}>
            −
          </IconButton>
          <div className="flex h-11 flex-1 items-center justify-center rounded-xl bg-sub text-base font-semibold tabular-nums">{pts(points)}</div>
          <IconButton shape="square" label="Больше очков" onClick={() => setPoints(points + 0.5)}>
            +
          </IconButton>
        </div>
        {write.update.isError || write.insert.isError ? <p className="m-0 text-cap text-ink2">Не получилось сохранить — возможно, такой тип уже есть.</p> : null}
        <Button onClick={save} disabled={!name.trim()}>
          Сохранить
        </Button>
      </div>
    </BottomSheet>
  )
}
