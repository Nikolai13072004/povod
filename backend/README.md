# POVOD — Backend API

Бэкенд для VK Mini App **«ПОВОД»** (хакатон, команда team-5, май 2026).
Реализует REST API, который уже ожидает фронтенд в
[`VK_POVOD_Hackathon_2026/src/services/api.ts`](../VK_POVOD_Hackathon_2026/src/services/api.ts):
события (поводы), пользователи, друзья, комментарии, health-проверки.

## Стек

- **Node.js 20 + Express 4 + TypeScript** (запуск через `tsx`, без шага сборки)
- **Zod** — валидация входных данных
- Хранилище — **in-memory + снапшот в `data/db.json`** (слой изолирован в `src/store.ts`,
  замена на Postgres/Prisma затрагивает только его)
- **CORS**, **morgan** (логи), health/ping под `rootStore` фронтенда
- **Docker** (non-root, healthcheck) + `env.example` + GitLab CI

## Запуск локально

```bash
npm install
npm run dev      # http://localhost:8080, авто-перезапуск (tsx watch)
# или
npm start        # без watch
npm run typecheck  # проверка типов (tsc --noEmit)
```

Сервер сидится тестовыми данными из макетов фронта (волейбол / караоке / пикник).

## Эндпоинты

Базовый префикс ресурсов — `/api`. Пути в PascalCase, как у фронта (роутинг регистронезависим).

### Health
| Метод | Путь | Ответ |
|------|------|-------|
| GET | `/health` | `{ service, status, database_enabled, timestamp }` |
| GET | `/api/ping` | `{ message: "pong", ... }` |
| GET | `/api/db/time` | `{ time, now }` |

### Events (поводы)
| Метод | Путь | Описание |
|------|------|----------|
| GET | `/api/Events` | список (фильтры: `?search=&category=&date=&author=`) |
| GET | `/api/Events/active` | ещё не прошедшие |
| GET | `/api/Events/upcoming` | будущие, по возрастанию даты |
| GET | `/api/Events/author/:authorId` | события автора |
| GET | `/api/Events/:id` | один повод |
| POST | `/api/Events` | создать |
| PUT | `/api/Events/:id` | обновить |
| DELETE | `/api/Events/:id` | удалить (+ его комментарии) |
| POST | `/api/Events/:id/join` | присоединиться (`{ userId? }`) |
| POST | `/api/Events/:id/leave` | выйти (`{ userId? }`) |

### Users
| Метод | Путь | Описание |
|------|------|----------|
| GET | `/api/Users` | список |
| GET | `/api/Users/:id` | пользователь |
| DELETE | `/api/Users/:id` | удалить |
| GET | `/api/Users/:id/friends` | друзья |
| POST | `/api/Users/:id/friends` | добавить друга (`{ friendId }`) |
| DELETE | `/api/Users/:id/friends/:friendId` | убрать друга |

### Comments
| Метод | Путь | Описание |
|------|------|----------|
| GET | `/api/Comments/event/:eventId` | комментарии события |
| POST | `/api/Comments` | создать (`{ text, eventId, author? }`) |
| DELETE | `/api/Comments/:id` | удалить |

## Подключение фронтенда

Фронт берёт базовый URL из `VITE_API_URL` и **дописывает endpoint без ведущего слеша**
(`${VITE_API_URL}api/Events`), поэтому база должна оканчиваться слешем:

```env
# .env фронтенда (VK_POVOD_Hackathon_2026)
VITE_API_URL=http://localhost:8080/
```

> Сейчас страницы фронта работают на локальных моках (`INITIAL_EVENTS`, закомментированный
> `loadBackendStatus`). Чтобы они реально ходили в это API, нужно мелко доработать
> `services/api.ts` / сторы / страницы — готов сделать отдельным шагом.

## Конфигурация

См. [`env.example`](./env.example): `PORT`, `HOST`, `CORS_ORIGIN`, `PERSIST`, `SERVICE_NAME`.

## Docker

```bash
docker build -t povod-backend .
docker run -p 8080:8080 povod-backend   # PERSIST=false, stateless
```

## Структура

```text
src/
├── index.ts          # bootstrap + listen
├── app.ts            # сборка Express, middleware, монтаж роутов
├── config.ts         # конфиг из ENV
├── types.ts          # модели Event / User / Comment
├── store.ts          # in-memory хранилище + персист в data/db.json
├── seed.ts           # стартовые данные
├── validation.ts     # Zod-схемы
├── middleware.ts     # asyncHandler, HttpError, errorHandler, notFound
└── routes/
    ├── health.ts
    ├── events.ts
    ├── users.ts
    └── comments.ts
```
