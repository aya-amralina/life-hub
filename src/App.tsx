import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { AuthProvider } from '@/app/auth'
import { ToastProvider } from '@/app/toast'
import { AppShell } from '@/components/layout/AppShell'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { SettingsScreen } from '@/features/settings/SettingsScreen'
import { BodyScreen } from '@/features/body/BodyScreen'
import { MoneyScreen } from '@/features/money/MoneyScreen'
import { StudyScreen } from '@/features/study/StudyScreen'
import { WorkScreen } from '@/features/work/WorkScreen'
import { TodayScreen } from '@/features/today/TodayScreen'

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
      { path: 'money/*', element: <MoneyScreen /> },
      { path: 'work/*', element: <WorkScreen /> },
      { path: 'study/*', element: <StudyScreen /> },
      { path: 'body/*', element: <BodyScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
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
