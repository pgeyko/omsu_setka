# Архитектура

`omsu_setka` — BFF-зеркало расписания ОмГУ: Go-сервис с многоуровневым кэшем
и React-PWA поверх него. Сервис не заменяет официальный источник, а снимает с
него нагрузку: данные скачиваются фоновыми задачами и отдаются из памяти за
доли миллисекунды, даже если upstream недоступен.

## Компоненты

```text
браузер / PWA
   │  HTTPS
   ▼
frontend (nginx)  ── /api ──▶  backend (Go, Fiber)
   │                              │
   │                              ├─ L1: sync.Map + готовый JSON
   │                              ├─ L2: SQLite (WAL)
   │                              └─ фоновый sync ──▶ eservice.omsu.ru
```

- `frontend` — nginx со статикой (`web/dist`) и проксированием `/api` в
  `backend`.
- Короткие ссылки `/g/<id>` обслуживает nginx: он проксирует их в backend,
  который отдаёт HTML с Open Graph-метаданными для Telegram и скриптом
  редиректа на `/today` (мобильные) или `/week` (десктоп).

## Кэш

| Уровень | Хранилище | Что лежит | Зачем |
|---|---|---|---|
| L1 | `sync.Map` | готовые JSON-байты, iCal, метаданные | отдача без сериализации |
| L2 | SQLite (`modernc.org/sqlite`, WAL) | справочники, расписания (gzip), история изменений, подписки, вебхуки | переживает рестарт и падение upstream |
| L3 | `eservice.omsu.ru/schedule/backend` | источник истины | только фоновая синхронизация и lazy-fetch |

L1 хранит не структуры, а уже сериализованный JSON — горячий GET не делает
повторную сериализацию. L2 отдаёт данные, если upstream недоступен, и
прогревает L1 при старте.

## Синхронизация

Фоновый sync запускается при старте и далее по таймерам (`SYNC_*`):

| Данные | По умолчанию |
|---|---|
| Справочники (группы, преподаватели, аудитории) | 12 ч |
| Расписания активных сущностей | 15 мин |
| Аудит/полная сверка | 24 ч |

- Синхронизируются только «горячие» сущности — те, которые запрашивали за
  последние 24 часа (`CACHE_ACTIVE_THRESHOLD`).
- Остальные загружаются лениво при первом запросе и попадают в приоритет
  фонового обновления.
- К upstream не более 2 параллельных запросов (`UPSTREAM_RATE_LIMIT`),
  таймаут 10 с.
- Неудачные обращения пишутся в `upstream_incidents` и видны в `/health`,
  `/incidents` и `/sync/status`.

## Хранилище

SQLite-файл (`SQLITE_PATH`, по умолчанию `./data/mirror.db`) в WAL-режиме.

| Таблица | Назначение |
|---|---|
| `dict_groups`, `dict_tutors`, `dict_auditories` | справочники для поиска и валидации ID |
| `schedule_cache` | gzip-расписания по ключу `type:id`, TTL, счётчик попаданий |
| `sync_metadata` | время последней синхронизации |
| `upstream_incidents` | ошибки и восстановления upstream |
| `schedule_changes` | история изменений (`added/removed/modified`, diff, old/new data) |
| `user_subscriptions` | FCM-подписки: PK `(fcm_token, entity_type, entity_id)` |
| `notification_outbox` | очередь push-уведомлений с retry |
| `webhook_subscribers`, `webhook_failed_deliveries` | внешние подписчики и недоставленные события |
| `schema_version` | версия схемы |

Миграции идемпотентны и выполняются при старте
(`core/internal/storage/migrations/migrate.go`), включая добавление новых
колонок через `PRAGMA table_info`.

## API

Полная схема — Swagger (`/swagger/index.html` при `SWAGGER_ENABLED=true`).
Группы эндпоинтов:

