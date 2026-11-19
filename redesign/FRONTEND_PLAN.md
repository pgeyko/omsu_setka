# План редизайна фронтенда «сетка»

Детальный план замены текущего `web/` на новый интерфейс по мокапам
`redesign/`. Визуальная часть строгая: мокапы — источник истины, текущий
фронтенд — источник доменной логики и API-контрактов, но не внешнего вида.

## 1. Цель и границы

**Цель:** новый SPA на реальном API, визуально и поведенчески совпадающий с
мокапами на 390×844 и 1440×1000, в светлой и тёмной темах.

**Входит:**

- Сегодня, Неделя, Поиск, Изменения, Настройки;
- карточки преподавателя и аудитории;
- подгруппы, объединение слотов, шторка деталей;
- темы, офлайн-баннер, PWA, FCM-подписки;
- миграция localStorage и старых URL.

**Не входит:**

- админка вебхуков;
- iCal;
- новые экраны и блоки, которых нет в мокапах;
- смена бренда, логотипа или типографики;
- backend-код, кроме согласованных P1.

## 2. Исходное состояние

Сейчас `web/` — React 19 + Vite, но UI построен вокруг `ScheduleContent.tsx`
(~1150 строк) и glassmorphism-карточек. Переиспользуем:

- `src/api/client.ts` — эндпоинты и типы (с правками под новый API);
- `store/useFavorites.ts` — избранное, недавние, подгруппа;
- `store/useSubscriptions.ts` — локальный реестр подписок;
- `utils/firebase.ts` — FCM;
- `vite-plugin-pwa` конфиг;
- чистые функции из `scheduleBreaks.ts` и тесты.

Не переиспользуем: CSS, `GlassCard`, текущий `ScheduleContent` как UI,
`framer-motion`, `useSettings` в старом виде. Логику группировки слотов и
подгрупп выносим в чистые функции и покрываем тестами.

## 3. Стек и решения

| Слой | Решение | Почему |
|---|---|---|
| UI | React 19 + TypeScript strict | уже в проекте, команда знает |
| Сборка | Vite 8, npm, Node 24 | текущий тулинг |
| Роутинг | React Router 7 (`BrowserRouter`) | уже используется, deep links |
| Серверные данные | TanStack Query 5 | кэш, ретраи, prefetch, offline |
| Клиентское состояние | Zustand 5 + `persist` | группа, подгруппа, тема, избранное |
| HTTP | Axios + два инстанса (`reverse proxy`, `origin`) | интерсепторы, 429, таймауты |
| Стили | Vanilla CSS: глобальные токены + CSS Modules | требование проекта, нет Tailwind |
| Иконки | lucide-react, stroke 1.6 + 3 кастомных SVG | единый штрих; wordmark/chevrон |
| Шрифты | self-host Oswald + Golos Text (woff2) | без Google Fonts в рантайме |
| Даты | `Intl.DateTimeFormat`, без date-fns | один формат, меньше зависимостей |
| Motion | CSS transitions 150–220 ms | мокап не требует framer-motion |
| PWA | `vite-plugin-pwa` (injectManifest) | офлайн shell + API cache |
| Push | Firebase JS SDK, lazy import | токен и permission только в настройках |
| Тесты | Vitest + Testing Library + Playwright + axe | текущая база + e2e |

Версии ориентира: Node 24, npm 11, React 19.2, Vite 8, TypeScript 6,
React Router 7, TanStack Query 5, Zustand 5, Axios 1.14, Firebase 12,
lucide-react 1, vite-plugin-pwa 0.21, Vitest 4.

**Не добавляем:** Tailwind, shadcn, UI-кит, CSS-in-JS, отдельную дизайн-систему,
framer-motion «на всякий случай». Любая новая зависимость — только с обоснованием
и проверкой бандла.

## 4. Архитектура

