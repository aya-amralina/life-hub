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
import { CORE_PATH, useCoreProgram, useCoreSessions, useCoreTests, useUpdateCoreProgram, type CoreProgram } from './coreApi'
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
  const [testing, setTesting] = useState(false)
  if (program.isPending || sessions.isPending) return <SkeletonCard />
  const p = program.data
  // «минимум»: only the minimum set; «Кор» stays one tap deeper (Тело → Кор)
  if (!p || today < p.start_date || log.data?.minimum_mode) return null
  const all = sessions.data ?? []
  const done = isSessionDone(all.find((s) => s.program_id === p.id && s.date === today))
  const next = nextStage(p, all, today)
  const testDue = isTestDay(p, today) && !(tests.data ?? []).some((t) => t.date === today)

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
