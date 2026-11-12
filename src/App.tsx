import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { AuthProvider } from '@/app/auth'
import { persistQueryCache } from '@/app/queryCache'
import { ToastProvider } from '@/app/toast'
import { AppShell } from '@/components/layout/AppShell'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { SkeletonCard } from '@/components/ui/Feedback'
import { TodayScreen } from '@/features/today/TodayScreen'

// Screens other than «Сегодня» load on first visit (own chunks): the shell opens fast on the phone.
const SettingsScreen = lazy(() => import('@/features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })))
const BodyScreen = lazy(() => import('@/features/body/BodyScreen').then((m) => ({ default: m.BodyScreen })))
const MoneyScreen = lazy(() => import('@/features/money/MoneyScreen').then((m) => ({ default: m.MoneyScreen })))
const StudyScreen = lazy(() => import('@/features/study/StudyScreen').then((m) => ({ default: m.StudyScreen })))
const WorkScreen = lazy(() => import('@/features/work/WorkScreen').then((m) => ({ default: m.WorkScreen })))
const ItemScreen = lazy(() => import('@/features/items/ItemScreen').then((m) => ({ default: m.ItemScreen })))
const ReviewScreen = lazy(() => import('@/features/review/ReviewScreen').then((m) => ({ default: m.ReviewScreen })))
const JournalScreen = lazy(() => import('@/features/journal/JournalScreen').then((m) => ({ default: m.JournalScreen })))
const CalendarScreen = lazy(() => import('@/features/calendar/CalendarScreen').then((m) => ({ default: m.CalendarScreen })))

function Lazy({ page: Page }: { page: LazyExoticComponent<ComponentType> }) {
  return (
    <Suspense fallback={<SkeletonCard className="mt-8" />}>
      <Page />
    </Suspense>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime: keep data for the offline cache (persisted to IndexedDB, restored at start)
    queries: { staleTime: 30_000, gcTime: 24 * 3_600_000, refetchOnWindowFocus: true, refetchOnReconnect: true, retry: 1 },
    // mutations run offline too: writes go to the offline queue instead of waiting paused in memory
    mutations: { networkMode: 'always' },
  },
})
persistQueryCache(queryClient)

const router = createBrowserRouter([
  { path: '/login', element: <LoginScreen /> },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <TodayScreen /> },
      { path: 'money/*', element: <Lazy page={MoneyScreen} /> },
      { path: 'work/*', element: <Lazy page={WorkScreen} /> },
      { path: 'study/*', element: <Lazy page={StudyScreen} /> },
      { path: 'body/*', element: <Lazy page={BodyScreen} /> },
      { path: 'item/:id', element: <Lazy page={ItemScreen} /> },
      { path: 'calendar', element: <Lazy page={CalendarScreen} /> },
      { path: 'journal', element: <Lazy page={JournalScreen} /> },
      { path: 'review', element: <Lazy page={ReviewScreen} /> },
      { path: 'settings', element: <Lazy page={SettingsScreen} /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
