/**
 * Письма, которые отправляет POVOD.
 *
 * Текст письма отделён от способа доставки: шаблон не знает, уйдёт он через
 * провайдера или в лог, а транспорт не знает, о чём письмо. Иначе смена
 * провайдера тянула бы за собой переписывание текстов.
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** Обязателен: часть почтовых клиентов и спам-фильтров не любят письма без текстовой версии. */
  text: string;
  html: string;
}

/** Экранирование для вставки в HTML-шаблон. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Письмо со ссылкой восстановления пароля (SEC-008).
 *
 * Срок действия назван прямо в письме: ссылка живёт час, и человек, открывший
 * почту назавтра, должен понимать, почему она не сработала, а не считать это
 * поломкой.
 *
 * Ссылка продублирована текстом рядом с кнопкой — почтовые клиенты нередко
 * режут стили и обрезают ссылки в кнопках.
 */
export function passwordResetMessage(to: string, link: string, lifetimeHours: number): MailMessage {
  const safeLink = escapeHtml(link);
  const hours = lifetimeHours === 1 ? "час" : `${lifetimeHours} ч.`;

  const text = [
    "Восстановление пароля в POVOD",
    "",
    "Чтобы задать новый пароль, откройте ссылку:",
    link,
    "",
    `Ссылка действует ${hours} и срабатывает один раз.`,
    "",
    "Если вы не запрашивали смену пароля — просто удалите это письмо,",
    "пароль останется прежним.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1c1e;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;">
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;line-height:28px;">Восстановление пароля</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:22px;">
            Чтобы задать новый пароль, нажмите кнопку ниже.
          </p>
          <p style="margin:0 0 24px;">
            <a href="${safeLink}" style="display:inline-block;padding:12px 24px;border-radius:12px;background:#2688eb;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Задать новый пароль</a>
          </p>
          <p style="margin:0 0 24px;font-size:13px;line-height:20px;color:#6b6b70;">
            Если кнопка не работает, скопируйте ссылку:<br />
            <span style="word-break:break-all;">${safeLink}</span>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#6b6b70;">
            Ссылка действует ${hours} и срабатывает один раз.
          </p>
          <p style="margin:0;font-size:13px;line-height:20px;color:#6b6b70;">
            Если вы не запрашивали смену пароля — просто удалите это письмо,
            пароль останется прежним.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { to, subject: "Восстановление пароля в POVOD", text, html };
}
