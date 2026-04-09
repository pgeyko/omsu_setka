# TASK — Чеклист реализации omsu_mirror

> Обновлять статус: `[ ]` → `[/]` (в работе) → `[x]` (готово)

---

## Этап 0: Подготовка проекта
- [x] 0.1 Инициализация Go-модуля (`go mod init`)
- [x] 0.2 Создание структуры каталогов проекта
- [x] 0.3 Создание `.env.example` с описанием переменных
- [x] 0.4 Создание `Dockerfile` (multi-stage, scratch)
- [x] 0.5 Создание `docker-compose.dev.yml` и `docker-compose.prod.yml`
- [x] 0.6 Создание `.gitignore`

---

## Этап 1: Конфигурация и модели
- [x] 1.1 `internal/config/config.go` — загрузка конфигурации из ENV
- [x] 1.2 `internal/models/group.go` — модель группы
- [x] 1.3 `internal/models/auditory.go` — модель аудитории
- [x] 1.4 `internal/models/tutor.go` — модель преподавателя
- [x] 1.5 `internal/models/schedule.go` — модель расписания (день + занятие)
- [x] 1.6 `internal/models/api.go` — обёртки API-ответов (upstream + BFF)

---

## Этап 2: Storage (SQLite)
- [x] 2.1 `internal/storage/sqlite.go` — инициализация SQLite, WAL-mode, миграции
- [x] 2.2 `internal/storage/dict_repo.go` — CRUD для справочников (groups, auditories, tutors)
  - [x] 2.2.1 `UpsertGroups([]Group)` — bulk upsert групп
  - [x] 2.2.2 `UpsertAuditories([]Auditory)` — bulk upsert аудиторий
  - [x] 2.2.3 `UpsertTutors([]Tutor)` — bulk upsert преподавателей
  - [x] 2.2.4 `GetAllGroups() []Group`
  - [x] 2.2.5 `GetAllAuditories() []Auditory`
  - [x] 2.2.6 `GetAllTutors() []Tutor`
  - [x] 2.2.7 `GetGroupByID(id) Group`
  - [x] 2.2.8 `GetAuditoryByID(id) Auditory`
  - [x] 2.2.9 `GetTutorByID(id) Tutor`
- [x] 2.3 `internal/storage/schedule_repo.go` — CRUD для кэша расписаний
  - [x] 2.3.1 `PutSchedule(key, data, ttl)` — сохранение с gzip-сжатием
  - [x] 2.3.2 `GetSchedule(key) (data, meta)` — получение + increment hit_count
  - [x] 2.3.3 `GetActiveScheduleKeys(threshold)` — ключи "горячих" расписаний
  - [x] 2.3.4 `CleanExpired()` — удаление устаревших записей
  - [x] 2.3.5 `PutSyncMeta(key, value)` / `GetSyncMeta(key)` — метаданные синхронизации

---

## Этап 3: Upstream-клиент
- [x] 3.1 `internal/upstream/client.go` — HTTP-клиент к eservice.omsu.ru
  - [x] 3.1.1 Инициализация fasthttp.Client с настройками
  - [x] 3.1.2 `FetchGroups() ([]Group, error)`
  - [x] 3.1.3 `FetchAuditories() ([]Auditory, error)`
  - [x] 3.1.4 `FetchTutors() ([]Tutor, error)`
  - [x] 3.1.5 `FetchGroupSchedule(realGroupID) ([]Day, error)`
  - [x] 3.1.6 `FetchTutorSchedule(tutorID) ([]Day, error)`
  - [x] 3.1.7 `FetchAuditorySchedule(auditoryID) ([]Day, error)`
  - [x] 3.1.8 Rate-limiter (token bucket, 2 req/sec)
  - [x] 3.1.9 Retry с exponential backoff
  - [x] 3.1.10 Таймауты и обработка ошибок upstream

---

## Этап 4: In-Memory кэш
- [x] 4.1 `internal/cache/memory.go` — кэш на sync.Map
  - [x] 4.1.1 `Set(key, preRenderedJSON)` — сохранение pre-rendered []byte
  - [x] 4.1.2 `Get(key) ([]byte, bool)` — получение без аллокаций
  - [x] 4.1.3 `SetWithGzip(key, rawJSON)` — сохранение с gzip-версией
  - [x] 4.1.4 `GetGzip(key) ([]byte, bool)` — для клиентов с Accept-Encoding: gzip
  - [x] 4.1.5 `Invalidate(key)` — точечная инвалидация
  - [x] 4.1.6 `Stats() CacheStats` — количество записей, hit/miss
