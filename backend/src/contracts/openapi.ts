import { z } from "zod";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import {
  authSessionSchema,
  commentSchema,
  dialogListSchema,
  directMessageSchema,
  errorSchema,
  eventChatPageSchema,
  eventMessageSchema,
  eventPageSchema,
  eventSchema,
  friendRequestsSchema,
  friendshipStatusSchema,
  invitationSchema,
  issuedInvitationSchema,
  messageThreadSchema,
  myEventsSchema,
  notificationFeedSchema,
  unreadCountSchema,
  userSchema,
} from "./schemas.js";
import {
  commentCreateSchema,
  commentUpdateSchema,
  eventCreateSchema,
  eventMessageCreateSchema,
  eventUpdateSchema,
  friendAddSchema,
  invitationCreateSchema,
  loginSchema,
  markNotificationsSchema,
  messageCreateSchema,
  messageUpdateSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  profileUpdateSchema,
  registerSchema,
} from "../validation.js";
import { MAX_DIALOGS } from "../directMessages.js";

/**
 * Сборка OpenAPI 3.1 из тех же схем, по которым работает сервер (ARCH-002).
 *
 * Документ не пишется руками: и запросы, и ответы описаны Zod-схемами, которые
 * реально исполняются. Спецификация, написанная отдельно, неизбежно расходится
 * с кодом — и тем опаснее, чем больше ей доверяют.
 */

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const bearer = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "Резерв для клиентов без кук (VK Mini App, мобильные, тесты).",
});

const sessionCookie = registry.registerComponent("securitySchemes", "sessionCookie", {
  type: "apiKey",
  in: "cookie",
  name: "povod_session",
  description:
    "Основной способ для браузера (SEC-001). Изменяющие запросы дополнительно " +
    "требуют заголовок X-CSRF-Token со значением куки povod_csrf.",
});

const security = [{ [sessionCookie.name]: [] }, { [bearer.name]: [] }];

const json = <T extends z.ZodTypeAny>(schema: T) => ({
  content: { "application/json": { schema } },
});

const errors = {
  400: { description: "Некорректный запрос", ...json(errorSchema) },
  401: { description: "Нужна сессия", ...json(errorSchema) },
  403: { description: "Недостаточно прав или не пройдена проверка CSRF", ...json(errorSchema) },
  404: { description: "Не найдено", ...json(errorSchema) },
};

// --- аутентификация ----------------------------------------------------------

