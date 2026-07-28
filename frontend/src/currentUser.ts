import type { User } from "./services/api";

/**
 * Заглушка пользователя до подтверждения сессии сервером.
 *
 * Показывается ровно до того момента, как `sessionStore.init()` получит ответ
 * `/api/Auth/session`; дальше её место занимает настоящий профиль. Нужна, чтобы
 * шапка не мигала пустотой на первом кадре.
 *
 * Соответствует сид-пользователю `u1` на бэкенде.
 */
export const CURRENT_USER: User = {
  id: "u1",
  name: "Эльмира Гильманова",
  email: "elmira@povod.app",
  avatar: "https://i.pravatar.cc/150?img=47",
  createdAt: "2026-01-01T00:00:00.000Z",
};
