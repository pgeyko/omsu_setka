# omsu_setka Core (Backend)

Серверная часть «сетки»: Go-сервис, который синхронизирует расписание ОмГУ,
кэширует его и отдаёт быстрый REST API фронтенду.

## Особенности

- **Трёхуровневый кэш**: L1 (`sync.Map` с готовым JSON) → L2 (SQLite, WAL) →
  L3 (upstream ОмГУ).
- **Фоновая синхронизация** только «горячих» расписаний (запрошенных за
  последние 24 часа) и ленивая загрузка остальных.
- **Поиск в памяти** по группам, преподавателям и аудиториям: по части
  названия, номеру аудитории и корпусу (`4-112`, `112`, `корпус 4`).
- **История изменений** с field-level diff (`added/removed/modified`).
- **Push-уведомления** (FCM): изменения, вечерний дайджест, напоминание перед
  парой.
- **Вебхуки** для `omsu_bot` с HMAC-SHA256 и повторами.
- **iCal-экспорт** и Open Graph-страницы для коротких ссылок.

## Стек

- Go 1.23, один бинарник.
- Fiber v2 (fasthttp).
- SQLite через `modernc.org/sqlite` (pure Go, без CGO).
- `caarlos0/env` для конфигурации, zerolog для логов.
- swaggo/swag + gofiber/swagger для OpenAPI.
- Firebase Admin SDK для FCM.

## Структура

```text
cmd/server/          точка входа и сборка зависимостей
internal/api/        роутер, хендлеры, middleware, Swagger-аннотации
internal/cache/      L1-кэш и поиск по токенам
internal/config/     env-конфигурация
internal/diff/       сравнение расписаний и нормализация подгрупп
internal/models/     модели BFF и обёртка ответа
internal/notifications/ FCM, дайджесты, напоминания
internal/scheduleutil/  слоты, окна, группировка
internal/storage/    SQLite-репозитории и миграции
internal/sync/       фоновая синхронизация
internal/upstream/   клиент eservice.omsu.ru
internal/webhook/    доставка вебхуков
docs/                сгенерированный Swagger
```

## Запуск

```bash
cd core
go mod download
go run ./cmd/server/main.go
```

Минимум для локального запуска — `.env` не обязателен: значения по умолчанию
берутся из `internal/config`. Для production нужны `ADMIN_KEY` и
`CORS_ALLOWED_ORIGINS` без `*`.

Проверки: `go vet ./...`, `go test ./...`, `go test -race ./...`.

Подробности — в [docs/core/DEVELOPMENT.md](../docs/core/DEVELOPMENT.md) и
[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).
