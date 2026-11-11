import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { AuthProvider } from '@/app/auth'
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
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, refetchOnReconnect: true, retry: 1 },
  },
})

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
