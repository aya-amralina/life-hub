import { NotebookPen } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import type { ISODate } from '@/lib/dates'
import { NoteEditor } from './NoteEditor'

/** «Заметка дня» on Тело → День; the header leads to the journal of all notes. */
export function DayNoteCard({ date }: { date: ISODate }) {
  return (
    <Card>
      <CardHeader title="Заметка дня" icon={<NotebookPen size={20} strokeWidth={1.75} aria-hidden="true" className="text-ink2" />} context="журнал" to="/journal" />
      <NoteEditor date={date} />
    </Card>
  )
}
