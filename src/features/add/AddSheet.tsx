import { useCallback, useState, type FormEvent } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/Feedback'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { useToast } from '@/app/toastContext'
import { SPHERE_CLASS, SPHERE_LABEL, type Sphere } from '@/lib/constants'
import { addDaysISO, formatRelativeDay, todayBerlin } from '@/lib/dates'
import { useCreateItem } from '@/features/items/api'

type Mode = 'expense' | 'item' | 'note'

const MODES = [
  { value: 'expense', label: 'Трата' },
  { value: 'item', label: 'Пункт' },
  { value: 'note', label: 'Заметка' },
] as const

const SPHERE_ORDER: Sphere[] = ['personal', 'work', 'study', 'body', 'money']

/** «+» sheet: трата / пункт / заметка. */
export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('item')
  const close = useCallback(() => onClose(), [onClose])
  return (
    <BottomSheet
      open={open}
      onClose={close}
      label="Добавить"
      header={<SegmentedTabs segments={MODES} value={mode} onChange={setMode} compact label="Что добавить" />}
    >
      {mode === 'item' && <ItemForm onDone={close} />}
      {mode === 'expense' && (
        <EmptyState title="Быстрая трата — на следующем этапе">Пока траты живут в Excel, скоро переедут сюда.</EmptyState>
      )}
      {mode === 'note' && <EmptyState title="Заметки — на следующем этапе">Появятся вместе с разделами сфер.</EmptyState>}
    </BottomSheet>
  )
}

function ItemForm({ onDone }: { onDone: () => void }) {
  const today = todayBerlin()
  const [title, setTitle] = useState('')
  const [sphere, setSphere] = useState<Sphere>('personal')
  const [date, setDate] = useState<string>(today)
  const create = useCreateItem()
  const toast = useToast()

  const dateChoices = [today, addDaysISO(today, 1)]
  const custom = !dateChoices.includes(date)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    create.mutate(
      { sphere, title: t, due_date: date || null },
      {
        onSuccess: () => {
          toast({ text: `Пункт добавлен · ${date ? formatRelativeDay(date, today) : 'без даты'}` })
          onDone()
        },
      },
    )
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
          className="h-12 rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2"
          placeholder="Например, записаться к врачу"
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-cap font-semibold text-ink2">Сфера</legend>
        <div className="flex flex-wrap gap-2">
          {SPHERE_ORDER.map((s) => (
            <Chip key={s} selected={sphere === s} dotClass={SPHERE_CLASS[s].dot} onClick={() => setSphere(s)}>
              {SPHERE_LABEL[s]}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-cap font-semibold text-ink2">Когда</legend>
        <div className="flex flex-wrap gap-2">
          <Chip selected={date === today} onClick={() => setDate(today)}>
            Сегодня
          </Chip>
          <Chip selected={date === dateChoices[1]} onClick={() => setDate(dateChoices[1]!)}>
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
