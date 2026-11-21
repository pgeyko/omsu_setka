# Web: разработка и поддержка

Фронтенд — React-PWA (`web/`), который работает поверх BFF. Подробное
описание экранов, тестов и соглашений — в [`web/README.md`](../../web/README.md);
здесь краткая карта для разработчика.

## Стек

- **React 19 + TypeScript**, сборка **Vite 8**.
- **React Router 7** (BrowserRouter, history API).
- **TanStack Query 5** — кэш запросов, повторные попытки, инвалидация.
- **Zustand 5 + persist** — группа, подгруппа, тема, избранное, недавние.
- **Axios** — клиент BFF.
- **Vanilla CSS** (`src/styles/app.css`, CSS-переменные). Без Tailwind и
  CSS-in-JS.
- **lucide-react** — иконки.
- **vite-plugin-pwa** (Workbox) — манифест, precache, офлайн-расписание.
- **Firebase Messaging** — push; воркер `public/firebase-messaging-sw.js`.
- Нативные **View Transitions** для переходов, без отдельной animation-библиотеки.

## Структура

```text
web/
  index.html                 # метаданные, тема до первой отрисовки
  vite.config.ts             # dev-прокси /api, PWA, манифест
  nginx.conf                 # production-статика, /api, /g/:id, кэш SW
  public/                    # иконки, og.png, share-redirect.js, FCM SW
  src/
    api/                     # axios-клиент, типы, React Query хуки
    components/              # оболочки, расписание, шторка, AppLink
    pages/                   # Today, Week, Changes, Settings, Search, Entity, 404
    lib/                     # слоты, даты, FCM, View Transitions, хуки
    store/preferences.ts     # persisted-настройки
    styles/app.css           # визуальная система
  e2e/                       # Playwright-сценарии, мок API, build-check
```

## Запуск

```bash
cd web
npm ci --legacy-peer-deps
npm run dev        # http://127.0.0.1:5174
```

`/api/*` проксируется на `VITE_PROXY_TARGET` (по умолчанию
`http://127.0.0.1:8080`). Для мока:

```bash
node e2e/mock-server.mjs                                  # :18082
VITE_PROXY_TARGET=http://127.0.0.1:18082 npm run dev
```

Dev-параметры:

- `?now=19:00` на `/g/:id/today` — подменить время для проверки блока «сейчас»
  и авто-перехода на следующий день;
- `?day=YYYY-MM-DD` — зафиксировать день;
- `?week_start=YYYY-MM-DD` — неделя;
- `?slot=N` — открыть шторку пары;
- `?q=` на `/search` — начальный запрос.

## Переменные сборки

| Переменная | Назначение |
|---|---|
| `VITE_API_BASE` | база API, по умолчанию `/api/v1` |
| `VITE_API_ORIGIN` | origin для изменяющих запросов и CORS |
| `VITE_FIREBASE_*` | web-конфиг Firebase (8 значений + VAPID) |

Секреты передаются в `web/Dockerfile` через build-args и подставляются в
`firebase-messaging-sw.js` на этапе сборки. Без реального Firebase push не
работают, но интерфейс и настройки остаются доступными.

`VITE_FIREBASE_*` на фронтенде и `FIREBASE_SERVICE_ACCOUNT` на backend должны
принадлежать **одному Firebase-проекту**. Иначе токен создаётся в одном
проекте, а отправка идёт из другого, и FCM отвечает `SenderId mismatch`.

## Маршруты и поведение

- `/` → группа из настроек или `/search`.
- `/search` — группы, преподаватели, аудитории; недавние запросы.
- `/g/:id` — умная короткая ссылка: mobile → `today`, desktop → `week`
  (в production отдаётся backend-страницей с OG-метаданными).
- `/g/:id/today` — «сейчас», следующие и прошедшие пары; после 18:00 или
  после последней пары сам показывает следующий учебный день.
- `/g/:id/week` — список на мобильном, сетка + панель дня на десктопе.
- `/g/:id/changes` — лента изменений «моя группа / все группы».
- `/g/:id/settings` — тема, подгруппа, уведомления (изменения, дайджест,
  напоминание), отписка.
- `/map` — карта занятости аудиторий: корпус, день, пара, свободные/занятые
  комнаты и переход на расписание аудитории.
- `/tutor/:id`, `/auditory/:id` — расписание сущности.

## Стили и движение

- Токены и компоненты — в `src/styles/app.css`; тема переключается атрибутом
  `data-theme` на `<html>`.
- Переходы страниц идут через `document.startViewTransition`
  (`src/lib/viewTransition.ts`, `src/components/AppLink.tsx`): контент
  меняется, оболочка стоит. Смена дня/недели и строки анимируются CSS.
- Всё отключается при `prefers-reduced-motion: reduce`.
- Не добавляйте Tailwind/CSS-in-JS и тяжёлые animation-библиотеки без
  необходимости.

## Тесты и проверки

```bash
npm test           # Vitest + Testing Library, 149 тестов
npm run build      # tsc -b && vite build
npm run test:build # проверка dist: manifest, precache, sw, og.png, share-redirect
npm run test:e2e   # 20 браузерных сценариев (Playwright + мок API)
```

E2E сами поднимают мок и Vite, фиксируют время и проходят онбординг, короткую
ссылку, авто-переход дня, шторку, недели, подгруппы, поиск, изменения,
настройки, уведомления, десктоп и офлайн.

## PWA и офлайн

- Workbox кэширует shell и `/api/v1/schedule/*` (NetworkFirst, 5 с таймаут),
  справочники — StaleWhileRevalidate.
- `sw.js` и `firebase-messaging-sw.js` отдаются с `no-cache`, чтобы деплой
  не оставлял старый воркер.
- Манифест: тёмный splash, maskable-иконка, `display: standalone`.
- При отсутствии сети показывается офлайн-бар с временем последних данных.

## Сборка

`npm run build` собирает статику в `dist/`; `npm run test:build` проверяет
манифест, precache, service worker, `og.png` и `share-redirect.js`. nginx
раздаёт `dist/`, проксирует `/api` и `/g/:id`, а хэшированные ассеты кэширует
надолго.
