export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'lifehub.theme'
const BG = { light: '#F6F4EF', dark: '#171614' } as const

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function resolved(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Sets <html data-theme> and the status-bar colour. */
export function applyTheme(pref: ThemePref = getThemePref()): void {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BG[resolved(pref)])
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    // storage unavailable — theme still applies for this session
  }
  applyTheme(pref)
}

export function watchSystemTheme(): void {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme('system')
  })
}
