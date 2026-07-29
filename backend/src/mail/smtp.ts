import { lookup } from "node:dns/promises";
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
  /** Подменяется в тестах, чтобы не ходить в DNS. */
  resolveHost?: (host: string) => Promise<string>;
}

/** Внешний сервер, не ответивший за это время, считается недоступным. */
const TIMEOUT_MS = 10_000;

/** Адрес почтового сервера в IPv4 — см. пояснение в `createSmtpTransport`. */
async function defaultResolveHost(host: string): Promise<string> {
  const { address } = await lookup(host, { family: 4 });
  return address;
}

export function createSmtpTransport({
  host,
  port,
  secure,
  user,
  password,
  from,
  createTransport = nodemailer.createTransport,
  resolveHost = defaultResolveHost,
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

  const connection = async (): Promise<Transporter> => {
    if (transporter) return transporter;

    /*
     * Имя разрешаем в IPv4 сами.
     *
     * У контейнеров многих хостингов (в том числе Render) нет исходящего IPv6,
     * а `smtp.gmail.com` отдаёт и A, и AAAA. Node шёл по AAAA и падал сразу:
     *
     *   connect ENETUNREACH 2a00:1450:4001:c21::6d:465 — code ESOCKET
     *
     * Ошибка выглядит как «SMTP заблокирован», хотя порт открыт — просто
     * стучимся не по тому протоколу. Выбрать семейство адресов через настройки
     * nodemailer нельзя: такой опции у него нет.
     */
    const address = await resolveHost(host);

    transporter = createTransport({
      host: address,
      port,
      secure,
      auth: { user, pass: password },
      // Сертификат выписан на имя, а не на адрес: без этого проверка TLS
      // провалится, потому что в `host` теперь цифры.
      tls: { servername: host },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
    return transporter;
  };

  return {
    name: "smtp",
    send: async (message) => {
      const mailer = await connection();
      await mailer.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}
