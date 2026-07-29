import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

/**
 * Единый контракт API (ARCH-002).
 *
 * До этого форма события, пользователя и остальных объектов была описана дважды:
 * в `backend/src/types.ts` и в `frontend/src/services/api.ts`. Совпадали они
 * только потому, что за этим следили руками, — а расходятся такие описания
 * молча: backend переименует поле, frontend соберётся, ошибку увидит уже
 * пользователь.
 *
 * Теперь источник один — схемы ниже:
 *   - типы backend выводятся из них (`z.infer`);
 *   - из них же собирается `docs/openapi.json`;
 *   - из спецификации генерируются типы frontend.
 *
 * Схемы описывают именно то, что уходит наружу: пароли, хэши токенов и email
 * чужих пользователей сюда не попадают.
 */

extendZodWithOpenApi(z);

const isoDateTime = () => z.string().datetime({ offset: true });

export const userSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    // Email виден только владельцу профиля — в публичных ответах его нет.
    email: z.string().optional(),
    avatar: z.string().optional(),
    city: z.string().optional(),
    interests: z.array(z.string()).optional(),
    friends: z.array(z.string()).optional(),
    createdAt: isoDateTime(),
  })
  .openapi("User");

export const eventSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    startsAt: isoDateTime(),
    endsAt: isoDateTime().optional().openapi({ description: "Окончание, если автор его указал" }),
    timezone: z.string().openapi({ example: "Europe/Moscow" }),
    location: z.string(),
    category: z.string().optional(),
    author: z.string().openapi({ description: "Отображаемое имя автора" }),
    authorId: z.string(),
    participants: z.number().int(),
    participantLimit: z
      .number()
      .int()
      .optional()
      .openapi({ description: "Предел числа участников вместе с автором" }),
    participantIds: z.array(z.string()),
    image: z.string().optional(),
    tags: z.array(z.string()).optional(),
    coords: z.tuple([z.number(), z.number()]).optional(),
    format: z.enum(["public", "private"]).optional(),
    createdAt: isoDateTime(),
  })
  .openapi("Event");

/** Страница ленты: курсор отсутствует — дальше ничего нет (BE-003). */
export const eventPageSchema = z
  .object({
    items: z.array(eventSchema),
    nextCursor: z.string().optional(),
  })
  .openapi("EventPage");

export const myEventsSchema = z
  .object({
    created: z.array(eventSchema),
    attending: z.array(eventSchema),
  })
  .openapi("MyEvents");

export const commentSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    author: userSchema,
    createdAt: isoDateTime(),
    editedAt: isoDateTime()
      .optional()
      .openapi({ description: "Отметка о правке; отсутствует — текст не менялся" }),
    eventId: z.string(),
  })
  .openapi("Comment");

export const notificationTypeSchema = z
  .enum([
    "event_updated",
    "event_cancelled",
    "event_comment",
    "event_joined",
    "direct_message",
    "friend_request",
    "friend_accepted",
  ])
  .openapi("NotificationType");

export const notificationSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    type: notificationTypeSchema,
    eventId: z
      .string()
      .optional()
      .openapi({ description: "Отсутствует, если событие удалено или это отмена" }),
    eventTitle: z.string().optional().openapi({
      description: "Отсутствует у уведомлений без события — например о личном сообщении",
    }),
    actorId: z.string().optional(),
    actorName: z.string().optional(),
    changes: z.array(z.string()).optional(),
    createdAt: isoDateTime(),
    readAt: isoDateTime().optional(),
  })
  .openapi("Notification");

export const notificationFeedSchema = z
  .object({
    items: z.array(notificationSchema),
    unread: z.number().int(),
  })
  .openapi("NotificationFeed");

/**
 * Личное сообщение (PROD-011).
 *
 * `readAt` уходит и отправителю — это галочка «прочитано». Решение
 * продуктовое, а не техническое: отметка нужна для счётчика непрочитанных в
 * любом случае, но показывать её второй стороне — отдельный выбор, обратной
 * дороги у которого нет.
 */
