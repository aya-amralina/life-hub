# Life Hub — правила проекта

Личное PWA, заменяет четыре Excel-трекера (деньги, работа Localiser, учёба WiSe 26/27, тело/глоу-ап). Пользователь один.
Главный документ — `docs/SPEC.md`. План и прогресс — `docs/PLAN.md`. Дизайн — `design/` (не в git, только справка).

## Источники правды
- **Поведение, данные, правила** — `docs/SPEC.md`.
- **Внешний вид** — дизайн-система в `design/support.js` (это HTML, несмотря на расширение; `Life Hub Mobile.dc.html` — JPEG-скриншот). Экранов в бандле нет: экраны собираются из компонентов дизайн-системы.
- При расхождении: внешний вид — дизайн, поведение — SPEC.

## Стек (зафиксирован в SPEC, новые зависимости — только с обоснованием в коммите)
- Vite + React 19 + TypeScript strict, Tailwind CSS v4 (`@tailwindcss/vite`), React Router.
- Supabase (`@supabase/supabase-js`), TanStack Query v5.
- vite-plugin-pwa (Workbox), офлайн-очередь мутаций в IndexedDB.
- date-fns (неделя Пн–Вс, `weekStartsOn: 1`), часовой пояс Europe/Berlin через `Intl` (без доп. пакетов).
- Recharts, lucide-react (stroke 1.75).
- Vitest (бизнес-правила — обязательно), Playwright (дымовой: вход + «Сегодня»).
- Импорт: Python 3 + openpyxl, запись в Supabase через REST (stdlib `urllib`), только локально.
- Node ≥ 22 (`.nvmrc` = 24). Хостинг: Vercel Hobby, автодеплой из `main`.

## Команды
```bash
npm run dev            # http://localhost:5173
npm run build          # tsc -b && vite build
npm run lint           # eslint
npm test               # vitest run (unit, без сети)
npm run test:e2e       # playwright; вход формой e-mail + пароль (LIFEHUB_EMAIL, LIFEHUB_PASSWORD в .env.local)
npm run test:integration # живые тесты против Supabase (ключи, RLS, регистрация выключена), нужен .env.local
npm run test:import    # проверки импорта против базы (раздел 6 SPEC), нужен SUPABASE_SECRET_KEY
npm run check:keys     # Python: формат ключей, доступ secret/publishable, регистрация выключена
npm run db:push        # npx supabase db push — применить миграции к проекту
npm run db:types       # сгенерировать src/lib/db/types.ts из схемы
python3 scripts/import/import.py --dry-run   # сводка импорта без записи
python3 scripts/import/import.py             # импорт (идемпотентный, по source_id)
python3 -m unittest discover scripts/import  # тесты парсеров импорта
```
Готовность этапа: `npm run lint && npm test && npm run build` зелёные → коммит.

## Структура
```
src/
  main.tsx, App.tsx          # вход, роутер
  app/                       # провайдеры: QueryClient, auth, тема, офлайн-очередь
  components/ui/             # компоненты дизайн-системы (Button, Chip, Card, SegmentedTabs,
                             #   CheckItem, ProgressBar, HabitButton, Scale, StatusBadge,
                             #   TabBar, Fab, BottomSheet, Toast, Skeleton, EmptyState, OfflinePill)
  components/layout/         # AppShell (таб-бар + «+»), ScreenHeader
  features/<sphere>/         # today | money | work | study | body | review | settings | auth
    *Screen.tsx, components, api.ts (хуки TanStack Query)
  lib/
    supabase.ts              # клиент (только publishable key)
    db/types.ts              # сгенерированные типы
    rules/*.ts (+ .test.ts)  # бизнес-правила раздела 4 — чистые функции
    dates.ts, format.ts      # Берлин «сегодня», недели, форматы «32,50 €», «10.12», «Пн»
    constants.ts             # справочники (статусы, типы, Bereich, категории, счета)
  styles/index.css           # токены (CSS-переменные светлая/тёмная) + @theme Tailwind
supabase/migrations/         # схема — только миграциями
scripts/import/              # Python-импорт из data/*.xlsx + unittest
tests/e2e/                   # Playwright
public/                      # иконки PWA, шрифт Onest (woff2, self-hosted)
```

