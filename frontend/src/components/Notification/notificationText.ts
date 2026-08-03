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
  // Типы без события: сообщение и дружба. Названия здесь не просто нет — его и
  // не может быть, открывать нечего, кроме человека.
  switch (notification.type) {
    case "direct_message":
      return `${actor(notification)} написал вам`;
    case "friend_request":
      return `${actor(notification)} хочет добавить вас в друзья`;
    case "friend_accepted":
      return `${actor(notification)} принял вашу заявку в друзья`;
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
    // Без actor'а: уведомление о самом событии, а не о чьём-то действии (PROD-013).
    case "event_chat":
      return `У события ${title} есть чат участников — там бывает важное`;
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

/** Сколько календарных дней назад была метка: 0 — сегодня, 1 — вчера… */
function calendarDaysAgo(timestamp: number, now: number): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = new Date(timestamp);
  day.setHours(0, 0, 0, 0);
  // Round, а не floor: переход на летнее время делает «сутки» на час короче.
  return Math.round((today.getTime() - day.getTime()) / DAY);
}

/** Точное «14:23» — внутри переписки, где важен момент, а не давность. */
export function timeShort(iso: string): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "";
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

/**
 * Короткое время для списка переписок: сегодня — «14:23», вчера — «Вчера»,
 * до недели — день недели, дальше — дата. «5 часов назад» из `relativeTime`
 * распирало колонку времени и заставляло правый край списка плясать; здесь
 * важна компактность, а привычную давность человек считывает и из даты.
 */
export function chatTimeShort(iso: string, now: number = Date.now()): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "";

  const daysAgo = calendarDaysAgo(timestamp, now);
  if (daysAgo <= 0) return timeShort(iso);
  if (daysAgo === 1) return "Вчера";
  if (daysAgo < 7) return new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(timestamp);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(timestamp);
}

/**
 * Заголовок дня в переписке: «Сегодня», «Вчера», дальше — дата (с годом, если
 * он уже не текущий). Без этих разделителей длинная переписка сливается в один
 * бесконечный столбец, а у каждого сообщения остаётся только «14:23» — по нему
 * не понять, сегодняшнее оно или недельной давности.
 */
export function dayLabel(iso: string, now: number = Date.now()): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "";

  const daysAgo = calendarDaysAgo(timestamp, now);
  if (daysAgo <= 0) return "Сегодня";
  if (daysAgo === 1) return "Вчера";

  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(
    "ru-RU",
    sameYear
      ? { day: "numeric", month: "long" }
      : { day: "numeric", month: "long", year: "numeric" },
  ).format(timestamp);
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
