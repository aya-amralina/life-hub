import { useState } from 'react'
import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { ChevronLeft, NotebookPen, Pencil, Search, Sparkles, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { cn } from '@/components/ui/cn'
import { addDaysISO, formatDayMonth, parseISODate, todayBerlin, type ISODate } from '@/lib/dates'
import { plural } from '@/lib/format'
import { byMonth, dayContext, journalEntries, longNote, searchJournal, type JournalEntry } from '@/lib/rules/journal'
import { useJournal } from './api'
import { NoteEditor } from './NoteEditor'

const dayTitle = (iso: ISODate, today: ISODate) => {
  const d = format(parseISODate(iso), 'EEEE, d MMMM', { locale: ru })
  if (iso === today) return `Сегодня · ${d}`
  if (iso === addDaysISO(today, -1)) return `Вчера · ${d}`
  return d.charAt(0).toUpperCase() + d.slice(1)
}
const monthTitle = (ym: string) => {
  const m = format(parseISODate(`${ym}-01`), 'LLLL yyyy', { locale: ru })
  return m.charAt(0).toUpperCase() + m.slice(1)
}

/**
 * Журнал: saved day notes and week thoughts — newest first, by month. Calm on purpose: no streaks, no counts per day,
 * no charts; a long note folds; search appears only when there is something to search in. Today without a note —
 * one quiet line to write it.
 */
export function JournalScreen() {
  const navigate = useNavigate()
  const today = todayBerlin()
  const journal = useJournal()
  const [query, setQuery] = useState('')
  const [writingToday, setWritingToday] = useState(false)

  const entries = journal.data ? journalEntries(journal.data.logs, journal.data.weeks) : []
  const shown = searchJournal(entries, query)
  const hasToday = entries.some((e) => e.kind === 'day' && e.date === today)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2 pt-4">
        <IconButton shape="square" label="Назад" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-big font-semibold tracking-[-0.01em]">Журнал</h1>
        </div>
      </header>
      <p className="m-0 -mt-2 text-cap text-ink2">Заметки дней и мысли недели. Только для тебя — без оценок и стриков.</p>

      {journal.isPending ? (
        <SkeletonCard />
      ) : (
        <>
          {!hasToday &&
            (writingToday ? (
              <Card>
                <div className="text-cap text-ink2">{dayTitle(today, today)}</div>
                <NoteEditor date={today} autoFocus onDone={() => setWritingToday(false)} />
              </Card>
            ) : (
              <button type="button" onClick={() => setWritingToday(true)} className="flex min-h-12 items-center gap-3 rounded-2xl border border-dashed border-line2 px-4 text-left text-base text-ink2 active:bg-sub">
                <NotebookPen size={20} strokeWidth={1.75} aria-hidden="true" />
                Сегодня ещё без записи — написать пару слов
              </button>
            ))}

          {entries.length >= 5 && (
            <label className="flex h-11 items-center gap-2 rounded-xl border border-line2 bg-card px-3 focus-within:border-ink2">
              <Search size={16} strokeWidth={1.75} aria-hidden="true" className="text-ink3" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти слово — «тревога», «сон»…" aria-label="Поиск по журналу" className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink3" />
              {query && (
                <IconButton label="Очистить поиск" onClick={() => setQuery('')} className="size-8 bg-transparent">
                  <X size={16} strokeWidth={2} aria-hidden="true" />
                </IconButton>
              )}
            </label>
          )}

          {entries.length === 0 ? (
            <EmptyState title="Пока ни одной записи">Заметка дня живёт в Тело → День. Сохранённые заметки собираются здесь — по дням, чтобы потом видеть, что волновало и что помогало.</EmptyState>
          ) : shown.length === 0 ? (
            <p className="m-0 text-cap text-ink2">По «{query.trim()}» ничего не нашлось.</p>
          ) : (
            byMonth(shown).map((m) => (
              <section key={m.month} aria-label={monthTitle(m.month)} className="flex flex-col gap-2">
                <h2 className="m-0 flex items-baseline gap-2 pt-2 text-base font-semibold">
                  {monthTitle(m.month)}
                  <span className="text-cap font-normal text-ink2 tabular-nums">
                    {m.entries.length} {plural(m.entries.length, ['запись', 'записи', 'записей'])}
                  </span>
                </h2>
                {m.entries.map((e) => (
                  <Entry key={`${e.kind}:${e.date}`} e={e} today={today} />
                ))}
              </section>
            ))
          )}
        </>
      )}
    </div>
  )
}

function Entry({ e, today }: { e: JournalEntry; today: ISODate }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const folds = longNote(e.text)
  const context = e.kind === 'day' ? dayContext(e) : ''
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-2">
        {e.kind === 'week' && <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink2" />}
        <h3 className="m-0 min-w-0 flex-1 text-cap font-semibold text-ink2">
          {e.kind === 'week' ? `Мысль на неделю · ${formatDayMonth(e.monday)} — ${formatDayMonth(e.date)}` : dayTitle(e.date, today)}
        </h3>
        {e.kind === 'day' && !editing && (
          <IconButton label={`Изменить запись за ${formatDayMonth(e.date)}`} onClick={() => setEditing(true)} className="-my-2 -mr-2 bg-transparent text-ink3">
            <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        )}
      </div>
      {editing ? (
        <NoteEditor date={e.date} autoFocus onDone={() => setEditing(false)} />
      ) : (
        <>
          <p className={cn('m-0 text-base whitespace-pre-wrap [overflow-wrap:anywhere]', folds && !open && 'line-clamp-4')}>{e.text}</p>
          {folds && (
            <Button variant="quiet" className="-ml-3 self-start text-cap" onClick={() => setOpen(!open)}>
              {open ? 'Свернуть' : 'Показать полностью'}
            </Button>
          )}
        </>
      )}
      {context && <div className="text-cap text-ink3 tabular-nums">{context}</div>}
    </article>
  )
}