## Правила кода
- Бизнес-правила — только чистые функции в `src/lib/rules/`, на входе данные, на выходе результат; каждое покрыто тестом. Компоненты их вызывают, не дублируют логику. Ничего вычисляемого не хранится в базе.
- Даты в базе — `date` (без времени) + отдельное `due_time`. «Сегодня» всегда через `todayBerlin()` из `lib/dates.ts`, никогда `new Date()` напрямую в UI.
- Суммы — `numeric(10,2)` в базе, в коде считаем в центах (целые числа), форматируем через `formatEur`.
- Статусы Работы и названия предметов хранятся как есть (немецкий); такой текст в UI с `lang="de"` и `hyphens:auto`.
- Стили: Tailwind-утилиты поверх токенов (`bg-card`, `text-ink2`, `border-line` …). Цвета только из токенов, сырых hex в компонентах нет. Шрифт: только 400 и 600, размеры 13/16/20/32. Отступы по шагу 8 (4 допускается). Радиусы 16 (карточка, лист) / 12 (кнопка, чип, поле) / 8 (метка, чекбокс). Тень — только у листа и «+».
- Цвет сферы — только метка (точка 8px, иконка, заполнение прогресса), не фон экрана и не текст. Янтарный — перерасход/пропуск, красный — только «срок прошёл». Сигнал всегда с подписью.
- Тап-зоны ≥ 44px. Тексты интерфейса на русском, короткие и тёплые, без капса.
- Запросы к Supabase — только из `features/*/api.ts` через TanStack Query; оптимистичные обновления для отметок.
- Каждая таблица: `id`, `user_id default auth.uid()`, `created_at`, `updated_at` (триггер), `source_id` (уникален с `user_id`), RLS с 4 политиками `user_id = auth.uid()`.
- **Права — явно в миграции, у каждой новой таблицы** (в проекте выключено «Automatically expose new tables», включено «Enable automatic RLS», поэтому default privileges нет). Сразу после `create table`:
  ```sql
  alter table public.<t> enable row level security;
  revoke all on table public.<t> from anon, public;
  grant select, insert, update, delete on table public.<t> to authenticated;
  grant select, insert, update, delete on table public.<t> to service_role;  -- secret key (import), bypasses RLS
  call private.add_owner_policies('public.<t>');  -- 4 политики + триггер updated_at
  ```
  `anon` (publishable key без входа) — никаких прав, ни на таблицы, ни на функции. Правило проверяет `tests/unit/migrations.test.ts`.
- Миграции: новая миграция на каждое изменение схемы, старые не редактируем после `db push`.
- Имена: компоненты `PascalCase.tsx`, остальное `camelCase.ts`; без default export, кроме страниц для lazy-роутов.

## Безопасность и приватность (жёстко)
- `data/`, `*.xlsx`, `.env*`, экспорты — никогда в git. Перед каждым коммитом: `git status` и проверка, что их нет в индексе.
- Не выводить содержимое строк Excel и базы в логи/терминал — только счётчики, агрегаты, номера строк с ошибками.
- Ключи только нового формата. `SUPABASE_SECRET_KEY` (`sb_secret_…`) — только в `.env.local` и только для `scripts/import` и интеграционных тестов (e2e его не использует). Никогда во фронтенде, в `VITE_*`, в git. `vite.config.ts` падает при секрете в `VITE_*`.
- Во фронтенде только `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`).
- Ключи нового формата — не JWT: в своих запросах (Python, fetch в тестах) кладём их только в `apikey`, без `Authorization: Bearer`.
- Вход: основной — e-mail + пароль (`signInWithPassword`), запасной — magic link для браузера (`signInWithOtp`, `shouldCreateUser: false`). Входа кодом нет. Регистрация в Supabase выключена, пользователь один и создан вручную с паролем.
- Форма входа: `autocomplete="username"` у e-mail и `autocomplete="current-password"` у пароля, `name`/`id` у полей — чтобы менеджер паролей iPhone подставлял данные. Пароль не логируем и не храним (кроме e2e: `LIFEHUB_PASSWORD` в `.env.local`).

