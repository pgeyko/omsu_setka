# Backend: разработка и поддержка

Бэкенд — Go-сервис (`core/`), который зеркалирует расписание ОмГУ, кэширует его
и отдаёт быстрый REST API. Архитектура и схема данных — в
[ARCHITECTURE.md](../ARCHITECTURE.md).

## Стек

- **Go 1.23** (см. `core/go.mod`), один бинарник.
- **Fiber v2** (fasthttp) — HTTP-слой.
- **SQLite** через `modernc.org/sqlite` (pure Go, без CGO), WAL.
- **zerolog** — JSON-логи.
- **swaggo/swag** + `gofiber/swagger` — OpenAPI.
- **Firebase Admin SDK** — FCM; **fasthttp** — upstream и вебхуки.

## Структура

```text
core/
  cmd/server/main.go          # сборка зависимостей, старт sync и сервера
  internal/
    api/                      # роутер, хендлеры, middleware, валидация
    apperrors/                # доменные ошибки
    cache/                    # L1-кэш и поиск по токенам
    config/                   # env-конфигурация
    diff/                     # сравнение расписаний, нормализация подгрупп
    models/                   # BFF-модели и обёртка ответа
    notifications/            # FCM, дайджесты, напоминания
    scheduleutil/             # слоты, окна, группировка
    service/                  # прикладные сценарии
    storage/                  # репозитории SQLite + миграции
    sync/                     # фоновая синхронизация и diff
    upstream/                 # клиент eservice.omsu.ru
    webhook/                  # HMAC-уведомления внешним системам
  docs/                       # сгенерированный Swagger (не править руками)
```

## Локальный запуск

```bash
cd core
go mod download
# минимум для разработки:
APP_ENV=development SQLITE_PATH=./data/mirror.db go run ./cmd/server/main.go
```

Сервер слушает `:8080`. Проверки:

```bash
curl -s localhost:8080/live
curl -s localhost:8080/ready
curl -s localhost:8080/api/v1/health | jq
```

`APP_ENV=production` требует непустой `ADMIN_KEY` и явный
`CORS_ALLOWED_ORIGINS` без `*` — иначе сервис не стартует.

## Конфигурация

Все настройки — переменные окружения, полный список с комментариями в
[`.env.example`](../../.env.example). Ключевые:

| Переменная | По умолчанию | Смысл |
|---|---|---|
| `ADMIN_KEY` | — | ключ админ-эндпоинтов (`X-Admin-Key`) |
| `CORS_ALLOWED_ORIGINS` | — | список origin через запятую |
| `UPSTREAM_BASE_URL` | `https://eservice.omsu.ru/schedule/backend` | источник |
| `SYNC_DICT_INTERVAL` | `12h` | период справочников |
| `SYNC_SCHEDULE_INTERVAL` | `15m` | период «горячих» расписаний |
| `CACHE_ACTIVE_THRESHOLD` | `24h` | окно «горячести» |
| `RATE_LIMIT_GENERAL` / `RATE_LIMIT_SEARCH` | `120` / `30` в минуту | лимиты API |
| `SWAGGER_ENABLED` | `false` | отдавать `/swagger` |
| `ICAL_ACCESS_TOKEN` | пусто | если задан, iCal требует `?token=` |
| `FIREBASE_SERVICE_ACCOUNT` | пусто | JSON сервис-аккаунта для FCM |

## Тесты

```bash
cd core
go vet ./...
go test ./...
go test -race ./...
```

Тесты используют временную SQLite-базу и `httptest` (`setupTestServer` в
`internal/api`). Покрыты: парсинг upstream, кэш, репозитории, diff, поиск,
расписание, подгруппы, изменения, share-страницы, вебхуки, уведомления.
CI гоняет `go vet` + `go test -race` и gitleaks; `Dockerfile` дополнительно
выполняет `go test ./...` при сборке образа.

## Swagger

После изменения хендлеров или DTO:

```bash
cd core
go run github.com/swaggo/swag/cmd/swag@v1.16.6 init -g cmd/server/main.go -o docs
```

Сгенерированные `docs/docs.go`, `swagger.json`, `swagger.yaml` коммитятся.
Сам UI доступен только при `SWAGGER_ENABLED=true`.

## Миграции и данные

- Миграции идемпотентны, запускаются при старте
  (`internal/storage/migrations/migrate.go`).
- Для новой колонки добавьте её в список `newColumnsList` — таблица
  обновится через `PRAGMA table_info` без потери данных.
- SQLite живёт в `SQLITE_PATH`; в Docker — volume `backend_data`.
- `VACUUM` выполняется раз в неделю; устаревшие изменения и outbox чистятся по
  `CHANGE_RETENTION_DAYS` и `OUTBOX_RETENTION_DAYS`.

## Наблюдаемость

- `GET /live` — процесс жив.
- `GET /ready` — БД доступна и upstream не в серии из >3 ошибок.
- `GET /api/v1/health` — uptime, статус upstream, время последних синхронизаций,
  статистика L1.
- `GET /api/v1/incidents` — история ошибок upstream.
- `GET /api/v1/sync/status` — отметки синхронизации.
- `POST /api/v1/sync/trigger` — ручной запуск (admin).

Логи — JSON (`LOG_FORMAT=json`), уровень через `LOG_LEVEL`.

## Правила изменений

- Сохраняйте семантику diff и `schedule_changes` — на ней держатся
  уведомления, вебхуки и лента «Изменения».
- Не логируйте FCM-токены, `ADMIN_KEY` и содержимое сервис-аккаунта.
- Новые запросы к upstream — только через `internal/upstream` (там таймауты,
  rate limit и запись инцидентов).
- Для новых эндпоинтов добавляйте Swagger-аннотации и тест в `internal/api`.
- Ошибки клиенту — в формате `{"error": "..."}` или `BFFResponse`, без
  внутренних деталей.
