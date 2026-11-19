import { useState } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Scale } from '@/components/ui/Scale'
import { YesNo } from '@/components/ui/YesNo'
import { useToast } from '@/app/toastContext'
import { formatDayMonth, type ISODate } from '@/lib/dates'
import { fingersText } from '@/lib/rules/core'
import { useSaveCoreTest } from './coreApi'

const FINGERS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4].map((v) => ({ value: v, label: String(v).replace('.', ',') }))

/** Тест пальцами: the width in fingers and whether the «домик» showed — saved for the day. */
export function CoreTestSheet({ open, onClose, programId, date }: { open: boolean; onClose: () => void; programId: string; date: ISODate }) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Тест пальцами">
      {/* a fresh form each time the sheet opens */}
      {open && <TestForm programId={programId} date={date} onDone={onClose} />}
    </BottomSheet>
  )
}

function TestForm({ programId, date, onDone }: { programId: string; date: ISODate; onDone: () => void }) {
  const save = useSaveCoreTest(programId)
  const toast = useToast()
  const [fingers, setFingers] = useState<number | null>(null)
  const [dome, setDome] = useState<boolean | null>(null)
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="m-0 text-title font-semibold">Тест пальцами</h2>
        <p className="m-0 text-cap text-ink2">{formatDayMonth(date)} · лёжа, колени согнуты, голова чуть приподнята</p>
      </div>
      <Scale label="Ширина, пальцев" options={FINGERS} columns={4} value={fingers} onChange={setFingers} format={fingersText} />
      <YesNo label="Домик был?" value={dome} onChange={setDome} clearable />
      <Button
        disabled={fingers === null && dome === null}
        onClick={() => {
          const what = fingers !== null ? ` · ${fingersText(fingers)}` : ''
          save
            .mutateAsync({ date, fingers, dome })
            .then((r) => toast({ text: r === 'queued' ? `Тест сохранён на телефоне${what} — отправится, когда будет сеть` : `Тест записан${what}` }))
            .catch(() => {}) // a failure is told app-wide (app/rejectedWrites.ts)
          onDone()
        }}
      >
        Сохранить
      </Button>
    </div>
  )
}