- [x] 4.2 `internal/cache/search.go` — поисковый индекс
  - [x] 4.2.1 Trie-структура для prefix-поиска
  - [x] 4.2.2 Нормализация ввода (lowercase, ё→е, удаление дефисов/пробелов/точек)
  - [x] 4.2.3 `Build(groups, tutors, auditories)` — построение индекса
  - [x] 4.2.4 `Search(query, type, limit) []SearchResult` — поиск с фильтром
  - [x] 4.2.5 `Rebuild()` — пересборка индекса при обновлении справочников

---

## Этап 5: Фоновая синхронизация
- [x] 5.1 `internal/sync/syncer.go` — оркестратор
  - [x] 5.1.1 Запуск горутин для каждого типа синхронизации
  - [x] 5.1.2 Graceful shutdown (context cancellation)
  - [x] 5.1.3 Логирование результатов синхронизации
  - [x] 5.1.4 Начальная загрузка при старте (startup sync)
- [x] 5.2 `internal/sync/dict_sync.go` — синхронизация справочников
  - [x] 5.2.1 Fetch → Compare diff → Upsert в SQLite → Update in-memory кэш
  - [x] 5.2.2 Rebuild поискового индекса если данные изменились
  - [x] 5.2.3 Логирование изменений (добавлено/обновлено/удалено)
- [x] 5.3 `internal/sync/schedule_sync.go` — синхронизация расписаний
  - [x] 5.3.1 Получение списка "горячих" расписаний из БД
  - [x] 5.3.2 Последовательный fetch с rate-limiting
  - [x] 5.3.3 Сравнение с кэшированной версией (по ETag или hash)
  - [x] 5.3.4 Обновление только при наличии изменений
  - [x] 5.3.5 Обновление in-memory кэша

---

## Этап 6: HTTP API
- [x] 6.1 `internal/api/router.go` — маршрутизация Fiber
  - [x] 6.1.1 Группировка маршрутов `/api/v1/`
  - [x] 6.1.2 Подключение middleware
- [x] 6.2 `internal/api/middleware.go` — middleware
  - [x] 6.2.1 CORS
  - [x] 6.2.2 Request logging (zerolog)
  - [x] 6.2.3 Recovery (panic handler)
  - [x] 6.2.4 Rate-limiting (по IP)
  - [x] 6.2.5 ETag / Conditional requests
  - [x] 6.2.6 Gzip-response (если клиент поддерживает)
- [x] 6.3 `internal/api/handlers_dict.go` — хэндлеры справочников
  - [x] 6.3.1 `GET /api/v1/groups` — список всех групп
  - [x] 6.3.2 `GET /api/v1/groups/:id` — группа по ID
  - [x] 6.3.3 `GET /api/v1/auditories` — список аудиторий
  - [x] 6.3.4 `GET /api/v1/auditories/:id` — аудитория по ID
  - [x] 6.3.5 `GET /api/v1/tutors` — список преподавателей
  - [x] 6.3.6 `GET /api/v1/tutors/:id` — преподаватель по ID
- [x] 6.4 `internal/api/handlers_schedule.go` — хэндлеры расписания
  - [x] 6.4.1 `GET /api/v1/schedule/group/:id` — расписание группы
  - [x] 6.4.2 `GET /api/v1/schedule/tutor/:id` — расписание преподавателя
  - [x] 6.4.3 `GET /api/v1/schedule/auditory/:id` — расписание аудитории
  - [x] 6.4.4 Lazy-fetch: при кэш-мисс — прозрачный запрос к upstream
  - [x] 6.4.5 Поддержка query-параметров фильтрации по датам
- [x] 6.5 `internal/api/handlers_search.go` — поиск
  - [x] 6.5.1 `GET /api/v1/search?q=...&type=...` — поиск
  - [x] 6.5.2 Валидация: min query length = 2
  - [x] 6.5.3 Ограничение результатов (limit, default=20)
- [x] 6.6 `internal/api/handlers_meta.go` — мета-эндпоинты
  - [x] 6.6.1 `GET /api/v1/health` — health check
  - [x] 6.6.2 `GET /api/v1/sync/status` — статус синхронизации
  - [x] 6.6.3 `POST /api/v1/sync/trigger` — ручной запуск sync (admin)

---

## Этап 7: Точка входа и сборка
- [x] 7.1 `cmd/server/main.go` — инициализация и запуск
  - [x] 7.1.1 Загрузка конфига
  - [x] 7.1.2 Инициализация SQLite
  - [x] 7.1.3 Инициализация upstream-клиента
  - [x] 7.1.4 Инициализация кэша и поискового индекса
  - [x] 7.1.5 Запуск фоновой синхронизации
  - [x] 7.1.6 Запуск HTTP-сервера
  - [x] 7.1.7 Graceful shutdown (SIGINT/SIGTERM)
