import { useState, type FormEvent } from 'react'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { DateChoice, TimeChoice } from '@/components/ui/DateChoice'
import { ChoiceChips, SaveError, TextField } from '@/components/ui/Form'
import { addDaysISO, formatRelativeDay, todayBerlin, type ISODate } from '@/lib/dates'
import { useCreateItem } from '@/features/items/api'
import { newBodyItem } from '@/features/items/newItem'

const KINDS = [
  { value: 'task', label: 'Сделать до' },
  { value: 'visit', label: 'Визит в день' },
] as const
type Kind = (typeof KINDS)[number]['value']

/** «+» on Тело → Задачи и визиты: a task by a date, or a visit on a day at a time («Состоялось?» asks after). */
export function BodyTaskForm({ onDone, initialDate }: { onDone: () => void; initialDate?: ISODate }) {
  const today = todayBerlin()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<Kind>('task')
  const [date, setDate] = useState<ISODate | null>(initialDate ?? null)
  const [time, setTime] = useState<string | null>(null)
  const create = useCreateItem()
  const toast = useToast()
  const visit = kind === 'visit'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || (visit && !date)) return
    create.mutate(newBodyItem({ title, kind, date, time: visit ? time : null }), {
      onSuccess: () => {
        toast({ text: `${visit ? 'Визит' : 'Задача'} добавлен${visit ? '' : 'а'}${date ? ` · ${formatRelativeDay(date, today)}` : ''}` })
        onDone()
      },
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <TextField label="Что" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} enterKeyHint="done" placeholder={visit ? 'Дерматолог' : 'Купить SPF'} />
      <ChoiceChips label="Вид" options={KINDS} value={kind} onChange={(k) => k && setKind(k)} optional={false} />
      <DateChoice
        label={visit ? 'День' : 'Срок'}
        value={date}
        onChange={setDate}
        options={[today, addDaysISO(today, 1)]}
        today={today}
        none={visit ? undefined : { label: 'Без срока', onSelect: () => setDate(null) }}
      />
      {visit && <TimeChoice value={time} onChange={setTime} />}
      <SaveError show={create.isError} />
      <Button type="submit" disabled={!title.trim() || (visit && !date) || create.isPending}>
        Сохранить
      </Button>
    </form>
  )
}
