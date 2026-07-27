# Backlog участника POVOD

Этот документ предназначен для участника, который работает над POVOD самостоятельно
в отдельных ветках и отправляет изменения в GitHub через Pull Request. Это подробный
пул задач, а не требование реализовать всё сразу.

## 1. Текущее состояние проекта

POVOD — самостоятельное web/PWA-приложение для поиска, создания и социального
планирования событий. Монорепозиторий содержит:

- `frontend/` — React, Vite, TypeScript, VKUI и MobX;
- `backend/` — Express, TypeScript, Zod и PostgreSQL;
- `compose.yaml` — PostgreSQL, backend и frontend;
- `scripts/check-api-contract.mjs` — smoke-проверка API;
- общие документы в `frontend/` и `backend/`.

Уже реализованы нормализованная PostgreSQL-модель, миграции, собственная
аутентификация, отзываемые сессии, права доступа, серверные «Мои события», ISO 8601
и timezone, единые async-состояния интерфейса, валидируемая конфигурация и локальный
Docker Compose.

Перед началом работы обязательно прочитайте:

1. корневой `AGENTS.md`;
2. `frontend/AGENTS.md` и `backend/AGENTS.md`;
3. `ARCHITECTURE.md`, `ROADMAP.md`, `CHANGELOG.md`, `CONTRIBUTING.md`;
4. описание выбранной задачи в этом документе.

## 2. Правила работы с Git

Нельзя отправлять изменения напрямую в `main`. Одна ветка должна решать одну
осмысленную задачу.

Рекомендуемый процесс:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/FE-001-responsive-layout

