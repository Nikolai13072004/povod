import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getRepository } from "./store";
import type { Event, EventInvitation, User } from "./types";

/**
 * Приглашения в закрытые события (BE-008).
 *
 * Закрытое событие невидимо посторонним: прямой запрос отвечает `404`, а не
 * `403`, чтобы даже факт его существования не подтверждался. Значит, позвать
 * человека можно было только сделав событие открытым — то есть никак.
 *
 * Приглашение — это ссылка с секретом. Предъявивший её получает ровно два
 * права: увидеть событие и записаться на него. Ни правки, ни списка других
 * приглашений, ни доступа к остальным закрытым событиям автора.
 *
 * В хранилище лежит только SHA-256 секрета — как у сессий: по украденной базе
 * попасть в чужое закрытое событие нельзя.
 */

/** Сколько живёт приглашение, если автор не задал срок явно. */
const DEFAULT_LIFETIME_DAYS = 30;

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedInvitation {
  /** Секрет. Отдаётся один раз — при создании; в базе его нет. */
  token: string;
  invitation: EventInvitation;
}

export async function issueInvitation(
  event: Event,
  author: User,
  options: { expiresInDays?: number; maxUses?: number } = {},
): Promise<IssuedInvitation> {
  const token = randomBytes(24).toString("base64url");
  const lifetimeDays = options.expiresInDays ?? DEFAULT_LIFETIME_DAYS;
  const invitation: EventInvitation = {
    id: randomUUID(),
    eventId: event.id,
    tokenHash: hashInvitationToken(token),
    createdBy: author.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + lifetimeDays * 24 * 60 * 60 * 1000).toISOString(),
    maxUses: options.maxUses,
    usedCount: 0,
  };
  await getRepository().createInvitation(invitation);
  return { token, invitation };
}

/**
 * Проверяет приглашение к конкретному событию.
 *
 * Проверка чтения не считает использование: иначе приглашение на пять человек
 * исчерпалось бы, пока один из них перечитывает страницу. Счётчик увеличивает
 * только запись на событие.
 */
export async function resolveInvitation(
  token: string | undefined,
  eventId: string,
): Promise<EventInvitation | undefined> {
  if (!token) return undefined;
  const invitation = await getRepository().findInvitationByTokenHash(hashInvitationToken(token));
  if (!invitation || invitation.eventId !== eventId) return undefined;
  if (invitation.revokedAt) return undefined;
  if (invitation.expiresAt && Date.parse(invitation.expiresAt) <= Date.now()) return undefined;
  if (invitation.maxUses !== undefined && invitation.usedCount >= invitation.maxUses) {
    return undefined;
  }
  return invitation;
}

/** Приглашение без секрета — таким его можно показывать автору события. */
export function presentInvitation(invitation: EventInvitation) {
  return {
    id: invitation.id,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    maxUses: invitation.maxUses,
    usedCount: invitation.usedCount,
    revokedAt: invitation.revokedAt,
  };
}
