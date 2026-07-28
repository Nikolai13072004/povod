import { config } from "../config.js";
import { createMailTransport, type MailTransport } from "./transport.js";

export type { MailTransport } from "./transport.js";
export { createMailTransport, createResendTransport } from "./transport.js";
export { passwordResetMessage, type MailMessage } from "./message.js";

let transport: MailTransport | undefined;

/** Транспорт создаётся один раз: у провайдера есть состояние (ключ, лимиты). */
export function getMailTransport(): MailTransport {
  transport ??= createMailTransport(config);
  return transport;
}

/** Подмена транспорта в тестах. `undefined` возвращает выбор конфигурации. */
export function setMailTransport(next: MailTransport | undefined): void {
  transport = next;
}
