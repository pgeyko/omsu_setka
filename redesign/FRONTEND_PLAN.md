# План разработки нового фронтенда

Основа: мокапы `redesign/` (ветка `develop/redesign`) и `DESIGN.md`.
Стек проекта: React 19, TypeScript, Vite, Zustand, TanStack Query, Vanilla CSS,
React Router. Никакого Tailwind и новых дизайн-систем.

## 1. Правила паритета с мокапами

- Токены, шрифты, размеры и состояния берутся из `redesign/style.css` и
  `DESIGN.md` без «улучшений»: Oswald + Golos Text, холодная бумага
  `#E9EAE3`, чернила `#151A14`, красный `#C22C12`, радиусы 2 px, тени только
  у шторки.
- Мобильный приоритет: ширина контента до 520 px, нижняя навигация 4 пункта,
  зона нажатия ≥ 44 px, safe-area.
- Десктоп от 980 px: сайдбар 264 px, основная область, панель дня 340 px,
  сетка 64 px + 6 дней, строки 58/92 px.
- Не менять копирайт, порядок блоков, названия кнопок и структуру экранов.
  Данные мокапов синтетические — в прод они не переносятся.
- Не дублировать DOM на mobile/desktop. В мокапе две оболочки нужны для
  статики; в React — один DOM и `useMediaQuery`/conditional layout. Это
  исправляет дубли `id`, которые были в мокапе.
- Все состояния из мокапа обязательны: сейчас, прошло, окно, замена,
  подгруппа, пустой день, пустой поиск, пустые изменения, офлайн, тёмная тема,
  шторка.

## 2. Архитектура

```text
src/
  app/            # router, providers, theme
  api/            # client, endpoints, types, query keys
  features/
    schedule/     # week/day, slots, subgroup, detail sheet
    search/       # query, results, recent
    groups/       # current group, favorites, switching
    changes/      # feed, diff, filters
    notifications/# FCM, settings, subscriptions
    status/       # health, incidents
  components/     # shell, nav, sheet, ui primitives
  store/          # zustand: ui, favorites, notifications
  styles/         # tokens.css, base.css, components
  utils/          # dates, subgroup, lesson merge
```

Провайдеры: `QueryClientProvider`, `ThemeProvider`, `FcmProvider`,
`ErrorBoundary`, `ToastProvider`.

## 3. Маршруты

| Маршрут | Экран |
|---|---|
| `/` | редирект на сохранённую группу → `today`, иначе `search` |
| `/g/:realGroupId/today` | Сегодня |
| `/g/:realGroupId/week?week_start=` | Неделя |
| `/g/:realGroupId/changes` | Изменения |
| `/g/:realGroupId/settings` | Настройки |
| `/search` | Поиск |
| `/tutor/:id` | Преподаватель |
| `/auditory/:id` | Аудитория |

`realGroupId` — `real_group_id` из поиска/справочника, не внутренний `id`.
Выбранная группа и подгруппа дублируются в localStorage и в URL, чтобы ссылки
открывались на нужном экране.

## 4. Данные и API

### 4.1 Клиенты

- `cdnClient` — GET/HEAD на `VITE_API_BASE` (reverse proxy).
- `originClient` — POST/PUT/PATCH/DELETE на `VITE_API_ORIGIN`.
- Оба: `baseURL=/api/v1`, таймаут 10 с, обработка 429 (`retry_after`),
  401/404/503, `X-Request-ID` в логах.

### 4.2 Эндпоинты по экранам

| Экран | Запрос |
|---|---|
| Поиск | `GET /search?q=&type=&limit=` |
| Сегодня/Неделя | `GET /schedule/group/{realGroupId}?week_start=YYYY-MM-DD` |
| День (fallback) | `GET /schedule/group/{id}/day?date=YYYY-MM-DD` |
| Преподаватель | `GET /schedule/tutor/{id}` |
| Аудитория | `GET /schedule/auditory/{id}` |
| Изменения | новый `GET /changes?...`; до него — `/changes/:type/:id` |
| Настройки | `GET/PATCH /notifications/settings/:type/:id`, `POST /subscribe`, `POST /unsubscribe` |
| Статус | `GET /health`, `GET /incidents`, `GET /sync/status` |

### 4.3 Query keys