- [x] 7.2 Сборка и запуск
  - [x] 7.2.1 `go build` — проверка компиляции
  - [x] 7.2.2 Запуск и тестирование локально
  - [x] 7.2.3 Docker build и запуск

---

## Этап 8: Тестирование и отладка
- [x] 8.1 Проверка загрузки справочников при старте
- [x] 8.2 Проверка отдачи справочников через API
- [x] 8.3 Проверка загрузки расписания (lazy-fetch)
- [x] 8.4 Проверка работы поиска
- [x] 8.5 Проверка фоновой синхронизации (логи)
- [x] 8.6 Проверка graceful degradation (недоступный upstream)
- [x] 8.7 Проверка ETag / 304 ответов
- [x] 8.8 Нагрузочное тестирование (wrk/hey)
- [x] 8.9 Проверка потребления RAM и CPU

---

## Этап 9: Документация и деплой
- [x] 9.1 README.md с инструкцией по запуску
- [x] 9.2 API-документация (примеры curl)
- [x] 9.3 Финальная проверка Docker-образа
- [x] 9.4 Опциональный `.github/workflows` для CI

---

## Этап 10: Веб-клиент (Frontend)
- [x] 10.1 Инициализация Vite + React + TS (в монорепе)
- [x] 10.2 Настройка PWA плагина (`vite-plugin-pwa`)
- [x] 10.3 Разработка дизайн-системы Vanilla CSS (переменные, темная/светлая тема)
- [x] 10.4 Создание UI-библиотеки (Input, Button, Card, Skeleton, BottomNav)
- [x] 10.5 Настройка API клиента (React Query, axios/fetch) 
- [x] 10.6 Реализация страницы Поиска (с мгновенным автокомплитом)
- [x] 10.7 Реализация страниц расписания (свайп дней, логика "Что сейчас?")
- [x] 10.8 Логика "Избранного" (Zustand + LocalStorage)
- [x] 10.9 UX-полишинг (микроанимации, жесты свайпа, glassmorphism)
- [x] 10.10 Настройка раздачи статики фронтенда через Go Fiber (опционально)

---

> **Новые этапы:** детальное описание в [BACKEND_PLAN.md](./BACKEND_PLAN.md)

## Этап 11: Мониторинг и статус-табло (→ [BACKEND_PLAN.md § 11](./BACKEND_PLAN.md#этап-11-мониторинг-и-статус-табло))
- [x] 11.1 Backend: `UpstreamStatus` struct с atomic-полями для отслеживания здоровья upstream
- [x] 11.2 Backend: Таблица `upstream_incidents` + `IncidentRepo` в SQLite
- [x] 11.3 Backend: Обновить `/health` — включить upstream_status, last_sync timestamps
- [x] 11.4 Backend: Эндпоинт `GET /api/v1/incidents` — история инцидентов
- [x] 11.5 Backend: Логирование инцидентов при sync ошибках (down/up/slow transitions)
- [x] 11.6 Frontend: `fetchHealth()` и `fetchIncidents()` в API-клиенте
- [x] 11.7 Frontend: Компонент `StatusBar` на главной (зелёная/красная точка + время обновления)
- [x] 11.8 Frontend: Страница `/status` — timeline инцидентов, текущий статус upstream

---

## Этап 12: Rate Limiting и защита (→ [BACKEND_PLAN.md § 12](./BACKEND_PLAN.md#этап-12-rate-limiting-и-защита-от-ddos))
- [x] 12.1 Rate-limit middleware: 120 req/min общий, 30 req/min для /search
- [x] 12.2 Config: `RATE_LIMIT_GENERAL`, `RATE_LIMIT_SEARCH`, `RATE_LIMIT_WINDOW`
- [x] 12.3 Security Headers middleware (X-Content-Type-Options, X-Frame-Options и т.д.)
- [x] 12.4 Input Validation: ограничение ID (1–999999), query length (max 100 chars), санитизация
- [x] 12.5 Request Size Limits: `BodyLimit: 1KB`, `ReadBufferSize: 4096`

---

## Этап 13: Очистка и оптимизация (→ [BACKEND_PLAN.md § 13](./BACKEND_PLAN.md#этап-13-очистка-и-оптимизация))
- [x] 13.1 Периодическая очистка expired-кэша (ticker раз в 1 час)
- [x] 13.2 Прогрев L1 из L2 при старте (устранение cold-start misses)
- [x] 13.3 GZIP-кэширование для справочников (SetGzip + отдача gzip-версии)

