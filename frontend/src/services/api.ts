import { appConfig } from "../config";
import type { components, paths } from "./schema";

interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

/*
 * Объявлен ниже, вместе с остальными типами контракта: этот интерфейс был
 * написан руками и успел разойтись со схемой — в нём не хватало `csrfToken`,
 * хотя сервер его отдаёт и фронт им пользуется. Ровно та болезнь, ради которой
 * заводился единый контракт (ARCH-002); поймать её было нечем, потому что
 * типы фронта не проверялись вовсе.
 */

const SESSION_TOKEN_KEY = "povod.sessionToken";
const CSRF_TOKEN_KEY = "povod.csrfToken";
const CSRF_COOKIE = "povod_csrf";
const CSRF_HEADER = "X-CSRF-Token";

function readCookie(name: string): string {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const entry = part.trim();
    if (entry.startsWith(prefix)) return decodeURIComponent(entry.slice(prefix.length));
  }
  return "";
}

/**
 * CSRF-токен для заголовка двойной отправки.
 *
 * Кука — основной путь, но она принадлежит домену API. Когда фронт и API живут
 * на разных доменах (обычное дело на бесплатных хостингах:
 * `povod-web.onrender.com` и `povod-v1fg.onrender.com`), `document.cookie`
 * её **не видит вовсе** — там только куки своего домена. Сессионную куку
 * браузер при этом отправляет, поэтому сервер требует заголовок, и без запасного
 * пути любой изменяющий запрос упирался в 403.
 *
 * Запасной путь — значение из ответа на вход, сохранённое рядом с сессионным
 * токеном. Секрета это не добавляет: кука и так была доступна скриптам.
 */
