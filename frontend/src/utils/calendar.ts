/**
 * Экспорт события в календарь через файл `.ics` (PROD-010).
 *
 * Формат iCalendar (RFC 5545) понимают Google Calendar, Apple Calendar,
 * Outlook и почти все остальные — поэтому серверная часть не нужна.
 */

/** Длительность события по умолчанию, если время окончания неизвестно (см. BE-006). */
export const DEFAULT_DURATION_MINUTES = 120;

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  /** ISO 8601 момент начала. */
  startsAt: string;
  /** Ссылка на событие в приложении. */
  url?: string;
}

/** Момент в формате iCalendar UTC: `20260627T150000Z`. */
function toIcsUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Экранирует спецсимволы значения (RFC 5545 §3.3.11): обратный слэш,
 * точка с запятой, запятая и перевод строки.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Складывает длинные строки: по спецификации строка не длиннее 75 октетов,
 * продолжение начинается с пробела.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) chunks.push(` ${rest}`);
  return chunks.join("\r\n");
}

/** Собирает содержимое `.ics` для одного события. */
export function buildEventIcs(event: CalendarEvent, now: Date = new Date()): string {
  const start = new Date(event.startsAt);
  if (Number.isNaN(start.getTime())) throw new Error("Некорректная дата события");
  const end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//POVOD//Events//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:povod-${event.id}@povod.app`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];

  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.url) lines.push(`URL:${escapeIcsText(event.url)}`);

  lines.push("END:VEVENT", "END:VCALENDAR");

  // Разделитель строк в iCalendar — CRLF.
  return lines.map(foldLine).join("\r\n");
}

/** Безопасное имя файла из названия события. */
export function icsFileName(title: string): string {
  const base =
    title
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, "-")
      // Удалённые символы могли оставить дефисы по краям и подряд.
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "povod-event";
  return `${base}.ics`;
}

/** Формирует `.ics` и отдаёт его браузеру как загрузку. */
export function downloadEventIcs(event: CalendarEvent): void {
  const blob = new Blob([buildEventIcs(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = icsFileName(event.title);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
