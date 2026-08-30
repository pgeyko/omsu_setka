# Деплой на Coolify

Проект поставляется с отдельным compose-файлом `docker-compose.coolify.yml`,
который использует **магические переменные Coolify** (`SERVICE_FQDN_*`,
`SERVICE_PASSWORD_*`) для автоматической генерации домена и секретов.

> Обычный деплой (GHCR-образы + SSH) продолжает работать как раньше —
> `docker-compose.prod.yml` не затронут.

## Архитектура

```
Пользователь
   │  https://<domain> (HTTPS, прокси Coolify)
   ▼
frontend (nginx, порт 80)  ── /api ──▶  backend (порт 8080, внутренний)
```

- Публичен только `frontend`. GET/HEAD-запросы идут на CDN-домен и через
  frontend nginx попадают в backend.
- Для изменяющих запросов и CORS preflight используется отдельный origin-домен
  без CDN. Он также проксируется в frontend nginx, но не кэшируется.
- `backend` наружу не выставляется вовсе.
- SQLite хранится в volume `backend_data` (`/app/data/mirror.db`).

## Быстрый старт

### 1. Репозиторий

Код лежит в приватном Forgejo-репозитории:

```bash
git remote add origin ssh://git@forgejo.n1.pgeyko.ru:22222/OmSU/setka.git
git push -u origin main
```

### 2. Доступ Coolify к приватному репозиторию

1. В Coolify: **New Resource → Docker Compose → Source = Git Repository**.
2. В поле репозитория укажите SSH-URL:
   `git@forgejo.n1.pgeyko.ru:22222/OmSU/setka.git`
3. Coolify покажет сгенерированный **публичный SSH-ключ** (Settings → Keys,
   или прямо в форме подключения).
4. Скопируйте его в Forgejo: **repo OmSU/setka → Settings → Deploy Keys** →
   Add Deploy Key (достаточно read-only).

### 3. Настройки приложения в Coolify

| Параметр | Значение |
|---|---|
| Build Pack | `Docker Compose` |
| Base Directory | `/` |
| Docker Compose Location | `docker-compose.coolify.yml` |
| Branch | `main` |
| Ports Exposes | `80` |

### 4. Домен

Назначьте домен сервису **frontend** (он слушает порт 80). Coolify
автоматически:
- сгенерирует `SERVICE_FQDN_FRONTEND` (FQDN без схемы);
- создаст HTTPS-прокси домен → контейнер `frontend:80`.

Эти же значения подставятся в `APP_BASE_URL` и `CORS_ALLOWED_ORIGINS` бэкенда
из compose-файла. `CORS_ALLOWED_ORIGINS` должен содержать CDN-домен, с которого
загружается frontend (например, `https://s.pgeyko.ru`), а не origin API.

Для схемы с CDN дополнительно создайте origin-домен без CDN-проксирования
(например, `api-origin.example.com`) и направьте его на origin-сервер. Этот
домен должен проксировать запросы в тот же frontend-контейнер. В frontend build
переменной `VITE_API_ORIGIN` укажите полный URL origin API.

В CSP, который отдается CDN или внешним nginx для HTML frontend, добавьте
origin API в `connect-src`, например:

```text
connect-src 'self' https://api-origin.example.com
```

### 5. Переменные окружения

В разделе Environment приложения заполните:

**Build Variables** (нужны на этапе сборки фронтенда, вшиваются в бандл и
Service Worker):

```
VITE_API_BASE=/api/v1
VITE_API_ORIGIN=https://api-origin.example.com/api/v1
VITE_CF_ANALYTICS_TOKEN=        # опционально
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
VITE_FIREBASE_VAPID_KEY=...
```

**Runtime Variables** (обязательные):

```
FIREBASE_SERVICE_ACCOUNT={ "type": "service_account", ... }
```

`ADMIN_KEY` и `CORS_ALLOWED_ORIGINS` / `APP_BASE_URL` подставятся автоматически
из `SERVICE_PASSWORD_64_BACKEND` и `SERVICE_FQDN_FRONTEND`. При желании их
можно переопределить, отредактировав сгенерированные переменные в UI.

Остальные настройки имеют дефолты (rate-limit, интервалы синхронизации,
webhook) и тоже редактируются в UI.

### 6. Deploy

Нажмите **Deploy**. Дождитесь сборки (backend из Go, frontend из Vite) и запуска.

## Проверка после деплоя

```bash
# Health-эндпоинт через CDN
curl -s https://<domain>/api/v1/health

# Проверка CORS preflight через origin
curl -i -X OPTIONS https://api-origin.example.com/api/v1/subscribe \
  -H 'Origin: https://<domain>' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'

# Live/ready пробы
curl -s https://<domain>/live
curl -s https://<domain>/ready

# Принудительная синхронизация (вручную, опционально)
curl -X POST https://api-origin.example.com/api/v1/sync/trigger -H "X-Admin-Key: <ADMIN_KEY>"
```

`ADMIN_KEY` смотрите в **Environment → Runtime Variables** приложения.

## Данные и бэкапы

- SQLite (`mirror.db`) лежит в volume `backend_data`. В Coolify он появится в
  разделе **Persistent Storage** приложения.
- Для бэкапа достаточно скопировать файл из volume или примонтировать
  `backend_data` во временный контейнер:
  ```bash
  docker run --rm -v omsu_setka_backend_data:/data -v $(pwd):/backup alpine \
    cp /data/mirror.db /backup/mirror.db
  ```
- При удалении/пересоздании приложения **не удаляйте volume** (или экспортируйте
  БД заранее).

## Интеграция с omsu_bot

После деплоя зарегистрируйте бота как подписчика вебхуков через Admin API:

```bash
curl -X POST https://api-origin.example.com/api/v1/admin/webhooks \
  -H "X-Admin-Key: <ADMIN_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://bot.example.com/webhook/schedule",
    "secret": "<shared-hmac-secret>",
    "group_ids": [],
    "enabled": true
  }'
```

Подробнее о контракте вебхуков — в [ADMIN_GUIDE.md](./ADMIN_GUIDE.md).

## Возможные проблемы

- **`SERVICE_FQDN_FRONTEND` пуст** → домен не назначен сервису `frontend`.
  Назначьте домен в UI и передеплойте.
- **Frontend собирается без Firebase-ключей** → не заполнены Build Variables
  `VITE_FIREBASE_*`; значения пустые вшиваются в Service Worker.
- **Backend не стартует** → проверьте логи: `FIREBASE_SERVICE_ACCOUNT` может
  быть невалидным JSON; `SYNC_ON_STARTUP=true` требует доступа к upstream.
- **Контейнер backend пересоздаётся по кругу** → приложение не проходит
  healthcheck (`/ready`). Смотрите `curl -sf http://localhost:8080/ready`
  в логике compose-файла.
