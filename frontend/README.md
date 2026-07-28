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

E2E-проверки на настоящем стеке (Playwright сам поднимает backend и frontend, база не нужна):

```bash
npm run test:e2e
```

Если загрузка браузера закрыта сетью, можно взять уже установленный: `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e`.

Собрать и локально посмотреть production-версию:

```bash
npm run build
npm run preview
```

## Установка как приложения

Приложение объявляет [web manifest](./public/manifest.webmanifest): имя, режим `standalone`, цвета из токенов оформления, ярлыки «Создать повод» и «Мои события», а также иконки для Android, iOS и рабочего стола.

Иконки не лежат в репозитории готовым бинарником — они собираются из описания фигур, поэтому цвет и размеры можно изменить в одном месте:

```bash
npm run icons      # пересобирает public/icons/*.png из scripts/generate-icons.mjs
```

Требования установимости (обязательные поля, размеры `192`/`512`, наличие `maskable`, совпадение объявленных и фактических размеров PNG, разбираемость SVG) проверяются тестом `src/pwa/manifest.test.ts`. Офлайн-режим и service worker — отдельные задачи PWA-002 и PWA-003.

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
