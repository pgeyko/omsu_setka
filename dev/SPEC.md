# Техническое задание: Зеркало расписания ОмГУ (omsu_mirror)

## 1. Цель проекта

Создать высокопроизводительный BFF-сервер (Backend-for-Frontend), который:
- **Зеркалирует** данные расписания с `eservice.omsu.ru/schedule/backend`
- **Кэширует** и хранит данные локально для мгновенной отдачи
- **Синхронизирует** данные в фоне, минимизируя нагрузку на источник
- **Предоставляет** быстрый REST API с поиском и фильтрацией

### Приоритеты (в порядке важности)
1. **Минимальная нагрузка на сервер** — RAM < 50 МБ, CPU ~ 0%
2. **Скорость отдачи** — P99 < 5 мс для любого GET-запроса
3. **Быстрый поиск** — полнотекстовый поиск по группам/преподавателям < 1 мс
4. **Отказоустойчивость** — работа при недоступности источника (из кэша)

---

## 2. Архитектура

```
┌──────────────┐       ┌─────────────────────────────────────────┐
│   Клиенты    │──────▶│           omsu_mirror (BFF)             │
│  (браузер,   │◀──────│                                         │
│  моб. прил.) │       │  ┌───────────┐  ┌────────────────────┐  │
└──────────────┘       │  │  HTTP API  │  │  Background Sync   │  │
                       │  │  (Fiber)   │  │  (goroutines)      │  │
                       │  └─────┬─────┘  └──────────┬─────────┘  │
                       │        │                    │            │
                       │  ┌─────▼────────────────────▼─────────┐ │
                       │  │         Cache Layer                 │ │
                       │  │  ┌──────────┐  ┌────────────────┐  │ │
                       │  │  │ In-Memory│  │  Pre-rendered  │  │ │
                       │  │  │ (sync.Map)│  │  JSON blobs    │  │ │
                       │  │  └──────────┘  └────────────────┘  │ │
                       │  └─────────────────┬──────────────────┘ │
                       │                    │                    │
                       │  ┌─────────────────▼──────────────────┐ │
                       │  │         SQLite (persistent)        │ │
                       │  │  • dict_groups                     │ │
                       │  │  • dict_auditories                 │ │
                       │  │  • dict_tutors                     │ │
                       │  │  • schedule_cache                  │ │
                       │  │  • sync_metadata                   │ │
                       │  └────────────────────────────────────┘ │
                       └───────────────┬─────────────────────────┘
                                       │ Background sync
                       ┌───────────────▼─────────────────────────┐
                       │    eservice.omsu.ru/schedule/backend     │
                       │    (upstream — оригинальный сервер)      │
                       └─────────────────────────────────────────┘
```

### 2.1 Трёхуровневый кэш

| Уровень | Хранилище | Назначение | Latency |
|---------|-----------|------------|---------|
| L1 | `sync.Map` + pre-rendered JSON | Горячие данные для мгновенной отдачи | ~0.1 мс |
| L2 | SQLite (WAL mode) | Персистентное хранение, переживает рестарт | ~1 мс |
| L3 | Upstream API | Источник истины, обращаемся только при синхронизации | 100-500 мс |

### 2.2 Стратегия синхронизации

| Данные | Интервал | Обоснование |
|--------|----------|-------------|
| `dict/groups` | 1 раз в 12 часов | Группы меняются только в начале семестра |
| `dict/auditories` | 1 раз в 24 часа | Аудитории практически никогда не меняются |
| `dict/tutors` | 1 раз в 12 часов | Преподаватели меняются крайне редко |
| `schedule/group/*` | 1 раз в 15 минут | Расписание может меняться (замены, переносы) |
| `schedule/tutor/*` | 1 раз в 30 минут | Обычно производное от группового |
| `schedule/auditory/*` | 1 раз в 30 минут | Обычно производное от группового |

**Умная синхронизация расписаний:**
- Синхронизируем не все группы подряд, а **только активные** (те, которые запрашивали за последние 24 часа).
- Остальные — по требованию (lazy-fetch): первый запрос идёт к upstream, кэшируется, далее отдаётся из кэша.
- Rate-limiting: не более 2 запросов/сек к upstream для предотвращения блокировки.

