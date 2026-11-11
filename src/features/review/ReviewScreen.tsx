import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ChevronRight, X } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { Button, IconButton } from '@/components/ui/Button'
import { SkeletonCard } from '@/components/ui/Feedback'
import { cn } from '@/components/ui/cn'
import type { Json } from '@/lib/db/types'
import { addDaysISO, formatDayMonth, todayBerlin } from '@/lib/dates'
import { REVIEW_STEPS, STEP_LABEL, reviewWeek, type ReviewStep } from '@/lib/rules/review'
import { useAllWeeks, useWeekRow } from '@/features/weeks/api'
import { useReview, useSaveReview } from './api'
import { AheadStep, BodyStep, MoneyStep, StudyStep, WorkStep } from './ReviewSteps'

export type Answers = { body?: string; work?: string; skipped?: ReviewStep[] }

/** Воскресный обзор (SPEC §5, design 7): 5 steps, any can be skipped; saved as you go, one row per week. */
export function ReviewScreen() {
  const today = todayBerlin()
  const monday = reviewWeek(today)
  const navigate = useNavigate()
  const weeks = useAllWeeks()
  const weekRow = useWeekRow()
  const [weekId, setWeekId] = useState<string | null>(null)
  const asked = useRef(false)
  const review = useReview(weekId)

  // the review needs the week row (created if the week had none yet) — asked once
  useEffect(() => {
    if (!weeks.data || asked.current) return
    asked.current = true
    void weekRow(monday, weeks.data).then((w) => setWeekId(w.id))
  }, [weeks.data, monday, weekRow])

  if (!weekId || review.isPending) {
    return (
      <div className="flex flex-col gap-4 pt-8">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }
  return <Wizard key={weekId} weekId={weekId} monday={monday} saved={review.data ?? null} onClose={() => navigate('/')} />
}

function Wizard({
  weekId,
  monday,
  saved,
  onClose,
}: {
  weekId: string
  monday: string
  saved: { answers: Json; balances: Json; impulse_note: string | null; week_thought: string | null; completed_at: string | null } | null
  onClose: () => void
}) {
  const save = useSaveReview()
  const toast = useToast()
  const weeks = useAllWeeks()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>((saved?.answers as Answers) ?? {})
  const [balances, setBalances] = useState<Record<string, string>>((saved?.balances as Record<string, string>) ?? {})
  const [impulse, setImpulse] = useState(saved?.impulse_note ?? '')
  const [thought, setThought] = useState(saved?.week_thought ?? '')
  const current = REVIEW_STEPS[step]!
  const week = weeks.data?.find((w) => w.start_date === monday)
  const range = `${formatDayMonth(monday)} — ${formatDayMonth(addDaysISO(monday, 6))}`

  const persist = (extra: Partial<{ completed_at: string }> = {}, skipped = answers.skipped) => {
    const cleanBalances = Object.fromEntries(Object.entries(balances).filter(([, v]) => v.trim()))
    save.mutate({
      weekId,
      patch: {
        answers: { ...answers, skipped } as Json,
        balances: cleanBalances as Json,
        impulse_note: impulse.trim() || null,
        week_thought: thought.trim() || null,
        ...extra,
      },
    })
  }
  const go = (to: number, skip = false) => {
    const skipped = skip ? [...new Set([...(answers.skipped ?? []), current])] : (answers.skipped ?? []).filter((s) => s !== current)
    setAnswers({ ...answers, skipped })
    persist({}, skipped)
    setStep(to)
    window.scrollTo({ top: 0 })
  }
  const finish = () => {
    persist({ completed_at: new Date().toISOString() })
    toast({ text: 'Обзор недели готов. Хорошей недели!' })
    onClose()
  }

  const title = current === 'ahead' ? 'Неделя вперёд' : STEP_LABEL[current]
  const sub =
    current === 'money'
      ? `${week?.budget_week_no ? `Неделя ${week.budget_week_no} · ` : ''}${range}`
      : current === 'study'
        ? `${week?.study_week ? `${week.study_week} · ` : ''}${range}`
        : current === 'ahead'
          ? `${formatDayMonth(addDaysISO(monday, 7))} — ${formatDayMonth(addDaysISO(monday, 13))}`
          : range

  return (
    <div className="flex flex-col gap-4 pb-28">
      <header className="grid grid-cols-[44px_1fr_auto] items-center gap-2 pt-4">
        <IconButton
          label="Закрыть обзор"
          onClick={() => {
            persist()
            onClose()
          }}
        >
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        <h1 className="m-0 text-center text-base font-semibold">Воскресный обзор</h1>
        <span className="text-cap text-ink2">~7 мин</span>
      </header>
      <nav aria-label="Шаги обзора" className="grid grid-cols-5 gap-1">
        {REVIEW_STEPS.map((s, i) => (
          <button key={s} type="button" onClick={() => go(i)} className="flex min-h-11 flex-col gap-1 text-left" aria-current={i === step ? 'step' : undefined}>
            <span className={cn('h-1 rounded-full', i === step ? 'bg-ink' : answers.skipped?.includes(s) ? 'bg-sub' : i < step ? 'bg-ink3' : 'bg-line2')} />
            <span className={cn('text-cap', i === step ? 'font-semibold text-ink' : 'text-ink2')}>{STEP_LABEL[s]}</span>
          </button>
        ))}
      </nav>
      <div>
        <div className="text-cap text-ink2">
          Шаг {step + 1} из {REVIEW_STEPS.length}
        </div>
        <h2 className="m-0 text-big font-semibold tracking-[-0.01em]">{title}</h2>
        <div className="text-cap text-ink2 tabular-nums">{sub}</div>
      </div>

      {current === 'money' && <MoneyStep monday={monday} balances={balances} onBalances={setBalances} impulse={impulse} onImpulse={setImpulse} />}
      {current === 'body' && <BodyStep monday={monday} note={answers.body ?? ''} onNote={(v) => setAnswers({ ...answers, body: v })} />}
      {current === 'study' && <StudyStep monday={monday} />}
      {current === 'work' && <WorkStep note={answers.work ?? ''} onNote={(v) => setAnswers({ ...answers, work: v })} />}
      {current === 'ahead' && <AheadStep monday={addDaysISO(monday, 7)} thought={thought} onThought={setThought} />}

      {step < REVIEW_STEPS.length - 1 && (
        <Button variant="quiet" className="self-start" onClick={() => go(step + 1, true)}>
          Пропустить шаг
        </Button>
      )}

      <BottomBar>
        <Button variant="secondary" onClick={() => go(step - 1)} disabled={step === 0}>
          Назад
        </Button>
        {step < REVIEW_STEPS.length - 1 ? (
          <Button onClick={() => go(step + 1)} icon={null}>
            Дальше: {STEP_LABEL[REVIEW_STEPS[step + 1]!]}
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        ) : (
          <Button onClick={finish}>Завершить обзор</Button>
        )}
      </BottomBar>
    </div>
  )
}

function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card">
      <div className="mx-auto grid max-w-[560px] grid-cols-[1fr_2fr] gap-2 px-4 pt-2">{children}</div>
    </div>
  )
}