## Деплой
GitHub (приватный `life-hub`, `main` = прод) → Vercel Hobby (пресет Vite, env `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` для Production и Preview, `vercel.json` — SPA rewrite). Supabase Free, Frankfurt.

## Решения (журнал)
- 2026-11-09: файлы в `data/` называются иначе, чем в SPEC (`WiSe26_27.xlsx`, `Глоу ап — трекер.xlsx`) → импорт ищет файлы по шаблону.
- 2026-11-09: одна таблица `weeks` с ключом «понедельник недели»; номера недель бюджета, учёбы и глоу-апа — колонки. Недели строго пн–вс без исключений: неделя 1 бюджета = 12.10–18.10, старт бюджета 13.10 задаёт операция S0.
- 2026-11-09: задачи Работы импортируются только из «Dev Aufgaben». «Organisatirisch» неактуален — не импортируется и не сравнивается. Строке с пустым Titel (Branch `fix/h2_secret_logging`) задаётся название «PR 1: Secret-Logging fixen».
- 2026-11-09: «Календарь» (Budget) — «Счёт» → `transactions.account` сопоставленной операции, «Что сделать» → её `note`. Задачи не создаются; в `--dry-run` — отдельный список строк, похожих на открытые действия, для ручного выбора.
- 2026-11-09: экраны дизайна придут новым handoff до UI этапа 2; если нет — собираю из компонентов и подгоняю позже.
- 2026-11-10: вход — e-mail + пароль (`signInWithPassword`); magic link — запасной вариант только для браузера. Причины: шаблоны писем в Supabase без своего SMTP менять нельзя, а стандартный Magic Link содержит только ссылку; установленная PWA на iOS не делит хранилище с Safari, так что ссылка из почты в приложение не логинит. Вход кодом и `supabase/templates/` удалены. `flowType: 'implicit'` — чтобы ссылка работала в любом браузере.
- 2026-11-09: TypeScript 6.0.x (typescript-eslint пока не поддерживает 7.x). Node 24 через nvm.
- 2026-11-09: цвета Tailwind по умолчанию сброшены (`--color-*: initial`) — в классах доступны только токены дизайна. Тема через CSS `light-dark()` + `data-theme` на `<html>`.
- 2026-11-09: синхронизация между устройствами — refetch TanStack Query при фокусе и восстановлении сети (без Supabase Realtime).
- 2026-11-09: контексты React (`authContext.ts`, `toastContext.ts`) отдельно от провайдеров — для fast refresh.
- 2026-11-09: часовой пояс — через `Intl.DateTimeFormat` с `Europe/Berlin`, без `@date-fns/tz`.
- 2026-11-09: шрифт Onest хранится в `public/fonts` (self-hosted): работает офлайн и не обращается к Google Fonts.
- 2026-11-09: проверки импорта (раздел 6) — `tests/integration/import*`, читает базу с secret key и считает теми же функциями из `lib/rules`.
- 2026-11-10: в проекте Supabase выключено «Automatically expose new tables» и включено «Enable automatic RLS» → GRANT пишутся явно у каждой таблицы: `authenticated` и `service_role` — select/insert/update/delete, `anon` — ничего. `service_role` нужен скрипту импорта: RLS он обходит, но без GRANT получит permission denied.
- 2026-11-10: переход на новые ключи Supabase: `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_`) и `SUPABASE_SECRET_KEY` (`sb_secret_`) вместо anon / service_role. supabase-js ≥ 2.119 распознаёт их сам; импорт и тесты шлют ключ только в `apikey`. Legacy-ключи скрипты отвергают.