---

## 3. Технологический стек

### 3.1 Язык и рантайм

| Компонент | Выбор | Обоснование |
|-----------|-------|-------------|
| **Язык** | **Go 1.22+** | Компилируемый, минимальный RAM (~10-30 МБ), нативная конкурентность, один бинарник |
| **HTTP-фреймворк** | **Fiber v2** | Самый быстрый Go-фреймворк (на базе fasthttp), ~1 мкс overhead |
| **БД** | **SQLite 3** (через `modernc.org/sqlite`) | Zero-config, embedded, WAL-mode даёт конкурентное чтение, pure Go (без CGO) |
| **Кэш** | **sync.Map + []byte** | Zero-allocation: храним pre-serialized JSON |
| **HTTP-клиент** | **fasthttp** | Переиспользование соединений, минимальные аллокации |
| **Конфиг** | **envconfig** | Переменные окружения, без файлов |
| **Логирование** | **zerolog** | Zero-allocation structured logging |
| **Контейнеризация** | **Docker** | Multi-stage build, scratch-based image ~10 МБ |

### 3.2 Почему именно этот стек

```
Go + Fiber + SQLite + sync.Map
   │         │         │          │
   │         │         │          └─ Мгновенная отдача без сериализации
   │         │         └─ Персистентность без отдельного сервиса БД
   │         └─ Самый быстрый HTTP в Go (нулевые аллокации)
   └─ Один бинарник, ~10 МБ RAM, горутины для фонового sync
```

**Отвергнутые альтернативы:**
- **Python/FastAPI**: в 10-50x медленнее, выше потребление RAM
- **Node.js**: выше потребление RAM, GC-паузы
- **Rust**: сопоставимая производительность, но в 3-5x дольше разработка
- **PostgreSQL/Redis**: избыточны для объёма данных (~5-10 МБ), создают лишние сетевые запросы

---

## 4. API контракт (BFF)

### 4.1 Справочники

```
GET /api/v1/groups                      → Список всех групп
GET /api/v1/groups/:id                  → Данные группы по ID
GET /api/v1/auditories                  → Список всех аудиторий
GET /api/v1/auditories/:id              → Данные аудитории по ID
GET /api/v1/tutors                      → Список преподавателей
GET /api/v1/tutors/:id                  → Данные преподавателя по ID
```

### 4.2 Расписание

```
GET /api/v1/schedule/group/:id          → Расписание группы
GET /api/v1/schedule/auditory/:id       → Расписание аудитории
GET /api/v1/schedule/tutor/:id          → Расписание преподавателя
```

**Query-параметры расписания:**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `date_from` | string (DD.MM.YYYY) | Фильтр от даты |
| `date_to` | string (DD.MM.YYYY) | Фильтр до даты |
| `day` | string (DD.MM.YYYY) | Конкретный день |

### 4.3 Поиск

```
GET /api/v1/search?q={query}&type={type}
```

| Параметр | Тип | Описание |
|----------|-----|----------|
| `q` | string | Поисковый запрос (мин. 2 символа) |
| `type` | string | Фильтр: `group`, `tutor`, `auditory`, `all` (по умолчанию) |

**Ответ:**
```json
{
  "groups": [{"id": 472, "name": "МБС-501-О-01", "real_group_id": 15103}],
  "tutors": [{"id": 303, "name": "Озол Виктория Александровна"}],
  "auditories": [{"id": 3024, "name": "1-1", "building": "1"}]
}
```

**Реализация поиска:**
- In-memory prefix tree (Trie) для мгновенного автокомплита
- Case-insensitive, поддержка частичного совпадения
- Rebuild trie только при обновлении справочников (~раз в 12ч)

### 4.4 Мета-эндпоинты

```
GET /api/v1/health                      → Статус сервиса
GET /api/v1/sync/status                 → Статус синхронизации
POST /api/v1/sync/trigger               → Принудительный запуск синхронизации (admin)
```

