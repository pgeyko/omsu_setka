# Документация omsu_setka

`omsu_setka` («сетка») — зеркало расписания ОмГУ с мгновенной отдачей из кэша,
историей замен, push-уведомлениями и PWA-интерфейсом.
Публичный инстанс: <https://s.pgeyko.ru>.

## С чего начать

- [README](../README.md) — что это, возможности, скриншоты, быстрый старт.
- [Архитектура](./ARCHITECTURE.md) — кэш L1/L2/L3, синхронизация, БД, API,
  уведомления, вебхуки.
- [Backend](./core/DEVELOPMENT.md) — Go-сервис, конфигурация, тесты, Swagger.
- [Web](./web/DEVELOPMENT.md) — React-PWA, маршруты, стили, PWA, тесты.
- [Администрирование](./ADMIN_GUIDE.md) — Admin CLI, health/incidents, вебхуки.
- [Upstream API](./UPSTREAM_API.md) — контракт `eservice.omsu.ru`, который
  парсит backend.
- [Дизайн](./DESIGN.md) — визуальная система и токены.
- [Скриншоты](./screenshots/) — мобильный и десктопный интерфейс.

## Быстрые факты

| | |
|---|---|
| Backend | Go 1.23, Fiber v2, SQLite (pure Go, WAL), zerolog, Swagger |
| Frontend | React 19, TypeScript, Vite 8, React Router 7, TanStack Query 5, Zustand 5, vanilla CSS |
| PWA | Workbox precache + офлайн-расписание, Firebase Messaging |
| База | `data/mirror.db` (по умолчанию), том `backend_data` в Docker |
| Тесты | Go `go test ./...`; web 149 unit/component, 20 E2E, build-check |

## Требования

- Go 1.23+.
- Node.js 20+ и npm (CI использует Node 20).
- Docker и Docker Compose — для контейнерного запуска.

## Три способа запуска

1. **Всё одной командой**: `./run.sh` (тесты, сборка фронтенда и бинарника,
   запуск backend на `:8080`).
2. **Раздельно с hot-reload**: backend `cd core && go run ./cmd/server/main.go`,
   frontend `cd web && npm run dev`.
3. **Docker**:
   - `docker compose up --build` — только backend (ручная проверка);
   - `docker compose -f docker-compose.local.yml up` — backend + frontend.

## Конфигурация и секреты

Полный список переменных — в [`.env.example`](../.env.example). В production
обязательны `ADMIN_KEY` и `CORS_ALLOWED_ORIGINS` (без `*`). Для push нужны
`VITE_FIREBASE_*` на сборке фронтенда и `FIREBASE_SERVICE_ACCOUNT` на backend;
без них приложение работает, но FCM-токен не выдаётся.

## CI

`.github/workflows/ci.yml` на каждый push в `main` и PR:

1. gitleaks + `go vet` + `go test -race`;
2. `npm run build`, `npm test`, `npm run test:build`;
3. `npm run test:e2e` (20 сценариев, артефакты при падении);
4. сборка Docker-образов.

## Мониторинг

- `GET /live` — процесс жив.
- `GET /ready` — БД и upstream в норме.
- `GET /api/v1/health` — uptime, кэш, время синхронизаций.
- `GET /api/v1/incidents` — ошибки upstream.
- `GET /api/v1/sync/status` — статус фоновой синхронизации.
- Admin CLI: `./admin.sh status|sync|incidents|logs|restart`.
