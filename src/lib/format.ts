const eur = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR' })
const eurWhole = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const decimal1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })

/** Normalize any whitespace Intl inserts (nbsp, narrow nbsp) to a regular no-break space; a real minus «−», not a hyphen. */
function nbsp(s: string): string {
  return s.replace(/[\u00a0\u202f ]/g, '\u00a0').replace('-', '\u2212')
}

/** Euro amount from cents: 3250 → '32,50 €'. `whole` drops ',00' for round sums: 2000 → '20 €'. */
export function formatEur(cents: number, opts: { whole?: boolean } = {}): string {
  const value = cents / 100 || 0 // −0 → 0: Intl would print «-0,00»
  const isWhole = Number.isInteger(value)
  return nbsp((opts.whole && isWhole ? eurWhole : eur).format(value))
}

const num2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

/** Amount without the currency sign, for «16,20 / 20 €»: 1620 → '16,20', with `whole` 2000 → '20'. */
export function formatAmount(cents: number, opts: { whole?: boolean } = {}): string {
  const value = cents / 100 || 0
  return nbsp((opts.whole && Number.isInteger(value) ? num0 : num2).format(value))
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

/** Apply a key to an amount string like '4,6' — at most 2 decimals, 6 integer digits. */
export function applyAmountKey(current: string, key: string): string {
  if (key === 'del') return current.slice(0, -1)
  if (key === ',') return current.includes(',') ? current : (current || '0') + ','
  const [int = '', dec] = current.split(',')
  if (dec !== undefined) return dec.length >= 2 ? current : current + key
  if (int === '0') return key
  return int.length >= 6 ? current : current + key
}

/** Russian plural: plural(2, ['день', 'дня', 'дней']) → 'дня'. */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b === 1) return forms[0]
  if (b >= 2 && b <= 4) return forms[1]
  return forms[2]
}

/** 'вода', 'вода и 10 минут на улице', 'a, b и c'. */
export function joinRu(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} и ${parts[parts.length - 1]}`
}

/** '14:00:00' (Postgres time) → '14:00'. */
export function formatTime(time: string): string {
  return time.slice(0, 5)
}

/** Chart numbers as the design writes them: «7,5», «1\u202f277», «−3»; null → «—». */
export function formatChartNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const rounded = Math.round(v * 10) / 10
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })
    .format(rounded)
    .replace('-', '\u2212')
    .replace(/[\u00a0\u202f]/g, '\u202f')
}