**Ответ /health:**
```json
{
  "status": "ok",
  "uptime": "2h15m",
  "last_sync": {
    "groups": "2026-04-07T10:00:00Z",
    "schedule": "2026-04-07T15:45:00Z"
  },
  "cache": {
    "groups_count": 1200,
    "tutors_count": 800,
    "auditories_count": 500,
    "active_schedules": 45
  }
}
```

### 4.5 Общий формат ответа BFF

```json
{
  "success": true,
  "data": { /* полезная нагрузка */ },
  "cached_at": "2026-04-07T15:45:00Z",
  "source": "cache"  // "cache" | "upstream" | "stale"
}
```

**HTTP-заголовки кэширования:**
```
Cache-Control: public, max-age=900
ETag: "abc123"
X-Cache-Status: HIT | MISS | STALE
X-Upstream-Sync: 2026-04-07T15:45:00Z
```

---

## 5. Структура БД (SQLite)

```sql
-- Справочник групп
CREATE TABLE dict_groups (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    real_group_id INTEGER,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_groups_name ON dict_groups(name);
CREATE INDEX idx_groups_real_id ON dict_groups(real_group_id);

-- Справочник аудиторий
CREATE TABLE dict_auditories (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    building    TEXT NOT NULL DEFAULT '0',
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_name ON dict_auditories(name);
CREATE INDEX idx_audit_building ON dict_auditories(building);

-- Справочник преподавателей
CREATE TABLE dict_tutors (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tutors_name ON dict_tutors(name);

-- Кэш расписаний (хранит pre-rendered JSON blob)
CREATE TABLE schedule_cache (
    cache_key   TEXT PRIMARY KEY,     -- "group:15103", "tutor:303", "auditory:3024"
    entity_type TEXT NOT NULL,        -- "group", "tutor", "auditory"
    entity_id   INTEGER NOT NULL,
    data        BLOB NOT NULL,        -- gzip-compressed JSON
    etag        TEXT,
    fetched_at  DATETIME NOT NULL,
    expires_at  DATETIME NOT NULL,
    hit_count   INTEGER DEFAULT 0,    -- для определения "горячих" записей
    last_hit_at DATETIME
);
CREATE INDEX idx_sched_type ON schedule_cache(entity_type);
CREATE INDEX idx_sched_expires ON schedule_cache(expires_at);
CREATE INDEX idx_sched_hits ON schedule_cache(hit_count DESC);

-- Метаданные синхронизации
CREATE TABLE sync_metadata (
    key         TEXT PRIMARY KEY,
    value       TEXT,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. Структура проекта

```
omsu_mirror/
├── cmd/
│   └── server/
│       └── main.go              # Точка входа
├── internal/
│   ├── config/
│   │   └── config.go            # Конфигурация из ENV
│   ├── models/
│   │   ├── group.go             # Модель группы
│   │   ├── auditory.go          # Модель аудитории
│   │   ├── tutor.go             # Модель преподавателя
│   │   ├── schedule.go          # Модель расписания
│   │   └── api.go               # Обёртки API-ответов
│   ├── storage/
│   │   ├── sqlite.go            # Инициализация SQLite + миграции
│   │   ├── dict_repo.go         # CRUD справочников
│   │   └── schedule_repo.go     # CRUD кэша расписаний
│   ├── cache/
│   │   ├── memory.go            # In-memory кэш (sync.Map + pre-rendered JSON)
│   │   └── search.go            # Поисковый индекс (Trie)
│   ├── sync/
│   │   ├── syncer.go            # Оркестратор фоновой синхронизации
│   │   ├── dict_sync.go         # Синхронизация справочников
│   │   └── schedule_sync.go     # Синхронизация расписаний
│   ├── upstream/
│   │   └── client.go            # HTTP-клиент к eservice.omsu.ru
│   └── api/
│       ├── router.go            # Маршрутизация Fiber
│       ├── handlers_dict.go     # Хэндлеры справочников
│       ├── handlers_schedule.go # Хэндлеры расписания
│       ├── handlers_search.go   # Хэндлер поиска
│       ├── handlers_meta.go     # Health, sync status
│       └── middleware.go        # CORS, логирование, rate-limit
├── API_DATA.md                  # Документация API upstream
├── SPEC.md                      # Это ТЗ
├── TASKS.md                     # Чеклист задач
├── go.mod
├── go.sum
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 7. Конфигурация

