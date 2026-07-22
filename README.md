# POVOD

POVOD — full-stack сервис поиска, создания и социального планирования локальных событий. Проект вырос из VK Mini App и развивается как самостоятельный pet-проект.

## Возможности MVP

- лента, поиск и фильтрация событий;
- создание события, запись и отмена записи;
- комментарии, профиль и интересы пользователя;
- VK Bridge и вход через launch-параметры VK;
- импорт публичных концертов и фестивалей из KudaGo;
- карта события на OpenStreetMap.

## Структура

```text
frontend/  React + Vite + TypeScript + VKUI + MobX
backend/   Express + TypeScript + Zod + PostgreSQL / JSON storage
```

## Быстрый локальный запуск

В двух отдельных терминалах:

```bash
cd backend
npm ci
npm run dev
```

```bash
cd frontend
npm ci
# Создайте frontend/.env.local с VITE_API_URL=http://localhost:8080/
npm run dev
```

Backend доступен на `http://localhost:8080`, frontend — на `http://localhost:5173`.

## Документация

Общие документы намеренно дублируются в `frontend/` и `backend/`, чтобы обе части приложения можно было развивать независимо:

- `CHANGELOG.md` — история изменений;
- `ARCHITECTURE.md` — текущая архитектура и ограничения;
- `ROADMAP.md` — план развития;
- `CONTRIBUTING.md` — правила совместной работы;
- `AGENTS.md` — инструкции для AI-агентов и участников.

## Статус

MVP собирается и проходит базовую проверку типов. Ближайшие задачи — единый локальный запуск, нормализованная PostgreSQL-модель, серверная авторизация и завершение сценария «Мои события».
