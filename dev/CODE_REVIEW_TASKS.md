# setka — Code Review Task Tracker

> Доработки по результатам `CODE_REVIEW.md` (2026-05-25).  
> Префикс `[joint]` — задачи, требующие координации с `bot/`.

---

## Этап 1 — 🔴 Критическая безопасность ✅ Completed: 2026-05-25

> Code Review P0: MITM-уязвимость, timing-атаки, неправильные CIDR.

- [x] **1.1** — Удалить `InsecureSkipVerify: true` из upstream HTTP-клиента. (`internal/upstream/client.go:30`)
- [x] **1.2** — Заменить строковое сравнение iCal токена на `crypto/subtle.ConstantTimeCompare`. (`internal/api/handlers_ical.go:65`)
- [x] **1.3** — Сузить `TrustedProxies` CIDR диапазоны: только `172.17.0.0/16` (Docker bridge). (`internal/api/router.go:59`)
- [x] **1.4** — Заменить `log.Fatal` на `zerolog.Fatal().Msg()` в конфиге. (`internal/config/config.go`)

---

## Этап 2 — 🔧 Инфраструктура и CI/CD ✅ Completed: 2026-05-25

> Code Review P0/P1: Нет CI/CD, проблемы Docker.

- [x] **2.1** — Создать `.github/workflows/ci.yml`: `golangci-lint`, `go vet`, `go test -race ./...`, `go build ./...`.
- [x] **2.2** — Создать `.github/workflows/frontend.yml` для web/: `npm run lint`, `npm run build`.
- [x] **2.3** — Создать `.dockerignore` с исключением `node_modules/`, `.git/`, `*.md`.
- [x] **2.4** — Удалить из Dockerfile установку `gcc musl-dev`. (`Dockerfile`)
- [x] **2.5** — Добавить `-ldflags="-s -w" -trimpath` в go build в Dockerfile. (`Dockerfile`)
- [x] **2.6** — `[joint]` Добавить `HEALTHCHECK` инструкцию в Dockerfile.

---

## Этап 3 — 🚀 Архитектура setka: service-layer и рефакторинг ✅ Completed: 2026-05-25

> Code Review P1/P2: Нет service-слоя, конструкторы с 10+ параметрами, copy-paste в хендлерах.

- [x] **3.1** — Ввести пакет `internal/service/` для бизнес-логики (+ `singleflight`). (`internal/service/schedule.go`)
- [x] **3.2** — Вынести миграции из `sqlite.go` в `internal/storage/migrations/`. (`internal/storage/migrations/migrate.go`)
- [x] **3.3** — Устранить copy-paste между `handleGetSchedule` и `handleGetScheduleDay`. (`internal/api/handlers_schedule.go`)
- [x] **3.4** — Ввести доменные ошибки (пакет `internal/apperrors`). (`internal/apperrors/errors.go`)
- [x] **3.5** — Сократить конструкторы Syncer и Server через `Deps`/`ServerDeps` структуры. (`internal/sync/syncer.go`, `internal/api/router.go`)

---

## Этап 4 — ⚡ Производительность и SQLite ✅ Completed: 2026-05-25

> Code Review P1: MaxOpenConns=25 для SQLite, gzip-кэш без eviction, отсутствие request coalescing.

- [x] **4.1** — Снизить `MaxOpenConns` с 25 до 4. (`internal/storage/sqlite.go:35`)
- [x] **4.2** — Добавить eviction в gzip-кэш (5000 items + 20% evict). (`internal/cache/memory.go`)
- [x] **4.3** — Добавить request coalescing (`singleflight`) для upstream-запросов. (`internal/service/schedule.go`)
- [x] **4.4** — Добавить middleware с генерацией request ID. (`internal/api/router.go`, `internal/api/middleware.go`)
- [x] **4.5** — Логировать ошибки в `processHits`. (`internal/storage/schedule_repo.go:29`)
- [x] **4.6** — Вынести `MaxConnsPerHost` в конфиг (`UpstreamMaxConns`). (`internal/upstream/client.go`, `internal/config/config.go`)

---

## Этап 5 — 🔗 Интеграционный контракт setka ↔ bot ✅ Completed: 2026-05-25

> Code Review P1: GroupID==EntityID, created_at перезаписывается.

- [x] **5.1** — Разделить `GroupID` и `EntityID` в webhook payload. (`internal/webhook/notifier.go:80-88`)
- [x] **5.2** — Убрать `created_at` из SET-части UPDATE в webhook upsert. (`internal/storage/webhook_repo.go:132,156`)

---

## Этап 6 — 🧪 Тесты и надёжность

> Code Review: sync engine, webhook notifier, upstream client — без тестов.

### Критические тесты
- [x] **6.1** — Написать тесты для `WebhookNotifier`: HMAC signing, retry, payload. (`internal/webhook/notifier_test.go`)
- [!] **6.2** — Написать тесты для sync-движка — **заблокировано**: требует mocks для upstream + рефакторинг Syncer для тестируемости
- [x] **6.3** — Написать тесты для upstream HTTP-клиента: retry, status codes. (`internal/upstream/client_test.go`)
- [x] **6.4** — Добавить `t.Parallel()` во все тесты с изолированными БД.

### Интеграционные тесты (joint)
- [!] **6.5** `[joint]` — End-to-end тест для вебхук-границы — **заблокировано**: нужен репозиторий `omsu_bot`
- [!] **6.6** `[joint]` — Тест регистрации подписчика — **заблокировано**: нужен репозиторий `omsu_bot`

### Race detector
- [x] **6.7** — CI уже имеет `go test -race ./...`. Makefile не используется.
- [x] **6.8** — Все новые тесты проверены race detector'ом. Фикс: `MaxOpenConns=1` в тестовой БД.

---

## Этап 7 — 🧹 Технический долг (React SPA) ✅ Completed: 2026-05-25

> Code Review P2: ScheduleContent без мемоизации.

- [x] **7.1** — React.memo + useMemo для `fillWeekDays`, `visibleCurrentLessons`, `formatWeekRange`. (`web/src/components/ScheduleContent.tsx`)
- [x] **7.2** — useMemo для `breakInfo` и `grouped` lessons. (`web/src/components/ScheduleContent.tsx`)

---

## Легенда

```
[x]  выполнено
[/]  в процессе
[!]  заблокировано

---

## Легенда

```
[ ]  не начато
[/]  в процессе
[x]  выполнено
[!]  заблокировано
```