export const directMessageSchema = z
  .object({
    id: z.string(),
    senderId: z.string(),
    recipientId: z.string(),
    text: z.string(),
    createdAt: isoDateTime(),
    editedAt: isoDateTime()
      .optional()
      .openapi({ description: "Отметка о правке; отсутствует — текст не менялся" }),
    readAt: isoDateTime()
      .optional()
      .openapi({ description: "Когда получатель открыл переписку; отсутствует — не прочитано" }),
  })
  .openapi("DirectMessage");

/** Строка списка диалогов: собеседник, последняя реплика и непрочитанные в ней. */
export const dialogSchema = z
  .object({
    peer: userSchema,
    lastMessage: directMessageSchema,
    unread: z.number().int().openapi({ description: "Непрочитанные входящие в этом диалоге" }),
  })
  .openapi("Dialog");

export const dialogListSchema = z
  .object({
    items: z.array(dialogSchema),
    unread: z.number().int().openapi({ description: "Непрочитанные во всех диалогах" }),
  })
  .openapi("DialogList");

/** Страница переписки: свежие сообщения первыми, курсор листает вглубь истории. */
export const messageThreadSchema = z
  .object({
    peer: userSchema,
    items: z.array(directMessageSchema),
    nextCursor: z.string().optional(),
    canSend: z.boolean().openapi({
      description: "Дружба подтверждена прямо сейчас. Ложь — история видна, отправка запрещена",
    }),
  })
  .openapi("MessageThread");

export const unreadCountSchema = z.object({ unread: z.number().int() }).openapi("UnreadCount");

/** Приглашение без секрета — таким его видит автор события (BE-008). */
export const invitationSchema = z
  .object({
    id: z.string(),
    createdAt: isoDateTime(),
    expiresAt: isoDateTime().optional(),
    maxUses: z.number().int().optional(),
    usedCount: z.number().int(),
    revokedAt: isoDateTime().optional(),
  })
  .openapi("Invitation");

/** Ответ на создание приглашения: секрет отдаётся ровно один раз. */
export const issuedInvitationSchema = invitationSchema
  .extend({ token: z.string() })
  .openapi("IssuedInvitation");

export const authSessionSchema = z
  .object({
    token: z.string().openapi({
      description: "Резерв для клиентов без кук (VK Mini App). Веб-фронт ходит по HttpOnly-куке.",
    }),
    csrfToken: z.string().openapi({
      description:
        "Токен двойной отправки. Дублирует куку povod_csrf для случая, когда фронт и API живут на разных доменах: там читаемая кука API невидима для скриптов фронта. Клиент шлёт его заголовком X-CSRF-Token.",
    }),
    expiresAt: isoDateTime(),
    user: userSchema,
  })
  .openapi("AuthSession");

export const errorSchema = z.object({ error: z.string() }).openapi("Error");

/**
 * Полная модель события со всеми внутренними полями — то, чем оперирует
 * хранилище. Наружу уходит `eventSchema`; расхождение только в обязательности
 * `email` у пользователя.
 */
export type User = z.infer<typeof userSchema> & { email: string };
export type Event = z.infer<typeof eventSchema>;
export type Comment = Omit<z.infer<typeof commentSchema>, "author"> & { author: User };
/** Состояние связи после попытки подружиться (SEC-012). */
export const friendshipStatusSchema = z
  .object({ status: z.enum(["pending", "accepted"]) })
  .openapi("FriendshipStatus");

/** Заявки, ждущие ответа: входящие — от других, исходящие — свои. */
export const friendRequestsSchema = z
  .object({ incoming: z.array(userSchema), outgoing: z.array(userSchema) })
  .openapi("FriendRequests");

export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type DirectMessage = z.infer<typeof directMessageSchema>;
/** Внутри диалога собеседник — полная модель пользователя; наружу он уходит урезанным. */
export type Dialog = Omit<z.infer<typeof dialogSchema>, "peer"> & { peer: User };