```text
src/
  app/
    App.tsx
    router.tsx
    providers.tsx
    AppShell.tsx
    theme/
  pages/
    TodayPage.tsx
    WeekPage.tsx
    SearchPage.tsx
    ChangesPage.tsx
    SettingsPage.tsx
    TutorPage.tsx
    AuditoryPage.tsx
    NotFoundPage.tsx
  features/
    schedule/
      model.ts          # слоты, merge, подгруппы, сейчас/далее
      queries.ts        # useWeekSchedule, useScheduleDay
      components/       # DayStrip, NowBand, SlotRow, WeekGrid, DetailSheet
    search/
    groups/
    changes/
    notifications/
    status/
  shared/
    api/                # clients, endpoints, types
    ui/                 # Segmented, Switch, Toast, EmptyState, Skeleton
    lib/                # dates, subgroup, storage, cn
    config.ts
  styles/
    tokens.css
    base.css
    typography.css
```

Правила:

- фича не импортирует страницу; страница собирает фичи;
- чистые функции — в `model.ts`, без React;
- CSS Modules рядом с компонентом, токены только глобально;
- никаких `any` в API-слое; DTO отдельно от view-моделей;
- один DOM, без двух скрытых mobile/desktop-деревьев.

## 5. Дизайн-система

### Токены

Переносим из `redesign/style.css`:

- светлая: `--ground #E9EAE3`, `--surface #F7F8F3`, `--ink #151A14`,
  `--red #C22C12`;
- тёмная: `#0C100D`, `#131814`, `#E9ECE3`, `#F2664A`;
- `--panel`, `--band`, `--rule`, `--muted`, `--on-ink`, `--chip-fg`;
- радиусы 2 px, overlay — 12 px;
- один spacing rhythm: 4/8/12/16/20/24/32.

Тема: `data-theme="light|dark"` на `<html>`, `light|dark|system` в Zustand,
`prefers-color-scheme`, `theme-color`, без вспышки (inline script до CSS).

### Типографика

- Oswald: wordmark, номера пар/дней, время, крупные цифры.
- Golos Text: весь UI.
- Шкала: 10.5 / 11.5 / 12.5 / 13 / 14.5 / 16 / 18 / 21 / 24 / 30.
- `font-variant-numeric: tabular-nums`, `text-wrap: balance`, трекинг не ниже
  `-0.03em`.
- Fonts preload, `font-display: swap`, fallback system.

### Сетка

- Mobile: max 520 px, sticky header, bottom nav 4 пункта, safe-area.
- Desktop ≥980: sidebar 264, main, aside 340; week grid 64 + 6 дней,
  header 58, row 92.
- Breakpoint один; tablet 768 использует mobile-композицию.

### Состояния

hover / focus-visible / active / disabled / loading / error / empty / selected.
Фокус — 2 px `--focus` с offset 2; на тёмном — `--red-bright`.
Браузерные поверхности: selection, caret, scrollbar, underline offset.

## 6. Роутинг и URL

```text
/                                  → last group /today, иначе /search
/g/:realGroupId/today?day=YYYY-MM-DD
/g/:realGroupId/week?week_start=YYYY-MM-DD
/g/:realGroupId/changes
/g/:realGroupId/settings
/search?q=
/tutor/:tutorId
/auditory/:auditoryId
```

- `real_group_id` — только он, не `dict_groups.id`.
- `day`, `week_start`, `slot` — в query, чтобы ссылки и back/forward работали.
- Редиректы со старых URL:
  - `/schedule/group/:id` → `/g/:id/today`;
  - `/schedule/tutor/:id` → `/tutor/:id`;
  - `/schedule/auditory/:id` → `/auditory/:id`;
  - `/favorites` → `/search`;
  - `/status` → `/g/:id/settings` (или 404 по решению).
- 404 — простая страница в стиле мокапа, без нового дизайна.

## 7. Данные и API

### Клиенты

```ts
cdnClient     // GET/HEAD, VITE_API_BASE (reverse proxy)
originClient  // POST/PATCH/DELETE, VITE_API_ORIGIN
```

Оба: `baseURL=/api/v1`, timeout 10 s, `X-Request-ID` в лог, обработка
`429 retry_after`, 503, 401/404. GET-запросы не повторяем на 4xx.

### Запросы

