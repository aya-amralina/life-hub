import { useState, type FormEvent } from 'react'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { DateChoice } from '@/components/ui/DateChoice'
import { ChoiceChips, MoreFields, SaveError, TextField } from '@/components/ui/Form'
import { Stepper } from '@/components/ui/Stepper'
import { STUDY_TYPES } from '@/lib/constants'
import { addDaysISO, todayBerlin, weekStart, type ISODate } from '@/lib/dates'
import { formatHours } from '@/lib/format'
import { useCreateItem, useItems } from '@/features/items/api'
import { newStudyItem } from '@/features/items/newItem'
import { useAllWeeks, useWeekRow } from '@/features/weeks/api'
import { weekLabel } from './weekLabel'

const MAX_HOURS = 20

/** «+» on Учёба: what to close, subject, hours and the week; type and deadline under «Ещё поля». */
export function StudyItemForm({ onDone, initialDate }: { onDone: () => void; initialDate?: ISODate }) {
  const today = todayBerlin()
  const thisMonday = weekStart(today)
  const items = useItems()
  const weeks = useAllWeeks()
  const weekRow = useWeekRow()
  const create = useCreateItem()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<string | null>(null)
  const [hours, setHours] = useState(1)
  const [monday, setMonday] = useState<ISODate>(initialDate ? weekStart(initialDate) : thisMonday)
  const [type, setType] = useState<string | null>(null)
  const [due, setDue] = useState<ISODate | null>(initialDate ?? null)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  const subjects = [...new Set((items.data ?? []).filter((i) => i.sphere === 'study' && i.area).map((i) => i.area!))].sort((a, b) => a.localeCompare(b, 'de'))
  const known = weeks.data ?? []
  const nextMonday = addDaysISO(thisMonday, 7)
  const weekOptions = [...new Set([thisMonday, nextMonday, monday])].map((m) => ({
    value: m,
    label: m === thisMonday ? `Эта · ${weekLabel(m, known)}` : m === nextMonday ? `Следующая · ${weekLabel(m, known)}` : weekLabel(m, known),
  }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setFailed(false)
    try {
      const week = await weekRow(monday, known)
      create.mutate(newStudyItem({ title, area, type, hours, weekId: week.id, due }), {
        onSuccess: () => {
          toast({ text: `Пункт в плане · ${weekLabel(monday, known)}` })
          onDone()
        },
        onSettled: () => setSaving(false),
      })
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <TextField label="Что закрыть" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} enterKeyHint="done" placeholder="HA 4 — Aufgabe 2" />
      {subjects.length > 0 && <ChoiceChips label="Предмет" lang="de" options={subjects.map((s) => ({ value: s, label: s }))} value={area} onChange={setArea} dotClass="bg-study" />}
      <div className="flex flex-col gap-2">
        <span className="text-cap text-ink2">Часы</span>
        <Stepper
          className="self-start"
          minusLabel="Меньше на полчаса"
          plusLabel="Больше на полчаса"
          minusDisabled={hours <= 0}
          plusDisabled={hours >= MAX_HOURS}
          onMinus={() => setHours(Math.max(0, hours - 0.5))}
          onPlus={() => setHours(Math.min(MAX_HOURS, hours + 0.5))}
        >
          <span aria-live="polite" className="min-w-24 text-center text-base tabular-nums">
            {hours ? formatHours(hours) : 'без оценки'}
          </span>
        </Stepper>
      </div>
      <ChoiceChips label="Неделя" options={weekOptions} value={monday} onChange={(m) => m && setMonday(m)} optional={false} />
      <MoreFields label="Тип и срок">
        <ChoiceChips label="Тип" options={STUDY_TYPES.map((t) => ({ value: t, label: t }))} value={type} onChange={setType} />
        <DateChoice label="Срок" value={due} onChange={setDue} options={[]} today={today} none={{ label: 'Без срока', onSelect: () => setDue(null) }} />
      </MoreFields>
      <SaveError show={failed || create.isError} />
      <Button type="submit" disabled={!title.trim() || saving}>
        Сохранить
      </Button>
    </form>
  )
}