```env
# Сервер
SERVER_PORT=8080
SERVER_READ_TIMEOUT=5s
SERVER_WRITE_TIMEOUT=5s
SERVER_PREFORK=false          # true для multi-core

# Upstream
UPSTREAM_BASE_URL=https://eservice.omsu.ru/schedule/backend
UPSTREAM_TIMEOUT=10s
UPSTREAM_RATE_LIMIT=2         # запросов/сек к upstream
UPSTREAM_USER_AGENT=omsu_setka/1.0

# Синхронизация
SYNC_DICT_INTERVAL=12h        # Справочники
SYNC_SCHEDULE_INTERVAL=15m    # Активные расписания
SYNC_AUDIT_INTERVAL=24h       # Аудитории
SYNC_ON_STARTUP=true          # Первичная загрузка при старте

# Кэш
CACHE_SCHEDULE_TTL=15m
CACHE_DICT_TTL=12h
CACHE_ACTIVE_THRESHOLD=24h   # Расписание считается "активным" если запрашивалось за N часов

# SQLite
SQLITE_PATH=./data/mirror.db
SQLITE_WAL_MODE=true
SQLITE_BUSY_TIMEOUT=5000

# Логирование
LOG_LEVEL=info
LOG_FORMAT=json
```

---

## 8. Требования к производительности

| Метрика | Целевое значение |
|---------|-----------------|
| RAM в idle | < 30 МБ |
| RAM при нагрузке | < 50 МБ |
| CPU в idle | ~0% |
| P50 latency (кэш-хит) | < 1 мс |
| P99 latency (кэш-хит) | < 5 мс |
| P99 latency (кэш-мисс) | < 500 мс (upstream) |
| Поиск (autocomplete) | < 1 мс |
| Одновременных подключений | > 10,000 |
| Docker-образ | < 15 МБ |
| Холодный старт | < 3 сек |

---

## 9. Оптимизации

### 9.1 Pre-rendered JSON
- При загрузке справочников в кэш — **сразу сериализуем в []byte**
- При HTTP-запросе — отдаём готовый blob без повторной сериализации
- Экономия: ~0 аллокаций на запрос

### 9.2 GZIP-кэширование
- Храним в SQLite gzip-сжатый JSON
- Если клиент поддерживает gzip — отдаём как есть (без декомпрессии)
- Экономия: ~70% трафика, ~0 CPU на сжатие

### 9.3 Conditional requests
- ETag для каждого кэшированного ответа
- `If-None-Match` → 304 Not Modified без тела ответа
- Снижает трафик при частых polling-запросах клиентов

### 9.4 Поисковый индекс
- Trie (префиксное дерево) в памяти для всех имён
- Нормализация: lowercase, замена ё→е
- Обновление только при sync справочников

### 9.5 Lazy-fetch расписаний
- Не загружаем все ~1200 групп при старте
- Загружаем по требованию + кэшируем
- Активно re-sync только "горячие" расписания (hit_count > 0 за 24ч)

---

## 10. Graceful degradation

| Сценарий | Поведение |
|----------|-----------|
| Upstream недоступен | Отдаём stale-данные из кэша, заголовок `X-Cache-Status: STALE` |
| Первый старт без данных | Последовательная загрузка: справочники → ожидание → готов к работе |
| SQLite corrupted | In-memory fallback, пересоздание БД |
| Кэш-мисс | Прозрачный проксирующий запрос к upstream с сохранением в кэш |

---

## 11. Безопасность

- **Rate-limiting**: Ограничение запросов с одного IP (100 req/min)
- **CORS**: Настраиваемый whitelist доменов
- **Admin-эндпоинты**: Защита через API-ключ в заголовке `X-Admin-Key`
- **Upstream rate-limit**: Не более 2 req/sec к eservice.omsu.ru
- **Input validation**: Санитизация всех query-параметров
