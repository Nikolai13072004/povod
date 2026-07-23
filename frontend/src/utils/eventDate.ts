const DEFAULT_TIMEZONE = "Europe/Moscow";

function partsInTimezone(value: string | Date, timezone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Некорректная дата события");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
}

export function formatEventDate(startsAt: string, timezone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(startsAt));
}

export function formatEventTime(startsAt: string, timezone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(startsAt));
}

export function eventDateKey(startsAt: string, timezone: string): string {
  const parts = partsInTimezone(startsAt, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function eventTimeKey(startsAt: string, timezone: string): string {
  const parts = partsInTimezone(startsAt, timezone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function filterDateKey(value: string): string {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function timezoneOffsetAt(timestamp: number, timezone: string): number {
  const parts = partsInTimezone(new Date(timestamp), timezone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - Math.floor(timestamp / 1000) * 1000;
}

export function localDateTimeToIso(
  date: string,
  time: string,
  timezone: string,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Некорректная дата");
  const localTime = time || "00:00";
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(localTime)) {
    throw new Error("Некорректное время");
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = naiveUtc - timezoneOffsetAt(naiveUtc, timezone);
  instant = naiveUtc - timezoneOffsetAt(instant, timezone);
  const result = new Date(instant);
  const roundTrip = partsInTimezone(result, timezone);
  if (
    roundTrip.year !== year ||
    roundTrip.month !== month ||
    roundTrip.day !== day ||
    roundTrip.hour !== hour ||
    roundTrip.minute !== minute
  ) {
    throw new Error("Такого локального времени не существует в выбранной timezone");
  }
  return result.toISOString();
}
