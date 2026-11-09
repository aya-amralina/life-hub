import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { AuthContext, type AuthState } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true })

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ session: data.session, loading: false })
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, loading: false })
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
