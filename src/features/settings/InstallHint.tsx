import { useEffect, useState } from 'react'
import { Share, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const DISMISS_KEY = 'lifehub.installHintDismissed'

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

let deferred: BeforeInstallPromptEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
  })
}

/** «Поставить на телефон»: native prompt on Android/desktop Chrome, instructions on iOS Safari. */
export function InstallHint({ compact = false }: { compact?: boolean }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return compact && localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [canPrompt, setCanPrompt] = useState(deferred !== null)

  useEffect(() => {
    const onPrompt = () => setCanPrompt(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (isStandalone() || dismissed) return null
  if (!canPrompt && !isIOS()) return compact ? null : <p className="m-0 text-cap text-ink2">Приложение уже установлено или браузер не поддерживает установку.</p>

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore
    }
    setDismissed(true)
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="text-body font-semibold">Поставь Life Hub на телефон</div>
        {canPrompt ? (
          <Button
            variant="secondary"
            onClick={async () => {
              await deferred?.prompt()
              deferred = null
              setCanPrompt(false)
            }}
          >
            Установить
          </Button>
        ) : (
          <div className="text-cap text-ink2">
            В Safari нажми <Share size={14} strokeWidth={1.75} className="inline align-[-2px]" aria-label="Поделиться" /> и
            выбери «На экран „Домой“». Войти в приложении можно кодом из письма.
          </div>
        )}
      </div>
      {compact && (
        <button type="button" aria-label="Скрыть" onClick={dismiss} className="-m-2.5 flex size-11 flex-none items-center justify-center text-ink3">
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
