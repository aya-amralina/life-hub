import { useState } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, LogOut } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/authContext'
import { getThemePref, setThemePref, type ThemePref } from '@/app/theme'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { supabase } from '@/lib/supabase'
import { InstallHint } from './InstallHint'

const THEMES = [
  { value: 'system', label: 'Авто' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
] as const

export function SettingsScreen() {
  const { session } = useAuth()
  const qc = useQueryClient()
  const [theme, setTheme] = useState<ThemePref>(getThemePref)

  return (
    <>
      <ScreenHeader
        title="Настройки"
        left={
          <Link
            to="/"
            aria-label="Назад"
            className="mt-0.5 flex size-11 flex-none items-center justify-center rounded-xl border border-line2 text-ink active:bg-sub"
          >
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        }
      />
      <Card>
        <CardHeader title="Тема" />
        <SegmentedTabs
          label="Тема"
          segments={THEMES}
          value={theme}
          onChange={(t) => {
            setTheme(t)
            setThemePref(t)
          }}
        />
      </Card>
      <Card>
        <CardHeader title="Установка" />
        <InstallHint />
      </Card>
      <Card>
        <CardHeader title="Аккаунт" />
        <div className="text-cap text-ink2 [overflow-wrap:anywhere]">{session?.user.email}</div>
        <Button
          variant="secondary"
          icon={<LogOut size={20} strokeWidth={1.75} aria-hidden="true" />}
          onClick={async () => {
            await supabase.auth.signOut()
            qc.clear()
          }}
        >
          Выйти
        </Button>
      </Card>
      <p className="m-0 text-cap text-ink3">Экспорт и восстановление данных появятся на этапе 4.</p>
    </>
  )
}
