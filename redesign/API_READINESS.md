# API readiness для нового фронтенда

Дата анализа: 18 ноября 2026. Дата доработки: 19 ноября 2026.
Анализ по коду `core/` и контрактам `API.md`.
Данные мокапов синтетические; здесь речь только о реальном API.

## Статус на 19 ноября 2026

Ниже сначала идёт исходный аудит (18.11), затем список закрытых P0 и остатки.
**P0 закрыт.** API готов к полному фронтенду по мокапам. Остались P1-улучшения
(надёжность push, метаданные ответов, OpenAPI).

Реализовано:

- `schedule_changes` хранит `day`, `pair`, `subgroup`, `subject`, `diff`;
- новый `GET /api/v1/changes` с фильтрами по сущности/подгруппе, `limit`,
  `before_id`, `since`, `scope=all`; старый `/changes/:type/:id` совместим;
- diff стал полным: `type_work`, `faculty`, `group` и остальные поля;
- синк включает подписки и группы вебхуков, подписка прогревает расписание;
- push по изменениям учитывает `notify_on_change` и подгруппу;
- digest/reminder считают локальное время подписки и нормализуют подгруппу;
- `PATCH /notifications/settings` — настоящий partial;
- `GET /subscriptions` по `X-FCM-Token`;
- retention истории изменений (`CHANGE_RETENTION_DAYS`, по умолчанию 90);
- валидация `entity_type` в `POST /subscribe`, нормализация подгруппы;
- вебхуки для преподавателя/аудитории не отбрасываются фильтром групп.

## Вердикт

- **Чтение расписания, поиск, справочники, карточки преподавателя и аудитории** —
  готово.
- **Полный набор мокапов** — готов: изменения, подгруппы, уведомления,
  офлайн-состояния покрываются API (офлайн/PWA остаются клиентскими).
- **Готовность к полному фронтенду:** да; P1 можно делать параллельно.

## Матрица: мокап → API

| Функция мокапа | API | Статус | Что важно |
|---|---|---|---|
| Поиск групп/преподавателей/аудиторий | `GET /search?q=&type=&limit=` | ✅ | префикс от 2 символов; группы содержат `real_group_id` |
| Смена группы | `GET /groups`, `GET /schedule/group/{real_group_id}` | ✅ | для расписания нужен `real_group_id`, а не `id` справочника |
| «Мои группы» | локально | ✅ клиент | API не хранит избранное |
| Подгруппа: значения | `subgroupName` в занятии | ✅ | формат бывает `GROUP/1`, `Подгруппа 1`; нужна нормализация |
| Подгруппа: фильтр расписания | клиент | ✅ клиент | API отдаёт все занятия, фильтр на фронте |
| Подгруппа: в подписке | `subgroup` в `Subscription` | ✅/⚠️ | поле хранится, но фильтрация push/digest частично сломана |
| Сегодня / неделя / день | `GET /schedule/{type}/{id}` и `/day?date=` | ✅ | `week_start` фильтрует неделю; `has_prev/has_next` |
| Окна между парами | клиент | ✅ клиент | API даёт номера пар и `TIME_SLOTS` на фронте |
| Объединение слотов | клиент | ✅ клиент | ключ: предмет + тип + преподаватель + аудитория |
| Шторка деталей | те же данные | ✅/⚠️ | `teacher` обычно ФИО, но иногда сокращён; отдельного поля нет |
| Аудитория и корпус | `auditCorps` | ✅ | парсить `4-308`; отдельного `building` нет |
| Изменения: added/removed/modified | `GET /changes/{type}/{id}` | ⚠️ | только 20 записей, нет дня/пары, diff нужно считать из JSON |
| Изменения: «Все группы» | — | ❌ | нет агрегированного эндпоинта |
| Изменения: «Открыть пару» | — | ❌ | в изменении нет `day`, только `lesson_id` и old/new Lesson |
| Изменения: пагинация/7 дней | — | ❌ | `limit=20` зашит, `offset/since` нет |
| Подписка на изменения | `POST /subscribe` | ⚠️ | `notify_on_change` принудительно `true`; нет проверки entity_type |
| Настройки уведомлений | `GET/PATCH /notifications/settings` | ⚠️ | `PATCH` — полный upsert, не частичное обновление |
| Дайджест и напоминание | фоновый syncer | ⚠️ | часовой пояс подписки не учитывается; подгруппа сравнивается нестабильно |
| Push об изменениях | FCM в syncer | ⚠️ | шлётся всем токенам сущности, игнорируя `notify_on_change` и подгруппу |
| Лимит 10 подписок | `POST /subscribe` | ✅ | 429 |
| Офлайн/устаревшие данные | `source: stale`, `cached_at` | ✅ | PWA/service worker — клиент |
| Health/incidents/sync | `/health`, `/incidents`, `/sync/status` | ✅ | статус можно показывать |
| Админка вебхуков | `/admin/webhooks` | ✅ | не входит в студенческий флоу |
| iCal | есть | — | исключён по условию |