| Данные | Endpoint | Кэш |
|---|---|---|
| Группа/неделя | `GET /schedule/group/{id}?week_start=` | 5 мин, prefetch ±1 |
| День | derive из недели; fallback `/day?date=` | — |
| Преподаватель | `GET /schedule/tutor/{id}` | 5 мин |
| Аудитория | `GET /schedule/auditory/{id}` | 5 мин |
| Поиск | `GET /search?q=&type=&limit=` | 30 с, debounce 250 |
| Изменения | `GET /changes?...` | 1 мин, infinite |
| Настройки | `GET/PATCH /notifications/settings` | по ключу |
| Подписки | `GET /subscriptions` | 1 мин |
| Health | `GET /health` | 30 с |

React Query keys:

```ts
['schedule','group',groupId,weekStart]
['search',q,type,limit]
['changes',entityType,entityId,subgroup]
['notifications',token,entityType,entityId]
['subscriptions',token]
['health']
```

### Обязательные преобразования

- Идентификаторы: `real_group_id` и `dict id` — разные; храним оба.
- `subgroup`: `GROUP/1`, `Подгруппа 1`, `1 подгруппа` → `"1"`.
- `merge`: ключ `lesson + type_work + teacher + auditCorps`; подгруппы
  объединяются, разные преподаватели/аудитории — отдельные занятия.
- `now`: номер пары + `TIME_SLOTS`; окно и «сейчас» считаем на клиенте.
- `day`: `DD.MM.YYYY` → ISO; отображение через `Intl`.
- `changes`: используем `day`, `pair`, `subgroup`, `changes[]`; fallback —
  diff `old_data/new_data`.
- `type_work`: `Лек/Прак/Лаб` → `лекция/практика/лабораторная`.
- `auditCorps`: `4-308` → `building 4`, `room 308`.
- `teacher`: как пришло; отдельного ФИО-поля нет.

### Ошибки и состояния

- 503 → «Нет данных upstream» + retry.
- 429 → баннер с `retry_after`.
- 404 группы → «Группа не найдена» + поиск.
- offline → кэш Query + баннер.
- Пустые дни/поиск/изменения — как в мокапе.

## 8. Состояние

`usePreferences` (persist, version 2):

```ts
groupId: number | null
subgroup: string // "" | "1" | "2"
theme: 'light'|'dark'|'system'
favorites: SearchResult[]
recentGroups / recentTutors / recentAuditories
lastSeenChangesAt: string | null
```

Миграция со старых ключей:

- `omsu-setka-settings` (theme dark/light) → `theme`;
- `omsu-setka-favorites` → favorites/recent;
- старый subgroup → `subgroup`;
- неизвестные значения игнорируем.

URL — источник истины для group/day/week; Zustand — для темы, подгруппы,
избранного. Шторка и тосты — локальный UI-state.

## 9. Экраны

### Сегодня

- `useWeekSchedule` + `useNow(30s)`.
- Daystrip: 6 дней, today-точка, selected, переход по URL.
- Now band: текущая пара, прогресс, «Детали»; если пары нет — «до следующей».
- Список: слоты после текущей пары / все для другого дня; окна, merged,
  замена, подгруппа.
- Пустой день: «Для подгруппы N занятий нет» + «Показать все».
- Шторка.

### Неделя

- Mobile: вертикальные дни, строки с шевроном, merged, «нет занятий».
- Desktop: grid 6×8, today-колонка, aside выбранного дня, merged-ячейка,
  клик в ячейку/строку/шторку.
- Переключение недель: `week_start`, prefetch соседней, `has_prev/next`.
- «Замена» в заголовке дня с учётом подгруппы.

### Поиск

- Полноэкранный на mobile, страница на desktop.
- От 2 символов, debounce, AbortController, группы/преподаватели/аудитории,
  счётчики, recent 5, «Очистить».
- Группа → `setGroup` + `today`; преподаватель/аудитория → карточка.
- Пустой результат + ссылка на eservice.

### Изменения

- Фильтр «Моя группа / Все группы» (новый `/changes`).
- Infinite query по `before_id`, «Показать ещё».
- Группировка по дню события, diff «было → стало», тип, подгруппа.
- «Открыть пару» только при наличии `day`/`pair`; иначе скрыта.
- Пустое состояние.

### Настройки

- Тема: segmented.
- Расписание: подгруппа, значения из текущего расписания.
- Уведомления: изменения, дайджест, время, напоминание, минуты, пояс.
- FCM: статус permission, запрос по кнопке, токен.
- `PATCH` только изменённых полей; optimistic + rollback.
- Двухшаговая отписка, лимит 10, 429.
- Строка статуса сервиса.