```ts
['groups', 'all']
['search', q, type, limit]
['schedule', 'group', realGroupId, weekStart]
['schedule', 'tutor', tutorId, weekStart]
['changes', entityType, entityId, filters]
['health']
['notifications', token, entityType, entityId]
```

`staleTime`: расписание 5 минут, справочники 12 часов, изменения 1 минута,
health 30 секунд. `retry` кроме 4xx. `placeholderData` — предыдущая неделя.

### 4.4 Обязательные преобразования

- **Group ID:** везде расписание/изменения/подписка используют
  `real_group_id`; `/groups/:id` — внутренний `id` справочника. Хранить оба.
- **Subgroup:** нормализовать `GROUP/1`, `Подгруппа 1`, `1 подгруппа` → `"1"`;
  в API отправлять `"1"`.
- **Merge слотов:** ключ `lesson + type_work + teacher + auditCorps`; разные
  подгруппы одного занятия объединять в один элемент; разные преподаватели/
  аудитории — отдельные занятия внутри слота.
- **Dates:** `day` приходит `DD.MM.YYYY`; преобразовывать в ISO для логики,
  отображать через `Intl.DateTimeFormat('ru-RU')`.
- **Time:** номер пары 1–8 + `TIME_SLOTS`; «сейчас» и «окно» считать на клиенте.
- **Subject/type:** `lesson` может содержать тип («Алгебра Лек»); чистить
  суффикс по `type_work` для заголовка, тип показывать отдельно.
- **Room:** `auditCorps` парсить в `building`/`room`; не показывать сырую строку
  в фактах шторки.
- **Changes:** использовать нормализованный `changes[]` из нового API; до него
  diff по `old_data/new_data` и `created_at` как дата события.
- **Teacher:** показывать как пришло; если нужно ФИО, отдельного поля нет —
  не выдумывать.

## 5. Экраны

### 5.1 Оболочка и тема

- `AppShell`: mobile header (wordmark, поиск, группа, подгруппа, свежесть),
  daystrip, content, bottom nav; desktop sidebar + top bar + content + aside.
- `ThemeProvider`: `light | dark | system`, `data-theme`, localStorage,
  `prefers-color-scheme`, `theme-color`. Сегментированный контрол в настройках.
- Офлайн-баннер из `navigator.onLine` + `source: stale`.
- PWA-манифест, favicon/PWA-иконки и OG — из `redesign/assets`.

### 5.2 Сегодня

- Один запрос недели, день выбирается локально.
- Daystrip: 6 дней, сегодняшняя точка, выбранный день.
- Now band: текущая пара (клиентское время), прогресс, «Детали».
- Список: слоты после текущей пары, окна, merged-слоты, «замена».
- Пустой день: «Для подгруппы N занятий нет» + «Показать все».
- Клик по слоту/«Детали» → DetailSheet.

### 5.3 Неделя

- Mobile: вертикальные дни, строки с шевроном, merged-слоты, «нет занятий».
- Desktop: сетка 6×8, today-колонка, aside выбранного дня, merged-ячейка,
  клик по ячейке/строке → DetailSheet.
- Переключение недель: `week_start`, `has_prev/has_next`, предзагрузка соседней.
- «Замена» в заголовке дня учитывает подгруппу.

### 5.4 Поиск

- Полноэкранный на mobile; страница в основной области на desktop.
- От 2 символов, debounce 250 мс, AbortController, группировка
  groups/tutors/auditories, счётчики, недавние (5), «Очистить».
- Клик по группе: сохранить `real_group_id` и перейти на `today`;
  по преподавателю/аудитории — на карточку.
- Пустой результат и подсказка про eservice.

### 5.5 Изменения

- Фильтры «Моя группа / Все группы» (второй — только после нового API).
- Группировка по дню события (`created_at`), diff «было → стало»,
  тип added/removed/modified, подгруппа.
- «Открыть пару» — только если API отдал `day` и `pair`; иначе кнопки нет.
- Пустое состояние для группы без истории.
- Пагинация/«Показать ещё» после появления `before_id`.

### 5.6 Настройки

- Секции: **Тема**, **Расписание** (подгруппа), **Уведомления**
  (изменения, дайджест, время, напоминание, минуты, часовой пояс).
- Автосохранение с «Сохранено», двухшаговая отписка.
- Значения из сервера; `PATCH` отправляет полный объект до появления partial.
- FCM: разрешение, токен, `X-FCM-Token`.
- Лимит 10 подписок, 429.

### 5.7 Карточки преподавателя и аудитории

