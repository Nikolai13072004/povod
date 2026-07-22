/**
 * Доменные модели. Совместимы с интерфейсами фронтенда
 * (VK_POVOD_Hackathon_2026/src/services/api.ts): Event, User, Comment.
 * Поля сверх контракта (authorId, participantIds, category, format...) —
 * безопасное расширение: фронт их просто игнорирует.
 */

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  interests?: string[];
  /** id-шники друзей */
  friends?: string[];
  createdAt: string;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  /** Формат макета: "DD/MM/YY", напр. "27/06/26" */
  date: string;
  /** "HH:MM", напр. "18:00" */
  time: string;
  location: string;
  category?: string;
  /** Отображаемое имя автора (контракт фронта: author: string) */
  author: string;
  authorId: string;
  /** Кол-во участников */
  participants: number;
  /** id-шники участников */
  participantIds: string[];
  image?: string;
  tags?: string[];
  /** Координаты места [lat, lng] — для карты на детальной странице */
  coords?: [number, number];
  format?: "public" | "private";
  createdAt: string;
}

export interface Comment {
  id: string;
  text: string;
  author: User;
  createdAt: string;
  eventId: string;
}