### Преподаватель / аудитория

- Заголовок, meta, дни, строки; клик по строке — шторка, если данные есть.
- Из поиска/шторки.

### Шторка

- `<dialog>`, 560 px на desktop, bottom sheet на mobile.
- Время/день, список занятий, ФИО, аудитория+корпус, группа, подгруппа,
  замена, ссылки.
- X / Escape / backdrop, focus return, scroll lock, safe-area, reduced motion.

## 10. Компоненты

`AppShell`, `MobileHeader`, `Sidebar`, `BottomNav`, `DayStrip`, `NowBand`,
`SlotRow`, `SlotList`, `WeekGrid`, `WeekList`, `DetailSheet`, `SearchField`,
`SearchResults`, `ChangeItem`, `FilterTabs`, `SettingsSection`, `Segmented`,
`Switch`, `Toast`, `OfflineBanner`, `EmptyState`, `ErrorState`, `Skeleton`,
`PageTitle`, `StatusLine`.

У каждого: default/hover/focus/active/disabled/loading, если применимо.
Иконки только lucide/свои, без emoji.

## 11. PWA, офлайн, FCM

- `vite-plugin-pwa` `injectManifest`; precache shell/fonts/icons, runtime cache
  GET расписания (stale-while-revalidate), не кэшировать мутации.
- Offline fallback: последний экран + баннер «Нет сети · данные от 2 минут».
- Один service worker на scope `/`; FCM-обработчик внутри кастомного SW
  (`firebase-messaging-sw.js` import), без второго конкурирующего scope.
- FCM permission запрашиваем только из настроек; токен — в `useNotifications`.
- Push click: `/g/:id/changes` для группы, `/tutor/:id` / `/auditory/:id`.
- Обновление SW: `skipWaiting` только по действию «Обновить», иначе риск
  потерять открытую шторку.

## 12. Производительность

- Route-level `lazy`, vendor split; initial JS ≤180 KB gzip.
- Fonts preload, only 2–3 weights per family; icons tree-shaken.
- Один запрос недели; prefetch соседней; нет запроса на каждый день.
- Списки 6×8 — без виртуализации; `content-visibility` не нужен.
- CSS transitions вместо JS-анимаций; никаких layout thrash.
- ETag/304, gzip reverse proxy.
- Lighthouse: LCP <2.5, CLS <0.1, INP <200 на 4G.
- Bundle analyzer в CI, budget fail.

## 13. Доступность

- Семантика: `header/nav/main/aside`, `button`/`a`, один `h1`.
- `aria-pressed` (дни, фильтры, тема), `aria-current`, `aria-haspopup`,
  `aria-labelledby` для dialog, `role=status` для поиска/сохранения.
- Видимый `:focus-visible`, skip-link mobile/desktop, focus trap в диалоге.
- Контраст ≥4.5:1; зоны ≥44 px; `prefers-reduced-motion`.
- Проверка axe + ручной keyboard-прогон.

## 14. Тестирование

**Unit:** merge слотов, подгруппы, даты, now/next, diff changes, group ID.
**Component:** DayStrip, SlotRow, DetailSheet, ThemeSwitch, SettingsForm.
**Integration:** MSW по `API.md`; реальный API на staging.
**E2E:** mobile 390×844 и desktop 1440×1000; сегодня/неделя/поиск/изменения/
настройки/карточки; смена группы/подгруппы/темы; шторка; offline.
**Visual:** Playwright screenshots обоих видов и тем; сравнение с мокапами.
**A11y:** axe, tab-order, Escape/backdrop.
**Contract:** новые `/changes`, partial PATCH, `/subscriptions`.
**CI:** lint → typecheck → unit → build → e2e → visual.

## 15. Миграция и выкатка

1. Новый фронтенд в `web-next/`; `web/` остаётся рабочим и откатным.
2. На staging `new.s.pgeyko.ru`; CORS добавить домен.
3. Проверить PWA/старый SW: новый scope, очистка старых кэшей.
4. Переключить Dockerfile/`run.sh` на `web-next/dist`; старый `web/` оставить
   в ветке до стабилизации.
