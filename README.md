# Life Hub

Личное PWA вместо четырёх Excel-трекеров: деньги, работа, учёба, тело. Один пользователь, 0 € в месяц.
Стек: Vite + React + TypeScript, Tailwind, Supabase (Postgres + Auth + RLS), Vercel. Подробно — `docs/SPEC.md`, план — `docs/PLAN.md`, правила проекта — `CLAUDE.md`.

## Запуск локально

Нужны Node 24 (`nvm use`) и Python 3 с `openpyxl` (только для импорта).

```bash
nvm use
npm install
cp .env.example .env.local   # вписать ключи Supabase (см. ниже)
npm run dev                  # http://localhost:5173
```

Проверки:

```bash
npm run lint && npm test && npm run build
npm run test:e2e             # Playwright; вход в тесте — через admin API, нужен SUPABASE_SECRET_KEY в .env.local
npm run test:integration     # живые проверки Supabase: ключи, RLS, регистрация выключена
npm run check:keys           # то же со стороны скрипта импорта (Python)
```

### Переменные окружения

| Переменная | Где | Зачем |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `.env.local`, Vercel | адрес проекта Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local`, Vercel | публичный ключ `sb_publishable_…` (данные защищены RLS) |
| `SUPABASE_SECRET_KEY` | **только** `.env.local` | секретный ключ `sb_secret_…`: импорт из Excel и тесты; никогда во фронтенд, в `VITE_*` или в git |
| `LIFEHUB_EMAIL` | `.env.local` | твой e-mail: импорт и e2e-тест находят по нему пользователя |

Ключи — только нового формата (Supabase → Project Settings → API Keys), legacy `anon` / `service_role` не используются. Если в `VITE_*` случайно окажется `sb_secret_…`, сборка упадёт.

## База данных

Схема меняется только миграциями в `supabase/migrations/`.

```bash
npx supabase login                       # один раз
npx supabase link --project-ref <ref>    # один раз
npm run db:push                          # применить новые миграции
npm run db:types                         # обновить src/lib/db/types.ts
```

## Деплой

`main` = прод. Vercel собирает каждый пуш в `main` автоматически, ветки получают preview-ссылки.

1. Пуш в GitHub (`git push`) → Vercel собирает `npm run build` и публикует `dist/`.
2. Новые миграции применить до пуша кода, который на них опирается: `npm run db:push`.
3. После деплоя открыть приложение на телефоне — service worker обновится сам при следующем запуске.

Первичная настройка (один раз): приватный репозиторий на GitHub → Supabase Free (Frankfurt) → Vercel Hobby (пресет Vite, env `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` для Production и Preview). В Supabase Auth: Site URL = прод-адрес, Redirect URLs = прод-адрес и `http://localhost:5173`, свой пользователь создан, регистрация выключена, в шаблон письма «Magic Link» добавлен код `{{ .Token }}` (текст — `supabase/templates/magic_link.html`).

## Вход

Только magic link на твою почту. В письме есть ссылка и код: в браузере удобнее ссылка, в установленном на iPhone приложении — код (у PWA на iOS своё хранилище, ссылка из почты откроется в Safari).

## Экспорт и восстановление

Появится на этапе 4 (Настройки → Экспорт JSON/CSV, Импорт JSON).

## Импорт из Excel

Появится на этапе 3: `python3 scripts/import/import.py --dry-run`, затем без `--dry-run`. Файлы лежат в `data/` и никогда не попадают в git.
