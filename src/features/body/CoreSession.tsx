import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { CheckItem } from '@/components/ui/CheckItem'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { YesNo } from '@/components/ui/YesNo'
import { formatDayMonth, todayBerlin } from '@/lib/dates'
import {
  fingersText,
  isSessionDone,
  isTestDay,
  nextStage,
  nextStagePhrase,
  nextTestDay,
  parseStages,
  programWeek,
  rulesLine,
  stageOf,
  toggleExercise,
} from '@/lib/rules/core'
import { useCoreProgram, useCoreSessions, useCoreTests, useSaveCoreSession } from './coreApi'
import { StageOffer } from './CoreCard'
import { CoreTestSheet } from './CoreTestSheet'

/**
 * Тело → Кор: today's session. The rules small on top, the exercises of the current stage with ticks, at the end
 * «Домик был?» and «Готово» (the session counts in the habit calendar). Below — the way to the next stage and the
 * finger tests.
 */
export function CoreSession() {
  const today = todayBerlin()
  const program = useCoreProgram()
  const sessions = useCoreSessions()
  const tests = useCoreTests()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [testing, setTesting] = useState(false)
  const p = program.data
  const save = useSaveCoreSession({ id: p?.id ?? '', stage: p?.stage ?? 1 }, today)

  if (program.isPending || sessions.isPending) return <SkeletonCard />
  if (!p) return <EmptyState title="Программы пока нет">Она появится здесь, когда будет заведена.</EmptyState>
  if (today < p.start_date) return <EmptyState title="Кор ещё не начался">{`Старт ${formatDayMonth(p.start_date)}.`}</EmptyState>

  const all = sessions.data ?? []
  const session = all.find((s) => s.program_id === p.id && s.date === today)
  const done = session?.done ?? []
  const dome = session?.dome ?? null
  const finished = isSessionDone(session)
  const stage = stageOf(p)
  const total = parseStages(p.stages).length
  const next = nextStage(p, all, today)
  const phrase = nextStagePhrase(next)
  const testList = [...(tests.data ?? [])].reverse()
  const testToday = isTestDay(p, today) && !testList.some((t) => t.date === today)
  const back = () => (location.key !== 'default' ? navigate(-1) : navigate('/body'))

  return (
    <>
      <p className="m-0 -mt-2 text-cap text-ink2">
        Этап {p.stage} из {total}, неделя {programWeek(p.start_date, today)}. Около {p.minutes} мин
      </p>
      {next.kind === 'offer' && (
        <Card>
          <StageOffer program={p} next={next} today={today} />
        </Card>
      )}
      {p.rules.length > 0 && <p className="m-0 rounded-xl bg-sub px-3 py-2 text-cap text-ink2">{rulesLine(p.rules)}</p>}

      {stage && stage.exercises.length > 0 ? (
        <ul aria-label={`Упражнения этапа ${p.stage}`} className="m-0 flex list-none flex-col gap-2 p-0">
          {stage.exercises.map((e) => (
            <li key={e.key}>
              <CheckItem
                title={e.name}
                meta={[e.dose, e.detail].filter(Boolean).join(' · ') || undefined}
                checked={done.includes(e.key)}
                onToggle={() => save.mutate({ done: toggleExercise(done, e.key) })}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={`Упражнения этапа ${p.stage} появятся позже`}>{stage?.note ?? 'Пока — по правилам выше.'}</EmptyState>
      )}

      <Card>
        <YesNo label="Домик был?" value={dome} onChange={(v) => save.mutate({ dome: v })} clearable />
        {finished ? (
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-base">Сессия засчитана</span>
            <Button variant="quiet" onClick={() => save.mutate({ done_at: null })}>
              Не засчитывать
            </Button>
          </div>
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={dome === null}
              onClick={() => {
                // the toast waits for the answer: «засчитан» only when the server has it (or it honestly waits for the network);
                // a rejection rolls the mark back and says so (useSaveCoreSession)
                save
                  .mutateAsync({ done_at: new Date().toISOString(), minimal: false })
                  .then((r) =>
                    toast({
                      text: r === 'queued' ? 'Кор засчитан на телефоне — отправится, когда будет сеть' : 'Кор засчитан',
                      actionLabel: 'Отменить',
                      onAction: () => save.mutate({ done_at: null }),
                    }),
                  )
                  .catch(() => {})
                back()
              }}
            >
              Готово
            </Button>
            {dome === null && <p className="m-0 text-cap text-ink2">Сначала ответь про домик — по нему видно, когда переходить дальше.</p>}
          </>
        )}
      </Card>

      <p className="m-0 text-cap text-ink2">
        {[phrase, testToday ? 'Сегодня тест пальцами.' : `Тест пальцами ${formatDayMonth(nextTestDay(p, today))}.`].filter(Boolean).join(' ')}
      </p>

      <Card>
        <CardHeader title="Тест пальцами" dotClass="bg-body" context={`раз в ${p.test_every_days / 7} нед.`} />
        {testList.length === 0 ? (
          <p className="m-0 text-cap text-ink2">Первый — {formatDayMonth(nextTestDay(p, p.start_date))}. В этот день напомню на «Сегодня».</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {testList.map((t) => (
              <li key={t.id} className="flex min-h-11 items-center gap-3 border-t border-line text-base first:border-t-0 tabular-nums">
                <span className="w-14 flex-none text-ink2">{formatDayMonth(t.date)}</span>
                <span className="min-w-0 flex-1">
                  {[t.fingers === null ? null : fingersText(Number(t.fingers)), t.dome === null ? null : t.dome ? 'домик был' : 'без домика'].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button variant={testToday ? 'primary' : 'secondary'} onClick={() => setTesting(true)}>
          {testToday ? 'Записать тест сегодня' : 'Записать тест'}
        </Button>
      </Card>
      <CoreTestSheet open={testing} onClose={() => setTesting(false)} programId={p.id} date={today} />
    </>
  )
}