5. Редиректы старых URL и миграция localStorage при первом запуске.
6. Мониторинг 429/503, health, ошибок; rollback — вернуть `web/`.

## 16. Этапы и оценки

| Этап | Работы | Оценка |
|---|---|---|
| 0 | API P0 | ✅ готово |
| 1 | scaffold, токены, шрифты, shell, темы, иконки | 3–4 дня |
| 2 | API client, типы, queries, поиск, группы | 4–5 дней |
| 3 | Сегодня/Неделя, слоты, подгруппы, шторка | 8–10 дней |
| 4 | Изменения, пагинация, diff | 4–5 дней |
| 5 | Настройки, FCM, подписки | 5–6 дней |
| 6 | Карточки преподавателя/аудитории | 2–3 дня |
| 7 | PWA, offline, SW | 3–4 дня |
| 8 | QA, visual, a11y, perf, rollout | 5–7 дней |

Ориентир: 5–7 недель одного разработчика; этапы 1–3 можно вести параллельно с
P1 API. Буфер на визуальную полировку — 20%.

## 17. Риски

- **API P1** (FCM retry, source/cached_at) не блокирует, но влияет на доверие.
- **Group ID**: ошибка `id` vs `real_group_id` — тип-бренд + тесты.
- **Подгруппы**: разные форматы — один util + тесты.
- **FCM/SW**: два service worker конфликтуют; один scope, аккуратный update.
- **reverse proxy/origin**: мутации не через reverse proxy; проверить CORS на новом домене.
- **Старые ссылки/закладки**: редиректы и localStorage миграция.
- **Визуальный дрейф**: сравнение с мокапами в CI, а не «на глаз».

## 18. Definition of Done

- Все экраны мокапов на 390×844 и 1440×1000, light/dark.
- Сегодня/неделя/день/поиск/карточки работают на реальном API.
- Слоты объединяются, подгруппы фильтруются, шторка доступна с клавиатуры.
- Изменения показывают день/пару/diff и «Открыть пару».
- Настройки сохраняются частичным PATCH; push учитывает подгруппу/пояс.
- Offline показывает кэш и баннер; нет горизонтального скролла.
- Visual/a11y/e2e/perf-прогоны зелёные; старые URL редиректят.
- `web-next` заменяет `web` в Docker только после приёмки.

## 19. Спринты

**Спринт 1 — каркас (1 неделя).**
`web-next`, токены, шрифты, AppShell, темы, роутер, API-клиенты, поиск,
переключение групп, миграция localStorage. Демо: поиск → группа → пустой
today-экран с реальным заголовком.

**Спринт 2 — расписание (1.5 недели).**
Week query, daystrip, now band, слоты, merge, подгруппа, шторка, мобильная
неделя, desktop grid, aside. Демо: полный today/week на реальных данных.

**Спринт 3 — изменения и настройки (1.5 недели).**
`/changes` с пагинацией и diff, настройки с partial PATCH, FCM permission,
подписки, тема/подгруппа, пустые/ошибочные состояния. Демо: полный
студенческий флоу без офлайна.

**Спринт 4 — полировка и выкатка (1.5 недели).**
Карточки преподавателя/аудитории, PWA/offline, visual regression, a11y,
perf, редиректы, staging, cutover. Демо: production-кандидат.

## 20. CI-гейты

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright test
npm run test:visual
npm run test:a11y
```

- `typecheck` — отдельный `tsc --noEmit` до сборки.
- `test:visual` — скриншоты 390×844 и 1440×1000, light/dark.
- `bundle` — budget на initial JS/CSS; падение CI при превышении.
- `api-contract` — MSW-схемы + smoke против staging.

## 21. Что считаем «редизайном завершённым»

Не «похоже на макет», а:

- все состояния мокапа воспроизведены и проверены скриншотами;
- данные настоящие, без демо-массивов;
- старые URL и localStorage мигрированы;
- PWA обновляется без потери открытой шторки;
- push приходит по подписке и открывает нужный экран;
- нет горизонтального скролла и скачков layout на 320–1440;
- пользовательский сценарий «нашёл группу → посмотрел сегодня → открыл пару»
  укладывается в 2 запроса и не требует онбординга.
