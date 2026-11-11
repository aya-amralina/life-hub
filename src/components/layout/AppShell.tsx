import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { Navigate, Outlet } from 'react-router'
import { AddSheetContext, type AddMode, type OpenAdd } from '@/app/addSheetContext'
import { useAuth } from '@/app/authContext'
import { useOnline } from '@/app/online'
import { Fab } from '@/components/ui/Fab'
import { OfflinePill, SkeletonCard } from '@/components/ui/Feedback'
import { TabBar } from '@/components/ui/TabBar'
import type { Sphere } from '@/lib/constants'
import { AddSheet } from '@/features/add/AddSheet'
import { useRollover } from '@/features/study/useRollover'

const SPHERE_BY_PATH: Record<string, Sphere> = { money: 'money', work: 'work', study: 'study', body: 'body' }
const sphereForPath = (path: string): Sphere => SPHERE_BY_PATH[path.split('/')[1] ?? ''] ?? 'personal'

/** Authenticated frame: 16px gutters, 560px column, tab bar and «+» on every screen. */
export function AppShell() {
  const { session, loading } = useAuth()
  const online = useOnline()
  const [adding, setAdding] = useState<{ mode: AddMode; sphere: Sphere; date?: string } | null>(null)

  // Read the path at tap time: router navigations are transitions, so render-time location can still
  // be the previous screen when «+» is tapped right after switching tabs.
  const openAdd = useCallback<OpenAdd>((mode, opts) => {
    const routeSphere = sphereForPath(window.location.pathname)
    setAdding({ mode: mode ?? (routeSphere === 'money' ? 'expense' : 'item'), sphere: opts?.sphere ?? routeSphere, date: opts?.date })
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
  adding: { mode: AddMode; sphere: Sphere; date?: string } | null
  setAdding: Dispatch<SetStateAction<{ mode: AddMode; sphere: Sphere; date?: string } | null>>
  openAdd: OpenAdd
  close: () => void
  online: boolean
}) {
  useRollover()

  return (
    <AddSheetContext.Provider value={openAdd}>
      <main
        className="pt-safe mx-auto flex max-w-[560px] flex-col gap-4 px-4"
        style={{ paddingBottom: 'calc(max(8px, env(safe-area-inset-bottom)) + 62px + 104px)' }}
      >
        {!online && (
          <div className="pt-4">
            <OfflinePill>Офлайн · изменения отправятся, когда появится сеть</OfflinePill>
          </div>
        )}
        <Outlet />
      </main>
      <Fab onClick={() => openAdd()} />
      <TabBar />
      <AddSheet
        open={adding !== null}
        onClose={close}
        mode={adding?.mode ?? 'item'}
        onMode={(mode) => setAdding((a) => (a ? { ...a, mode } : a))}
        sphere={adding?.sphere ?? 'personal'}
        date={adding?.date}
      />
    </AddSheetContext.Provider>
  )
}
