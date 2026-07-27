import { INTEREST_CATALOG, type FilterState } from "./filtersStore";

/**
 * Фильтры ленты в адресной строке (FE-006).
 *
 * Раньше подобранная выборка жила только в памяти вкладки: её нельзя было ни
 * переслать, ни сохранить в закладки, а обновление страницы её теряло.
 *
 * Имена параметров короткие и не совпадают с названиями полей: ссылка часто
 * попадает в мессенджер, где длинный «хвост» переносится и выглядит мусором.
 */

const PARAM = {
  search: "q",
  date: "date",
  location: "place",
  startTime: "from",
  endTime: "to",
  interests: "i",
} as const;

const KNOWN_INTEREST_IDS = new Set(INTEREST_CATALOG.map((interest) => interest.id));

/** Только `HH:MM` — иначе фильтр времени молча не сработает. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Только `YYYY-MM-DD`: значение уходит прямо в `input[type=date]`. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Насколько длинную строку принимаем из ссылки — защита от мусора в адресе. */
const MAX_TEXT_LENGTH = 100;

export function filtersToSearchParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  const search = filters.search.trim();
  if (search) params.set(PARAM.search, search);
  if (filters.date) params.set(PARAM.date, filters.date);
  if (filters.location.trim()) params.set(PARAM.location, filters.location.trim());
  // Диапазон времени осмыслен только целиком — половину в ссылку не кладём.
  if (filters.timeActive) {
    params.set(PARAM.startTime, filters.startTime);
    params.set(PARAM.endTime, filters.endTime);
  }
  if (filters.interestIds.length > 0) {
    params.set(PARAM.interests, [...filters.interestIds].sort().join(","));
  }
  return params;
}

export interface ParsedFilters {
  search: string;
  date: string;
  location: string;
  startTime: string;
  endTime: string;
  interestIds: string[];
}

/**
 * Разбор ссылки. Ссылку мог собрать кто угодно, поэтому неизвестные интересы,
 * неверные форматы и слишком длинные строки отбрасываются молча: показать
 * ленту без части фильтров лучше, чем упереться в ошибку разбора.
 */
export function searchParamsToFilters(params: URLSearchParams): ParsedFilters {
  const text = (name: string): string => (params.get(name) ?? "").trim().slice(0, MAX_TEXT_LENGTH);

  const date = text(PARAM.date);
  const startTime = text(PARAM.startTime);
  const endTime = text(PARAM.endTime);
  const timeValid = TIME_PATTERN.test(startTime) && TIME_PATTERN.test(endTime);

  const interestIds = (params.get(PARAM.interests) ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => KNOWN_INTEREST_IDS.has(id));

  return {
    search: text(PARAM.search),
    date: DATE_PATTERN.test(date) ? date : "",
    location: text(PARAM.location),
    // Одна граница без второй фильтр не включает — отбрасываем обе.
    startTime: timeValid ? startTime : "",
    endTime: timeValid ? endTime : "",
    interestIds: [...new Set(interestIds)],
  };
}

/** Ссылка на текущую выборку — то, что уходит в мессенджер. */
export function shareableFilterUrl(filters: FilterState, origin: string, pathname: string): string {
  const params = filtersToSearchParams(filters).toString();
  return params ? `${origin}${pathname}?${params}` : `${origin}${pathname}`;
}
