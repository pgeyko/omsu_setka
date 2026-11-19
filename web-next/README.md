# web-next — новый фронтенд «сетки»

Реализация редизайна из `../redesign/` на реальном API. Папка готова заменить
`../web/` перед мержем в `main`; CI, `Dockerfile` и `nginx.conf` при этом
менять не нужно.

## Стек

- React 19 + TypeScript, Vite 8
- React Router 7 (history API, прямые ссылки)
- TanStack Query 5 — кэш и повторные запросы
- Zustand 5 + `persist` — группа, подгруппа, тема, избранное, недавние
- Axios — клиент BFF (`/api/v1`)
- Vanilla CSS — `src/styles/app.css` (копия `redesign/style.css`)
- Firebase Messaging — существующий воркер `public/firebase-messaging-sw.js`
- `vite-plugin-pwa` — манифест и офлайн-кэш расписания

## Структура

```text
web-next/
  index.html                 # тема до первой отрисовки, шрифты, иконки
  vite.config.ts             # dev-прокси /api, PWA, манифест
  public/
    firebase-messaging-sw.js # FCM-воркер из web/ (плейсхолдеры VITE_*)
    icon-*.png, favicon.*    # ассеты редизайна
  src/
    api/                     # client, типы BFF, React Query хуки
    components/              # оболочки, расписание, шторка пары
    pages/                   # today, week, search, changes, settings, entity
    lib/                     # слоты, даты, FCM, хуки
    store/preferences.ts     # persisted-настройки
    styles/app.css           # визуальная система редизайна
```

## Запуск

```bash
cd web-next
npm ci --legacy-peer-deps
npm run dev
```

Дев-сервер: `http://127.0.0.1:5174`. Запросы `/api/*` проксируются на
`VITE_PROXY_TARGET` (по умолчанию `http://127.0.0.1:8080` — backend из
`docker-compose`). Для мока или другого хоста:

```bash
VITE_PROXY_TARGET=http://127.0.0.1:8082 npm run dev
```

Полезные параметры только для dev:

- `?now=09:00` на `/g/:id/today` — подменить время для проверки блока «сейчас»;
- `?day=YYYY-MM-DD`, `?week_start=YYYY-MM-DD` — выбранный день/неделя;
- `?slot=N` — открыть шторку пары (используется ссылками «Открыть пару»);
- `?q=` на `/search` — начальный запрос.

## Сборка

```bash
npm run build     # tsc -b && vite build → dist/
npm run preview
```

Переменные production-сборки (те же имена, что в `web/Dockerfile`):

- `VITE_API_BASE` — база BFF, по умолчанию `/api/v1`;
- `VITE_API_ORIGIN` — база для POST/PATCH (subscribe, настройки);
- `VITE_FIREBASE_*` — конфиг FCM, включая `VITE_FIREBASE_VAPID_KEY`.

`npm run build` не запускает eslint/тесты — проверка типов входит в `tsc -b`.
CI для `web/` остаётся прежним: `npm ci --legacy-peer-deps && npm run build`
на Node 20.

## Маршруты

| Путь | Экран |
| --- | --- |
| `/` | редирект на сохранённую группу или `/search` |
| `/search` | поиск групп, преподавателей и аудиторий |
| `/g/:groupId/today` | «Сегодня» (на десктопе редирект на неделю) |
| `/g/:groupId/week` | неделя: список на мобильном, сетка + день на десктопе |
| `/g/:groupId/changes` | изменения, фильтр «моя группа / все группы» |
| `/g/:groupId/settings` | тема, подгруппа, уведомления, отписка |
| `/tutor/:id`, `/auditory/:id` | расписание преподавателя/аудитории |

## Интеграция в `main`

1. Содержимое `web-next/` переносится в `web/` (без `node_modules` и `dist`).
2. `web/public/firebase-messaging-sw.js` сохраняется: Dockerfile подставляет в
   него `VITE_FIREBASE_*` после сборки.
3. `package-lock.json` обязателен — CI использует `npm ci`.
4. `.github/workflows/ci.yml`, `web/Dockerfile`, `web/nginx.conf` не меняются:
   сборка идёт из `web/`, статика отдаётся nginx, `/api` проксируется на backend.
5. `vite-plugin-pwa` генерирует `dist/sw.js`; FCM-воркер живёт отдельно и
   регистрируется Firebase при получении токена.
