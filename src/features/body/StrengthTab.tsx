import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { SkeletonCard } from '@/components/ui/Feedback'
import { formatWeekdayDate, todayBerlin } from '@/lib/dates'
import { bodyDataKeys, useStrengthSets, useWrite, type StrengthSet } from './activityApi'
import { parseReps } from './parseReps'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'

/** Силовые: journal by day (exercise · reps per set · load). The reps chart comes with the charts stage. */
export function StrengthTab() {
  const sets = useStrengthSets()
  const [adding, setAdding] = useState(false)
  if (sets.isPending) return <SkeletonCard />
  const list = sets.data ?? []
  const days = [...new Set(list.map((s) => s.date))]
  return (
    <>
      <Button onClick={() => setAdding(true)} icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}>
        Записать упражнение
      </Button>
      {days.length === 0 ? (
        <section className="flex flex-col gap-1 rounded-2xl border border-dashed border-line2 p-4">
          <div className="text-base font-semibold">Журнал пока пустой</div>
          <p className="m-0 text-cap text-ink2">Записи из листа «Сила» придут при импорте. Новую тренировку можно записать сразу.</p>
        </section>
      ) : (
        days.slice(0, 20).map((d) => {
          const day = list.filter((s) => s.date === d)
          return (
            <Card key={d}>
              <CardHeader title={formatWeekdayDate(d)} dotClass="bg-body" context={day[0]?.workout ? `Тренировка ${day[0].workout}` : undefined} />
              <ul className="m-0 flex list-none flex-col p-0">
                {day.map((s) => (
                  <li key={s.id} className="flex min-h-11 items-center gap-3 border-t border-line first:border-t-0">
                    <span className="min-w-0 flex-1 text-base">{s.exercise}</span>
                    <span className="text-base tabular-nums">{s.reps.join(' · ')}</span>
                    {s.load && <span className="text-cap text-ink2">{s.load}</span>}
                    {s.hard_at_end && <span className="text-cap text-ink2">тяжело в конце</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )
        })
      )}
      <StrengthSheet open={adding} onClose={() => setAdding(false)} known={list} />
    </>
  )
}

function StrengthSheet({ open, onClose, known }: { open: boolean; onClose: () => void; known: StrengthSet[] }) {
  const write = useWrite('strength_sets', bodyDataKeys.strength)
  const toast = useToast()
  const [exercise, setExercise] = useState('')
  const [workout, setWorkout] = useState<string | null>(null)
  const [reps, setReps] = useState('')
  const [load, setLoad] = useState('')
  const [hard, setHard] = useState(false)
  const exercises = [...new Set(known.map((s) => s.exercise))].slice(0, 12)
  const parsed = parseReps(reps)
  return (
    <BottomSheet open={open} onClose={onClose} label="Упражнение">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!exercise.trim() || !parsed) return
          write.insert.mutate(
            { date: todayBerlin(), exercise: exercise.trim(), workout, reps: parsed, load: load.trim() || null, hard_at_end: hard },
            {
              onSuccess: () => {
                toast({ text: `${exercise.trim()} · ${parsed.join(' · ')}` })
                setReps('')
                setHard(false)
                onClose()
              },
            },
          )
        }}
      >
        {exercises.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {exercises.map((x) => (
              <Chip key={x} selected={exercise === x} onClick={() => setExercise(x)}>
                {x}
              </Chip>
            ))}
          </div>
        )}
        <input value={exercise} onChange={(e) => setExercise(e.target.value)} placeholder="Упражнение" aria-label="Упражнение" className={field} />
        <div className="flex gap-2" aria-label="Тренировка">
          {['A', 'B'].map((w) => (
            <Chip key={w} selected={workout === w} onClick={() => setWorkout(workout === w ? null : w)}>
              Тренировка {w}
            </Chip>
          ))}
        </div>
        <input value={reps} onChange={(e) => setReps(e.target.value)} inputMode="numeric" placeholder="Повторы по подходам: 10 10 8" aria-label="Повторы" className={field} />
        <input value={load} onChange={(e) => setLoad(e.target.value)} placeholder="Вес или резинка" aria-label="Нагрузка" className={field} />
        <Chip selected={hard} onClick={() => setHard(!hard)} className="self-start">
          Тяжело в конце
        </Chip>
        <Button type="submit" disabled={!exercise.trim() || !parsed || write.insert.isPending}>
          Сохранить
        </Button>
      </form>
    </BottomSheet>
  )
}
