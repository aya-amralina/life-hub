import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { cleanNote, noteDirty } from '@/lib/rules/journal'
import type { ISODate } from '@/lib/dates'
import { useDailyLog, useSaveDailyLog } from '@/features/body/api'

const draftKey = (date: ISODate) => `lifehub.noteDraft.${date}`
const readDraft = (date: ISODate): string | null => {
  try {
    return localStorage.getItem(draftKey(date))
  } catch {
    return null
  }
}
const writeDraft = (date: ISODate, text: string | null) => {
  try {
    if (text === null) localStorage.removeItem(draftKey(date))
    else localStorage.setItem(draftKey(date), text)
  } catch {
    // private mode: the draft lives while the screen is open
  }
}

/**
 * The day's note: grows with the text (no inner scroll), «Сохранить» and «Отменить» appear only when the text differs
 * from the saved one. Until saved, the draft is kept on the device — closing the app loses nothing.
 */
export function NoteEditor({ date, autoFocus = false, onDone }: { date: ISODate; autoFocus?: boolean; onDone?: () => void }) {
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)
  const toast = useToast()
  const saved = log.data?.note ?? null
  const [text, setText] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  // once the saved note is known: a draft that differs from it wins
  useEffect(() => {
    if (log.isPending || text !== null) return
    const draft = readDraft(date)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from the device draft after the load
    setText(draft !== null && noteDirty(draft, saved) ? draft : (saved ?? ''))
  }, [log.isPending, saved, date, text])

  const value = text ?? saved ?? ''
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])

  const dirty = noteDirty(value, saved)
  const change = (v: string) => {
    setText(v)
    writeDraft(date, noteDirty(v, saved) ? v : null)
  }
  const submit = () => {
    const note = cleanNote(value)
    save.mutate({ note })
    writeDraft(date, null)
    setText(note ?? '')
    toast({ text: note ? 'Сохранено в журнал' : 'Заметка убрана', actionLabel: 'Вернуть', onAction: () => save.mutate({ note: saved }) })
    onDone?.()
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        ref={ref}
        rows={3}
        autoFocus={autoFocus}
        aria-label="Заметка дня"
        placeholder="Что было важного, что волновало — пара слов"
        value={value}
        onChange={(e) => change(e.target.value)}
        className="max-h-[60dvh] min-h-[88px] resize-none rounded-xl border border-line2 bg-card px-4 py-3 text-base text-ink outline-none placeholder:text-ink3 focus:border-ink2"
      />
      {dirty && (
        <div className="flex items-center gap-2">
          <Button className="h-11 flex-1" onClick={submit}>
            Сохранить
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              change(saved ?? '')
              onDone?.()
            }}
          >
            Отменить
          </Button>
        </div>
      )}
    </div>
  )
}
