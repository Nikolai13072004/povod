import type { MailTransport } from "./transport.js";

/**
 * Brevo — отправка по HTTP API.
 *
 * Появился как ответ на конкретную стену: Render с сентября 2025 блокирует
 * исходящий трафик на SMTP-порты (25, 465, 587) для бесплатных сервисов.
 * Соединение уходит и не возвращается — `ETIMEDOUT` на фазе `CONN`, будто
 * почтовый сервер не отвечает. Никакая настройка SMTP это не обходит: порт
 * закрыт самим хостингом.
 *
 * HTTP API работает поверх обычного 443 и под запрет не попадает.
 *
 * Почему именно Brevo, а не Resend, который уже поддержан: Resend без
 * подтверждённого домена доставляет письма ТОЛЬКО владельцу аккаунта. Brevo
 * подтверждает отдельный адрес отправителя — достаточно личной почты, домен не
 * нужен, — и после этого письма уходят кому угодно, 300 штук в сутки на
 * бесплатном тарифе.
 */

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/** Провайдер, не ответивший за это время, считается недоступным. */
const REQUEST_TIMEOUT_MS = 10_000;

export interface BrevoOptions {
  apiKey: string;
  /** `user@example.com` либо `Имя <user@example.com>`. */
  from: string;
  /** Подменяется в тестах, чтобы не ходить в сеть. */
  fetchImpl?: typeof fetch;
}

/** Разбирает `Имя <user@example.com>` на части: Brevo ждёт их отдельными полями. */
export function parseSender(from: string): { name?: string; email: string } {
  const angled = /^(.*)<([^<>\s]+)>$/.exec(from.trim());
  if (!angled) return { email: from.trim() };
  const name = angled[1]!.trim();
  return name ? { name, email: angled[2]! } : { email: angled[2]! };
}

export function createBrevoTransport({
  apiKey,
  from,
  fetchImpl = fetch,
}: BrevoOptions): MailTransport {
  const sender = parseSender(from);

  return {
    name: "brevo",
    send: async (message) => {
      const response = await fetchImpl(BREVO_ENDPOINT, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender,
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
        }),
        // Без ограничения зависший провайдер держал бы наш ответ до таймаута
        // клиента, а восстановление пароля отправку дожидается.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) return;

      // Тело ответа объясняет отказ словами: «адрес отправителя не подтверждён»,
      // «дневная квота исчерпана», «ключ недействителен». Без него в логе
      // остаётся голый код статуса, по которому непонятно, что чинить.
      const details = await response.text().catch(() => "");
      throw new Error(
        `Brevo отклонил письмо: ${response.status} ${response.statusText}` +
          (details ? ` — ${details.slice(0, 500)}` : ""),
      );
    },
  };
}
