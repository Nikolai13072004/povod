// Базовый URL API. Эндпоинты дописываются без ведущего слеша (`${BASE}api/Events`),
// поэтому гарантируем завершающий слеш у базы.
const RAW_BASE_URL = import.meta.env.VITE_API_URL || "https://team-5.hack.kam-dev.ru/";
const API_BASE_URL = RAW_BASE_URL.endsWith("/") ? RAW_BASE_URL : `${RAW_BASE_URL}/`;

interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
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
  email: string;
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

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      return {
        error: `API Error: ${response.status}`,
        status: response.status,
      };
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

  create: (event: Omit<Event, "id">) =>
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

  join: (eventId: string) =>
    fetchApi<void>(`api/Events/${eventId}/join`, {
      method: "POST",
    }),

  leave: (eventId: string) =>
    fetchApi<void>(`api/Events/${eventId}/leave`, {
      method: "POST",
    }),
};

export const usersAPI = {
  getAll: () => fetchApi<User[]>("api/Users"),

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

  create: (comment: Omit<Comment, "id" | "createdAt">) =>
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
  ping: () => fetchApi<{ status: string }>("api/ping"),

  health: () => fetchApi<{ status: string }>("health"),
};

export const authAPI = {
  // Авторизация VK Mini App: бэкенд проверяет подпись launch-параметров и upsert-ит пользователя
  vk: (launchParams: string, profile?: { name?: string; avatar?: string }) =>
    fetchApi<User>("api/Auth/vk", {
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
