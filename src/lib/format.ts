const eur = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR' })
const eurWhole = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const decimal1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })

/** Normalize any whitespace Intl inserts (nbsp, narrow nbsp) to a regular no-break space. */
function nbsp(s: string): string {
  return s.replace(/[\u00a0\u202f ]/g, '\u00a0')
}

/** Euro amount from cents: 3250 → '32,50 €'. `whole` drops ',00' for round sums: 2000 → '20 €'. */
export function formatEur(cents: number, opts: { whole?: boolean } = {}): string {
  const value = cents / 100
  const isWhole = Number.isInteger(value)
  return nbsp((opts.whole && isWhole ? eurWhole : eur).format(value))
}

/** Euro amount from a decimal (as stored in numeric(10,2)) to integer cents. */
export function toCents(amount: number | string): number {
  return Math.round(Number(amount) * 100)
}

/** Parse user input like '4,6' or '4.60' to cents; null if invalid. */
export function parseEurInput(input: string): number | null {
  const s = input.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null
  return Math.round(Number(s) * 100)
}

/** 27.5 → '27,5 ч' */
export function formatHours(h: number): string {
  return `${decimal1.format(h)}\u00a0ч`
}
