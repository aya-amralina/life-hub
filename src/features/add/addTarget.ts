import type { AddForm } from '@/app/addSheetContext'

const SPHERE_FORM: Record<string, AddForm> = { money: 'expense', work: 'work', study: 'study', body: 'body' }

const root = (pathname: string) => pathname.split('/')[1] ?? ''

/** Sphere screens and their sections register their own «+»; the shell waits for it there. */
export function ownsAddAction(pathname: string): boolean {
  return root(pathname) in SPHERE_FORM
}

/** The form «+» opens when no screen registered its own: the sphere's main form, else the chooser. */
export function addFormFor(pathname: string): AddForm {
  return SPHERE_FORM[root(pathname)] ?? 'choose'
}
