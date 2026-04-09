# План доработки omsu_mirror v2

> Результат аудита проекта и план новых этапов реализации.

---

## Результаты аудита

### ✅ Что работает хорошо
- Трёхуровневый кэш (L1/L2/L3) реализован полностью
- Lazy-fetch расписаний с graceful degradation (stale-данные при падении upstream)
- Trie-поиск с нормализацией
- Background sync с раздельными интервалами
- Swagger-документация API
- PWA-frontнад с glassmorphism, избранное, история

### ⚠️ Что отсутствует / требует доработки

| Проблема | Критичность | Описание |
|----------|-------------|----------|
| **Нет rate-limit middleware** | 🔴 Высокая | В `SPEC.md` описан rate-limit 100 req/min, в `TASKS.md` отмечен как `[x]`, но в `middleware.go` — **только логгер и admin-auth**. Нет фактической защиты от DDoS |
| **Нет статус-табло upstream** | 🟡 Средняя | Нет отслеживания доступности upstream; `/health` не сообщает, жив ли eservice.omsu.ru |
| **Нет логов падений** | 🟡 Средняя | Ошибки upstream логируются в stderr/zerolog, но нет UI и нет таблицы в БД |
| **Нет информации о синхронизации на фронте** | 🟡 Средняя | Пользователь не знает, актуальны ли данные |
| **Input validation слабая** | 🟡 Средняя | ID в schedule handler не ограничен; нет лимита на query string |
| **CORS слишком открытый** | 🟢 Низкая | `CORS_ALLOWED_ORIGINS=*` в .env и в default |
| **Нет request size limit** | 🟢 Низкая | Fiber по умолчанию принимает любой размер body |
| **Нет security headers** | 🟢 Низкая | Отсутствуют X-Content-Type-Options, X-Frame-Options и т.д. |
| **Нет очистки expired-кэша** | 🟡 Средняя | `CleanExpired()` реализован, но нигде не вызывается |

---

## Этап 11: Мониторинг и статус-табло

### 11.1 Backend: Отслеживание здоровья upstream

#### [MODIFY] `core/internal/sync/syncer.go`
- Добавить `UpstreamStatus` struct с atomic-полями:
  - `IsHealthy bool` — текущий статус
  - `LastSuccessSync time.Time` — время последнего успешного запроса
  - `LastFailTime time.Time` — время последнего сбоя
  - `LastError string` — текст последней ошибки
  - `ConsecutiveFailures int` — счётчик последовательных ошибок
  - `TotalFailures int` — общее количество ошибок за всё время
- Обновлять status при каждом sync (success/fail)

#### [NEW] `core/internal/storage/incident_repo.go`
- Таблица `upstream_incidents`:
  ```sql
  CREATE TABLE upstream_incidents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type  TEXT NOT NULL,       -- 'down', 'up', 'error', 'slow'
      message     TEXT,
      error_text  TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```
- Методы: `LogIncident(...)`, `GetIncidents(limit, offset)`, `GetIncidentsSince(time)`

#### [MODIFY] `core/internal/api/handlers_meta.go`
- Обновить `/health` — включить `upstream_status`:
  ```json
  {
    "status": "ok",
    "uptime": "2h15m",
    "upstream": {
      "healthy": true,
      "last_success": "2026-04-08T10:00:00Z",
      "last_error": null,
      "consecutive_failures": 0
    },
    "last_sync": {
      "dictionaries": "2026-04-08T10:00:00Z",
      "schedules": "2026-04-08T10:15:00Z"
    },
    "cache": { "hits": 1234, "misses": 56, "item_count": 42 }
  }
  ```

#### [NEW] Эндпоинт `GET /api/v1/incidents?limit=50&offset=0`
- Публичный (без admin-key), но с rate-limit
- Возвращает историю инцидентов upstream

### 11.2 Frontend: Статус-бар на главной

#### [MODIFY] `web/src/api/client.ts`
- Добавить `fetchHealth()` и `fetchIncidents()` функции

#### [MODIFY] `web/src/pages/Home.tsx`
- Добавить компонент `StatusBar` между header и search:
  - Зелёная точка + «Данные актуальны • Обновлено 5 мин назад»
  - Красная точка + «Сервер ОмГУ недоступен • Данные от 2 часов назад»
  - При клике → переход на страницу инцидентов

#### [NEW] `web/src/pages/StatusPage.tsx`
- Страница `/status` — лог инцидентов
- Timeline-список событий (down/up/slow) с датами
- Текущий статус upstream в виде hero-блока

#### [NEW] `web/src/pages/StatusPage.module.css`
- Стили для timeline и status badges

#### [MODIFY] `web/src/App.tsx`
- Добавить маршрут `/status`

---

## Этап 12: Rate Limiting и защита от DDoS

