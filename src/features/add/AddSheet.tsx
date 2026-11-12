import { useCallback, useState, type FormEvent } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { useToast } from '@/app/toastContext'
import type { AddMode } from '@/app/addSheetContext'
import { SPHERE_CLASS, SPHERE_LABEL, type Sphere } from '@/lib/constants'
import { addDaysISO, formatRelativeDay, todayBerlin } from '@/lib/dates'
import { useCreateItem } from '@/features/items/api'
import { newItem } from '@/features/items/newItem'
import { useCreateNote } from '@/features/notes/api'
import { ExpenseForm } from '@/features/money/ExpenseForm'

const MODES = [
  { value: 'expense', label: 'Трата' },
  { value: 'item', label: 'Пункт' },
  { value: 'note', label: 'Заметка' },
] as const

const SPHERE_ORDER: Sphere[] = ['personal', 'work', 'study', 'body', 'money']

const field = 'h-12 rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'

/** «+» sheet: трата / пункт / заметка. */
export function AddSheet({
  open,
  onClose,
  mode,
  onMode,
  sphere,
  date,
}: {
  open: boolean
  onClose: () => void
  mode: AddMode
  onMode: (m: AddMode) => void
  sphere: Sphere
  /** preset day (from the calendar) */
  date?: string
}) {
  const close = useCallback(() => onClose(), [onClose])
  return (
    <BottomSheet
      open={open}
      onClose={close}
      label="Добавить"
      header={<SegmentedTabs segments={MODES} value={mode} onChange={onMode} label="Что добавить" />}
    >
      {mode === 'expense' && <ExpenseForm onDone={close} />}
      {mode === 'item' && <ItemForm key={date ?? 'today'} onDone={close} initialSphere={sphere} initialDate={date} />}
      {mode === 'note' && <NoteForm onDone={close} initialSphere={sphere} />}
    </BottomSheet>
  )
}

function SpherePicker({ value, onChange }: { value: Sphere; onChange: (s: Sphere) => void }) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-cap font-semibold text-ink2">Сфера</legend>
      <div className="flex flex-wrap gap-2">
        {SPHERE_ORDER.map((s) => (
          <Chip key={s} selected={value === s} dotClass={SPHERE_CLASS[s].dot} onClick={() => onChange(s)}>
            {SPHERE_LABEL[s]}
          </Chip>
        ))}
      </div>
    </fieldset>
  )
}

function ItemForm({ onDone, initialSphere, initialDate }: { onDone: () => void; initialSphere: Sphere; initialDate?: string }) {
  const today = todayBerlin()
  const tomorrow = addDaysISO(today, 1)
  const [title, setTitle] = useState('')
  const [sphere, setSphere] = useState<Sphere>(initialSphere === 'money' ? 'money' : initialSphere)
  const [date, setDate] = useState<string>(initialDate ?? today)
  const create = useCreateItem()
  const toast = useToast()
  const custom = date !== '' && date !== today && date !== tomorrow

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    create.mutate(newItem(sphere, t, date || null), {
      onSuccess: () => {
        toast({ text: `Пункт добавлен · ${date ? formatRelativeDay(date, today) : 'без даты'}` })
        onDone()
      },
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="text-cap font-semibold text-ink2">Что сделать</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          enterKeyHint="done"
          lang={sphere === 'work' ? 'de' : undefined}
          className={field}
          placeholder="Например, записаться к врачу"
        />
      </label>
      <SpherePicker value={sphere} onChange={setSphere} />
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-cap font-semibold text-ink2">Когда</legend>
        <div className="flex flex-wrap gap-2">
          <Chip selected={date === today} onClick={() => setDate(today)}>
            Сегодня
          </Chip>
          <Chip selected={date === tomorrow} onClick={() => setDate(tomorrow)}>
            Завтра
          </Chip>
          <Chip selected={date === ''} onClick={() => setDate('')}>
            Без даты
          </Chip>
          <input
            type="date"
            aria-label="Другая дата"
            value={custom ? date : ''}
            onChange={(e) => setDate(e.target.value || today)}
            className="h-11 rounded-xl border border-line2 bg-card px-3 text-base text-ink"
          />
        </div>
      </fieldset>
      {create.isError && <p className="m-0 text-cap text-ink2">Не получилось сохранить. Проверь сеть и попробуй ещё раз.</p>}
      <Button type="submit" disabled={!title.trim() || create.isPending}>
        Сохранить
      </Button>
    </form>
  )
}

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
        <span className="text-cap font-semibold text-ink2">Заметка</span>
        <textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="rounded-xl border border-line2 bg-card px-4 py-3 text-base text-ink outline-none focus:border-ink2"
          placeholder="Первая строка станет заголовком"
        />
      </label>
      <SpherePicker value={sphere} onChange={setSphere} />
      {create.isError && <p className="m-0 text-cap text-ink2">Не получилось сохранить. Проверь сеть и попробуй ещё раз.</p>}
      <Button type="submit" disabled={!text.trim() || create.isPending}>
        Сохранить
      </Button>
    </form>
  )
}
