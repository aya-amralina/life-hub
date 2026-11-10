// Справочники из SPEC §3. Значения Работы и предметов хранятся как есть (немецкий).

export const SPHERES = ['work', 'study', 'body', 'money', 'personal'] as const
export type Sphere = (typeof SPHERES)[number]

export const SPHERE_LABEL: Record<Sphere, string> = {
  money: 'Деньги',
  work: 'Работа',
  study: 'Учёба',
  body: 'Тело',
  personal: 'Личное',
}

/** Tailwind classes per sphere: dot/fill colour and soft background. */
export const SPHERE_CLASS: Record<Sphere, { dot: string; soft: string; text: string }> = {
  money: { dot: 'bg-money', soft: 'bg-money-soft', text: 'text-money' },
  work: { dot: 'bg-work', soft: 'bg-work-soft', text: 'text-work' },
  study: { dot: 'bg-study', soft: 'bg-study-soft', text: 'text-study' },
  body: { dot: 'bg-body', soft: 'bg-body-soft', text: 'text-body' },
  personal: { dot: 'bg-ink3', soft: 'bg-sub', text: 'text-ink2' },
}

export const WORK_STATUSES = [
  'Offen',
  'In Arbeit',
  'Im Review',
  'Wartet auf Antwort',
  'Blockiert',
  'Geparkt',
  'Erledigt',
  'Verworfen',
] as const
export type WorkStatus = (typeof WORK_STATUSES)[number]
export const WORK_ACTIVE: readonly WorkStatus[] = ['Offen', 'In Arbeit', 'Im Review']
export const WORK_STALLED: readonly WorkStatus[] = ['Wartet auf Antwort', 'Blockiert', 'Geparkt']

export const WORK_TYPES = ['Aufgabe', 'Bug', 'Anfrage', 'Offene Frage', 'Follow-up', 'Idee'] as const
export const WORK_PRIORITIES = ['Hoch', 'Mittel', 'Niedrig'] as const
export const WORK_AREAS = [
  'H2-Registrierung',
  'H2-Marktplatz',
  'Kundendashboard',
  'Website & Marketing',
  'Karriere & Rolle',
  'Bachelorarbeit',
  'Organisatorisches',
  'LIS Front',
] as const

export const STUDY_TYPES = ['Лекция', 'HA', 'Сверка', 'Задача', 'Тест', 'Подготовка', 'Орга', 'Hausarbeit', 'Туториум'] as const
export const STUDY_STATUSES = ['открыто', 'готово'] as const

export const BODY_STATUSES = ['Не начато', 'В процессе', 'Готово'] as const

export const WEEK_CATEGORIES = [
  'Продукты',
  'Кофейни и перекусы',
  'Выходы и еда вне дома',
  'Мелочи',
  'Шопинг',
  'Доставка',
] as const
export type WeekCategory = (typeof WEEK_CATEGORIES)[number]

export const ACCOUNTS = ['Revolut', 'Sparkasse', 'Наличные', 'Казахстанская карта'] as const

/** Statuses that mean «closed» in any sphere (in addition to done_at). */
export const CLOSED_STATUSES: readonly string[] = ['Erledigt', 'Verworfen', 'готово', 'Готово']

/** Glow-up tracker dropdowns («Трекер»). */
export const WORKOUT_TYPES = ['Силовая A', 'Силовая B', 'Минимум 15 мин', 'Группа USC', 'Болдеринг', 'Йога', 'Прогулка'] as const
export const WORKOUT_MINUTES = [15, 30, 45, 60, 90] as const
export const FACE_EVENING = ['Ретиноид', 'Азелаинка', 'Пропуск'] as const