function csrfToken(): string {
  const fromCookie = readCookie(CSRF_COOKIE);
  if (fromCookie) return fromCookie;
  try {
    return localStorage.getItem(CSRF_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Хранится в `localStorage`, а не в `sessionStorage`.
 *
 * `sessionStorage` живёт в пределах одной вкладки. Кука, которую он заменяет,
 * общая для всех вкладок, — и разница вылезла сразу: переход по присланной
 * ссылке открывает НОВУЮ вкладку, там токена нет, приложение решает, что входа
 * не было, и показывает экран входа. Сессия на сервере при этом жива, и даже
 * после «входа» запись упиралась бы в 403, потому что заголовок брать неоткуда.
 *
 * Хранить его так не опаснее куки: сам по себе он ничего не открывает — нужен
 * ещё `HttpOnly`-токен сессии, до которого скрипты не дотягиваются. Сессионный
 * токен остаётся в `sessionStorage`: вот он как раз учётные данные.
 */
export function setCsrfToken(token?: string): void {
  try {
    if (token) localStorage.setItem(CSRF_TOKEN_KEY, token);
    else localStorage.removeItem(CSRF_TOKEN_KEY);
  } catch {
    /* хранилище недоступно (приватный режим) — остаётся путь через куку */
  }
}

/**
 * Видна ли CSRF-кука напрямую.
 *
 * Это признак того, что фронт и API на одном сайте: тогда куки работают
 * привычно и резервный Bearer-токен хранить незачем (SEC-001). Если куки не
 * видно — либо разные домены, либо браузер режет сторонние куки в iframe
 * (VK Mini App), — резерв нужен.
 */
export function hasReadableCsrfCookie(): boolean {
  return readCookie(CSRF_COOKIE) !== "";
}

/**
 * Есть ли основания считать, что сессия существует.
 *
 * Смотрит и на сохранённый CSRF-токен: на разных доменах куку не видно, и без
 * этого приложение после перезагрузки страницы решило бы, что входа не было.
 */
export function hasCookieSession(): boolean {
  return csrfToken() !== "";
}

/**
 * Резервный токен для окружений, где куки недоступны, — прежде всего VK Mini App
 * в iframe, где браузер может резать сторонние куки. В обычном вебе не хранится.
 */
export function getSessionToken(): string {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setSessionToken(token?: string): void {
  try {
    if (token) sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    else sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* хранилище недоступно (приватный режим) — работаем без резерва */
  }
}

/** Стоит ли вообще спрашивать сервер о текущей сессии. */
export function hasStoredSession(): boolean {
  return hasCookieSession() || getSessionToken() !== "";
}

/**
 * Локально помечает сессию завершённой. Саму `HttpOnly`-куку убирает сервер
 * (`Set-Cookie` на `/logout` или ответ 401) — JS до неё не дотянется.
 */
export function clearLocalSession(): void {
  setSessionToken();
  setCsrfToken();
  document.cookie = `${CSRF_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Формы данных больше не описываются здесь (ARCH-002).
 *
 * Раньше те же поля были объявлены и тут, и в `backend/src/types.ts`, и
 * совпадали только потому, что за этим следили руками: сервер мог переименовать
 * поле, фронт бы собрался, а ошибку увидел бы пользователь.
 *
 * Теперь типы приходят из `schema.d.ts`, сгенерированного из `docs/openapi.json`,
 * который, в свою очередь, собирается из Zod-схем сервера. Пересобрать всю
 * цепочку: `npm --prefix backend run openapi`.
 */
type Schemas = components["schemas"];

export type Event = Schemas["Event"];
export type User = Schemas["User"];
export type Comment = Schemas["Comment"];
export type NotificationType = Schemas["NotificationType"];
export type Notification = Schemas["Notification"];
export type NotificationFeed = Schemas["NotificationFeed"];
export type AuthSession = Schemas["AuthSession"];
export type DirectMessage = Schemas["DirectMessage"];
export type Dialog = Schemas["Dialog"];
export type DialogList = Schemas["DialogList"];
/** Страница переписки: свежие сообщения первыми, курсор листает вглубь истории. */
export type MessageThread = Schemas["MessageThread"];
/** Сообщение в чате события: имя автора подписано прямо в реплике (PROD-013). */
export type EventMessage = Schemas["EventMessage"];
/** Страница чата события: свежие первыми, курсор — вглубь истории. */
export type EventChatPage = Schemas["EventChatPage"];
/** Страница ленты: `nextCursor` отсутствует — дальше ничего нет (BE-003). */
export type EventPage = Schemas["EventPage"];
/** Приглашение без секрета — таким его видит автор события (BE-008). */
export type Invitation = Schemas["Invitation"];
export type IssuedInvitation = Schemas["IssuedInvitation"];

/** Поля профиля, доступные владельцу для изменения (BE-010). */
export type ProfileUpdate = NonNullable<
  paths["/api/Users/me"]["put"]["requestBody"]
>["content"]["application/json"];

export type EventWrite = Omit<
  Event,
  "id" | "author" | "authorId" | "participants" | "participantIds" | "createdAt"
>;

interface ApiIssue {
  message?: string;
  path?: (string | number)[];
}

interface ApiErrorPayload {
  error?: string;
  issues?: ApiIssue[];
}

/** Человекочитаемые названия полей: `path` из Zod содержит имена из схемы. */
const FIELD_LABELS: Record<string, string> = {
  name: "Имя",
  email: "Email",
  password: "Пароль",
  title: "Название",
  description: "Описание",
  startsAt: "Дата начала",
  endsAt: "Дата окончания",
  location: "Место",
  category: "Категория",
  tags: "Теги",
  coords: "Координаты",
  participantLimit: "Ограничение мест",
  text: "Текст",
  city: "Город",
  interests: "Интересы",
  image: "Изображение",
};

/**
 * Собирает сообщение об ошибке из ответа сервера.
 *
 * Сервер на неверный ввод отвечает `{ error: "Validation failed", issues: [...] }`,
 * где у каждой записи есть путь до поля и внятный текст. Раньше бралось только
 * `error`, и человек видел «Validation failed» — фразу, из которой невозможно
 * понять, что именно поправить. На настоящей регистрации это выглядело так:
 * сервер написал «Некорректный email», а на экране появилось «Validation failed».
 *
 * Несколько ошибок склеиваются: форма показывает одну строку, и умолчать о
 * второй ошибке значит заставить исправлять поля по одному.
 */
function describeApiError(payload: ApiErrorPayload | null, status: number): string {
  const issues = payload?.issues ?? [];
  if (issues.length > 0) {
    const described = issues
      .map((issue) => {
        const message = issue.message?.trim();
        if (!message) return undefined;
        const field = issue.path?.[0];
        const label = typeof field === "string" ? FIELD_LABELS[field] : undefined;
        // Подпись поля добавляется, только если она известна: «Некорректный
        // email» и так понятно, а «participantLimit: ...» — нет.
        return label && !message.toLowerCase().includes(label.toLowerCase())
          ? `${label}: ${message}`
          : message;
      })
      .filter((item): item is string => Boolean(item));
    if (described.length > 0) return described.join(". ");
  }
  return payload?.error ?? `API Error: ${status}`;
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const url = `${appConfig.apiBaseUrl}${endpoint}`;
    /*
     * Заголовок двойной отправки и резервный Bearer решают разные задачи.
     *
     * CSRF-токен нужен всегда, когда он есть: на разных доменах он приходит из
     * сохранённого значения, а не из куки.
     *
     * Bearer — только там, где кука API не читается, то есть куки либо
     * сторонние и порезаны (VK Mini App), либо чужого домена. При рабочих
     * куках токен в запрос не подставляется вовсе (SEC-001).
     */
    const csrf = csrfToken();
    const fallbackToken = hasReadableCsrfCookie() ? "" : getSessionToken();
    const response = await fetch(url, {
      // Без этого браузер не приложит HttpOnly-куку сессии к cross-origin запросу.
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        // Double submit: сервер сверит заголовок с одноимённой кукой (SEC-001).
        ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
        ...(fallbackToken ? { Authorization: `Bearer ${fallbackToken}` } : {}),
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
      const isCredentialAttempt =
        endpoint === "api/Auth/login" ||
        endpoint === "api/Auth/register" ||
        endpoint === "api/Auth/vk";
      if (response.status === 401 && !isCredentialAttempt) {
        clearLocalSession();
        window.dispatchEvent(new Event("povod:unauthorized"));
      }
      return {
        error: describeApiError(payload, response.status),
        status: response.status,
      };
    }

    if (response.status === 204) {
      return { status: response.status };
    }

    const data = await response.json();
    return {
      data,
      status: response.status,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown error",
      status: 0,
    };
  }
}

export const eventsAPI = {
  /**
   * Лента отдаётся страницами (BE-003). `nextCursor` отсутствует — это конец.
   * Курсор непрозрачен: клиенту незачем знать, что внутри.
   */
  getAll: (params: { search?: string; cursor?: string; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit) query.set("limit", String(params.limit));
    const suffix = query.toString();
    return fetchApi<EventPage>(`api/Events${suffix ? `?${suffix}` : ""}`);
  },

  getById: (id: string, inviteToken?: string) =>
    fetchApi<Event>(
      `api/Events/${id}${inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : ""}`,
    ),

  create: (event: EventWrite) =>
    fetchApi<Event>("api/Events", {
      method: "POST",
      body: JSON.stringify(event),
    }),

  update: (id: string, event: Partial<Event>) =>
    fetchApi<Event>(`api/Events/${id}`, {
      method: "PUT",
      body: JSON.stringify(event),
    }),

  delete: (id: string) =>
    fetchApi<void>(`api/Events/${id}`, {
      method: "DELETE",
    }),

  getActive: () => fetchApi<Event[]>("api/Events/active"),

  getUpcoming: () => fetchApi<Event[]>("api/Events/upcoming"),

  getByAuthor: (authorId: string) => fetchApi<Event[]>(`api/Events/author/${authorId}`),

  getByParticipant: (userId: string) => fetchApi<Event[]>(`api/Events/participant/${userId}`),

  getMine: () => fetchApi<{ created: Event[]; attending: Event[] }>("api/Events/mine"),

  /** Избранное текущего пользователя (PROD-001). */
  getFavorites: () => fetchApi<Event[]>("api/Events/favorites"),

  addFavorite: (eventId: string) =>
    fetchApi<void>(`api/Events/${eventId}/favorite`, { method: "POST" }),

  removeFavorite: (eventId: string) =>
    fetchApi<void>(`api/Events/${eventId}/favorite`, { method: "DELETE" }),

  /** Приглашения в закрытое событие: доступны только его автору (BE-008). */
  createInvitation: (eventId: string, options: { maxUses?: number; expiresInDays?: number } = {}) =>
    fetchApi<Invitation & { token: string }>(`api/Events/${eventId}/invitations`, {
      method: "POST",
      body: JSON.stringify(options),
    }),

  listInvitations: (eventId: string) => fetchApi<Invitation[]>(`api/Events/${eventId}/invitations`),

  revokeInvitation: (eventId: string, invitationId: string) =>
    fetchApi<void>(`api/Events/${eventId}/invitations/${invitationId}`, { method: "DELETE" }),

  join: (eventId: string, inviteToken?: string) =>
    fetchApi<Event>(
      `api/Events/${eventId}/join${inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : ""}`,
      { method: "POST" },
    ),

  leave: (eventId: string) =>
    fetchApi<Event>(`api/Events/${eventId}/leave`, {
      method: "POST",
    }),
};

export const usersAPI = {
  getAll: () => fetchApi<User[]>("api/Users"),

  /** Обновление собственного профиля (BE-010). */
  updateMe: (patch: ProfileUpdate) =>
    fetchApi<User>("api/Users/me", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  getById: (id: string) => fetchApi<User>(`api/Users/${id}`),

  delete: (id: string) =>
    fetchApi<void>(`api/Users/${id}`, {
      method: "DELETE",
    }),

  getFriends: (userId: string) => fetchApi<User[]>(`api/Users/${userId}/friends`),

  /** Заявки, ждущие ответа: входящие — от других, исходящие — свои (SEC-012). */
  getFriendRequests: (userId: string) =>
    fetchApi<{ incoming: User[]; outgoing: User[] }>(`api/Users/${userId}/friends/requests`),

  acceptFriendRequest: (userId: string, requesterId: string) =>
    fetchApi<void>(`api/Users/${userId}/friends/requests/${requesterId}/accept`, {
      method: "POST",
    }),

  /**
   * Отправляет заявку в друзья. Ответ говорит, чем всё кончилось: `pending` —
   * заявка ушла и ждёт ответа, `accepted` — встречная заявка уже висела и этот
   * вызов её принял.
   */
  addFriend: (userId: string, friendId: string) =>
    fetchApi<{ status: "pending" | "accepted" }>(`api/Users/${userId}/friends`, {
      method: "POST",
      body: JSON.stringify({ friendId }),
    }),

  removeFriend: (userId: string, friendId: string) =>
    fetchApi<void>(`api/Users/${userId}/friends/${friendId}`, {
      method: "DELETE",
    }),
};

export const commentsAPI = {
  getByEvent: (eventId: string) => fetchApi<Comment[]>(`api/Comments/event/${eventId}`),

  create: (comment: { text: string; eventId: string }) =>
    fetchApi<Comment>("api/Comments", {
      method: "POST",
      body: JSON.stringify(comment),
    }),

  /** Правка своего комментария (BE-009). */
  update: (id: string, text: string) =>
    fetchApi<Comment>(`api/Comments/${id}`, {
      method: "PUT",
      body: JSON.stringify({ text }),
    }),

  delete: (id: string) =>
    fetchApi<void>(`api/Comments/${id}`, {
      method: "DELETE",
    }),
};

export const notificationsAPI = {
  list: () => fetchApi<NotificationFeed>("api/Notifications"),

  /** Дешёвый запрос только ради значка на колокольчике. */
  unreadCount: () => fetchApi<{ unread: number }>("api/Notifications/unread"),

  /** Без `ids` отмечает прочитанным всё. */
  markRead: (ids?: string[]) =>
    fetchApi<{ unread: number }>("api/Notifications/read", {
      method: "POST",
      body: JSON.stringify(ids ? { ids } : {}),
    }),
};

/**
 * Личные сообщения (PROD-011).
 *
 * Переписка живёт под `dialog/`, а `:id` без префикса — идентификатор
 * сообщения. Без разделения один и тот же сегмент означал бы то собеседника,
 * то реплику, и разобраться в маршрутах стало бы невозможно.
 */
export const messagesAPI = {
  /** Диалоги с последней репликой и непрочитанными. Без курсора: потолок 50. */
  getDialogs: () => fetchApi<DialogList>("api/Messages"),

  /** Дешёвый запрос только ради значка на вкладке. */
  unreadCount: () => fetchApi<{ unread: number }>("api/Messages/unread"),

  getThread: (peerId: string, params: { cursor?: string; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query}` : "";
    return fetchApi<MessageThread>(`api/Messages/dialog/${encodeURIComponent(peerId)}${suffix}`);
  },

  send: (recipientId: string, text: string) =>
    fetchApi<DirectMessage>("api/Messages", {
      method: "POST",
      body: JSON.stringify({ recipientId, text }),
    }),

  update: (id: string, text: string) =>
    fetchApi<DirectMessage>(`api/Messages/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ text }),
    }),

  remove: (id: string) =>
    fetchApi<void>(`api/Messages/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /** Идемпотентно: повторный вызов отмечает 0 сообщений и отвечает тем же 204. */
  markRead: (peerId: string) =>
    fetchApi<void>(`api/Messages/dialog/${encodeURIComponent(peerId)}/read`, { method: "POST" }),
};

/**
 * Чат участников события (PROD-013).
 *
 * Все отказы приходят как 404 — «нет события», «чат выключен» и «вы не участник»
 * снаружи неразличимы, ровно как у личных сообщений.
 */
export const eventChatAPI = {
  getChat: (eventId: string, params: { cursor?: string; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query}` : "";
    return fetchApi<EventChatPage>(`api/Events/${encodeURIComponent(eventId)}/chat${suffix}`);
  },

  send: (eventId: string, text: string) =>
    fetchApi<EventMessage>(`api/Events/${encodeURIComponent(eventId)}/chat`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  remove: (eventId: string, messageId: string) =>
    fetchApi<void>(
      `api/Events/${encodeURIComponent(eventId)}/chat/${encodeURIComponent(messageId)}`,
      { method: "DELETE" },
    ),
};

export const healthAPI = {
  ping: () => fetchApi<{ message: string; service?: string; timestamp?: string }>("api/ping"),

  health: () => fetchApi<{ status: string }>("health"),
};

export const authAPI = {
  register: (payload: { name: string; email: string; password: string }) =>
    fetchApi<AuthSession>("api/Auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    fetchApi<AuthSession>("api/Auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /**
   * Запрос ссылки восстановления (SEC-008). Ответ одинаков независимо от того,
   * есть такой адрес или нет — форма не должна выдавать, кто зарегистрирован.
   */
  requestPasswordReset: (email: string) =>
    fetchApi<void>("api/Auth/password-reset", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  confirmPasswordReset: (token: string, password: string) =>
    fetchApi<void>("api/Auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),

  session: () => fetchApi<{ user: User }>("api/Auth/session"),

  logout: () =>
    fetchApi<void>("api/Auth/logout", {
      method: "POST",
    }),

  // Авторизация VK Mini App: бэкенд проверяет подпись launch-параметров и upsert-ит пользователя
  vk: (launchParams: string, profile?: { name?: string; avatar?: string }) =>
    fetchApi<AuthSession>("api/Auth/vk", {
      method: "POST",
      body: JSON.stringify({ launchParams, profile }),
    }),
};

export const api = {
  auth: authAPI,
  events: eventsAPI,
  users: usersAPI,
  comments: commentsAPI,
  notifications: notificationsAPI,
  messages: messagesAPI,
  eventChat: eventChatAPI,
  health: healthAPI,
};
