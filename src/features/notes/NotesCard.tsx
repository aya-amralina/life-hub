import { useState } from 'react'
import { ChevronDown, Pin } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { Sphere } from '@/lib/constants'
import { useNotes } from './api'

/** Notes of a sphere: pinned first, three visible, the rest behind «Ещё N». Hidden when empty. */
export function NotesCard({ sphere }: { sphere: Sphere }) {
  const notes = useNotes(sphere)
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const list = notes.data ?? []
  if (!list.length) return null
  const shown = all ? list : list.slice(0, 3)
  return (
    <Card>
      <CardHeader title="Заметки" context={`${list.length}`} />
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {shown.map((n) => (
          <li key={n.id} className="rounded-xl border border-line">
            <button
              type="button"
              aria-expanded={open === n.id}
              onClick={() => setOpen(open === n.id ? null : n.id)}
              className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left text-base"
            >
              {n.pinned && <Pin size={16} strokeWidth={1.75} aria-label="Закреплено" className="flex-none text-ink2" />}
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{n.title}</span>
            </button>
            {open === n.id && n.body_md && (
              <p className="m-0 px-4 pb-3 text-base whitespace-pre-wrap text-ink2 [overflow-wrap:anywhere]">{n.body_md}</p>
            )}
          </li>
        ))}
      </ul>
      {list.length > 3 && !all && (
        <Button variant="quiet" className="-ml-3 self-start" onClick={() => setAll(true)}>
          Ещё {list.length - 3}
          <ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      )}
    </Card>
  )
}
