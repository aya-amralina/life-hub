import { useState } from 'react'
import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/app/authContext'
import { useOnline } from '@/app/online'
import { Fab } from '@/components/ui/Fab'
import { OfflinePill, SkeletonCard } from '@/components/ui/Feedback'
import { TabBar } from '@/components/ui/TabBar'
import { AddSheet } from '@/features/add/AddSheet'

/** Authenticated frame: 16px gutters, 560px column, tab bar and «+» on every screen. */
export function AppShell() {
  const { session, loading } = useAuth()
  const online = useOnline()
  const [adding, setAdding] = useState(false)

  if (loading) {
    return (
      <main className="mx-auto flex max-w-[560px] flex-col gap-4 px-4 pt-20">
        <SkeletonCard />
        <SkeletonCard />
      </main>
    )
  }
  if (!session) return <Navigate to="/login" replace />

  return (
    <>
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
      <Fab onClick={() => setAdding(true)} />
      <TabBar />
      <AddSheet open={adding} onClose={() => setAdding(false)} />
    </>
  )
}
