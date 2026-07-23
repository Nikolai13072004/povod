# POVOD — Backend API

Серверная часть [POVOD](../README.md): платформенно-независимый REST API на **Express + TypeScript** с нормализованной **PostgreSQL**, собственной аутентификацией и отзываемыми серверными сессиями.

## Стек

- **Node.js + Express 4 + TypeScript** (запуск через `tsx`, без отдельного шага сборки)
- **Zod** — валидация конфигурации и входных данных
- **PostgreSQL** — нормализованное хранение с нумерованными миграциями; для локальной разработки доступны in-memory и JSON-адаптеры
- **CORS**, **morgan**, health/readiness-проверки
- **Docker** (non-root, healthcheck)

## Локальный запуск

```bash
cp env.example .env
npm ci
npm run dev        # http://localhost:8080, авто-перезапуск (tsx watch)
# либо
npm start          # без watch
npm run typecheck  # проверка типов (tsc --noEmit)
npm test           # unit- и API-тесты
```

Без заданного `DATABASE_URL` данные хранятся в `data/db.json` (или полностью in-memory при `PERSIST=false`). Запуск с PostgreSQL и всем стеком — через Docker Compose из [корневого README](../README.md).

## Конфигурация

Переменные окружения (см. [`env.example`](./env.example)) валидируются через Zod **до** запуска; небезопасная production-конфигурация (wildcard CORS, включённый демо-вход, VK-вход без секрета) останавливает старт с понятной ошибкой. Ключевые: `PORT`, `HOST`, `CORS_ORIGIN`, `PERSIST`, `DATABASE_URL`, `DEMO_AUTH_ENABLED`, `VK_APP_SECRET`.

## API

Базовый префикс — `/api` (пути в PascalCase, роутинг регистронезависим). Полный контракт и правила — в [`ARCHITECTURE.md`](./ARCHITECTURE.md).

- `/health`, `/api/ping` — служебные проверки
- `/api/Auth/register`, `/api/Auth/login`, `/api/Auth/session`, `/api/Auth/logout` — собственная учётная запись и жизненный цикл серверной сессии
- `/api/Auth/vk` — вход через launch-параметры VK
- `/api/Events`, `/api/Events/:id`, `/api/Events/author/:userId`, `/api/Events/participant/:userId` — события, создание и изменение, запись и отмена записи
- `/api/Users` — пользователи и друзья
- `/api/Comments` — комментарии к событиям

Автор события и комментария определяется сервером; приватные события и email пользователей не раскрываются посторонним. Время события хранится и отдаётся как ISO 8601 `startsAt` с IANA `timezone`.

## Проверки

Полная проверка monorepo — из корня репозитория: `npm run check`. Smoke-проверка контракта уже запущенного API:

```bash
API_URL=http://localhost:8080 npm run check:api
```

Авторизованная часть контракта включается переменными `CONTRACT_AUTH_EMAIL` и `CONTRACT_AUTH_PASSWORD`.

## Структура

```text
src/
├── index.ts, app.ts      # bootstrap, сборка Express и монтаж роутов
├── config.ts             # валидация конфигурации (Zod)
├── auth/                 # регистрация/вход, сессии, пароли, rate limit
├── db/                   # PostgreSQL-адаптер, миграции, работа с датами
├── repositories/         # слой доступа к данным (PostgreSQL / in-memory)
├── routes/               # HTTP-роутеры (auth, events, users, comments, health)
├── seed.ts, kudago.ts    # стартовые данные и импорт публичных событий из KudaGo
└── validation, middleware, presenters, types, vk, store
```

## Документация

Общие документы (идентичны в `frontend/` и `backend/`): [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`ROADMAP.md`](./ROADMAP.md), [`CHANGELOG.md`](./CHANGELOG.md), [`CONTRIBUTING.md`](./CONTRIBUTING.md), [`AGENTS.md`](./AGENTS.md). Пул задач для участников — [`docs/CONTRIBUTOR_BACKLOG.md`](../docs/CONTRIBUTOR_BACKLOG.md).
