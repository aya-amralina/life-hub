import { lazy, Suspense, useCallback, useState, type FormEvent } from 'react'
import { BookOpen, Briefcase, ChevronLeft, ListTodo, NotebookPen, PersonStanding, Wallet, type LucideIcon } from 'lucide-react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button, IconButton } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { DateChoice } from '@/components/ui/DateChoice'
import { SaveError } from '@/components/ui/Form'
import { PickList } from '@/components/ui/PickSheet'
import { useToast } from '@/app/toastContext'
import type { AddForm } from '@/app/addSheetContext'
import { SPHERE_CLASS, SPHERE_LABEL, type Sphere } from '@/lib/constants'
import { addDaysISO, formatRelativeDay, todayBerlin, type ISODate } from '@/lib/dates'
import { useCreateItem } from '@/features/items/api'
import { newItem } from '@/features/items/newItem'
import { useCreateNote } from '@/features/notes/api'
import { ExpenseForm } from '@/features/money/ExpenseForm'
import { SkeletonCard } from '@/components/ui/Feedback'

// sphere forms load on first use: the shell (and «Сегодня») stay light
const WorkTaskForm = lazy(() => import('@/features/work/WorkTaskForm').then((m) => ({ default: m.WorkTaskForm })))
const StudyItemForm = lazy(() => import('@/features/study/StudyItemForm').then((m) => ({ default: m.StudyItemForm })))
const BodyTaskForm = lazy(() => import('@/features/body/BodyTaskForm').then((m) => ({ default: m.BodyTaskForm })))

type Choice = { form: Exclude<AddForm, 'choose'>; label: string; hint: string; icon: LucideIcon; sphere: Sphere; dated: boolean }

/** The chooser of «Сегодня»: each row opens its sphere's own form. `dated` — offered for a preset day (calendar). */
const CHOICES: readonly Choice[] = [
  { form: 'expense', label: 'Трата', hint: 'сумма и категория', icon: Wallet, sphere: 'money', dated: false },
  { form: 'personal', label: 'Дело', hint: 'на сегодня или любой день', icon: ListTodo, sphere: 'personal', dated: true },
  { form: 'work', label: 'Задача по работе', hint: 'на доску', icon: Briefcase, sphere: 'work', dated: true },
  { form: 'study', label: 'Учёба', hint: 'пункт в план недели', icon: BookOpen, sphere: 'study', dated: true },
  { form: 'body', label: 'Тело', hint: 'задача или визит', icon: PersonStanding, sphere: 'body', dated: true },
  { form: 'note', label: 'Заметка', hint: 'в любую сферу', icon: NotebookPen, sphere: 'personal', dated: false },
]

const TITLE: Record<AddForm, string> = {
  choose: 'Добавить',
  expense: 'Трата',
  personal: 'Новое дело',
  work: 'Новая задача',
  study: 'Пункт учёбы',
  body: 'Задача или визит',
  note: 'Заметка',
}

/** «+»: the chooser on «Сегодня», one sphere's own form elsewhere. */
export function AddSheet({
  open,
  onClose,
  form,
  picked,
  onPick,
  onBack,
  sphere,
  date,
}: {
  open: boolean
  onClose: () => void
  form: AddForm
  /** the form was picked in the chooser: show the way back */
  picked: boolean
  onPick: (f: AddForm) => void
  onBack: () => void
  sphere: Sphere
  /** preset day (from the calendar) */
  date?: ISODate
}) {
  const close = useCallback(() => onClose(), [onClose])
  const header =
    form !== 'choose' && picked ? (
      <div className="flex items-center gap-2">
        <IconButton label="К выбору" onClick={onBack}>
          <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        <h2 className="m-0 text-title font-semibold">{TITLE[form]}</h2>
      </div>
    ) : undefined

  return (
    <BottomSheet open={open} onClose={close} label={TITLE[form]} header={header}>
      {form === 'choose' && <Chooser onPick={onPick} dated={Boolean(date)} />}
      {form === 'expense' && <ExpenseForm onDone={close} />}
      {form === 'personal' && <PersonalForm onDone={close} initialDate={date} />}
      <Suspense fallback={<SkeletonCard />}>
        {form === 'work' && <WorkTaskForm onDone={close} initialDate={date} />}
        {form === 'study' && <StudyItemForm onDone={close} initialDate={date} />}
        {form === 'body' && <BodyTaskForm onDone={close} initialDate={date} />}
      </Suspense>
      {form === 'note' && <NoteForm onDone={close} initialSphere={sphere} />}
    </BottomSheet>
  )
}

function Chooser({ onPick, dated }: { onPick: (f: AddForm) => void; dated: boolean }) {
  return (
    <PickList
      options={CHOICES.filter((c) => !dated || c.dated).map((c) => ({ label: c.label, hint: c.hint, icon: c.icon, sphere: c.sphere, onPick: () => onPick(c.form) }))}
    />
  )
}

/** «Дело»: a personal item — what and when. */
function PersonalForm({ onDone, initialDate }: { onDone: () => void; initialDate?: ISODate }) {
  const today = todayBerlin()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState<ISODate | null>(initialDate ?? today)
  const create = useCreateItem()
  const toast = useToast()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    create.mutate(newItem('personal', t, date), {
      onSuccess: () => {
        toast({ text: `Дело добавлено · ${date ? formatRelativeDay(date, today) : 'без даты'}` })
        onDone()
      },
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="text-cap text-ink2">Что сделать</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          enterKeyHint="done"
          className="h-12 rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2"
          placeholder="Например, записаться к врачу"
        />
      </label>
      <DateChoice label="Когда" value={date} onChange={setDate} options={[today, addDaysISO(today, 1)]} today={today} none={{ label: 'Без даты', onSelect: () => setDate(null) }} />
      <SaveError show={create.isError} />
      <Button type="submit" disabled={!title.trim() || create.isPending}>
        Сохранить
      </Button>
    </form>
  )
}

const NOTE_SPHERES: Sphere[] = ['personal', 'work', 'study', 'body', 'money']

function NoteForm({ onDone, initialSphere }: { onDone: () => void; initialSphere: Sphere }) {
  const [text, setText] = useState('')
  const [sphere, setSphere] = useState<Sphere>(initialSphere)
  const create = useCreateNote()
  const toast = useToast()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const [first = '', ...rest] = text.trim().split('\n')
    if (!first.trim()) return
    create.mutate(
      { sphere, title: first.trim(), body_md: rest.join('\n').trim() || null },
      {
        onSuccess: () => {
          toast({ text: `Заметка сохранена · ${SPHERE_LABEL[sphere]}` })
          onDone()
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="text-cap text-ink2">Заметка</span>
        <textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="rounded-xl border border-line2 bg-card px-4 py-3 text-base text-ink outline-none focus:border-ink2"
          placeholder="Первая строка станет заголовком"
        />
      </label>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-cap text-ink2">Сфера</legend>
        <div className="flex flex-wrap gap-2">
          {NOTE_SPHERES.map((s) => (
            <Chip key={s} selected={sphere === s} dotClass={SPHERE_CLASS[s].dot} onClick={() => setSphere(s)}>
              {SPHERE_LABEL[s]}
            </Chip>
          ))}
        </div>
      </fieldset>
      <SaveError show={create.isError} />
      <Button type="submit" disabled={!text.trim() || create.isPending}>
        Сохранить
      </Button>
    </form>
  )
}