## Как сейчас работает отслеживание изменений

1. `SyncActiveSchedules` раз в `SYNC_SCHEDULE_INTERVAL` (15 мин) берёт ключи
   расписаний, у которых `last_hit_at` за последние 24 часа.
2. Для каждого ключа скачивает расписание из upstream и сравнивает со старым
   кэшем по `lesson.id`.
3. Изменения пишутся в `schedule_changes` (`added` / `removed` / `modified`),
   старые и новые данные — JSON занятия.
4. При наличии изменений:
   - отправляется webhook подписчикам (`Date`, `Pair`, `Field`, `Old`, `New`,
     `Subject` — здесь данных больше, чем в публичном `/changes`);
   - отправляется FCM всем токенам сущности;
   - пишется инцидент `schedule_change`.
5. Публичный `GET /changes/{type}/{id}` отдаёт последние 20 записей из
   `schedule_changes`.

### Что в этом работает

- ловится добавление, удаление и изменение занятия;
- сравниваются предмет, тип в строке предмета, преподаватель, аудитория,
  номер пары, день и подгруппа (частично);
- изменения пишутся для group, tutor и auditory;
- webhook получает нормализованные поля, пригодные для текста.

### Где ломается

- **Нет дня в записи изменения.** `old_data/new_data` — это `Lesson` без `day`.
  Поэтому нельзя открыть конкретную пару из истории, а фильтр «сегодня/вчера»
  можно строить только по `created_at` (времени события, не дню занятия).
- **Не все поля сравниваются.** `isLessonEqual` не смотрит `type_work`,
  `faculty`, `group`, `publishDate`. Изменение только типа занятия может не
  попасть в историю.
- **`/changes` не нормализован.** Фронтенд должен сам парсить `old_data/new_data`
  и считать diff; для «добавлено/удалено/изменено» это возможно, но хрупко.
- **Нет пагинации.** Последние 20 записей — всё, что видит клиент.
- **Нет «Все группы».** Каждый запрос — только одна сущность.
- **Нет retention.** `schedule_changes` не чистится; таблица растёт.
- **Синк только «горячих» расписаний.** Если группу не открывали 24 часа, она
  перестаёт синхронизироваться, даже если на неё есть подписка или вебхук.
- **Push игнорирует настройки.** `GetTokensByEntity` отдаёт все токены; флаг
  `notify_on_change` и подгруппа не учитываются.
- **Digest/reminder игнорируют timezone подписки.** Время считается в
  `Asia/Omsk`, хотя в настройках можно выбрать другой пояс.
- **Подгруппа в digest/reminder** сравнивается как `==` или суффикс `/1`;
  формат `Подгруппа 1` не сработает.
- **`PATCH /notifications/settings`** перезаписывает всю подписку; если отправить
  только изменённое поле, остальные флаги сбросятся.
- **Webhook-фильтр по `group_ids`** для изменений преподавателя/аудитории не
  отправляет событие, если у подписчика заданы группы: `matchesGroup` получает
  `0` для не-групповой сущности.

## P0: что было доработано

### 1. Изменения: день, пара, нормализованный diff, пагинация

Расширить `schedule_changes`:

```sql
ALTER TABLE schedule_changes ADD COLUMN lesson_day TEXT;     -- 2026-11-18
ALTER TABLE schedule_changes ADD COLUMN lesson_time INTEGER; -- 1..8
ALTER TABLE schedule_changes ADD COLUMN subgroup TEXT;      -- "1" или ""
CREATE INDEX IF NOT EXISTS idx_changes_created
  ON schedule_changes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_changes_entity_created
  ON schedule_changes(entity_type, entity_id, created_at DESC);
```

При логировании брать `lessonWithDay.Day` и `Lesson.Time`; подгруппу
нормализовать до `1`/`2`.

Новый контракт (старый `/changes/:type/:id` оставить совместимым):

```http
GET /api/v1/changes?entity_type=group&entity_id=12246
    &subgroup=1&limit=20&before_id=512&since=2026-11-11T00:00:00Z
```

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 512,
        "entity_type": "group",
        "entity_id": 12246,
        "change_type": "modified",
        "lesson_id": 901,
        "day": "2026-11-18",
        "pair": 4,
        "subgroup": "1",
        "subject": "Базы данных",
        "changes": [
          { "field": "auditCorps", "label": "аудитория",
            "old": "4-312", "new": "4-308" }
        ],
        "created_at": "2026-11-18T06:35:00Z"
      }
    ],
    "next_before_id": 501
  },
  "cached_at": "2026-11-18T10:00:00Z",
  "source": "cache"
}
```

- `GET /changes?scope=all` или `entity_type` без `entity_id` — для фильтра
  «Все группы».
- `subgroup=1` — вернуть изменения этой подгруппы и общие изменения без
  подгруппы; без параметра — все.
- Лимит 1..100, дефолт 20; `before_id` для курсора; `since` для «7 дней».
- Нормализованный `changes` собирать на сервере из `lessonDiffToChanges`
  (переиспользовать код webhook), чтобы фронтенд не парсил JSON.
- Для `added`/`removed` отдавать `changes: [{field:"full", old/new}]`.
- Оставить `old_data`/`new_data` строками для совместимости.

### 2. Полнота diff

В `isLessonEqual` и `lessonDiffToChanges` добавить:

- `type_work` (`Лек`/`Прак`/`Лаб`) — поле `type`;
- `faculty`;
- `group`;
- при необходимости `publishDate` (скорее метаданные, можно не считать
  изменением расписания).

Иначе смена типа занятия или группы не попадёт в историю.

### 3. Синхронизация подписанных сущностей

`SyncActiveSchedules` должен брать объединение:

- ключи `schedule_cache` с `last_hit_at > now-24h`;
- `SELECT DISTINCT entity_type, entity_id FROM user_subscriptions`;
- группы из `webhook_subscribers.group_ids`.

Иначе группа с подпиской, которую давно не открывали, перестанет отслеживаться.
Дополнительно: при `POST /subscribe` и регистрации вебхука сразу поставить
расписание в очередь синка / обновить `last_hit_at`.

### 4. Push об изменениях

Добавить в `SubscriptionRepo`:

```sql
SELECT fcm_token
FROM user_subscriptions
WHERE entity_type = ?
  AND entity_id = ?
  AND notify_on_change = 1
  AND (subgroup = '' OR subgroup = ?);
