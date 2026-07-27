import { appConfig } from "../config";

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

export function getSessionToken(): string {
  return sessionStorage.getItem(SESSION_TOKEN_KEY) ?? "";
}

export function setSessionToken(token?: string): void {
  if (token) sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  else sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

export interface Event {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  timezone: string;
  location: string;
  category?: string;
  author: string;
  authorId?: string;
  participants: number;
  participantIds?: string[];
  image?: string;
  tags?: string[];
  coords?: [number, number];
  format?: "public" | "private";
  createdAt?: string;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  city?: string;
  interests?: string[];
}

/** Поля профиля, доступные владельцу для изменения (BE-010). */
export interface ProfileUpdate {
  name?: string;
  city?: string;
  avatar?: string;
  interests?: string[];
}

export interface Comment {
  id: string;
  text: string;
  author: User;
  createdAt: string;
  eventId: string;
}

export type EventWrite = Omit<
  Event,
  "id" | "author" | "authorId" | "participants" | "participantIds" | "createdAt"
>;

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const url = `${appConfig.apiBaseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(getSessionToken() ? { Authorization: `Bearer ${getSessionToken()}` } : {}),
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
        setSessionToken();
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
  getAll: () => fetchApi<Event[]>("api/Events"),

  getById: (id: string) => fetchApi<Event>(`api/Events/${id}`),

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

  join: (eventId: string) =>
    fetchApi<Event>(`api/Events/${eventId}/join`, {
      method: "POST",
    }),

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

  addFriend: (userId: string, friendId: string) =>
    fetchApi<void>(`api/Users/${userId}/friends`, {
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

  delete: (id: string) =>
    fetchApi<void>(`api/Comments/${id}`, {
      method: "DELETE",
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
  health: healthAPI,
};