- Заголовок, meta, список дней, строки с группой/аудиторией.
- Клик по строке — DetailSheet (если API даёт нужные данные) или без клика,
  как в мокапе.
- Переходы из поиска и из шторки.

### 5.8 DetailSheet

- `<dialog>`: время/день, список занятий, ФИО, аудитория + корпус, группа,
  подгруппа, замена, ссылки.
- Закрытие X/Escape/фон, возврат фокуса, блокировка скролла, safe-area,
  тёмная тема, `prefers-reduced-motion`.
- На desktop — та же нижняя панель 560 px, не правая модалка.

## 6. Состояние

`useUiStore` (persist): `groupId`, `subgroup`, `theme`, `favorites`,
`recentSearches`, `lastSeenChangesAt`.
`useNotificationsStore`: FCM token, permission, subscription per entity.
Серверные настройки — в React Query; стор только для токена/разрешения.
URL — источник истины для group/day/week; состояние не должно расходиться.

## 7. Ошибки, загрузка, офлайн

- Скелетоны строк и сетки; не спиннер в центре.
- 503 при недоступном upstream: «Нет данных, попробуйте позже» + retry.
- 429: баннер с `retry_after`.
- Offline: баннер и кэш Query; service worker для shell и последнего расписания.
- Empty states — как в мокапе, с действием.

## 8. Доступность

- Один `h1` на экран, `nav`, `main`, `button`/`a` по назначению.
- `aria-pressed` для дней/фильтров/темы, `aria-current` в навигации,
  `aria-haspopup="dialog"`, `aria-labelledby` у шторки.
- Видимый `:focus-visible`, skip-link для mobile и desktop.
- Контраст ≥ 4.5:1, зоны ≥ 44 px, `prefers-reduced-motion`.

## 9. Тесты

- Unit: merge слотов, нормализация подгрупп, парсинг дат/аудиторий, diff.
- Component: DayStrip, SlotRow, DetailSheet (фокус/Escape), ThemeSwitch.
- E2E Playwright: mobile 390×844 и desktop 1440×1000; today/week/search/
  changes/settings/entity; смена группы, подгруппы, темы, шторка.
- Visual regression: скриншоты обоих видов и тем; сравнение с мокапами.
- Contract: моки MSW по `API.md` + реальные ответы.
- A11y: axe, клавиатура, screen reader smoke.

## 10. Этапы

| Этап | Содержание | Зависимость |
|---|---|---|
| 0 | API P0: changes, notifications, sync targets, PATCH | backend |
| 1 | Scaffold, токены, шрифты, shell, тема, иконки | — |
| 2 | API client, типы, запросы, поиск, группы | API чтения |
| 3 | Сегодня/Неделя, слоты, подгруппы, DetailSheet | API расписания |
| 4 | Изменения | API P0 changes |
| 5 | Уведомления, FCM, настройки | API P0 notifications |
| 6 | PWA, offline, service worker | этап 3 |
| 7 | QA, visual regression, perf, rollout | все |

Ориентир: этапы 1–3 можно вести параллельно с P0; полный релиз — после P0.
Без P0 экран изменений и push-уведомления не соответствуют мокапам.

## 11. Риски

- **P0 задержится** → выпустить read-only beta (сегодня/неделя/поиск).
- **FCM** требует HTTPS и разрешения; на localhost работает ограниченно.
- **reverse proxy/origin**: мутации только на origin; проверить CORS.
- **Group ID**: перепутать `id` и `real_group_id` — частая ошибка; типы-бренды.
- **Change diff**: пока API не отдаёт нормализованный diff, не дублировать
  логику в двух местах.
- **Подгруппы**: форматы отличаются; нормализация в одном util + тесты.
- **Переполнение**: 8 пар × 6 дней на 1024 px; проверить 320/390/768/1024/1440.

## 12. Definition of Done

- Все экраны мокапов воспроизведены на 390×844 и 1440×1000, светлая/тёмная.
- Сегодня/неделя/день/поиск/карточки работают на реальном API.
- Слоты объединяются, подгруппы фильтруются, шторка открывается с клавиатуры.
- Изменения показывают день, пару, diff и «Открыть пару».
- Уведомления сохраняются и приходят с учётом подгруппы и часового пояса.
- Offline показывает кэш и баннер; нет горизонтального скролла.
- Visual regression и a11y-прогон зелёные.
