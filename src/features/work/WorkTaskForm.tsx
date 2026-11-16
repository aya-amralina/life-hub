import { useState, type FormEvent } from 'react'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { DateChoice } from '@/components/ui/DateChoice'
import { ChoiceChips, MoreFields, SaveError, TextField } from '@/components/ui/Form'
import { WORK_AREAS, WORK_PRIORITIES, WORK_TYPES } from '@/lib/constants'
import { addDaysISO, formatRelativeDay, todayBerlin, type ISODate } from '@/lib/dates'
import { useCreateItem } from '@/features/items/api'
import { newWorkTask } from '@/features/items/newItem'

const opts = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }))

/** «+» on Работа: Titel, Bereich, Prio, Fällig; Typ, Nächster Schritt and Wartet auf under «Ещё поля». */
export function WorkTaskForm({ onDone, initialDate }: { onDone: () => void; initialDate?: ISODate }) {
  const today = todayBerlin()
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<string | null>(null)
  const [priority, setPriority] = useState<string | null>(null)
  const [due, setDue] = useState<ISODate | null>(initialDate ?? null)
  const [type, setType] = useState<string | null>('Aufgabe')
  const [nextStep, setNextStep] = useState('')
  const [waitingOn, setWaitingOn] = useState('')
  const create = useCreateItem()
  const toast = useToast()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    create.mutate(newWorkTask({ title, area, priority, due, type, nextStep, waitingOn }), {
      onSuccess: () => {
        toast({ text: `Задача на доске · ${due ? `Fällig ${formatRelativeDay(due, today)}` : 'Offen'}` })
        onDone()
      },
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <TextField label="Titel" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} lang="de" enterKeyHint="done" placeholder="Login-Fehler beheben" />
      <ChoiceChips label="Bereich" lang="de" options={opts(WORK_AREAS)} value={area} onChange={setArea} />
      <ChoiceChips label="Prio" lang="de" options={opts(WORK_PRIORITIES)} value={priority} onChange={setPriority} />
      <DateChoice label="Fällig" value={due} onChange={setDue} options={[today, addDaysISO(today, 1)]} today={today} none={{ label: 'Без срока', onSelect: () => setDue(null) }} />
      <MoreFields>
        <ChoiceChips label="Typ" lang="de" options={opts(WORK_TYPES)} value={type} onChange={(t) => setType(t ?? 'Aufgabe')} optional={false} />
        <TextField label="Nächster Schritt" lang="de" value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
        <TextField label="Wartet auf" lang="de" value={waitingOn} onChange={(e) => setWaitingOn(e.target.value)} placeholder="Имя" />
      </MoreFields>
      <SaveError show={create.isError} />
      <Button type="submit" disabled={!title.trim() || create.isPending}>
        Сохранить
      </Button>
    </form>
  )
}
