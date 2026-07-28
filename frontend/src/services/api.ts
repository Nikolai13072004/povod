import { appConfig } from "../config";
import type { components, paths } from "./schema";

interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

export interface AuthSession {
  token: string;
  expiresAt: string;
  user: User;
}

const SESSION_TOKEN_KEY = "povod.sessionToken";
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
 * Сессия живёт в `HttpOnly`-куке (SEC-001) — из JS её не прочитать, но рядом
 * сервер ставит читаемую CSRF-куку. Её наличие и есть признак живой куки-сессии.
 */
export function hasCookieSession(): boolean {
  return readCookie(CSRF_COOKIE) !== "";
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

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const url = `${appConfig.apiBaseUrl}${endpoint}`;
    const csrfToken = readCookie(CSRF_COOKIE);
    const fallbackToken = csrfToken ? "" : getSessionToken();
    const response = await fetch(url, {
      // Без этого браузер не приложит HttpOnly-куку сессии к cross-origin запросу.
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        // Double submit: сервер сверит заголовок с одноимённой кукой (SEC-001).
        ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
        ...(fallbackToken ? { Authorization: `Bearer ${fallbackToken}` } : {}),
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      const isCredentialAttempt =
        endpoint === "api/Auth/login" ||
        endpoint === "api/Auth/register" ||
        endpoint === "api/Auth/vk";
      if (response.status === 401 && !isCredentialAttempt) {
        clearLocalSession();
        window.dispatchEvent(new Event("povod:unauthorized"));
      }
      return {
        error: payload?.error ?? `API Error: ${response.status}`,
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
  health: healthAPI,
};
