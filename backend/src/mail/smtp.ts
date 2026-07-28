import nodemailer, { type Transporter } from "nodemailer";
import type { MailTransport } from "./transport.js";

/**
 * Отправка через обычный SMTP-сервер.
 *
 * Нужен там, где нет своего домена. Провайдеры вроде Resend доставляют письма
 * на произвольные адреса только после подтверждения домена — до этого письма
 * уходят исключительно владельцу аккаунта. SMTP личного ящика (Яндекс, Gmail)
 * такого ограничения не имеет: почта отправляется от собственного адреса
 * кому угодно, в пределах суточной квоты провайдера.
 *
 * Цена решения — в письме виден личный адрес отправителя. Для проекта без
 * домена это приемлемо, для настоящего продукта — нет.
 */

export interface SmtpOptions {
  host: string;
  port: number;
  /** `true` — TLS с первого байта (порт 465); `false` — STARTTLS (587). */
  secure: boolean;
  user: string;
  password: string;
  /**
   * Отправитель. Яндекс и Gmail требуют, чтобы он совпадал с ящиком, под
   * которым выполнен вход, — иначе сервер отклоняет письмо или подменяет
   * адрес молча.
   */
  from: string;
  /** Подменяется в тестах, чтобы не открывать соединение. */
  createTransport?: typeof nodemailer.createTransport;
}

/** Внешний сервер, не ответивший за это время, считается недоступным. */
const TIMEOUT_MS = 10_000;

export function createSmtpTransport({
  host,
  port,
  secure,
  user,
  password,
  from,
  createTransport = nodemailer.createTransport,
}: SmtpOptions): MailTransport {
  /*
   * Соединение создаётся один раз и переиспользуется: рукопожатие TLS с
   * аутентификацией стоит сотни миллисекунд, а восстановление пароля его
   * дожидается.
   *
   * Таймауты заданы явно на все три фазы. Без них повисший SMTP-сервер держал
   * бы наш HTTP-запрос до таймаута клиента: у nodemailer значения по умолчанию
   * измеряются минутами.
   */
  let transporter: Transporter | undefined;
  const connection = (): Transporter =>
    (transporter ??= createTransport({
      host,
      port,
      secure,
      auth: { user, pass: password },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    }));

  return {
    name: "smtp",
    send: async (message) => {
      await connection().sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}