### 12.1 Rate-limit middleware

#### [MODIFY] `core/internal/api/middleware.go`
- Реализовать `RateLimitMiddleware` на основе Fiber's built-in `limiter`:
  ```
  github.com/gofiber/fiber/v2/middleware/limiter
  ```
- Конфигурация:
  - **Общий**: 120 req/min на IP (для всех `/api/v1/*`)
  - **Поиск**: 30 req/min на IP (для `/api/v1/search`)
  - **Schedule**: 60 req/min на IP (для `/api/v1/schedule/*`)
- При превышении: `429 Too Many Requests` + `Retry-After` header

#### [MODIFY] `core/internal/config/config.go`
- Добавить config-поля:
  - `RateLimitGeneral int` (default: 120)
  - `RateLimitSearch int` (default: 30)
  - `RateLimitWindow time.Duration` (default: 1m)

### 12.2 Security Headers

#### [NEW] `SecurityHeadersMiddleware` в `middleware.go`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy: default-src 'self'`

### 12.3 Input Validation

#### [MODIFY] `core/internal/api/handlers_schedule.go`
- Ограничить `id` по диапазону: 1 ≤ id ≤ 999999
- Вернуть 400 для невалидных ID

#### [MODIFY] `core/internal/api/handlers_search.go`
- Ограничить `q` параметр: max 100 символов
- Санитизация: убрать спецсимволы (< > " ' ;)

### 12.4 Request Body/Size Limits

#### [MODIFY] `core/internal/api/router.go`
- В `fiber.Config` добавить:
  - `BodyLimit: 1 * 1024` (1 KB — API не принимает body кроме trigger)
  - `ReadBufferSize: 4096`
  - `DisablePreParseMultipartForm: true`

---

## Этап 13: Очистка и оптимизация

### 13.1 Периодическая очистка expired-кэша

#### [MODIFY] `core/internal/sync/syncer.go`
- Добавить ticker для `CleanExpired()` — раз в 1 час
- Логировать количество удалённых записей

### 13.2 Прогрев L1-кэша при старте

#### [MODIFY] `core/internal/sync/syncer.go`
- После startup sync → загрузить все «горячие» записи из L2 в L1
- Это устранит cold-start cache-misses после рестарта

### 13.3 GZIP-кэширование для справочников

#### [MODIFY] `core/internal/sync/dict_sync.go`
- В `cacheCollection()` — делать `SetGzip()` помимо `Set()`
- В handlers_dict → проверять `Accept-Encoding: gzip` и отдавать gzip-версию

---

## Этап 14: Улучшения Frontend

### 14.1 Error boundary и offline-режим

#### [NEW] `web/src/components/ErrorBoundary.tsx`
- React error boundary для перехвата ошибок рендеринга
- Красивый fallback-экран

### 14.2 Skeleton-загрузки

#### [MODIFY] Страницы с загрузкой
- Заменить текстовые «Загрузка...» на shimmer-skeleton карточки
- Улучшит воспринимаемую скорость

### 14.3 Pull-to-refresh (мобильная)
- Жест pull-down на странице расписания для принудительного обновления

---

## Зависимости для добавления

### Backend (Go)
```
github.com/gofiber/fiber/v2/middleware/limiter  # Уже есть в Fiber, просто импорт
```
Нет новых внешних зависимостей — `limiter` входит в Fiber v2.

### Frontend (React)
Нет новых зависимостей — всё реализуется на имеющемся стеке.

---

## Приоритеты реализации

| Этап | Приоритет | Трудозатраты | Описание |
|------|-----------|--------------|----------|
| 12.1 | 🔴 P0 | ~30 мин | Rate Limiting — критическая защита |
| 12.2 | 🔴 P0 | ~10 мин | Security Headers — минимум усилий |
| 12.3 | 🟡 P1 | ~15 мин | Input Validation — запас прочности |
| 11.1 | 🟡 P1 | ~1 час | Backend мониторинг upstream |
| 11.2 | 🟡 P1 | ~1.5 часа | Frontend статус-табло + страница инцидентов |
| 13.1 | 🟢 P2 | ~15 мин | Очистка expired кэша |
| 13.2 | 🟢 P2 | ~20 мин | Прогрев L1 при старте |
| 14.1 | 🟢 P2 | ~30 мин | Error boundary |

---

## Верификация

### Автоматические проверки
- `go build ./...` — компиляция бэкенда
- `npm run build` — сборка фронтенда
- `docker compose up --build` — полная сборка и запуск
- `curl` тесты: rate-limit (429), health endpoint, incidents

### Ручные проверки
- Открыть главную → проверить статус-бар
- Быстро отправить 130+ запросов → убедиться в 429
- Проверить security headers в DevTools → Network
- Перейти на `/status` → проверить timeline