# работа и проверки
git status
git add <только файлы текущей задачи>
git commit -m "feat: improve responsive application layout"
git push -u origin feature/FE-001-responsive-layout
```

После push создайте Pull Request в `main`. В описании PR укажите:

- идентификатор задачи;
- что и зачем изменено;
- как проверить результат;
- какие команды выполнены;
- скриншоты для визуальных изменений;
- миграционные или security-риски;
- что сознательно не вошло в задачу.

Не объединяйте в одном PR рефакторинг, новую функцию, обновление зависимостей и
массовое форматирование. Если задача требует изменения API, схемы PostgreSQL,
аутентификации или общей архитектуры, сначала создайте небольшой proposal/ADR и
согласуйте направление с владельцем проекта.

## 3. Definition of Done

Задача считается готовой, когда:

- реализован основной сценарий и обработаны loading/error/empty состояния;
- нет секретов, временных файлов, debug-кода и случайных изменений;
- `npm run check` из корня проходит;
- при изменении API запущен `npm run check:api`;
- при изменении PostgreSQL добавлена новая миграция; старые миграции не редактируются;
- добавлены или обновлены релевантные тесты;
- обновлены оба `CHANGELOG.md`;
- общие документы в `frontend/` и `backend/` остались идентичными;
- визуальные изменения проверены минимум на ширинах 360, 768, 1280 и 1440 px;
- ветка актуальна относительно `main`, а PR не содержит конфликтов.

## 4. Приоритеты и режим согласования

| Метка | Значение |
| --- | --- |
| P0 | Базовое качество и портфолио; делать в первую очередь. |
| P1 | Важная продуктовая или техническая функция. |
| P2 | Улучшение после стабилизации основных сценариев. |
| READY | Можно брать самостоятельно. |
| DECISION | До реализации согласовать архитектуру или продуктовые правила. |
| RESEARCH | Сначала подготовить исследование без production-кода. |

## 5. Рекомендуемая первая очередь

Эти задачи дают максимальный эффект и слабо конфликтуют друг с другом:

| Порядок | Задача | Рекомендуемая ветка |
| --- | --- | --- |
| 1 | FE-001 — полноценный desktop/tablet layout | `feature/FE-001-responsive-layout` |
| 2 | PERF-001 — оптимизация тяжёлых изображений | `perf/PERF-001-optimize-images` |
| 3 | QA-001 — ESLint и Prettier | `chore/QA-001-lint-format` |
| 4 | QA-003 — frontend unit/component tests | `test/QA-003-frontend-tests` |
| 5 | QA-005 — Playwright E2E smoke | `test/QA-005-e2e-smoke` |
| 6 | OPS-001 — GitHub Actions | `ci/OPS-001-github-actions` |
| 7 | DOC-001 — очистка legacy README и metadata | `docs/DOC-001-cleanup-readmes` |
| 8 | ARCH-002 — OpenAPI и генерируемые типы | `feature/ARCH-002-openapi-contract` |
| 9 | FE-007 — редактирование и удаление события | `feature/FE-007-manage-events` |
| 10 | BE-003 — пагинация и серверные фильтры | `feature/BE-003-event-pagination` |

## 6. Архитектура

| ID | Приоритет | Режим | Задача и ожидаемый результат |
| --- | --- | --- | --- |
| ARCH-001 | P0 | READY | Описать текущие доменные границы и добавить ADR-шаблон. Зафиксировать решения по событиям, участию, идентичностям и интеграциям. |
| ARCH-002 | P0 | DECISION | Добавить OpenAPI 3.1 как единый контракт API, проверку схем и генерацию frontend-типов. Убрать ручное дублирование DTO. |
| ARCH-003 | P1 | DECISION | Ввести версионирование API (`/api/v1`) и план совместимого перехода со старых URL. |
| ARCH-004 | P1 | READY | Отделить HTTP routers от application/use-case слоя backend. Routers должны разбирать запрос и преобразовывать ответ, а не содержать бизнес-логику. |
| ARCH-005 | P1 | READY | Разделить доменные сущности, DTO и PostgreSQL rows. Убрать неявные преобразования между слоями. |
| ARCH-006 | P1 | DECISION | Спроектировать общий формат ошибок: стабильный `code`, локализуемый `message`, `details`, `requestId`. |
| ARCH-007 | P1 | READY | Добавить dependency injection для repository, clock, id generator и внешних adapters, чтобы тесты не зависели от глобального store. |
| ARCH-008 | P1 | DECISION | Определить стратегию кэширования и обновления frontend-данных: MobX request stores либо специализированный server-state слой. |
| ARCH-009 | P2 | READY | Добавить диаграммы контейнеров, ERD и последовательности входа/создания события в `docs/architecture/`. |
| ARCH-010 | P2 | DECISION | Подготовить границы будущего модульного монолита: auth, users, events, social graph, notifications, integrations. |

## 7. Backend и PostgreSQL

| ID | Приоритет | Режим | Задача и ожидаемый результат |
| --- | --- | --- | --- |
| BE-001 | P0 | READY | Добавить graceful shutdown: перестать принимать запросы, дождаться активных операций и закрыть HTTP server/PostgreSQL pool. |
| BE-002 | P0 | READY | Разделить liveness и readiness. Readiness должна реально проверять PostgreSQL и состояние миграций. |
| BE-003 | P0 | DECISION | Добавить cursor-based пагинацию, сортировку и серверные фильтры событий. Зафиксировать контракт в OpenAPI. |
| BE-004 | P1 | READY | Добавить транзакции для составных операций: удаление события, участие, дружба, связывание identity. |
| BE-005 | P1 | READY | Проверить индексы через `EXPLAIN ANALYZE`; добавить индексы для ленты, автора, участника, даты, категорий и комментариев. |
| BE-006 | P1 | DECISION | Добавить `endsAt`, правила временного интервала и корректную поддержку многодневных событий. |
| BE-007 | P1 | DECISION | Добавить лимит участников и атомарную запись без переполнения при конкурентных запросах. |
| BE-008 | P1 | DECISION | Реализовать приглашения в приватные события через одноразовые/ограниченные токены. Не раскрывать приватное событие без разрешения. |
| BE-009 | P1 | READY | Добавить редактирование и удаление комментариев с проверкой владельца и аудитом API-тестами. |
| BE-010 | P1 | READY | Добавить endpoint обновления собственного профиля и серверную валидацию имени, города, интересов и аватара. |
| BE-011 | P1 | DONE | Избранное реализовано таблицей `event_favorites` с первичным ключом по паре и идемпотентными endpoints (см. PROD-001). |
| BE-012 | P1 | READY | Добавить полнотекстовый поиск PostgreSQL по названию, описанию и месту; измерить производительность. |
| BE-013 | P2 | DECISION | Добавить soft delete и правила хранения для событий/пользователей, если это потребуется продукту. |
| BE-014 | P2 | READY | Добавить seed-профили для разных ролей и состояний без хранения production-секретов. |
| BE-015 | P2 | READY | Удалить устаревшие комментарии и имена, оставшиеся от хакатонной структуры (`VK_POVOD_Hackathon_2026`, `team-5`). |

## 8. Аутентификация и безопасность

| ID | Приоритет | Режим | Задача и ожидаемый результат |
| --- | --- | --- | --- |
| SEC-001 | P0 | DONE | Browser-сессия переведена в Secure HttpOnly SameSite cookie; CSRF-модель и план миграции — в [`docs/decisions/SEC-001-cookie-sessions.md`](./decisions/SEC-001-cookie-sessions.md). |
| SEC-002 | P0 | READY | Добавить `helmet`, Content Security Policy, `X-Content-Type-Options`, frame policy и безопасные production headers. |
| SEC-003 | P0 | READY | Ввести централизованный redaction секретов и персональных данных в логах. Токены, пароли и подписи не должны логироваться. |
| SEC-004 | P1 | DECISION | Перенести rate limit из памяти в общий store (например Redis) для нескольких backend-инстансов. |
| SEC-005 | P1 | READY | Добавить ограничения размера/типа изображения и проверку фактического MIME, а не только client-side значения. |
| SEC-006 | P1 | READY | Добавить тесты horizontal privilege escalation для всех endpoints с `userId`, `eventId` и `commentId`. |
| SEC-007 | P1 | READY | Добавить регулярную очистку истёкших/отозванных сессий и индекс для этой операции. |
| SEC-008 | P1 | DECISION | Спроектировать подтверждение email и безопасное восстановление пароля с одноразовыми короткоживущими токенами. |
| SEC-009 | P2 | READY | Добавить audit log значимых действий: вход, смена identity, изменение приватности, удаление события. |
| SEC-010 | P2 | RESEARCH | Провести dependency/security audit и оформить правила реакции на уязвимости без автоматического опасного обновления major-версий. |

## 9. Frontend и состояние приложения

| ID | Приоритет | Режим | Задача и ожидаемый результат |
| --- | --- | --- | --- |
| FE-001 | P0 | READY | Переработать адаптивный layout. На desktop контент сейчас слишком узкий и прижат к левому краю. Нужны центрированный контейнер, сетка карточек и разумная максимальная ширина. |
| FE-002 | P0 | READY | Перевести основные маршруты на lazy loading и добавить route-level fallback; уменьшить initial bundle. |
| FE-003 | P0 | READY | Добавить React Error Boundary для ошибок рендера и понятный экран восстановления. |
| FE-004 | P0 | READY | Заменить оставшиеся `alert()` на общий snackbar/toast и inline-ошибки. |
| FE-005 | P1 | READY | Вынести повторяющиеся фильтры ленты и «Моих событий» в общий типизированный модуль без `any`. |
| FE-006 | P1 | DONE | Поиск и фильтры ленты синхронизированы с query params; добавлена кнопка «Поделиться подборкой», состояние восстанавливается после reload. Фильтры «Моих событий» пока не в URL: раздел приватный и ссылка на него бесполезна другому пользователю. |
| FE-007 | P1 | READY | Добавить UI редактирования и удаления собственного события с подтверждением и корректным обновлением store. |
| FE-008 | P1 | READY | Добавить отдельные вкладки «Созданные» и «Посещаю» в «Моих событиях», счётчики и сортировку. |
| FE-009 | P1 | READY | Реализовать profile editing на серверных данных; убрать расхождения между локальным и backend-профилем. |
| FE-010 | P1 | READY | Добавить image fallback, aspect ratio, lazy loading и понятный placeholder для событий без изображения. |
| FE-011 | P1 | READY | Сделать optimistic UI только там, где есть rollback; остальные операции должны явно показывать прогресс и результат. |
| FE-012 | P1 | READY | Убрать `any` из EventMap и Filters, добавить типы Leaflet и типизированные props всех модальных фильтров. |
| FE-013 | P1 | DECISION | Определить модель форм: единая валидация, touched/errors, server errors и защита от потери несохранённых данных. |
| FE-014 | P2 | READY | Нормализовать имена маршрутов (`/profile`, `/interests`, `/events/:id`) и добавить совместимые redirects. |
| FE-015 | P2 | READY | Добавить skeleton states для ленты и карточки события вместо одного spinner там, где это улучшает perceived performance. |
| FE-016 | P2 | READY | Удалить или изолировать `ComponentShowcase`, mock-события и неиспользуемые Vite/React assets из production bundle. |

## 10. UX, дизайн и доступность

| ID | Приоритет | Режим | Задача и ожидаемый результат |
| --- | --- | --- | --- |
| UX-001 | P0 | DECISION | Сформировать компактную дизайн-систему: цвета, типографика, spacing, radius, shadows, breakpoints и состояния controls. |
| UX-002 | P0 | READY | Привести карточки ленты и «Моих событий» к одному визуальному языку и одинаковой информационной иерархии. |
| UX-003 | P0 | READY | Проверить keyboard navigation, focus ring, tab order и управление модалками без мыши. |
| UX-004 | P0 | READY | Добавить корректные labels, ARIA, `aria-live`, alt-тексты и контраст уровня WCAG AA. |
| UX-005 | P1 | READY | Улучшить форму создания: пошаговая структура, ошибки рядом с полями, объяснение public/private, preview перед отправкой. |
| UX-006 | P1 | READY | Добавить состояние повреждённого/недоступного изображения без схлопывания карточки. |
| UX-007 | P1 | READY | Спроектировать desktop navigation: верхняя панель или sidebar вместо растянутой мобильной нижней навигации. |
| UX-008 | P1 | READY | Добавить нормальные hover/pressed/disabled/loading/success состояния интерактивных элементов. |
| UX-009 | P1 | DECISION | Пересмотреть onboarding: вход → интересы → город → лента; разрешить пропуск необязательных шагов. |
| UX-010 | P1 | READY | Улучшить empty states действиями: создать событие, открыть ленту, сбросить фильтры. |
| UX-011 | P2 | READY | Проверить светлую/тёмную тему и убрать жёстко заданные белые/чёрные цвета из компонентов. |
| UX-012 | P2 | READY | Добавить ненавязчивые transitions с поддержкой `prefers-reduced-motion`. |
| UX-013 | P2 | READY | Подготовить единый набор SVG-иконок/иллюстраций без тяжёлых растровых декоративных файлов. |

## 11. Тестирование и качество кода

| ID | Приоритет | Режим | Задача и ожидаемый результат |
| --- | --- | --- | --- |
| QA-001 | P0 | READY | Настроить ESLint и Prettier для root/frontend/backend; добавить `lint` и `format:check` в корневой `npm run check`. |
| QA-002 | P0 | READY | Включить более строгие TypeScript rules поэтапно: noUncheckedIndexedAccess, exactOptionalPropertyTypes и запрет неявного `any`. |
| QA-003 | P0 | READY | Добавить Vitest + React Testing Library и тесты AsyncContent, login, event cards, filters и create form. |
| QA-004 | P0 | READY | Добавить unit-тесты frontend date/time utilities, включая DST, несуществующее локальное время и разные timezone. |
| QA-005 | P0 | READY | Добавить Playwright E2E: вход, лента, поиск, deep link, «Мои события», создание и отмена участия. |
| QA-006 | P0 | READY | Сделать изолированную тестовую PostgreSQL БД/контейнер и integration tests всех миграций с нуля. |
| QA-007 | P1 | READY | Добавить contract tests для ошибок, pagination, permissions и приватных событий. |
| QA-008 | P1 | READY | Добавить regression test для обычного web-входа без зависания на VK Bridge. |
| QA-009 | P1 | READY | Добавить тест конкурентной записи при лимите участников и идемпотентности mutations. |
| QA-010 | P1 | READY | Добавить coverage reports и разумные thresholds для критичных модулей, не гоняясь за 100%. |
| QA-011 | P2 | READY | Добавить visual regression для ключевых ширин и основных экранов. |
| QA-012 | P2 | READY | Настроить проверку dead code, неиспользуемых exports и циклических зависимостей. |

## 12. Производительность

| ID | Приоритет | Режим | Задача и ожидаемый результат |
| --- | --- | --- | --- |
| PERF-001 | P0 | READY | Сжать и конвертировать изображения в WebP/AVIF. Сейчас `volleyball.png` около 16.9 MB, `karaoke.png` около 4 MB, `1.png` около 3.7 MB. |
| PERF-002 | P0 | READY | Уменьшить initial JS chunk (сейчас больше 500 KB): lazy routes, vendor chunks и удаление неиспользуемого кода. |
| PERF-003 | P1 | READY | Добавить responsive `srcset`/`sizes`, фиксированные размеры и lazy decoding изображений. |
| PERF-004 | P1 | READY | Добавить HTTP cache headers для immutable frontend assets и корректный no-cache для `index.html`. |
| PERF-005 | P1 | READY | Измерить Core Web Vitals и Lighthouse; приложить baseline и результат улучшений к PR. |
| PERF-006 | P2 | READY | Добавить виртуализацию или incremental rendering после появления больших списков событий. |
| PERF-007 | P2 | READY | Добавить backend response compression только после измерения и с корректными proxy-настройками. |

## 13. CI/CD, эксплуатация и production

| ID | Приоритет | Режим | Задача и ожидаемый результат |
| --- | --- | --- | --- |
| OPS-001 | P0 | READY | Создать GitHub Actions для `npm ci`, `npm run check`, Docker build и contract tests с PostgreSQL service. |
| OPS-002 | P0 | READY | Добавить branch protection для `main`: PR, успешные checks и запрет force push. Настраивается владельцем репозитория. |
| OPS-003 | P0 | READY | Добавить Pull Request template и issue templates для bug/feature/architecture proposal. |
| OPS-004 | P1 | DECISION | Выбрать production hosting frontend/backend/PostgreSQL и описать архитектуру deploy без привязки домена к одной платформе. |
| OPS-005 | P1 | READY | Добавить production Compose/manifest с явными secrets, healthchecks, restart policy и resource limits. |
| OPS-006 | P1 | READY | Автоматизировать применение миграций как отдельный release step с блокировкой и понятным rollback-планом. |
| OPS-007 | P1 | DECISION | Настроить резервные копии PostgreSQL, retention и периодическую проверку восстановления. |
| OPS-008 | P1 | READY | Добавить structured JSON logs, request ID и correlation между frontend error и backend request. |
| OPS-009 | P1 | DECISION | Подключить error monitoring и базовые метрики: latency, error rate, DB pool, auth failures. |
| OPS-010 | P1 | READY | Добавить Dependabot с ограниченной частотой и отдельными PR, без автоматического merge major-обновлений. |
| OPS-011 | P2 | READY | Добавить staging environment и smoke-проверку после deploy до продвижения production. |
| OPS-012 | P2 | READY | Настроить release tags, semver и автоматический changelog только после определения процесса релизов. |

## 14. Продуктовые функции

| ID | Приоритет | Режим | Задача и ожидаемый результат |
| --- | --- | --- | --- |
| PROD-001 | P1 | DONE | Избранное: таблица связи (миграция 008), идемпотентные endpoints, сердечко в ленте и карточке события, вкладка «Избранное» в «Моих событиях». |
| PROD-002 | P1 | DECISION | Приглашения в приватное событие и управление списком приглашённых. |
| PROD-003 | P1 | DONE | Уведомления о новом участнике, комментарии к своему событию, переносе времени/места и отмене. Приглашения появятся вместе с BE-008. |
| PROD-004 | P1 | DECISION | Система рекомендаций по интересам, городу, друзьям и истории участия с объяснимыми причинами. |
| PROD-005 | P1 | READY | Просмотр публичного профиля автора и его открытых событий без раскрытия email. |
| PROD-006 | P1 | DECISION | Жалобы и модерация пользовательских событий/комментариев. |
| PROD-007 | P2 | DECISION | Повторяющиеся события и правила изменения одного экземпляра/серии. |
| PROD-008 | P2 | DECISION | Лист ожидания при заполненном лимите участников. |
| PROD-009 | P2 | RESEARCH | Чат события: сначала определить необходимость real-time, retention, moderation и push-модель. |
| PROD-010 | P2 | READY | Экспорт события в календарь через `.ics` и web share без платформенной зависимости. |

## 15. Файлы, карты и геоданные

| ID | Приоритет | Режим | Задача и ожидаемый результат |
| --- | --- | --- | --- |
| MEDIA-001 | P1 | DECISION | Перейти с base64 в JSON на object storage с presigned upload, лимитами и удалением неиспользуемых объектов. |
| MEDIA-002 | P1 | READY | Генерировать thumbnails и несколько размеров, удалять EXIF/геоданные, проверять MIME и dimensions. |
| MAP-001 | P1 | DECISION | Выбрать geocoding provider с допустимыми условиями использования, quota и privacy policy. |
| MAP-002 | P1 | READY | Хранить структурированное место: display name, coordinates, provider ID; не смешивать адрес и ссылку. |
| MAP-003 | P2 | READY | Добавить fallback без карты, если внешний script/provider недоступен. |

## 16. Платформенные адаптеры

| ID | Приоритет | Режим | Задача и ожидаемый результат |
| --- | --- | --- | --- |
| INT-001 | P1 | DECISION | Определить TypeScript-контракт platform adapter: identity, capabilities, share, deep link, notifications. |
| INT-002 | P1 | READY | Вынести VK Bridge из страниц в VK adapter и запретить прямые platform imports в доменных компонентах. |
| INT-003 | P1 | READY | Добавить строгую проверку VK launch params, timestamp/replay policy и integration tests. |
| INT-004 | P1 | RESEARCH | Исследовать официальные возможности Telegram Web Apps/Login/ботов; оформить поддерживаемые сценарии и ограничения. |
| INT-005 | P1 | RESEARCH | Исследовать официальный MAX API; не реализовывать предположительные endpoints. |
| INT-006 | P2 | DECISION | Добавить UI связывания/отвязывания внешних identities с повторной аутентификацией. |
| INT-007 | P2 | READY | Реализовать platform-independent Web Share/clipboard adapter как browser fallback. |

## 17. PWA и offline

| ID | Приоритет | Режим | Задача и ожидаемый результат |
| --- | --- | --- | --- |
| PWA-001 | P1 | DONE | Добавлены web manifest, иконки (включая `maskable` и `apple-touch-icon`), theme colors из токенов и тесты требований установимости. |
| PWA-002 | P1 | DECISION | Определить offline-стратегию: shell и read-only cache публичных событий без кэширования приватных данных. |
| PWA-003 | P1 | READY | Добавить безопасный service worker update flow и уведомление о новой версии. |
| PWA-004 | P2 | DECISION | Исследовать Web Push: согласие, подписки, VAPID, отзыв и platform limitations. |

## 18. Документация и GitHub-портфолио

| ID | Приоритет | Режим | Задача и ожидаемый результат |
| --- | --- | --- | --- |
| DOC-001 | P0 | READY | Переписать `frontend/README.md` и `backend/README.md`, удалить GitLab/hackathon/team-5 ссылки и исправить package name/description вместе с lock-файлами. |
| DOC-002 | P0 | READY | Улучшить корневой README: скриншоты, архитектура, возможности, demo flow, команды, env и roadmap. |
| DOC-003 | P0 | READY | Добавить актуальные screenshots для desktop/mobile и короткое GIF/video demo без персональных данных. |
| DOC-004 | P1 | READY | Добавить ERD PostgreSQL и схему основных HTTP flows. |
| DOC-005 | P1 | READY | Публиковать интерактивную OpenAPI документацию после ARCH-002. |
| DOC-006 | P1 | DECISION | Выбрать лицензию перед переводом репозитория в public; проверить права на изображения и внешние assets. |
| DOC-007 | P1 | READY | Добавить `SECURITY.md`, правила сообщения об уязвимостях и supported versions. |
| DOC-008 | P1 | READY | Добавить `CODE_OF_CONDUCT.md`, issue labels и project board при росте числа участников. |
| DOC-009 | P2 | READY | Добавить troubleshooting для Docker Desktop, WSL2, портов, PostgreSQL volume и env validation. |

## 19. Как выбирать следующую задачу

1. Выберите одну задачу со статусом `READY`, желательно из первой очереди.
2. Проверьте зависимости: не начинайте frontend для API, которого ещё нет.
3. Напишите владельцу проекта идентификатор задачи и имя будущей ветки.
4. Для `DECISION` сначала создайте issue или маленький docs-only PR с вариантами,
   trade-offs и рекомендацией.
5. После merge удалите рабочую ветку в GitHub и синхронизируйте локальную `main`.

Если во время работы обнаружена новая проблема, не расширяйте PR незаметно. Добавьте
её отдельным пунктом в backlog/issue или согласуйте изменение scope с владельцем.