- **Справочники**: `GET /api/v1/groups`, `/tutors`, `/auditories` (+ `/:id`).
- **Расписание**: `GET /api/v1/schedule/{group|tutor|auditory}/:id`,
  `.../day`, `.../subgroups` (группы), `.../ical`.
- **Изменения**: `GET /api/v1/changes` (лента), `GET /api/v1/changes/:type/:id`.
- **Поиск**: `GET /api/v1/search?q=…` — in-memory поиск по токенам и подстрокам;
  понимает `4-112`, `112`, `4 корпус 112`, `корпус 4`; нормализует регистр,
  ё/е, дефисы, точки и пробелы.
- **Уведомления**: `POST /subscribe`, `POST /unsubscribe`,
  `PATCH /notifications/settings`, `GET /notifications/settings/:type/:id`,
  `GET /subscriptions`.
- **Служебные**: `GET /live`, `/ready`, `/health`, `/incidents`,
  `/sync/status`, `POST /sync/trigger` (admin).
- **Вебхуки**: `/api/v1/admin/webhooks` (admin).
- **Поделиться**: `GET /api/v1/share/group/:id` — HTML для превью ссылки.

Ответы обёрнуты в `BFFResponse` (`success`, `data`, `cached_at`, `source`).
ID сущностей — это ID словарей (`dict_groups.id` и т. п.), а не «real» ID
upstream; для групп upstream-ID хранится в `real_group_id`.

## Изменения расписания

При каждой успешной синхронизации новое расписание сравнивается с предыдущим:
- `added` — появилась пара;
- `removed` — пара исчезла (в `old_data` сохраняется снимок);
- `modified` — изменились поля (предмет, аудитория, преподаватель, время,
  подгруппа); diff хранится в `changes`.

История доступна в ленте `/changes` и в API, хранится
`CHANGE_RETENTION_DAYS` дней (по умолчанию 90).

## Push-уведомления

- Клиент получает FCM-токен и подписывается на группу/преподавателя/аудиторию
  (`POST /subscribe`, до 10 подписок на токен).
- Настройки: изменения, ежедневный дайджест (время в часовом поясе
  пользователя), напоминание перед парой (`before_minutes`, по умолчанию 30),
  подгруппа.
- Отправка идёт через `notification_outbox` с повторами и retention; мёртвые
  FCM-токены отключаются.
- Для реальных push нужны `VITE_FIREBASE_*` при сборке фронтенда и
  `FIREBASE_SERVICE_ACCOUNT` на backend. Они должны быть из одного
  Firebase-проекта, иначе FCM возвращает `SenderId mismatch`. Без них UI
  работает, но токен не выдаётся.

## Вебхуки

Интеграция с `omsu_bot`: HMAC-SHA256-подписанный POST при изменениях.

```json
{
  "type": "change",
  "group_id": 15103,
  "entity_type": "group",
  "entity_id": 15103,
  "event_id": "…",
  "occurred_at": "2026-11-19T12:00:00Z",
  "changes": [{"date": "2026-11-20", "pair": 1, "subject": "Физика",
               "field": "auditCorps", "old": "4-210", "new": "4-308"}]
}
```

Заголовки: `X-Webhook-Signature` (HMAC от `timestamp.body`),
`X-Webhook-Timestamp`, `X-Webhook-Event-ID`. Подписчики идемпотентны по URL,
неудачные доставки сохраняются в `webhook_failed_deliveries`.

## Безопасность и лимиты

- `ADMIN_KEY` обязателен в production; админ-эндпоинты требуют `X-Admin-Key`.
- Rate limit: общий 120 запросов/мин, поиск 30/мин (`RATE_LIMIT_*`).
- CORS ограничен `CORS_ALLOWED_ORIGINS`.
- iCal можно закрыть общим токеном `ICAL_ACCESS_TOKEN` (`?token=…`).
- В CI работает gitleaks; секреты не коммитятся, Firebase-конфиг передаётся
  build-args.
