import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { AuthProvider } from '@/app/auth'
import { ToastProvider } from '@/app/toast'
import { AppShell } from '@/components/layout/AppShell'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { SettingsScreen } from '@/features/settings/SettingsScreen'
import { SpherePlaceholder } from '@/features/SpherePlaceholder'
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
      { path: 'money/*', element: <SpherePlaceholder title="Деньги" soon="Неделя, лимиты и быстрая трата — на этапе 2." /> },
      { path: 'work/*', element: <SpherePlaceholder title="Работа" soon="Список задач со статусами — на этапе 2." /> },
      { path: 'study/*', element: <SpherePlaceholder title="Учёба" soon="Неделя: ёмкость, предметы и чекбоксы — на этапе 2." /> },
      { path: 'body/*', element: <SpherePlaceholder title="Тело" soon="Отметка дня и этапы — на этапе 2." /> },
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
