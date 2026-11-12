import { createContext, useContext, useEffect } from 'react'

/** A screen asks the shell for the full width (the table view); the shell drops the 560px column while it is on. */
export const WideContext = createContext<(on: boolean) => void>(() => {})

export function useWideLayout(on: boolean) {
  const setWide = useContext(WideContext)
  useEffect(() => {
    setWide(on)
    return () => setWide(false)
  }, [on, setWide])
}