registry.registerPath({
  method: "post",
  path: "/api/Auth/register",
  tags: ["Auth"],
  summary: "Регистрация",
  description: "Ставит HttpOnly-куку сессии и возвращает токен для клиентов без кук.",
  request: { body: json(registerSchema) },
  responses: {
    201: { description: "Пользователь создан", ...json(authSessionSchema) },
    409: { description: "Email уже занят", ...json(errorSchema) },
    400: errors[400],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/Auth/login",
  tags: ["Auth"],
  summary: "Вход",
  request: { body: json(loginSchema) },
  responses: {
    200: { description: "Сессия выдана", ...json(authSessionSchema) },
    401: { description: "Неверные учётные данные", ...json(errorSchema) },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/Auth/session",
  tags: ["Auth"],
  summary: "Текущая сессия",
  security,
  responses: {
    200: {
      description: "Пользователь текущей сессии",
      ...json(z.object({ user: userSchema })),
    },
    401: errors[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/Auth/logout",
  tags: ["Auth"],
  summary: "Выход",
  description: "Отзывает сессию на сервере и сбрасывает куки.",
  security,
  responses: { 204: { description: "Сессия отозвана" }, 401: errors[401] },
});

registry.registerPath({
  method: "post",
  path: "/api/Auth/password-reset",
  tags: ["Auth"],
  summary: "Запросить ссылку восстановления пароля",
  description:
    "Ответ одинаков независимо от того, есть такой адрес или нет: иначе форма " +
    "превращается в способ выяснить, зарегистрирован ли человек (SEC-008).",
  request: { body: json(passwordResetRequestSchema) },
  responses: {
    204: { description: "Запрос принят" },
    400: errors[400],
    429: { description: "Слишком часто", ...json(errorSchema) },
    503: { description: "Восстановление отключено", ...json(errorSchema) },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/Auth/password-reset/confirm",
  tags: ["Auth"],
  summary: "Сменить пароль по ссылке",
  description: "Токен одноразовый и живёт час. Успешная смена отзывает все сессии пользователя.",
  request: { body: json(passwordResetConfirmSchema) },
  responses: {
    204: { description: "Пароль изменён, сессии отозваны" },
    400: { description: "Ссылка недействительна или уже использована", ...json(errorSchema) },
  },
});

// --- события -----------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/Events",
  tags: ["Events"],
  summary: "Лента событий",
  description:
    "Отдаётся страницами по курсору (BE-003). Для авторизованного пользователя " +
    "события, совпадающие с его интересами, идут первыми.",
  request: {
    query: z.object({
      search: z.string().optional().openapi({ description: "Полнотекстовый поиск (BE-012)" }),
      category: z.string().optional(),
      author: z.string().optional(),
      startsFrom: z.string().datetime({ offset: true }).optional(),
      startsTo: z.string().datetime({ offset: true }).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
      cursor: z
        .string()
        .optional()
        .openapi({ description: "Непрозрачный курсор предыдущей страницы" }),
    }),
  },
  responses: { 200: { description: "Страница ленты", ...json(eventPageSchema) } },
});

registry.registerPath({
  method: "get",
  path: "/api/Events/mine",
  tags: ["Events"],
  summary: "Мои события",
  security,
  responses: {
    200: { description: "Созданные и посещаемые", ...json(myEventsSchema) },
    401: errors[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/Events/favorites",
  tags: ["Events"],
  summary: "Избранные события",
  security,
  responses: {
    200: { description: "Избранное текущего пользователя", ...json(z.array(eventSchema)) },
    401: errors[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/Events/{id}",
  tags: ["Events"],
  summary: "Событие",
  description:
    "Закрытое чужое событие отвечает 404, а не 403 — чтобы не подтверждать его существования. " +
    "Параметр invite открывает ровно то событие, для которого выдан (BE-008).",
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ invite: z.string().optional() }),
  },
  responses: { 200: { description: "Событие", ...json(eventSchema) }, 404: errors[404] },
});

registry.registerPath({
  method: "post",
  path: "/api/Events",
  tags: ["Events"],
  summary: "Создать событие",
  security,
  request: { body: json(eventCreateSchema) },
  responses: {
    201: { description: "Событие создано", ...json(eventSchema) },
    400: errors[400],
    401: errors[401],
  },
});

registry.registerPath({
  method: "put",
  path: "/api/Events/{id}",
  tags: ["Events"],
  summary: "Изменить событие",
  security,
  request: { params: z.object({ id: z.string() }), body: json(eventUpdateSchema) },
  responses: {
    200: { description: "Событие обновлено", ...json(eventSchema) },
    400: errors[400],
    403: errors[403],
    404: errors[404],
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/Events/{id}",
  tags: ["Events"],
  summary: "Удалить событие",
  security,
  request: { params: z.object({ id: z.string() }) },
  responses: { 204: { description: "Удалено" }, 403: errors[403], 404: errors[404] },
});

registry.registerPath({
  method: "post",
  path: "/api/Events/{id}/join",
  tags: ["Events"],
  summary: "Записаться на событие",
  description: "Повторный вызов идемпотентен. 409 — свободных мест не осталось (BE-007).",
  security,
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ invite: z.string().optional() }),
  },
  responses: {
    200: { description: "Запись подтверждена", ...json(eventSchema) },
    403: errors[403],
    404: errors[404],
    409: { description: "Мест не осталось", ...json(errorSchema) },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/Events/{id}/leave",
  tags: ["Events"],
  summary: "Отменить запись",
  security,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "Запись отменена", ...json(eventSchema) }, 404: errors[404] },
});

for (const method of ["post", "delete"] as const) {
  registry.registerPath({
    method,
    path: "/api/Events/{id}/favorite",
    tags: ["Events"],
    summary: method === "post" ? "Добавить в избранное" : "Убрать из избранного",
    description: "Идемпотентно: повторный вызов возвращает тот же 204 (PROD-001).",
    security,
    request: { params: z.object({ id: z.string() }) },
    responses: { 204: { description: "Готово" }, 401: errors[401], 404: errors[404] },
  });
}

// --- приглашения -------------------------------------------------------------

registry.registerPath({
  method: "post",
  path: "/api/Events/{id}/invitations",
  tags: ["Invitations"],
  summary: "Выдать приглашение",
  description: "Секрет виден только в этом ответе: в базе хранится его SHA-256.",
  security,
  request: { params: z.object({ id: z.string() }), body: json(invitationCreateSchema) },
  responses: {
    201: { description: "Приглашение создано", ...json(issuedInvitationSchema) },
    403: errors[403],
    404: errors[404],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/Events/{id}/invitations",
  tags: ["Invitations"],
  summary: "Приглашения события",
  security,
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Список без секретов", ...json(z.array(invitationSchema)) },
    403: errors[403],
    404: errors[404],
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/Events/{id}/invitations/{invitationId}",
  tags: ["Invitations"],
  summary: "Отозвать приглашение",
  security,
  request: { params: z.object({ id: z.string(), invitationId: z.string() }) },
  responses: { 204: { description: "Отозвано" }, 403: errors[403], 404: errors[404] },
});

// --- комментарии -------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/Comments/event/{eventId}",
  tags: ["Comments"],
  summary: "Комментарии события",
  request: { params: z.object({ eventId: z.string() }) },
  responses: {
    200: { description: "Комментарии", ...json(z.array(commentSchema)) },
    404: errors[404],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/Comments",
  tags: ["Comments"],
  summary: "Оставить комментарий",
  security,
  request: { body: json(commentCreateSchema) },
  responses: {
    201: { description: "Комментарий создан", ...json(commentSchema) },
    403: errors[403],
    404: errors[404],
  },
});

registry.registerPath({
  method: "put",
  path: "/api/Comments/{id}",
  tags: ["Comments"],
  summary: "Изменить свой комментарий",
  description:
    "Только автор комментария: автор события может его удалить, но не переписать — " +
    "подменять чужие слова, оставляя чужое имя, нельзя (BE-009).",
  security,
  request: { params: z.object({ id: z.string() }), body: json(commentUpdateSchema) },
  responses: {
    200: { description: "Комментарий изменён", ...json(commentSchema) },
    400: errors[400],
    403: errors[403],
    404: errors[404],
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/Comments/{id}",
  tags: ["Comments"],
  summary: "Удалить комментарий",
  description: "Доступно автору комментария и автору события.",
  security,
  request: { params: z.object({ id: z.string() }) },
  responses: { 204: { description: "Удалён" }, 403: errors[403], 404: errors[404] },
});

// --- уведомления -------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/Notifications",
  tags: ["Notifications"],
  summary: "Лента уведомлений",
  security,
  responses: {
    200: { description: "Уведомления и число непрочитанных", ...json(notificationFeedSchema) },
    401: errors[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/Notifications/unread",
  tags: ["Notifications"],
  summary: "Число непрочитанных",
  description: "Дешёвый запрос для значка на колокольчике.",
  security,
  responses: {
    200: { description: "Счётчик", ...json(z.object({ unread: z.number().int() })) },
    401: errors[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/Notifications/read",
  tags: ["Notifications"],
  summary: "Отметить прочитанными",
  description: "Без ids читается всё. Чужие уведомления недоступны даже по их идентификаторам.",
  security,
  request: { body: json(markNotificationsSchema) },
  responses: {
    200: {
      description: "Новое число непрочитанных",
      ...json(z.object({ unread: z.number().int() })),
    },
    401: errors[401],
  },
});

// --- личные сообщения --------------------------------------------------------

/**
 * Все отказы — один и тот же 404. «Нет такого пользователя», «вы не друзья» и
 * «это чужое сообщение» снаружи неразличимы: иначе перебором можно выяснять,
 * кто зарегистрирован и с кем переписывается (PROD-011).
 */
registry.registerPath({
  method: "get",
  path: "/api/Messages",
  tags: ["Messages"],
  summary: "Список диалогов",
  description: `Последняя реплика и непрочитанные по каждому собеседнику. Без курсора: потолок ${MAX_DIALOGS}.`,
  security,
  responses: {
    200: { description: "Диалоги и общее число непрочитанных", ...json(dialogListSchema) },
    401: errors[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/Messages/unread",
  tags: ["Messages"],
  summary: "Число непрочитанных сообщений",
  description: "Дешёвый запрос для значка на вкладке «Чаты».",
  security,
  responses: { 200: { description: "Счётчик", ...json(unreadCountSchema) }, 401: errors[401] },
});

registry.registerPath({
  method: "get",
  path: "/api/Messages/dialog/{userId}",
  tags: ["Messages"],
  summary: "Переписка с собеседником",
  description:
    "Свежие сообщения первыми, курсор листает вглубь истории. История переживает расторжение дружбы, но `canSend` тогда ложь.",
  security,
  request: {
    params: z.object({ userId: z.string() }),
    query: z.object({
      cursor: z
        .string()
        .optional()
        .openapi({ description: "Непрозрачный курсор предыдущей страницы" }),
      limit: z.coerce.number().int().optional(),
    }),
  },
  responses: {
    200: { description: "Страница переписки", ...json(messageThreadSchema) },
    401: errors[401],
    404: errors[404],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/Messages/dialog/{userId}/read",
  tags: ["Messages"],
  summary: "Отметить переписку прочитанной",
  description: "Идемпотентно: повторный вызов отмечает 0 сообщений и отвечает тем же 204.",
  security,
  request: { params: z.object({ userId: z.string() }) },
  responses: { 204: { description: "Отмечено" }, 401: errors[401], 404: errors[404] },
});

registry.registerPath({
  method: "post",
  path: "/api/Messages",
  tags: ["Messages"],
  summary: "Отправить сообщение",
  description: "Писать можно только тем, с кем дружба подтверждена.",
  security,
  request: { body: json(messageCreateSchema) },
  responses: {
    201: { description: "Отправлено", ...json(directMessageSchema) },
    400: errors[400],
    401: errors[401],
    404: errors[404],
  },
});

registry.registerPath({
  method: "put",
  path: "/api/Messages/{id}",
  tags: ["Messages"],
  summary: "Изменить своё сообщение",
  description:
    "Правка оставляет отметку `editedAt`. Чужое сообщение неотличимо от несуществующего.",
  security,
  request: { params: z.object({ id: z.string() }), body: json(messageUpdateSchema) },
  responses: {
    200: { description: "Изменено", ...json(directMessageSchema) },
    400: errors[400],
    401: errors[401],
    404: errors[404],
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/Messages/{id}",
  tags: ["Messages"],
  summary: "Удалить своё сообщение",
  description: "Сообщение исчезает у обоих собеседников.",
  security,
  request: { params: z.object({ id: z.string() }) },
  responses: { 204: { description: "Удалено" }, 401: errors[401], 404: errors[404] },
});

// --- чат события -------------------------------------------------------------

/**
 * Групповая переписка участников события (PROD-013). Как и у личных сообщений,
 * все отказы — один 404: «события нет», «чат выключен» и «вы не участник»
 * снаружи неразличимы, иначе перебором выяснялось бы, что закрытая комната есть.
 */
registry.registerPath({
  method: "get",
  path: "/api/Events/{id}/chat",
  tags: ["EventChat"],
  summary: "Чат события",
  description: "Свежие сообщения первыми, курсор листает вглубь. Доступен автору и участникам.",
  security,
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({
      cursor: z
        .string()
        .optional()
        .openapi({ description: "Непрозрачный курсор предыдущей страницы" }),
      limit: z.coerce.number().int().optional(),
    }),
  },
  responses: {
    200: { description: "Страница чата", ...json(eventChatPageSchema) },
    401: errors[401],
    404: errors[404],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/Events/{id}/chat",
  tags: ["EventChat"],
  summary: "Написать в чат события",
  description: "Писать можно, только если чат включён и вы автор события или его участник.",
  security,
  request: { params: z.object({ id: z.string() }), body: json(eventMessageCreateSchema) },
  responses: {
    201: { description: "Отправлено", ...json(eventMessageSchema) },
    400: errors[400],
    401: errors[401],
    404: errors[404],
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/Events/{id}/chat/{messageId}",
  tags: ["EventChat"],
  summary: "Удалить реплику из чата события",
  description: "Свою убирает автор реплики, любую — автор события (модерация своей комнаты).",
  security,
  request: { params: z.object({ id: z.string(), messageId: z.string() }) },
  responses: { 204: { description: "Удалено" }, 401: errors[401], 404: errors[404] },
});

// --- пользователи ------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/Users",
  tags: ["Users"],
  summary: "Пользователи",
  description: "Публичный список: email не раскрывается.",
  responses: { 200: { description: "Пользователи", ...json(z.array(userSchema)) } },
});

registry.registerPath({
  method: "get",
  path: "/api/Users/{id}",
  tags: ["Users"],
  summary: "Профиль пользователя",
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "Профиль", ...json(userSchema) }, 404: errors[404] },
});

registry.registerPath({
  method: "put",
  path: "/api/Users/me",
  tags: ["Users"],
  summary: "Изменить свой профиль",
  security,
  request: { body: json(profileUpdateSchema) },
  responses: {
    200: { description: "Профиль обновлён", ...json(userSchema) },
    400: errors[400],
    401: errors[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/Users/{userId}/friends",
  tags: ["Users"],
  summary: "Друзья пользователя",
  description: "Только принятые дружбы: ожидающая заявка друзьями ещё не делает.",
  security,
  request: { params: z.object({ userId: z.string() }) },
  responses: { 200: { description: "Друзья", ...json(z.array(userSchema)) }, 404: errors[404] },
});

registry.registerPath({
  method: "post",
  path: "/api/Users/{userId}/friends",
  tags: ["Users"],
  summary: "Отправить заявку в друзья",
  description:
    "Создаёт заявку. Если встречная заявка уже висит, вызов её принимает — тогда ответ 200 со статусом accepted.",
  security,
  request: { params: z.object({ userId: z.string() }), body: json(friendAddSchema) },
  responses: {
    200: { description: "Заявка принята или уже существовала", ...json(friendshipStatusSchema) },
    201: { description: "Заявка отправлена", ...json(friendshipStatusSchema) },
    400: errors[400],
    403: errors[403],
    404: errors[404],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/Users/{userId}/friends/requests",
  tags: ["Users"],
  summary: "Свои заявки в друзья",
  description: "Входящие и исходящие. Чужие заявки не показываются никому.",
  security,
  request: { params: z.object({ userId: z.string() }) },
  responses: {
    200: { description: "Заявки", ...json(friendRequestsSchema) },
    403: errors[403],
    404: errors[404],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/Users/{userId}/friends/requests/{requesterId}/accept",
  tags: ["Users"],
  summary: "Принять заявку в друзья",
  security,
  request: { params: z.object({ userId: z.string(), requesterId: z.string() }) },
  responses: { 204: { description: "Принята" }, 403: errors[403], 404: errors[404] },
});

registry.registerPath({
  method: "delete",
  path: "/api/Users/{userId}/friends/{friendId}",
  tags: ["Users"],
  summary: "Убрать связь",
  description: "Расторгает дружбу, отклоняет входящую заявку или отзывает свою.",
  security,
  request: { params: z.object({ userId: z.string(), friendId: z.string() }) },
  responses: { 204: { description: "Убрана" }, 403: errors[403], 404: errors[404] },
});

// --- служебные ---------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/health/ready",
  tags: ["Health"],
  summary: "Готовность к обслуживанию",
  description: "Проверяет доступность хранилища; 503 — база недоступна.",
  responses: {
    200: { description: "Готов", ...json(z.object({ status: z.string() })) },
    503: { description: "Хранилище недоступно", ...json(z.object({ status: z.string() })) },
  },
});

/** Собирает документ OpenAPI 3.1. */
export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "POVOD API",
      version: "1.0.0",
      description:
        "Контракт собирается из тех же Zod-схем, которые проверяют запросы и описывают " +
        "ответы сервера, поэтому не может разойтись с реализацией (ARCH-002).",
    },
    servers: [{ url: "http://localhost:8080", description: "Локальная разработка" }],
  });
}
