import type { Notification } from "../../services/api";

/**
 * Текст уведомления собирается на клиенте, а не приходит с сервера.
 *
 * Сервер хранит факт («кто, что, с каким событием»), а не готовую фразу: иначе
 * старые записи навсегда останутся со старыми формулировками, а перевод на
 * другой язык потребует переписывать базу.
 */

const NAMELESS = "Кто-то";

function actor(notification: Notification): string {
  return notification.actorName?.trim() || NAMELESS;
}

/** «время и место», «время, место и название» — без запятой перед последним. */
function joinChanges(changes: string[]): string {
  if (changes.length <= 1) return changes[0] ?? "детали";
  return `${changes.slice(0, -1).join(", ")} и ${changes[changes.length - 1]}`;
}

export function formatNotification(notification: Notification): string {
  // Единственный тип без события — личное сообщение. Название здесь не просто
  // отсутствует, его и не может быть: открывать нечего, кроме переписки.
  if (notification.type === "direct_message") {
    return `${actor(notification)} написал вам`;
  }

  const title = notification.eventTitle ? `«${notification.eventTitle}»` : "«без названия»";
  switch (notification.type) {
    case "event_joined":
      return `${actor(notification)} записался на ваше событие ${title}`;
    case "event_comment":
      return `${actor(notification)} оставил комментарий к вашему событию ${title}`;
    case "event_updated":
      return `В событии ${title} изменились ${joinChanges(notification.changes ?? [])}`;
    case "event_cancelled":
      return `Событие ${title} отменено`;
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * «5 минут назад» вместо точной даты: в ленте уведомлений важна свежесть, а не
 * календарная точность. Начиная с недели показываем обычную дату — «14 дней
 * назад» человек всё равно переводит в дату в уме.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "";

  const elapsed = now - timestamp;
  if (elapsed < MINUTE) return "только что";
  if (elapsed < HOUR)
    return `${plural(Math.floor(elapsed / MINUTE), "минуту", "минуты", "минут")} назад`;
  if (elapsed < DAY) return `${plural(Math.floor(elapsed / HOUR), "час", "часа", "часов")} назад`;
  if (elapsed < 7 * DAY) return `${plural(Math.floor(elapsed / DAY), "день", "дня", "дней")} назад`;

  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(timestamp);
}

/** Русские числительные: 1 минуту, 2 минуты, 5 минут. */
function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} ${many}`;
  if (mod10 === 1) return `${count} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}
