const LEGACY_DATE = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/;
const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

export function eventDateToIso(date: string, time = "00:00"): string {
  const match = date.match(LEGACY_DATE);
  const isoCalendarMatch = date.match(ISO_CALENDAR_DATE);
  if (isoCalendarMatch) {
    return eventDateToIso(
      `${isoCalendarMatch[3]}/${isoCalendarMatch[2]}/${isoCalendarMatch[1]}`,
      time,
    );
  }
  if (!match) {
    const parsed = new Date(date);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    throw new Error(`Invalid event date: ${date}`);
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const calendarValue = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  if (
    calendarValue.getUTCFullYear() !== year ||
    calendarValue.getUTCMonth() !== month - 1 ||
    calendarValue.getUTCDate() !== day
  ) {
    throw new Error(`Invalid event date: ${date}`);
  }
  const result = new Date(calendarValue.getTime() - MOSCOW_OFFSET_MS);
  return result.toISOString();
}
