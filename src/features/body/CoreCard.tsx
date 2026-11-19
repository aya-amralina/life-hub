import { useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/components/ui/cn'
import { SkeletonCard } from '@/components/ui/Feedback'
import type { ISODate } from '@/lib/dates'
import { coreLine, isSessionDone, isTestDay, nextStage, snoozePatch, switchPatch, weekDaysActive, weekSessions, type NextStage } from '@/lib/rules/core'
import { useDailyLog } from './api'
import { CORE_PATH, useCoreProgram, useCoreSessions, useCoreTests, useSaveCoreSession, useUpdateCoreProgram, type CoreProgram } from './coreApi'
import { useHabits } from './habitsApi'
import { useItemSeries } from './healthApi'
import { useItems } from '@/features/items/api'
import { seriesItemOn } from '@/lib/rules/health'
import { CoreTestSheet } from './CoreTestSheet'

const linkButton = 'inline-flex h-12 flex-none items-center justify-center rounded-xl border border-line2 bg-card px-4 text-base font-semibold text-ink no-underline active:scale-[.98] active:bg-sub'

/**
 * «Кор» on «Сегодня» and on «Тело»: the stage and week, «Начать» (or «Засчитано» once the session is done), the offer
 * to move to the next stage and, on a test day, the finger test. Nothing before the program starts.
 */
export function CoreCard({ today }: { today: ISODate }) {
  const program = useCoreProgram()
  const sessions = useCoreSessions()
  const tests = useCoreTests()
  const log = useDailyLog(today)
  const habits = useHabits()
  const items = useItems()
  const series = useItemSeries()
  const [testing, setTesting] = useState(false)
  const save = useSaveCoreSession({ id: program.data?.id ?? '', stage: program.data?.stage ?? 1 }, today)
  if (program.isPending || sessions.isPending || habits.isPending) return <SkeletonCard />
  const p = program.data
  if (!p || today < p.start_date) return null
  const all = sessions.data ?? []
  // «Тяжёлый день»: the minimal version of the habit («Дыхание 360° — 10 вдохов»), a session marked minimal
  const habit = habits.data?.habits.find((h) => h.kind === 'program' && h.program_id === p.id)
  if (log.data?.minimum_mode) {
    if (!habit?.in_minimum) return null
    const session = all.find((s) => s.program_id === p.id && s.date === today)
    return <CoreMinimal note={habit.minimum_note} done={isSessionDone(session)} full={isSessionDone(session) && !session?.minimal} onDone={() => save.mutate({ done_at: new Date().toISOString(), minimal: true })} onUndo={() => save.mutate({ done_at: null, minimal: false })} />
  }
  const done = isSessionDone(all.find((s) => s.program_id === p.id && s.date === today))
  const next = nextStage(p, all, today)
  // on a «Замеры» day the test is part of the measurement form — no reminder of its own
  const measureDay = Boolean(seriesItemOn(series.data ?? [], (items.data ?? []).filter((i) => i.sphere === 'body'), 'Замеры', today))
  const testDue = isTestDay(p, today) && !measureDay && !(tests.data ?? []).some((t) => t.date === today)

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="size-2 flex-none rounded-full bg-body" />
            <h2 className="m-0 text-base font-semibold">Кор</h2>
          </div>
          <div className="text-cap text-ink2 tabular-nums">
            {coreLine(p, today)} · на неделе {weekSessions(all, today)} из {weekDaysActive(p.start_date, today)}
          </div>
        </div>
        {done ? (
          <Link to={CORE_PATH} aria-label="Кор засчитан — открыть" className={cn(linkButton, 'gap-2 border-transparent bg-transparent font-normal text-ink2')}>
            <CircleCheck size={20} strokeWidth={1.75} aria-hidden="true" className="text-body" />
            Засчитано
          </Link>
        ) : (
          <Link to={CORE_PATH} className={linkButton}>
            Начать
          </Link>
        )}
      </div>
      {next.kind === 'offer' && <StageOffer program={p} next={next} today={today} />}
      {testDue && (
        <div className="flex items-center gap-3 border-t border-line pt-3">
          <span className="min-w-0 flex-1">
            <span className="block text-base">Сегодня тест пальцами</span>
            <span className="block text-cap text-ink2">Ширина в пальцах и был ли домик</span>
          </span>
          <Button variant="secondary" onClick={() => setTesting(true)}>
            Записать
          </Button>
        </div>
      )}
      <CoreTestSheet open={testing} onClose={() => setTesting(false)} programId={p.id} date={today} />
    </Card>
  )
}

/** «Кор» on a «Тяжёлый день»: only the minimal version, one tap. A full session of the day stays full. */
function CoreMinimal({ note, done, full, onDone, onUndo }: { note: string | null; done: boolean; full: boolean; onDone: () => void; onUndo: () => void }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="size-2 flex-none rounded-full bg-body" />
            <h2 className={cn('m-0 text-base font-semibold', done && 'text-ink3')}>Кор · минимум</h2>
          </div>
          <div className={cn('text-cap', done ? 'text-ink3' : 'text-ink2')}>{note ?? 'Сколько получится'}</div>
        </div>
        {done ? (
          <button type="button" onClick={full ? undefined : onUndo} disabled={full} className={cn(linkButton, 'gap-2 border-transparent bg-transparent font-normal text-ink2')} aria-label={full ? 'Кор засчитан' : 'Кор минимум засчитан — отменить'}>
            <CircleCheck size={20} strokeWidth={1.75} aria-hidden="true" className="text-body" />
            Засчитано
          </button>
        ) : (
          <Button variant="secondary" onClick={onDone}>
            Сделала
          </Button>
        )}
      </div>
    </Card>
  )
}

/** «Переходим на этап 2?» → «Перейти» / «Ещё неделю». The app offers, the user switches. */
export function StageOffer({ program, next, today }: { program: Pick<CoreProgram, 'id'>; next: Extract<NextStage, { kind: 'offer' }>; today: ISODate }) {
  const update = useUpdateCoreProgram()
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <div>
        <div className="text-base font-semibold">Переходим на этап {next.next.no}?</div>
        <div className="text-cap text-ink2">Срок этапа прошёл, последние 7 сессий — без домика.</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => update.mutate({ id: program.id, patch: switchPatch(next.next, today) })}>Перейти</Button>
        <Button variant="secondary" onClick={() => update.mutate({ id: program.id, patch: snoozePatch(today) })}>
          Ещё неделю
        </Button>
      </div>
    </div>
  )
}