```

- Для изменения без подгруппы (`teacher`, `room`, `pair`) — слать всем
  подписчикам сущности с `notify_on_change=1`.
- Для изменения конкретной подгруппы — только пустым + совпадающей.
- Если в одном синке изменились несколько подгрупп — объединить токены.
- Нормализовать `SubgroupName` (`GROUP/1`, `Подгруппа 1`, `1 подгруппа`) в `1`.
- В payload добавить `kind:"change"`, `change_id`, `day`, `pair`, чтобы
  фронтенд мог открыть шторку.

### 5. Время доставки уведомлений

Сейчас `processDailyDigests` и `processLessonReminders` считают `now` в
`Asia/Omsk` и игнорируют `Subscription.Timezone`.

Вариант A (проще): оставить только `Asia/Omsk`, убрать выбор пояса из UI.
Вариант B (правильнее): для каждой подписки грузить `timezone`, считать локальное
`15:04` и сравнивать с `digest_time`; для напоминаний — локальное время старта.
Рекомендуется B, так как в мокапе пояс уже есть.

Также `MarkDigestSent`/`MarkReminderSent` стоит вызывать только после успешной
отправки (сейчас отметка ставится независимо от результата FCM).

### 6. `PATCH /notifications/settings` — настоящий partial

Сейчас это полный upsert `Subscription`. Нужен DTO с указателями:

```go
type NotificationSettingsPatch struct {
  NotifyOnChange     *bool
  NotifyDailyDigest  *bool
  DigestTime         *string
  NotifyBeforeLesson *bool
  BeforeMinutes      *int
  Timezone           *string
  Subgroup           *string
}
```

Загрузить существующую подписку по `(token, entity_type, entity_id)`, применить
только переданные поля, сохранить. Иначе новый фронтенд обязан каждый раз
отправлять весь объект, а любой пропуск сбрасывает флаг.

## P1: осталось желательно до релиза

- Идемпотентность push: outbox/таблица событий с ретраями; сейчас FCM
  best-effort, а `mark sent` ставится независимо от результата.
- `POST /subscribe` всё ещё принудительно включает `notify_on_change=true`;
  выключение — только через `PATCH`.
- `POST /subscribe` проверяет `entity_type`, но не существование сущности.
- Привести `source`/`cached_at` в ответах `/search` и `/:id` к осмысленным
  значениям (сейчас нулевые).
- Добавить `date` (ISO) в `Day`, `subgroup_number`/`building` в `Lesson` —
  чтобы фронтенд не парсил `DD.MM.YYYY` и `4-308`.
- Обновить OpenAPI/Swagger под новые поля и эндпоинты.
- Настроить deep link FCM под новые маршруты фронтенда (`/g/:id/...`).

## Backend work breakdown

1. **Миграции** (`internal/storage/migrations/migrate.go`): колонки
   `lesson_day`, `lesson_time`, `subgroup` в `schedule_changes`; индексы;
   retention-очистка.
2. **ChangeRepo** (`internal/storage/change_repo.go`): запись новых полей;
   выборка с `entity_type/entity_id/limit/before_id/since`; режим без entity;
   сборка нормализованного diff.
3. **Diff** (`internal/sync/schedule_sync.go`): `lessonWithDay` → `ScheduleChange`
   с днём/парой; `isLessonEqual` + `lessonDiffToChanges` для `type_work`,
   `faculty`, `group`, `publish_date`; переиспользовать diff в API.
4. **Sync targets** (`internal/sync/schedule_sync.go`,
   `internal/storage/schedule_repo.go`, `subscription_repo.go`,
   `webhook_repo.go`): union активных ключей, подписок и webhook-групп;
   постановка в синк при подписке/регистрации вебхука.
5. **SubscriptionRepo**: `GetTokensForChange` с `notify_on_change` и
   нормализованной подгруппой; `GetAllByToken` уже есть.
6. **Notifications** (`internal/sync/notifications_sync.go`): timezone
   подписки, нормализация подгруппы, mark-sent только после успеха, payload
   с `change_id/day/pair`.
7. **Handlers** (`internal/api/handlers_schedule.go`,
   `handlers_notifications.go`): новый `GET /changes`, partial PATCH DTO,
   валидация `entity_type` в subscribe, envelope.
8. **Тесты**: unit на diff/подгруппы/часовые пояса; integration на SQLite;
   contract-тесты для `/changes`; проверка, что push не уходит при
   `notify_on_change=false` и чужой подгруппе.

## Критерии готовности API к полному фронтенду

- [x] `/changes` отдаёт день, пару, подгруппу, нормализованный diff, пагинацию.
- [x] Есть режим «Все группы».
- [x] Изменение типа/группы/аудитории/пары/дня/подгруппы попадает в историю.
- [x] Подписанные группы синкаются, даже если их не открывали.
- [x] Push учитывает `notify_on_change` и подгруппу.
- [x] Digest/reminder учитывают timezone подписки.
- [x] `PATCH` настроек частичный.
- [x] Есть тесты на diff, фильтры изменений, подписки и подгруппы.

Пока P0 не закрыт, новый фронтенд можно начинать с чтения расписания, поиска и
карточек, но экраны «Изменения» и «Уведомления» будут требовать обходных
клиентских решений.
