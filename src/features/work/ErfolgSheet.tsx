import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { DateChoice } from '@/components/ui/DateChoice'
import { ERFOLG_TYPE, WORK_AREAS } from '@/lib/constants'
import { addDaysISO, type ISODate } from '@/lib/dates'
import { useCreateItem } from '@/features/items/api'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'

/** «Записать Erfolg»: one line about what worked, optional Bereich and day. */
export function ErfolgSheet({ open, onClose, today }: { open: boolean; onClose: () => void; today: ISODate }) {
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<string | null>(null)
  const [day, setDay] = useState<ISODate>(today)
  const create = useCreateItem()
  const toast = useToast()
  return (
    <BottomSheet open={open} onClose={onClose} label="Записать Erfolg">
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          create.mutate(
            { sphere: 'work', type: ERFOLG_TYPE, status: 'Erledigt', title: title.trim(), area, done_at: new Date(`${day}T12:00:00Z`).toISOString() },
            {
              onSuccess: () => {
                toast({ text: 'Записано в Erfolge' })
                setTitle('')
                onClose()
              },
            },
          )
        }}
      >
        <label className="flex flex-col gap-2">
          <span className="text-cap text-ink2">Что получилось</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} lang="de" className={field} placeholder="Kundenportal 2.4 ist live" />
        </label>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-cap text-ink2">Bereich</legend>
          <div className="flex flex-wrap gap-2">
            {WORK_AREAS.map((a) => (
              <Chip key={a} selected={area === a} onClick={() => setArea(area === a ? null : a)} lang="de">
                {a}
              </Chip>
            ))}
          </div>
        </fieldset>
        <DateChoice label="Когда" value={day} onChange={setDay} options={[today, addDaysISO(today, -1)]} today={today} />
        <Button type="submit" disabled={!title.trim() || create.isPending} icon={<Trophy size={20} strokeWidth={1.75} aria-hidden="true" />}>
          Записать
        </Button>
      </form>
    </BottomSheet>
  )
}

