import { createHash, randomBytes, randomUUID } from "node:crypto";
import { config } from "../config.js";
import { getRepository } from "../store.js";
import { logger } from "../logger.js";
import { hashPassword } from "./password.js";
import { getMailTransport } from "../mail/index.js";
import { passwordResetMessage } from "../mail/message.js";
import type { User } from "../types.js";

/**
 * Восстановление пароля (SEC-008).
 *
 * До этого забытый пароль означал потерянный аккаунт: сменить его было негде.
 *
 * Свойства, определившие реализацию:
 *
 *  1. Ответ на запрос ссылки одинаков независимо от того, есть такой адрес или
 *     нет. Иначе форма превращается в проверялку «зарегистрирован ли этот
 *     человек» — а это уже утечка.
 *  2. В базе лежит только SHA-256 токена, как у сессий и приглашений.
 *  3. Токен живёт час и срабатывает один раз. Ссылка уходит по почте, а почта
 *     хранится дольше, чем нужно.
 *  4. Успешная смена пароля отзывает все сессии пользователя: если пароль меняют
 *     потому, что аккаунт увели, чужой вход обязан прекратиться.
 */

/** Час: достаточно, чтобы дойти до письма, мало, чтобы ссылка «полежала». */
const TOKEN_LIFETIME_HOURS = 1;
const TOKEN_LIFETIME_MS = TOKEN_LIFETIME_HOURS * 60 * 60 * 1000;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Ссылка, которую видит пользователь. */
export function resetLink(token: string): string {
  const base = config.appUrl.replace(/\/+$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Отправка письма.
 *
 * Ошибка провайдера гасится намеренно. Если дать ей выйти наружу, запрос по
 * существующему адресу вернёт 500, а по несуществующему — 204, и форма снова
 * станет проверялкой «зарегистрирован ли этот человек» — ровно то, от чего
 * защищает свойство 1. Неудача остаётся в логе, где её видит владелец сервиса,
 * а не тот, кто перебирает адреса.
 */
async function deliverResetLink(user: User, link: string): Promise<void> {
  try {
    await getMailTransport().send(passwordResetMessage(user.email, link, TOKEN_LIFETIME_HOURS));
  } catch (error) {
    logger.error("[auth] не удалось отправить письмо восстановления пароля:", error);
  }
}

/**
 * Выдаёт ссылку восстановления, если такой пользователь есть.
 *
 * Наружу ничего не возвращает намеренно — вызывающий не должен иметь
 * возможности отличить «отправили» от «такого адреса нет».
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const repository = getRepository();
  const user = await repository.findUserByEmail(email);
  if (!user) return;

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await repository.createPasswordResetToken({
    id: randomUUID(),
    userId: user.id,
    tokenHash: hashResetToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_MS).toISOString(),
  });
  await deliverResetLink(user, resetLink(token));
}

export type PasswordResetOutcome = "changed" | "invalid-token";

/**
 * Меняет пароль по токену.
 *
 * Просроченный, использованный и выдуманный токены неотличимы в ответе: любой
 * из них — просто «ссылка не подошла».
 */
export async function confirmPasswordReset(
  token: string,
  password: string,
): Promise<PasswordResetOutcome> {
  const repository = getRepository();
  const stored = await repository.getPasswordResetToken(hashResetToken(token));
  if (!stored || stored.usedAt || Date.parse(stored.expiresAt) <= Date.now()) {
    return "invalid-token";
  }

  const user = await repository.getUser(stored.userId);
  if (!user) return "invalid-token";

  // Гасим токен до смены пароля: два одновременных перехода по одной ссылке
  // иначе сменили бы пароль дважды, и второй результат затёр бы первый.
  if (!(await repository.consumePasswordResetToken(stored.id, new Date().toISOString()))) {
    return "invalid-token";
  }

  await repository.setPasswordHash(user.id, await hashPassword(password));
  // Смена пароля — способ выгнать того, кто вошёл без спроса.
  await repository.revokeUserSessions(user.id, new Date().toISOString());
  return "changed";
}