---

## Этап 14: Улучшения Frontend (→ [BACKEND_PLAN.md § 14](./BACKEND_PLAN.md#этап-14-улучшения-frontend))
- [x] 14.1 React Error Boundary с fallback-экраном
- [x] 14.2 Skeleton-загрузки вместо текстовых «Загрузка...»
- [x] 14.3 Pull-to-refresh жест на странице расписания

---

## Этап 15: Страница аудиторий (→ [SPEC.md § 4.2](./SPEC.md#42-расписание))
- [ ] 15.1 Frontend: Создание страницы `AuditoriesPage.tsx` для поиска и выбора аудиторий
- [ ] 15.2 Frontend: Маршрутизация `/auditories` в `App.tsx`
- [ ] 15.3 Frontend: Интеграция с `fetchSchedule('auditory', id)` для отображения занятости кабинетов
- [ ] 15.4 Frontend: Добавление карточки «Аудитории» в навигацию на главной странице

---

## Этап 16: Тестирование и QA (→ [TESTING_PLAN.md](./TESTING_PLAN.md))
- [x] 16.1 Backend: Реализация Unit-тестов для парсера Upstream API
- [x] 16.2 Backend: Тестирование поискового индекса Trie (нормализация ё/е, регистр)
- [x] 16.3 Backend: Интеграционные тесты API (Rate Limiting, Security Headers)
- [x] 16.4 Frontend: Тесты Zustand-хранилищ (Favorites, Settings)
- [x] 16.5 QA: Нагрузочное тестирование (P99 < 5ms под нагрузкой)
- [x] 16.6 Backend: Unit-тесты для кэша, SQLite-репозиториев и конфигурации

---

## Этап 17: Безопасность и Production Hardening (Audit)
- [x] 17.1 Backend: Использовать `subtle.ConstantTimeCompare` для проверки `AdminKey` (защита от timing attack)
- [x] 17.2 Backend: Установить строгий CORS по умолчанию (вместо `*`) в конфиге
- [x] 17.3 Backend: Убрать дефолтное значение `admin-secret` для `ADMIN_KEY` в коде
- [x] 17.4 Backend: Настроить `ProxyHeader: "X-Real-IP"` в Fiber для корректного rate-limiting за Nginx
- [x] 17.5 Backend: Скрыть Swagger UI в продакшне или защитить его через `AdminAuth`
- [x] 17.6 Backend: Добавить `Content-Security-Policy` и `HSTS` заголовки в `SecurityHeadersMiddleware`
- [x] 17.7 Frontend: Исключить копирование `.env` в Docker-образ (использовать build-args для `VITE_*`)
- [x] 17.8 Frontend: Добавить `encodeURIComponent` для поисковых запросов в API-клиенте

---

---

## Этап 19: Продвинутая безопасность и Инфраструктура (Audit v2)
- [x] 19.1 Backend: Валидация `ADMIN_KEY` при старте (запрет пустой строки в production)
- [x] 19.2 Backend: Скрыть детали ошибок SQLite в `handlers_dict.go` (Information Disclosure)
- [x] 19.3 Backend: Настроить `TrustedProxies` в Fiber для защиты от подмены IP
- [x] 19.4 Docker: Запуск бэкенда от не-root пользователя (безопасность контейнера)
- [x] 19.5 Docker: Зафиксировать версию `alpine:3.19` вместо `latest`
- [x] 19.6 Nginx: Отключить `server_tokens` (скрытие версии сервера)
- [x] 19.7 Frontend: Оптимизация PWA-кэша (7 дней, `StaleWhileRevalidate` для API)

---

## Этап 20: Рефакторинг и исправление логики (Audit v2)
- [x] 20.1 Backend: Вынести сетевые запросы из-под мьютекса в `SyncDictionaries`
- [x] 20.2 Backend: Устранить двойной rate-limit на эндпоинте `/search`
- [x] 20.3 Backend: Ограничить размер `MemoryCache` (предотвращение утечки памяти)
- [x] 20.4 Backend: Оптимизировать инкремент хитов (использовать worker pool или батчинг)
- [x] 20.5 Backend: Убрать холостой тикер `auditTicker` или реализовать его
- [x] 20.6 Backend: Исправить race condition при инкременте `itemCount` в `MemoryCache`
- [x] 20.7 Backend: Консолидировать валидацию `limit/offset` в хэндлерах
