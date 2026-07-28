import { logger } from "../logger.js";
import type { MailMessage } from "./message.js";
import { createSmtpTransport } from "./smtp.js";

/**
 * Доставка писем.
 *
 * Транспорт выбирается конфигурацией и подменяется целиком, а не ветвлениями
 * внутри кода отправки: провайдер здесь заведомо не последний, и место, где
 * решается «куда уйдёт письмо», должно быть одно.
 *
 * `send` бросает исключение при неудаче. Решение, что делать с неудачей, за
 * вызывающим: у восстановления пароля и, скажем, у уведомления они разные.
 */
export interface MailTransport {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

/** Провайдер не настроен: письма никуда не уходят. */
export const noneTransport: MailTransport = {
  name: "none",
  send: async () => {},
};

/**
 * Разработка: письмо печатается в лог.
 *
 * В production запрещён проверкой конфигурации — иначе пользователь видит
 * «письмо отправлено», а ссылка лежит в логах сервера.
 */
export const consoleTransport: MailTransport = {
  name: "console",
  send: async (message) => {
    // Адрес и ссылку logger вырежет как PII и секрет, поэтому письмо печатается
    // одной строкой без разбора на поля: в dev нужен именно читаемый вывод.
    logger.info(`[mail] ${message.subject}\n  кому: ${message.to}\n\n${message.text}\n`);
  },
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Провайдер, который не ответил за это время, считается недоступным. */
const REQUEST_TIMEOUT_MS = 10_000;

export interface ResendOptions {
  apiKey: string;
  from: string;
  /** Подменяется в тестах, чтобы не ходить в сеть. */
  fetchImpl?: typeof fetch;
}

/**
 * Resend — отправка по HTTP API.
 *
 * HTTP, а не SMTP: SMTP потребовал бы зависимости и долгоживущего соединения,
 * а один POST обходится без того и другого.
 *
 * Запрос ограничен по времени. Без этого зависший провайдер держал бы наш
 * HTTP-запрос до таймаута клиента, а восстановление пароля отправку дожидается.
 */
export function createResendTransport({
  apiKey,
  from,
  fetchImpl = fetch,
}: ResendOptions): MailTransport {
  return {
    name: "resend",
    send: async (message) => {
      const response = await fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) return;

      // Тело ответа Resend содержит причину отказа («домен не подтверждён»,
      // «адрес получателя не разрешён на free-плане»). Без него в логе остаётся
      // голый код статуса, по которому непонятно, что чинить.
      const details = await response.text().catch(() => "");
      throw new Error(
        `Resend отклонил письмо: ${response.status} ${response.statusText}` +
          (details ? ` — ${details.slice(0, 500)}` : ""),
      );
    },
  };
}

export interface MailTransportConfig {
  mailTransport: "console" | "none" | "resend" | "smtp";
  resendApiKey: string;
  mailFrom: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
}

export function createMailTransport(
  config: MailTransportConfig,
  fetchImpl?: typeof fetch,
): MailTransport {
  switch (config.mailTransport) {
    case "resend":
      return createResendTransport({
        apiKey: config.resendApiKey,
        from: config.mailFrom,
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    case "smtp":
      return createSmtpTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        user: config.smtpUser,
        password: config.smtpPassword,
        from: config.mailFrom,
      });
    case "console":
      return consoleTransport;
    case "none":
      return noneTransport;
  }
}
