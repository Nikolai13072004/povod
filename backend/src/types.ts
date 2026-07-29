/**
 * Доменные модели POVOD.
 *
 * Описаний больше нет — типы выводятся из схем контракта (ARCH-002). Раньше та
 * же форма была записана здесь и ещё раз в `frontend/src/services/api.ts`, и
 * совпадали они только потому, что за этим следили руками.
 *
 * Единственное отличие внутренней модели от внешней: у пользователя внутри
 * `email` обязателен — по нему идёт вход, — а наружу он уходит только владельцу
 * профиля и потому объявлен необязательным.
 */

export type {
  Comment,
  Dialog,
  DirectMessage,
  Event,
  Notification,
  NotificationType,
  User,
} from "./contracts/schemas.js";

/**
 * Приглашение в закрытое событие (BE-008).
 *
 * Наружу отдаётся урезанная версия без `tokenHash` (`invitationSchema` в
 * контракте): в хранилище лежит только SHA-256 секрета, а сам секрет виден один
 * раз — в ответе на создание.
 */
export interface EventInvitation {
  id: string;
  eventId: string;
  tokenHash: string;
  createdBy: string;
  createdAt: string;
  /** Отсутствует — приглашение бессрочное. */
  expiresAt?: string;
  /** Отсутствует — число переходов не ограничено. */
  maxUses?: number;
  usedCount: number;
  revokedAt?: string;
}
