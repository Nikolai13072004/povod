# POVOD — Frontend

Клиентская часть [POVOD](../README.md) — самостоятельного web/PWA-приложения для поиска, создания и социального планирования событий. Ядро платформенно-независимо; социальные платформы (VK и др.) подключаются через отдельные адаптеры.

## Стек

- **React 18 + TypeScript**, сборка **Vite**
- **VKUI** — библиотека UI-компонентов
- **MobX** — управление состоянием
- **React Router** — навигация и защита маршрутов
- **Emotion** (`@emotion/styled`) — стили

## Локальный запуск

```bash
cp env.example .env.local   # при необходимости поправьте VITE_API_URL
npm ci
npm run dev                 # http://localhost:5173
```

По умолчанию фронтенд обращается к API на `http://localhost:8080/`. Запуск всего стека (frontend + backend + PostgreSQL) одной командой описан в [корневом README](../README.md).

## Проверки

Полная проверка monorepo запускается из корня репозитория:

```bash
npm run check      # backend typecheck + тесты, затем production-сборка frontend
```

Собрать и локально посмотреть production-версию:

```bash
npm run build
npm run preview
```

## Конфигурация сборки

Frontend читает только типизированные build-time переменные `VITE_*` (см. [`env.example`](./env.example)); значение `VITE_API_URL` вшивается в бандл на этапе `npm run build`, поэтому смена URL требует пересборки.

## Структура

```text
src/
├── main.tsx              # точка входа: провайдеры темы и роутера
├── App.tsx               # оболочка приложения (layout, шапка, навигация)
├── app/                  # роутер и защита маршрутов (RequireAuth)
├── pages/                # экраны: лента, событие, создание, «Мои события», профиль, вход, интересы, чат
├── components/           # переиспользуемые компоненты (Layout, Header, NavMenu, Filters, AsyncContent, Modal…)
├── stores/               # MobX-сторы (события, сессия)
├── services/             # API-клиент
├── context/, styles/     # темы и глобальные стили
└── utils/                # утилиты (даты, валидация)
```

## Документация

Общие документы дублируются в `frontend/` и `backend/` и должны оставаться идентичными:

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — архитектура и ограничения
- [`ROADMAP.md`](./ROADMAP.md) — план развития
- [`CHANGELOG.md`](./CHANGELOG.md) — история изменений
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — правила совместной работы
- [`AGENTS.md`](./AGENTS.md) — инструкции для участников и AI-агентов

Пул самостоятельных задач для участников — [`docs/CONTRIBUTOR_BACKLOG.md`](../docs/CONTRIBUTOR_BACKLOG.md).
