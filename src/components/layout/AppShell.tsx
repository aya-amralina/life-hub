import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { flush, usePendingChanges } from '@/app/offlineQueue'
import { useRejectedWrites } from '@/app/rejectedWrites'
import { useToast } from '@/app/toastContext'
import { Navigate, Outlet, useLocation } from 'react-router'
import { AddActionContext, AddSheetContext, type AddForm, type OpenAdd } from '@/app/addSheetContext'
import { WideContext } from '@/app/layoutContext'
import { cn } from '@/components/ui/cn'
import { useAuth } from '@/app/authContext'
import { useOnline } from '@/app/online'
import { Fab } from '@/components/ui/Fab'
import { OfflinePill, SkeletonCard } from '@/components/ui/Feedback'
import { TabBar } from '@/components/ui/TabBar'
import type { Sphere } from '@/lib/constants'
import { plural } from '@/lib/format'
import { AddSheet } from '@/features/add/AddSheet'
import { addFormFor, ownsAddAction } from '@/features/add/addTarget'
import { useRollover } from '@/features/study/useRollover'

const SPHERE_BY_PATH: Record<string, Sphere> = { money: 'money', work: 'work', study: 'study', body: 'body' }
const sphereForPath = (path: string): Sphere => SPHERE_BY_PATH[path.split('/')[1] ?? ''] ?? 'personal'

type Adding = { form: AddForm; sphere: Sphere; date?: string; picked: boolean }

/** Authenticated frame: 16px gutters, 560px column, tab bar and «+» on every screen. */
export function AppShell() {
  const { session, loading } = useAuth()
  const online = useOnline()
  const [adding, setAdding] = useState<Adding | null>(null)

  // Read the path at tap time: router navigations are transitions, so render-time location can still
  // be the previous screen when «+» is tapped right after switching tabs.
  const openAdd = useCallback<OpenAdd>((form, opts) => {
    const path = window.location.pathname
    setAdding({ form: form ?? addFormFor(path), sphere: opts?.sphere ?? sphereForPath(path), date: opts?.date, picked: false })
  }, [])
  const close = useCallback(() => setAdding(null), [])

  if (loading) {
    return (
      <main className="mx-auto flex max-w-[560px] flex-col gap-4 px-4 pt-20">
        <SkeletonCard />
        <SkeletonCard />
      </main>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return <Shell adding={adding} setAdding={setAdding} openAdd={openAdd} close={close} online={online} />
}

/** Signed-in frame; background jobs (study rollover) run only with a session. */
function Shell({
  adding,
  setAdding,
  openAdd,
  close,
  online,
}: {
  adding: Adding | null
  setAdding: Dispatch<SetStateAction<Adding | null>>
  openAdd: OpenAdd
  close: () => void
  online: boolean
}) {
  useRollover()
  // a failed write is never silent (Деньги, Работа, Учёба, Тело …)
  useRejectedWrites()
  // the table view takes the full width (laptop); every other screen keeps the 560px column
  const [wide, setWide] = useState(false)
  const pending = usePendingChanges()
  const qc = useQueryClient()
  const toast = useToast()
  // send the offline queue: at start, when the network is back, when the app comes to the front
  useEffect(() => {
    const send = () =>
      void flush(qc).then(({ sent, dropped }) => {
        if (dropped) toast({ text: `${dropped} ${plural(dropped, ['изменение не принято', 'изменения не приняты', 'изменений не принято'])} сервером — проверь последние отметки` })
        else if (sent) toast({ text: `Отправлено изменений: ${sent}` })
      })
    send()
    const onVisible = () => document.visibilityState === 'visible' && send()
    window.addEventListener('online', send)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', send)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [qc, toast])
  // «+» adds what is on screen: the screen's own action (useAddAction), registered for its path.
  // Right after a tab switch the new screen may not have registered yet — wait for it a moment.
  const action = useRef<{ path: string; run: () => void } | null>(null)
  const register = useCallback((path: string, run: () => void) => {
    const entry = { path, run }
    action.current = entry
    return () => {
      if (action.current === entry) action.current = null
    }
  }, [])
  const tapPlus = useCallback(() => {
    const started = Date.now()
    const attempt = () => {
      const path = window.location.pathname
      const own = action.current
      if (own && own.path === path) return own.run()
      if (ownsAddAction(path) && Date.now() - started < 600) return void setTimeout(attempt, 30)
      openAdd()
    }
    attempt()
  }, [openAdd])
  // the Sunday review is full-screen: no tab bar, no «+» (design 7)
  const focus = useLocation().pathname.startsWith('/review')

  return (
    <AddSheetContext.Provider value={openAdd}>
      <AddActionContext.Provider value={register}>
      <WideContext.Provider value={setWide}>
      <main
        // from 1024 px the tab bar is a rail on the left (96px): the column is centred in what is left
        className={cn('pt-safe mx-auto flex flex-col gap-4 px-4 print:!pb-0', !focus && 'lg:pl-[112px]', wide ? 'max-w-none lg:pr-6' : 'max-w-[560px] lg:max-w-[672px]')}
        // above the tab bar (its measured height) and the «+» (56 + gaps); nothing extra in print
        style={{ paddingBottom: focus ? 'max(8px, env(safe-area-inset-bottom))' : 'calc(var(--nav-h) + 96px)' }}
      >
        {(!online || pending > 0) && (
          <div className="pt-4">
            <OfflinePill>
              {online
                ? `Отправляю ${pending} ${plural(pending, ['изменение', 'изменения', 'изменений'])}…`
                : pending > 0
                  ? `Офлайн · ${pending} ${plural(pending, ['изменение ждёт', 'изменения ждут', 'изменений ждут'])} сети`
                  : 'Офлайн · изменения отправятся, когда появится сеть'}
            </OfflinePill>
          </div>
        )}
        <Outlet />
      </main>
      {!focus && <Fab onClick={tapPlus} />}
      {!focus && <TabBar />}
      <AddSheet
        open={adding !== null}
        onClose={close}
        form={adding?.form ?? 'choose'}
        picked={adding?.picked ?? false}
        onPick={(form) => setAdding((a) => (a ? { ...a, form, picked: true } : a))}
        onBack={() => setAdding((a) => (a ? { ...a, form: 'choose', picked: false } : a))}
        sphere={adding?.sphere ?? 'personal'}
        date={adding?.date}
      />
      </WideContext.Provider>
      </AddActionContext.Provider>
    </AddSheetContext.Provider>
  )
}
